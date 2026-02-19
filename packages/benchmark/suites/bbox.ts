import type { BenchmarkSuite } from '../types.js';

const suite: BenchmarkSuite = {
  name: 'bbox',
  description: 'Bounding box query benchmarks — envelope overlap tests',
  databases: ['postgis', 'mssql'],
  cases: [
    {
      name: 'bbox-amsterdam',
      description: 'Bounding box overlap for Amsterdam area',
      fn: async (ctx) => {
        if (ctx.database === 'postgis') {
          const res = await ctx.pgPool!.query(
            `SELECT id, name FROM geo_features
             WHERE geom && ST_MakeEnvelope($1, $2, $3, $4, 4326)`,
            [4.8, 52.3, 5.0, 52.4]
          );
          return { rowsReturned: res.rowCount ?? 0 };
        } else {
          const res = await ctx.mssqlPool!.request()
            .input('wkt', 'POLYGON((4.8 52.3, 5.0 52.3, 5.0 52.4, 4.8 52.4, 4.8 52.3))')
            .query(
              `DECLARE @bbox geometry = geometry::STGeomFromText(@wkt, 4326);
               SELECT id, name FROM geo_features
               WHERE geom.Filter(@bbox) = 1`
            );
          return { rowsReturned: res.recordset.length };
        }
      },
    },
    {
      name: 'bbox-amsterdam-intersects',
      description: 'Explicit envelope intersection (more precise than bbox overlap)',
      fn: async (ctx) => {
        if (ctx.database === 'postgis') {
          const res = await ctx.pgPool!.query(
            `SELECT id, name FROM geo_features
             WHERE ST_Intersects(geom, ST_MakeEnvelope($1, $2, $3, $4, 4326))`,
            [4.8, 52.3, 5.0, 52.4]
          );
          return { rowsReturned: res.rowCount ?? 0 };
        } else {
          const res = await ctx.mssqlPool!.request()
            .input('wkt', 'POLYGON((4.8 52.3, 5.0 52.3, 5.0 52.4, 4.8 52.4, 4.8 52.3))')
            .query(
              `DECLARE @bbox geometry = geometry::STGeomFromText(@wkt, 4326);
               SELECT id, name FROM geo_features
               WHERE geom.STIntersects(@bbox) = 1`
            );
          return { rowsReturned: res.recordset.length };
        }
      },
    },
    {
      name: 'bbox-netherlands',
      description: 'Bounding box for entire Netherlands',
      fn: async (ctx) => {
        if (ctx.database === 'postgis') {
          const res = await ctx.pgPool!.query(
            `SELECT id, name FROM geo_features
             WHERE geom && ST_MakeEnvelope($1, $2, $3, $4, 4326)`,
            [3.37, 50.75, 7.21, 53.47]
          );
          return { rowsReturned: res.rowCount ?? 0 };
        } else {
          const res = await ctx.mssqlPool!.request()
            .input('wkt', 'POLYGON((3.37 50.75, 7.21 50.75, 7.21 53.47, 3.37 53.47, 3.37 50.75))')
            .query(
              `DECLARE @bbox geometry = geometry::STGeomFromText(@wkt, 4326);
               SELECT id, name FROM geo_features
               WHERE geom.Filter(@bbox) = 1`
            );
          return { rowsReturned: res.recordset.length };
        }
      },
    },
    {
      name: 'bbox-small-area',
      description: 'Very small bounding box (few results)',
      fn: async (ctx) => {
        if (ctx.database === 'postgis') {
          const res = await ctx.pgPool!.query(
            `SELECT id, name FROM geo_features
             WHERE geom && ST_MakeEnvelope($1, $2, $3, $4, 4326)`,
            [4.89, 52.37, 4.90, 52.375]
          );
          return { rowsReturned: res.rowCount ?? 0 };
        } else {
          const res = await ctx.mssqlPool!.request()
            .input('wkt', 'POLYGON((4.89 52.37, 4.90 52.37, 4.90 52.375, 4.89 52.375, 4.89 52.37))')
            .query(
              `DECLARE @bbox geometry = geometry::STGeomFromText(@wkt, 4326);
               SELECT id, name FROM geo_features
               WHERE geom.Filter(@bbox) = 1`
            );
          return { rowsReturned: res.recordset.length };
        }
      },
    },
  ],
};

export default suite;
