import type { BenchmarkSuite } from '../types.js';

// Amsterdam central station area
const AMSTERDAM_PT = { lon: 4.9, lat: 52.37 };
// Rotterdam
const ROTTERDAM_PT = { lon: 4.48, lat: 51.92 };

const suite: BenchmarkSuite = {
  name: 'distance',
  description: 'Distance and nearest neighbor query benchmarks',
  databases: ['postgis', 'mssql'],
  cases: [
    {
      name: 'knn-10-amsterdam',
      description: '10 nearest neighbors to Amsterdam center',
      fn: async (ctx) => {
        if (ctx.database === 'postgis') {
          const res = await ctx.pgPool!.query(
            `SELECT id, name, ST_AsGeoJSON(geom) AS geojson,
                    ST_Distance(geom::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) AS dist_m
             FROM geo_features
             ORDER BY geom <-> ST_SetSRID(ST_MakePoint($1, $2), 4326)
             LIMIT 10`,
            [AMSTERDAM_PT.lon, AMSTERDAM_PT.lat]
          );
          return { rowsReturned: res.rowCount ?? 0 };
        } else {
          const res = await ctx.mssqlPool!.request()
            .input('lon', AMSTERDAM_PT.lon)
            .input('lat', AMSTERDAM_PT.lat)
            .query(
              `DECLARE @pt geometry = geometry::STGeomFromText('POINT(' + CAST(@lon AS VARCHAR) + ' ' + CAST(@lat AS VARCHAR) + ')', 4326);
               SELECT TOP 10 id, name,
                      geom.STDistance(@pt) AS dist
               FROM geo_features
               WHERE geom.STDistance(@pt) IS NOT NULL
               ORDER BY geom.STDistance(@pt)`
            );
          return { rowsReturned: res.recordset.length };
        }
      },
    },
    {
      name: 'knn-50-amsterdam',
      description: '50 nearest neighbors to Amsterdam center',
      fn: async (ctx) => {
        if (ctx.database === 'postgis') {
          const res = await ctx.pgPool!.query(
            `SELECT id, name,
                    ST_Distance(geom::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) AS dist_m
             FROM geo_features
             ORDER BY geom <-> ST_SetSRID(ST_MakePoint($1, $2), 4326)
             LIMIT 50`,
            [AMSTERDAM_PT.lon, AMSTERDAM_PT.lat]
          );
          return { rowsReturned: res.rowCount ?? 0 };
        } else {
          const res = await ctx.mssqlPool!.request()
            .input('lon', AMSTERDAM_PT.lon)
            .input('lat', AMSTERDAM_PT.lat)
            .query(
              `DECLARE @pt geometry = geometry::STGeomFromText('POINT(' + CAST(@lon AS VARCHAR) + ' ' + CAST(@lat AS VARCHAR) + ')', 4326);
               SELECT TOP 50 id, name,
                      geom.STDistance(@pt) AS dist
               FROM geo_features
               WHERE geom.STDistance(@pt) IS NOT NULL
               ORDER BY geom.STDistance(@pt)`
            );
          return { rowsReturned: res.recordset.length };
        }
      },
    },
    {
      name: 'within-5km-amsterdam',
      description: 'All features within 5km of Amsterdam center',
      fn: async (ctx) => {
        if (ctx.database === 'postgis') {
          const res = await ctx.pgPool!.query(
            `SELECT id, name
             FROM geo_features
             WHERE ST_DWithin(geom::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, 5000)`,
            [AMSTERDAM_PT.lon, AMSTERDAM_PT.lat]
          );
          return { rowsReturned: res.rowCount ?? 0 };
        } else {
          // SQL Server geometry: approximate 5km in degrees (~0.045)
          const res = await ctx.mssqlPool!.request()
            .input('lon', AMSTERDAM_PT.lon)
            .input('lat', AMSTERDAM_PT.lat)
            .query(
              `DECLARE @pt geometry = geometry::STGeomFromText('POINT(' + CAST(@lon AS VARCHAR) + ' ' + CAST(@lat AS VARCHAR) + ')', 4326);
               SELECT id, name
               FROM geo_features
               WHERE geom.STDistance(@pt) <= 0.045`
            );
          return { rowsReturned: res.recordset.length };
        }
      },
    },
    {
      name: 'within-1km-amsterdam',
      description: 'All features within 1km of Amsterdam center',
      fn: async (ctx) => {
        if (ctx.database === 'postgis') {
          const res = await ctx.pgPool!.query(
            `SELECT id, name
             FROM geo_features
             WHERE ST_DWithin(geom::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, 1000)`,
            [AMSTERDAM_PT.lon, AMSTERDAM_PT.lat]
          );
          return { rowsReturned: res.rowCount ?? 0 };
        } else {
          const res = await ctx.mssqlPool!.request()
            .input('lon', AMSTERDAM_PT.lon)
            .input('lat', AMSTERDAM_PT.lat)
            .query(
              `DECLARE @pt geometry = geometry::STGeomFromText('POINT(' + CAST(@lon AS VARCHAR) + ' ' + CAST(@lat AS VARCHAR) + ')', 4326);
               SELECT id, name
               FROM geo_features
               WHERE geom.STDistance(@pt) <= 0.009`
            );
          return { rowsReturned: res.recordset.length };
        }
      },
    },
    {
      name: 'knn-10-rotterdam',
      description: '10 nearest neighbors to Rotterdam (different area)',
      fn: async (ctx) => {
        if (ctx.database === 'postgis') {
          const res = await ctx.pgPool!.query(
            `SELECT id, name,
                    ST_Distance(geom::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) AS dist_m
             FROM geo_features
             ORDER BY geom <-> ST_SetSRID(ST_MakePoint($1, $2), 4326)
             LIMIT 10`,
            [ROTTERDAM_PT.lon, ROTTERDAM_PT.lat]
          );
          return { rowsReturned: res.rowCount ?? 0 };
        } else {
          const res = await ctx.mssqlPool!.request()
            .input('lon', ROTTERDAM_PT.lon)
            .input('lat', ROTTERDAM_PT.lat)
            .query(
              `DECLARE @pt geometry = geometry::STGeomFromText('POINT(' + CAST(@lon AS VARCHAR) + ' ' + CAST(@lat AS VARCHAR) + ')', 4326);
               SELECT TOP 10 id, name,
                      geom.STDistance(@pt) AS dist
               FROM geo_features
               WHERE geom.STDistance(@pt) IS NOT NULL
               ORDER BY geom.STDistance(@pt)`
            );
          return { rowsReturned: res.recordset.length };
        }
      },
    },
  ],
};

export default suite;
