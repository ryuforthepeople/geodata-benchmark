/**
 * Import generated CSV data into PostGIS.
 * Usage: npx tsx seed/import-postgis.ts --scale small|large
 */
import pg from "pg";
import {
  streamCsv,
  getCsvFiles,
  countLines,
  ProgressReporter,
  parseScale,
  timer,
  type GeoRow,
} from "./shared.js";
import { readFile } from "node:fs/promises";

const scale = parseScale();
const BATCH_SIZE = 1000;

const pool = new pg.Pool({
  host: process.env.PGHOST ?? "localhost",
  port: Number(process.env.PGPORT ?? 5432),
  database: process.env.PGDATABASE ?? "geobench",
  user: process.env.PGUSER ?? "bench",
  password: process.env.PGPASSWORD ?? "bench",
});

async function run() {
  const client = await pool.connect();
  const totalTimer = timer();

  try {
    // 1. Create schema
    console.log("▶ Creating schema...");
    const schemaPath = new URL("../schemas/postgis.sql", import.meta.url);
    const schemaSql = await readFile(schemaPath, "utf-8");
    await client.query(schemaSql);
    console.log("  Schema created.");

    // 2. Drop spatial index if exists
    await client.query("DROP INDEX IF EXISTS idx_geo_features_geom");
    console.log("  Spatial index dropped (will rebuild after import).");

    // 3. Import each CSV via batched INSERT
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
          await insertBatch(client, batch);
          rowCount += batch.length;
          progress.tick(batch.length);
          batch = [];
        }
      }
      if (batch.length > 0) {
        await insertBatch(client, batch);
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

    // 4. ANALYZE before index build
    await client.query("ANALYZE geo_features");

    // 5. Build spatial index
    console.log("\n▶ Building spatial index (GiST)...");
    const indexTimer = timer();
    await client.query(
      "CREATE INDEX idx_geo_features_geom ON geo_features USING GIST (geom)"
    );
    const indexElapsed = indexTimer.elapsed();
    console.log(`  ✓ Index built in ${(indexElapsed / 1000).toFixed(2)}s`);

    // 6. Get sizes
    const sizeResult = await client.query(
      "SELECT pg_size_pretty(pg_relation_size('idx_geo_features_geom')) AS idx_size, pg_size_pretty(pg_total_relation_size('geo_features')) AS tbl_size"
    );
    console.log(`  Index size: ${sizeResult.rows[0].idx_size}`);
    console.log(`  Table total size: ${sizeResult.rows[0].tbl_size}`);

    // Summary
    console.log("\n════════════════════════════════════════");
    console.log(`  Scale:          ${scale}`);
    console.log(`  Rows imported:  ${totalRows.toLocaleString()}`);
    console.log(`  Import time:    ${(importElapsed / 1000).toFixed(2)}s`);
    console.log(`  Index time:     ${(indexElapsed / 1000).toFixed(2)}s`);
    console.log(`  Total time:     ${totalTimer.elapsedSec()}s`);
    console.log("════════════════════════════════════════\n");
  } finally {
    client.release();
    await pool.end();
  }
}

/**
 * Batched INSERT using unnest for performance.
 * Uses ST_GeomFromEWKT since our data already has SRID prefix.
 */
async function insertBatch(client: pg.PoolClient, rows: GeoRow[]) {
  const names: string[] = [];
  const categories: string[] = [];
  const properties: string[] = [];
  const geoms: string[] = [];

  for (const row of rows) {
    names.push(row.name);
    categories.push(row.category);
    properties.push(row.properties);
    geoms.push(row.geom); // EWKT with SRID prefix
  }

  await client.query(
    `INSERT INTO geo_features (name, category, properties, geom)
     SELECT * FROM unnest(
       $1::varchar[],
       $2::varchar[],
       $3::jsonb[],
       (SELECT array_agg(ST_GeomFromEWKT(g)) FROM unnest($4::text[]) AS g)
     )`,
    [names, categories, properties, geoms]
  );
}

run().catch((err) => {
  console.error("Import failed:", err);
  process.exit(1);
});
