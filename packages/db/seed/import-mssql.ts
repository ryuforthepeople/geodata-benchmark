/**
 * Import generated CSV data into SQL Server.
 * Usage: npx tsx seed/import-mssql.ts --scale small|large
 */
import mssql from "mssql";
import {
  streamCsv,
  ewktToWkt,
  getCsvFiles,
  countLines,
  ProgressReporter,
  parseScale,
  timer,
  type GeoRow,
} from "./shared.js";
import { readFile } from "node:fs/promises";

const scale = parseScale();
const BATCH_SIZE = 500;

const config: mssql.config = {
  server: process.env.MSSQL_HOST ?? "localhost",
  port: Number(process.env.MSSQL_PORT ?? 1433),
  user: process.env.MSSQL_USER ?? "sa",
  password: process.env.MSSQL_PASSWORD ?? "Bench!Pass123",
  database: process.env.MSSQL_DATABASE ?? "master", // start with master for DB creation
  options: {
    trustServerCertificate: true,
    enableArithAbort: true,
  },
  pool: { max: 5 },
};

async function run() {
  const totalTimer = timer();

  // 1. Connect and create schema
  console.log("▶ Creating schema...");
  let pool = await mssql.connect(config);

  // Create database if not exists
  await pool.request().query(`
    IF NOT EXISTS (SELECT * FROM sys.databases WHERE name = 'geobench')
      CREATE DATABASE geobench;
  `);
  await pool.close();

  // Reconnect to geobench
  config.database = "geobench";
  pool = await mssql.connect(config);

  // Create tables
  const schemaPath = new URL("../schemas/mssql.sql", import.meta.url);
  const schemaSql = await readFile(schemaPath, "utf-8");
  // Split on GO and execute each batch
  const batches = schemaSql
    .split(/^\s*GO\s*$/im)
    .map((b) => b.trim())
    .filter((b) => b && !b.startsWith("--"));
  
  for (const batch of batches) {
    // Skip USE/CREATE DATABASE statements since we're already connected
    if (/^\s*(CREATE DATABASE|USE )/i.test(batch)) continue;
    try {
      await pool.request().query(batch);
    } catch (e: any) {
      // Ignore drop errors
      if (!e.message?.includes("Cannot drop")) throw e;
    }
  }
  console.log("  Schema created (geometry + geography tables).");

  // 2. Import data
  const files = getCsvFiles(scale);
  let totalRows = 0;

  console.log(`\n▶ Importing ${scale} dataset...`);
  const importTimer = timer();

  for (const filePath of files) {
    const lineCount = await countLines(filePath);
    const label = filePath.split("/").pop()!.replace(".csv", "");
    const progress = new ProgressReporter(label, lineCount);

    let batch: GeoRow[] = [];
    let rowCount = 0;

    for await (const row of streamCsv(filePath)) {
      batch.push(row);
      if (batch.length >= BATCH_SIZE) {
        await insertBatch(pool, batch);
        rowCount += batch.length;
        progress.tick(batch.length);
        batch = [];
      }
    }
    // Flush remaining
    if (batch.length > 0) {
      await insertBatch(pool, batch);
      rowCount += batch.length;
      progress.tick(batch.length);
    }

    const elapsed = progress.finish();
    totalRows += rowCount;
    console.log(
      `  ✓ ${label}: ${rowCount.toLocaleString()} rows in ${(elapsed / 1000).toFixed(2)}s\n`
    );
  }

  const importElapsed = importTimer.elapsed();
  console.log(
    `▶ Import complete: ${totalRows.toLocaleString()} rows in ${(importElapsed / 1000).toFixed(2)}s`
  );

  // 3. Build spatial indexes
  console.log("\n▶ Building spatial index (geometry)...");
  const idxGeomTimer = timer();
  await pool.request().query(`
    CREATE SPATIAL INDEX idx_geo_features_geom
    ON geo_features(geom)
    USING GEOMETRY_GRID
    WITH (
      BOUNDING_BOX = (xmin = -180, ymin = -90, xmax = 180, ymax = 90),
      GRIDS = (LEVEL_1 = HIGH, LEVEL_2 = HIGH, LEVEL_3 = HIGH, LEVEL_4 = HIGH),
      CELLS_PER_OBJECT = 16
    )
  `);
  const idxGeomElapsed = idxGeomTimer.elapsed();
  console.log(`  ✓ Geometry index built in ${(idxGeomElapsed / 1000).toFixed(2)}s`);

  console.log("\n▶ Building spatial index (geography)...");
  const idxGeogTimer = timer();
  await pool.request().query(`
    CREATE SPATIAL INDEX idx_geo_features_geog
    ON geo_features_geog(geog)
    USING GEOGRAPHY_GRID
    WITH (
      GRIDS = (LEVEL_1 = HIGH, LEVEL_2 = HIGH, LEVEL_3 = HIGH, LEVEL_4 = HIGH),
      CELLS_PER_OBJECT = 16
    )
  `);
  const idxGeogElapsed = idxGeogTimer.elapsed();
  console.log(`  ✓ Geography index built in ${(idxGeogElapsed / 1000).toFixed(2)}s`);

  // 4. Get sizes
  const sizeResult = await pool.request().query(`
    SELECT
      i.name,
      CAST(SUM(s.used_page_count) * 8 / 1024.0 AS DECIMAL(10,2)) AS size_mb
    FROM sys.dm_db_partition_stats s
    JOIN sys.indexes i ON s.object_id = i.object_id AND s.index_id = i.index_id
    WHERE i.name LIKE 'idx_geo_features%'
    GROUP BY i.name
  `);
  for (const row of sizeResult.recordset) {
    console.log(`  Index ${row.name}: ${row.size_mb} MB`);
  }

  // Summary
  console.log("\n════════════════════════════════════════");
  console.log(`  Scale:               ${scale}`);
  console.log(`  Rows imported:       ${totalRows.toLocaleString()}`);
  console.log(`  Import time:         ${(importElapsed / 1000).toFixed(2)}s`);
  console.log(`  Geom index time:     ${(idxGeomElapsed / 1000).toFixed(2)}s`);
  console.log(`  Geog index time:     ${(idxGeogElapsed / 1000).toFixed(2)}s`);
  console.log(`  Total time:          ${totalTimer.elapsedSec()}s`);
  console.log("════════════════════════════════════════\n");

  await pool.close();
}

/**
 * Insert a batch of rows using a single parameterized INSERT with
 * geometry::STGeomFromText for the geometry table and
 * geography::STGeomFromText for the geography table.
 */
async function insertBatch(pool: mssql.ConnectionPool, rows: GeoRow[]) {
  if (rows.length === 0) return;

  // Build VALUES clauses for geometry table
  const geomValues: string[] = [];
  const geogValues: string[] = [];
  const request = pool.request();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const wkt = ewktToWkt(row.geom);
    request.input(`n${i}`, mssql.NVarChar(255), row.name);
    request.input(`c${i}`, mssql.NVarChar(50), row.category);
    request.input(`p${i}`, mssql.NVarChar(mssql.MAX), row.properties);
    request.input(`g${i}`, mssql.NVarChar(mssql.MAX), wkt);

    geomValues.push(
      `(@n${i}, @c${i}, @p${i}, geometry::STGeomFromText(@g${i}, 4326))`
    );
    geogValues.push(
      `(@n${i}, @c${i}, @p${i}, geography::STGeomFromText(@g${i}, 4326))`
    );
  }

  // Insert into geometry table
  await request.query(
    `INSERT INTO geo_features (name, category, properties, geom) VALUES ${geomValues.join(",")}`
  );

  // Insert into geography table (separate request since inputs are consumed)
  const request2 = pool.request();
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const wkt = ewktToWkt(row.geom);
    request2.input(`n${i}`, mssql.NVarChar(255), row.name);
    request2.input(`c${i}`, mssql.NVarChar(50), row.category);
    request2.input(`p${i}`, mssql.NVarChar(mssql.MAX), row.properties);
    request2.input(`g${i}`, mssql.NVarChar(mssql.MAX), wkt);
  }
  
  try {
    await request2.query(
      `INSERT INTO geo_features_geog (name, category, properties, geog) VALUES ${geogValues.join(",")}`
    );
  } catch (e: any) {
    // Geography may fail on ring orientation — log and skip
    if (e.message?.includes("24205") || e.message?.includes("24204")) {
      console.warn(`  ⚠ Geography insert skipped for batch (ring orientation issue)`);
    } else {
      throw e;
    }
  }
}

run().catch((err) => {
  console.error("Import failed:", err);
  process.exit(1);
});
