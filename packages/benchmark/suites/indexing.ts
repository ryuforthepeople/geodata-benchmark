import type { BenchmarkSuite } from '../types.js';

const suite: BenchmarkSuite = {
  name: 'indexing',
  description: 'Spatial index build time — drop and recreate spatial indexes',
  databases: ['postgis', 'mssql'],
  cases: [
    {
      name: 'gist-index-rebuild',
      description: 'Drop and recreate GiST/spatial index on geo_features',
      fn: async (ctx) => {
        if (ctx.database === 'postgis') {
          await ctx.pgPool!.query(`DROP INDEX IF EXISTS idx_geo_features_geom`);
          await ctx.pgPool!.query(`CREATE INDEX idx_geo_features_geom ON geo_features USING GIST (geom)`);
          const res = await ctx.pgPool!.query(
            `SELECT pg_relation_size('idx_geo_features_geom') AS size_bytes`
          );
          return { rowsReturned: res.rows[0]?.size_bytes ?? 0 };
        } else {
          await ctx.mssqlPool!.request().query(
            `IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_geo_features_geom')
             DROP INDEX idx_geo_features_geom ON geo_features`
          );
          await ctx.mssqlPool!.request().query(
            `CREATE SPATIAL INDEX idx_geo_features_geom
             ON geo_features(geom)
             USING GEOMETRY_GRID
             WITH (BOUNDING_BOX = (-180, -90, 180, 90), GRIDS = (HIGH, HIGH, HIGH, HIGH))`
          );
          const res = await ctx.mssqlPool!.request().query(
            `SELECT s.used_page_count * 8 * 1024 AS size_bytes
             FROM sys.dm_db_partition_stats s
             JOIN sys.indexes i ON s.object_id = i.object_id AND s.index_id = i.index_id
             WHERE i.name = 'idx_geo_features_geom'`
          );
          return { rowsReturned: res.recordset[0]?.size_bytes ?? 0 };
        }
      },
    },
    {
      name: 'index-size-check',
      description: 'Query spatial index size without rebuild',
      fn: async (ctx) => {
        if (ctx.database === 'postgis') {
          const res = await ctx.pgPool!.query(
            `SELECT pg_relation_size('idx_geo_features_geom') AS size_bytes`
          );
          return { rowsReturned: res.rows[0]?.size_bytes ?? 0 };
        } else {
          const res = await ctx.mssqlPool!.request().query(
            `SELECT ISNULL(SUM(s.used_page_count * 8 * 1024), 0) AS size_bytes
             FROM sys.dm_db_partition_stats s
             JOIN sys.indexes i ON s.object_id = i.object_id AND s.index_id = i.index_id
             WHERE i.name = 'idx_geo_features_geom'`
          );
          return { rowsReturned: res.recordset[0]?.size_bytes ?? 0 };
        }
      },
    },
  ],
};

export default suite;
