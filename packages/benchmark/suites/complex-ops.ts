import type { BenchmarkSuite } from '../types.js';

const suite: BenchmarkSuite = {
  name: 'complex-ops',
  description: 'Complex polygon operations — difference, symmetric difference, convex hull',
  databases: ['postgis', 'mssql'],
  cases: [
    {
      name: 'difference-two-features',
      description: 'Difference between two features (a - b)',
      fn: async (ctx) => {
        if (ctx.database === 'postgis') {
          const res = await ctx.pgPool!.query(
            `SELECT ST_AsGeoJSON(ST_Difference(a.geom, b.geom)) AS diff_geojson
             FROM geo_features a, geo_features b
             WHERE a.id = 1 AND b.id = 2`
          );
          return { rowsReturned: res.rowCount ?? 0 };
        } else {
          const res = await ctx.mssqlPool!.request().query(
            `SELECT a.geom.STDifference(b.geom).STAsText() AS diff_wkt
             FROM geo_features a
             CROSS JOIN geo_features b
             WHERE a.id = 1 AND b.id = 2`
          );
          return { rowsReturned: res.recordset.length };
        }
      },
    },
    {
      name: 'symmetric-difference',
      description: 'Symmetric difference between two features',
      fn: async (ctx) => {
        if (ctx.database === 'postgis') {
          const res = await ctx.pgPool!.query(
            `SELECT ST_AsGeoJSON(ST_SymDifference(a.geom, b.geom)) AS symdiff_geojson
             FROM geo_features a, geo_features b
             WHERE a.id = 1 AND b.id = 2`
          );
          return { rowsReturned: res.rowCount ?? 0 };
        } else {
          const res = await ctx.mssqlPool!.request().query(
            `SELECT a.geom.STSymDifference(b.geom).STAsText() AS symdiff_wkt
             FROM geo_features a
             CROSS JOIN geo_features b
             WHERE a.id = 1 AND b.id = 2`
          );
          return { rowsReturned: res.recordset.length };
        }
      },
    },
    {
      name: 'convex-hull-amsterdam',
      description: 'Convex hull of all features in Amsterdam area',
      fn: async (ctx) => {
        if (ctx.database === 'postgis') {
          const res = await ctx.pgPool!.query(
            `SELECT ST_AsGeoJSON(ST_ConvexHull(ST_Collect(geom))) AS hull_geojson
             FROM geo_features
             WHERE geom && ST_MakeEnvelope(4.8, 52.3, 5.0, 52.4, 4326)`
          );
          return { rowsReturned: res.rowCount ?? 0 };
        } else {
          const res = await ctx.mssqlPool!.request().query(
            `DECLARE @bbox geometry = geometry::STGeomFromText(
               'POLYGON((4.8 52.3, 5.0 52.3, 5.0 52.4, 4.8 52.4, 4.8 52.3))', 4326);
             SELECT geometry::UnionAggregate(geom).STConvexHull().STAsText() AS hull_wkt
             FROM geo_features
             WHERE geom.STIntersects(@bbox) = 1`
          );
          return { rowsReturned: res.recordset.length };
        }
      },
    },
    {
      name: 'voronoi-points-amsterdam',
      description: 'Voronoi diagram of points in Amsterdam (PostGIS-specific)',
      fn: async (ctx) => {
        if (ctx.database === 'postgis') {
          const res = await ctx.pgPool!.query(
            `SELECT ST_AsGeoJSON(ST_VoronoiPolygons(ST_Collect(geom))) AS voronoi_geojson
             FROM geo_features
             WHERE category = 'point'
               AND geom && ST_MakeEnvelope(4.8, 52.3, 5.0, 52.4, 4326)`
          );
          return { rowsReturned: res.rowCount ?? 0 };
        } else {
          // No Voronoi equivalent in SQL Server — compute convex hull as fallback
          const res = await ctx.mssqlPool!.request().query(
            `DECLARE @bbox geometry = geometry::STGeomFromText(
               'POLYGON((4.8 52.3, 5.0 52.3, 5.0 52.4, 4.8 52.4, 4.8 52.3))', 4326);
             SELECT geometry::UnionAggregate(geom).STConvexHull().STAsText() AS hull_wkt
             FROM geo_features
             WHERE category = N'point'
               AND geom.STIntersects(@bbox) = 1`
          );
          return { rowsReturned: res.recordset.length };
        }
      },
    },
    {
      name: 'difference-batch',
      description: 'Pairwise difference of first 50 polygon pairs',
      fn: async (ctx) => {
        if (ctx.database === 'postgis') {
          const res = await ctx.pgPool!.query(
            `SELECT ST_AsGeoJSON(ST_Difference(a.geom, b.geom)) AS diff_geojson
             FROM (SELECT id, geom FROM geo_features WHERE category = 'polygon' LIMIT 50) a
             CROSS JOIN LATERAL (
               SELECT geom FROM geo_features
               WHERE category = 'polygon' AND id > a.id
               LIMIT 1
             ) b`
          );
          return { rowsReturned: res.rowCount ?? 0 };
        } else {
          const res = await ctx.mssqlPool!.request().query(
            `SELECT a.geom.STDifference(b.geom).STAsText() AS diff_wkt
             FROM (SELECT TOP 50 id, geom FROM geo_features WHERE category = N'polygon' ORDER BY id) a
             CROSS APPLY (
               SELECT TOP 1 geom FROM geo_features
               WHERE category = N'polygon' AND id > a.id
               ORDER BY id
             ) b`
          );
          return { rowsReturned: res.recordset.length };
        }
      },
    },
  ],
};

export default suite;
