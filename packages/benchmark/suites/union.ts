import type { BenchmarkSuite } from '../types.js';

const suite: BenchmarkSuite = {
  name: 'union',
  description: 'Union and spatial aggregation benchmarks',
  databases: ['postgis', 'mssql'],
  cases: [
    {
      name: 'union-polygons-amsterdam',
      description: 'Union all polygons in Amsterdam area',
      fn: async (ctx) => {
        if (ctx.database === 'postgis') {
          const res = await ctx.pgPool!.query(
            `SELECT ST_AsGeoJSON(ST_Union(geom)) AS unified
             FROM geo_features
             WHERE category = 'polygon'
               AND geom && ST_MakeEnvelope(4.8, 52.3, 5.0, 52.4, 4326)`
          );
          return { rowsReturned: res.rowCount ?? 0 };
        } else {
          const res = await ctx.mssqlPool!.request().query(
            `DECLARE @bbox geometry = geometry::STGeomFromText(
               'POLYGON((4.8 52.3, 5.0 52.3, 5.0 52.4, 4.8 52.4, 4.8 52.3))', 4326);
             SELECT geometry::UnionAggregate(geom).STAsText() AS unified
             FROM geo_features
             WHERE category = N'polygon'
               AND geom.STIntersects(@bbox) = 1`
          );
          return { rowsReturned: res.recordset.length };
        }
      },
    },
    {
      name: 'union-memunion-amsterdam',
      description: 'Memory-friendly union (PostGIS ST_MemUnion vs standard)',
      fn: async (ctx) => {
        if (ctx.database === 'postgis') {
          const res = await ctx.pgPool!.query(
            `SELECT ST_AsGeoJSON(ST_MemUnion(geom)) AS unified
             FROM geo_features
             WHERE category = 'polygon'
               AND geom && ST_MakeEnvelope(4.8, 52.3, 5.0, 52.4, 4326)`
          );
          return { rowsReturned: res.rowCount ?? 0 };
        } else {
          // SQL Server has no equivalent — use same UnionAggregate
          const res = await ctx.mssqlPool!.request().query(
            `DECLARE @bbox geometry = geometry::STGeomFromText(
               'POLYGON((4.8 52.3, 5.0 52.3, 5.0 52.4, 4.8 52.4, 4.8 52.3))', 4326);
             SELECT geometry::UnionAggregate(geom).STAsText() AS unified
             FROM geo_features
             WHERE category = N'polygon'
               AND geom.STIntersects(@bbox) = 1`
          );
          return { rowsReturned: res.recordset.length };
        }
      },
    },
    {
      name: 'spatial-grid-aggregation',
      description: 'Count features per grid cell (spatial aggregation)',
      fn: async (ctx) => {
        if (ctx.database === 'postgis') {
          const res = await ctx.pgPool!.query(
            `SELECT ST_AsText(ST_SnapToGrid(geom, 0.01)) AS cell,
                    COUNT(*) AS feature_count
             FROM geo_features
             GROUP BY ST_SnapToGrid(geom, 0.01)
             ORDER BY feature_count DESC
             LIMIT 20`
          );
          return { rowsReturned: res.rowCount ?? 0 };
        } else {
          // SQL Server: approximate grid via ROUND
          const res = await ctx.mssqlPool!.request().query(
            `SELECT
               CAST(ROUND(geom.STCentroid().STX, 2) AS VARCHAR) + ',' +
               CAST(ROUND(geom.STCentroid().STY, 2) AS VARCHAR) AS cell,
               COUNT(*) AS feature_count
             FROM geo_features
             WHERE geom IS NOT NULL
             GROUP BY ROUND(geom.STCentroid().STX, 2), ROUND(geom.STCentroid().STY, 2)
             ORDER BY feature_count DESC
             OFFSET 0 ROWS FETCH NEXT 20 ROWS ONLY`
          );
          return { rowsReturned: res.recordset.length };
        }
      },
    },
  ],
};

export default suite;
