import type { BenchmarkSuite } from '../types.js';

const suite: BenchmarkSuite = {
  name: 'buffer',
  description: 'Buffer operation benchmarks — create and query buffers',
  databases: ['postgis', 'mssql'],
  cases: [
    {
      name: 'buffer-point-1km',
      description: 'Create 1km buffer around a point',
      fn: async (ctx) => {
        if (ctx.database === 'postgis') {
          const res = await ctx.pgPool!.query(
            `SELECT ST_AsGeoJSON(
               ST_Buffer(ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, 1000)::geometry
             ) AS buffer_geojson`,
            [4.9, 52.37]
          );
          return { rowsReturned: res.rowCount ?? 0 };
        } else {
          const res = await ctx.mssqlPool!.request().query(
            `DECLARE @ptGeog geography = geography::STGeomFromText('POINT(4.9 52.37)', 4326);
             SELECT @ptGeog.STBuffer(1000).STAsText() AS buffer_wkt`
          );
          return { rowsReturned: res.recordset.length };
        }
      },
    },
    {
      name: 'buffer-find-within-1km',
      description: 'Find features within 1km buffer of a point',
      fn: async (ctx) => {
        if (ctx.database === 'postgis') {
          const res = await ctx.pgPool!.query(
            `SELECT id, name FROM geo_features
             WHERE ST_DWithin(geom::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, 1000)`,
            [4.9, 52.37]
          );
          return { rowsReturned: res.rowCount ?? 0 };
        } else {
          const res = await ctx.mssqlPool!.request().query(
            `DECLARE @pt geometry = geometry::STGeomFromText('POINT(4.9 52.37)', 4326);
             SELECT id, name FROM geo_features
             WHERE geom.STDistance(@pt) <= 0.009`
          );
          return { rowsReturned: res.recordset.length };
        }
      },
    },
    {
      name: 'buffer-polygons-500m',
      description: 'Buffer all polygons in Amsterdam area by 500m',
      fn: async (ctx) => {
        if (ctx.database === 'postgis') {
          const res = await ctx.pgPool!.query(
            `SELECT id, ST_AsGeoJSON(ST_Buffer(geom::geography, 500)::geometry) AS buffered
             FROM geo_features
             WHERE category = 'polygon'
               AND geom && ST_MakeEnvelope(4.8, 52.3, 5.0, 52.4, 4326)
             LIMIT 1000`
          );
          return { rowsReturned: res.rowCount ?? 0 };
        } else {
          const res = await ctx.mssqlPool!.request().query(
            `DECLARE @bbox geometry = geometry::STGeomFromText(
               'POLYGON((4.8 52.3, 5.0 52.3, 5.0 52.4, 4.8 52.4, 4.8 52.3))', 4326);
             SELECT TOP 1000 id, geom.STBuffer(0.005).STAsText() AS buffered
             FROM geo_features
             WHERE category = N'polygon'
               AND geom.STIntersects(@bbox) = 1`
          );
          return { rowsReturned: res.recordset.length };
        }
      },
    },
    {
      name: 'buffer-point-5km',
      description: 'Create 5km buffer and find intersecting features',
      fn: async (ctx) => {
        if (ctx.database === 'postgis') {
          const res = await ctx.pgPool!.query(
            `SELECT id, name FROM geo_features
             WHERE ST_DWithin(geom::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, 5000)`,
            [4.9, 52.37]
          );
          return { rowsReturned: res.rowCount ?? 0 };
        } else {
          const res = await ctx.mssqlPool!.request().query(
            `DECLARE @pt geometry = geometry::STGeomFromText('POINT(4.9 52.37)', 4326);
             SELECT id, name FROM geo_features
             WHERE geom.STDistance(@pt) <= 0.045`
          );
          return { rowsReturned: res.recordset.length };
        }
      },
    },
  ],
};

export default suite;
