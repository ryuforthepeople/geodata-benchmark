import type { BenchmarkSuite } from '../types.js';

// Amsterdam city center rough bounds
const AMSTERDAM_CENTER = {
  type: 'Polygon',
  coordinates: [[[4.87, 52.36], [4.92, 52.36], [4.92, 52.38], [4.87, 52.38], [4.87, 52.36]]],
};

// Larger area around Amsterdam
const AMSTERDAM_WIDE = {
  type: 'Polygon',
  coordinates: [[[4.7, 52.3], [5.1, 52.3], [5.1, 52.5], [4.7, 52.5], [4.7, 52.3]]],
};

// Small area — should return few results
const AMSTERDAM_SMALL = {
  type: 'Polygon',
  coordinates: [[[4.89, 52.37], [4.90, 52.37], [4.90, 52.375], [4.89, 52.375], [4.89, 52.37]]],
};

const suite: BenchmarkSuite = {
  name: 'point-in-polygon',
  description: 'Point-in-polygon query benchmarks — find all points inside a given polygon',
  databases: ['postgis', 'mssql'],
  cases: [
    {
      name: 'pip-amsterdam-center',
      description: 'Points within Amsterdam city center polygon',
      fn: async (ctx) => {
        if (ctx.database === 'postgis') {
          const geojson = JSON.stringify(AMSTERDAM_CENTER);
          const res = await ctx.pgPool!.query(
            `SELECT f.id, f.name
             FROM geo_features f
             WHERE f.category = 'point'
               AND ST_Within(f.geom, ST_SetSRID(ST_GeomFromGeoJSON($1), 4326))`,
            [geojson]
          );
          return { rowsReturned: res.rowCount ?? 0 };
        } else {
          const wkt = 'POLYGON((4.87 52.36, 4.92 52.36, 4.92 52.38, 4.87 52.38, 4.87 52.36))';
          const res = await ctx.mssqlPool!.request()
            .input('poly', wkt)
            .query(
              `DECLARE @queryPoly geometry = geometry::STGeomFromText(@poly, 4326);
               SELECT f.id, f.name
               FROM geo_features f
               WHERE f.category = N'point'
                 AND f.geom.STWithin(@queryPoly) = 1`
            );
          return { rowsReturned: res.recordset.length };
        }
      },
    },
    {
      name: 'pip-amsterdam-wide',
      description: 'Points within wider Amsterdam area',
      fn: async (ctx) => {
        if (ctx.database === 'postgis') {
          const geojson = JSON.stringify(AMSTERDAM_WIDE);
          const res = await ctx.pgPool!.query(
            `SELECT f.id, f.name
             FROM geo_features f
             WHERE f.category = 'point'
               AND ST_Within(f.geom, ST_SetSRID(ST_GeomFromGeoJSON($1), 4326))`,
            [geojson]
          );
          return { rowsReturned: res.rowCount ?? 0 };
        } else {
          const wkt = 'POLYGON((4.7 52.3, 5.1 52.3, 5.1 52.5, 4.7 52.5, 4.7 52.3))';
          const res = await ctx.mssqlPool!.request()
            .input('poly', wkt)
            .query(
              `DECLARE @queryPoly geometry = geometry::STGeomFromText(@poly, 4326);
               SELECT f.id, f.name
               FROM geo_features f
               WHERE f.category = N'point'
                 AND f.geom.STWithin(@queryPoly) = 1`
            );
          return { rowsReturned: res.recordset.length };
        }
      },
    },
    {
      name: 'pip-amsterdam-small',
      description: 'Points within small Amsterdam area (few results expected)',
      fn: async (ctx) => {
        if (ctx.database === 'postgis') {
          const geojson = JSON.stringify(AMSTERDAM_SMALL);
          const res = await ctx.pgPool!.query(
            `SELECT f.id, f.name
             FROM geo_features f
             WHERE f.category = 'point'
               AND ST_Within(f.geom, ST_SetSRID(ST_GeomFromGeoJSON($1), 4326))`,
            [geojson]
          );
          return { rowsReturned: res.rowCount ?? 0 };
        } else {
          const wkt = 'POLYGON((4.89 52.37, 4.90 52.37, 4.90 52.375, 4.89 52.375, 4.89 52.37))';
          const res = await ctx.mssqlPool!.request()
            .input('poly', wkt)
            .query(
              `DECLARE @queryPoly geometry = geometry::STGeomFromText(@poly, 4326);
               SELECT f.id, f.name
               FROM geo_features f
               WHERE f.category = N'point'
                 AND f.geom.STWithin(@queryPoly) = 1`
            );
          return { rowsReturned: res.recordset.length };
        }
      },
    },
  ],
};

export default suite;
