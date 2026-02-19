import type { BenchmarkSuite } from '../types.js';

/**
 * Bulk Import Speed — measures batch INSERT performance.
 */

function generateBatchInsertPostgis(batchSize: number): string {
  const values: string[] = [];
  for (let i = 0; i < batchSize; i++) {
    const lon = 3.37 + Math.random() * (7.21 - 3.37);
    const lat = 50.75 + Math.random() * (53.47 - 50.75);
    values.push(
      `('import_${i}', 'point', '{}', ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326))`
    );
  }
  return `INSERT INTO geo_features (name, category, properties, geom) VALUES ${values.join(',\n')}`;
}

function generateBatchInsertMssql(batchSize: number): string {
  const values: string[] = [];
  for (let i = 0; i < batchSize; i++) {
    const lon = 3.37 + Math.random() * (7.21 - 3.37);
    const lat = 50.75 + Math.random() * (53.47 - 50.75);
    values.push(
      `(N'import_${i}', N'point', N'{}', geometry::STGeomFromText('POINT(${lon} ${lat})', 4326))`
    );
  }
  return `INSERT INTO geo_features (name, category, properties, geom) VALUES ${values.join(',\n')}`;
}

const suite: BenchmarkSuite = {
  name: 'import',
  description: 'Bulk import speed — batch INSERT of GeoJSON features',
  databases: ['postgis', 'mssql'],
  cases: [
    {
      name: 'batch-insert-100',
      description: 'Insert 100 random point features',
      fn: async (ctx) => {
        if (ctx.database === 'postgis') {
          const sql = generateBatchInsertPostgis(100);
          const res = await ctx.pgPool!.query(sql);
          return { rowsReturned: res.rowCount ?? 0 };
        } else {
          const sql = generateBatchInsertMssql(100);
          const res = await ctx.mssqlPool!.request().query(sql);
          return { rowsReturned: res.rowsAffected[0] ?? 0 };
        }
      },
    },
    {
      name: 'batch-insert-1000',
      description: 'Insert 1000 random point features',
      fn: async (ctx) => {
        if (ctx.database === 'postgis') {
          const sql = generateBatchInsertPostgis(1000);
          const res = await ctx.pgPool!.query(sql);
          return { rowsReturned: res.rowCount ?? 0 };
        } else {
          const sql = generateBatchInsertMssql(1000);
          const res = await ctx.mssqlPool!.request().query(sql);
          return { rowsReturned: res.rowsAffected[0] ?? 0 };
        }
      },
    },
    {
      name: 'batch-insert-polygon-100',
      description: 'Insert 100 random polygon features',
      fn: async (ctx) => {
        if (ctx.database === 'postgis') {
          const values: string[] = [];
          for (let i = 0; i < 100; i++) {
            const lon = 3.37 + Math.random() * (7.21 - 3.37 - 0.1);
            const lat = 50.75 + Math.random() * (53.47 - 50.75 - 0.1);
            const d = 0.01 + Math.random() * 0.05;
            const wkt = `POLYGON((${lon} ${lat}, ${lon + d} ${lat}, ${lon + d} ${lat + d}, ${lon} ${lat + d}, ${lon} ${lat}))`;
            values.push(`('import_poly_${i}', 'polygon', '{}', ST_SetSRID(ST_GeomFromText('${wkt}'), 4326))`);
          }
          const sql = `INSERT INTO geo_features (name, category, properties, geom) VALUES ${values.join(',')}`;
          const res = await ctx.pgPool!.query(sql);
          return { rowsReturned: res.rowCount ?? 0 };
        } else {
          const values: string[] = [];
          for (let i = 0; i < 100; i++) {
            const lon = 3.37 + Math.random() * (7.21 - 3.37 - 0.1);
            const lat = 50.75 + Math.random() * (53.47 - 50.75 - 0.1);
            const d = 0.01 + Math.random() * 0.05;
            const wkt = `POLYGON((${lon} ${lat}, ${lon + d} ${lat}, ${lon + d} ${lat + d}, ${lon} ${lat + d}, ${lon} ${lat}))`;
            values.push(`(N'import_poly_${i}', N'polygon', N'{}', geometry::STGeomFromText('${wkt}', 4326))`);
          }
          const sql = `INSERT INTO geo_features (name, category, properties, geom) VALUES ${values.join(',')}`;
          const res = await ctx.mssqlPool!.request().query(sql);
          return { rowsReturned: res.rowsAffected[0] ?? 0 };
        }
      },
    },
  ],
  teardown: async (ctx) => {
    // Clean up imported test data
    if (ctx.database === 'postgis') {
      await ctx.pgPool!.query(`DELETE FROM geo_features WHERE name LIKE 'import_%'`);
    } else {
      await ctx.mssqlPool!.request().query(`DELETE FROM geo_features WHERE name LIKE N'import_%'`);
    }
  },
};

export default suite;
