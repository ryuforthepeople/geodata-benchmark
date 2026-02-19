import type { BenchmarkSuite } from '../types.js';

// Simple rectangle — 4 vertices (Amsterdam area)
const SIMPLE_RECT = {
  type: 'Polygon',
  coordinates: [[[4.8, 52.3], [5.0, 52.3], [5.0, 52.4], [4.8, 52.4], [4.8, 52.3]]],
};

// Moderate polygon — ~20 vertices (irregular shape around Amsterdam)
const MODERATE_POLYGON = {
  type: 'Polygon',
  coordinates: [[[4.82, 52.34], [4.85, 52.33], [4.88, 52.32], [4.91, 52.33],
    [4.94, 52.34], [4.96, 52.35], [4.97, 52.37], [4.96, 52.39],
    [4.95, 52.40], [4.93, 52.41], [4.91, 52.42], [4.88, 52.42],
    [4.86, 52.41], [4.84, 52.40], [4.83, 52.39], [4.82, 52.38],
    [4.81, 52.37], [4.81, 52.36], [4.82, 52.35], [4.82, 52.34]]],
};

// Complex polygon — 50+ vertices (detailed irregular shape)
const COMPLEX_POLYGON = {
  type: 'Polygon',
  coordinates: [(() => {
    const center = [4.9, 52.37];
    const points: number[][] = [];
    const n = 60;
    for (let i = 0; i <= n; i++) {
      const angle = (2 * Math.PI * (i % n)) / n;
      const r = 0.04 + 0.02 * Math.sin(3 * angle) + 0.01 * Math.cos(7 * angle);
      points.push([
        Math.round((center[0] + r * Math.cos(angle)) * 1e6) / 1e6,
        Math.round((center[1] + r * Math.sin(angle)) * 1e6) / 1e6,
      ]);
    }
    return points;
  })()],
};

// MultiPolygon — two separate areas
const MULTI_POLYGON = {
  type: 'MultiPolygon',
  coordinates: [
    [[[4.8, 52.3], [4.85, 52.3], [4.85, 52.35], [4.8, 52.35], [4.8, 52.3]]],
    [[[4.9, 52.37], [4.95, 52.37], [4.95, 52.42], [4.9, 52.42], [4.9, 52.37]]],
  ],
};

// Thin elongated shape — stress-test for spatial index
const THIN_SHAPE = {
  type: 'Polygon',
  coordinates: [[[3.5, 52.0], [7.0, 52.0], [7.0, 52.005], [3.5, 52.005], [3.5, 52.0]]],
};

// Netherlands-wide bbox
const NL_BBOX = {
  type: 'Polygon',
  coordinates: [[[3.37, 50.75], [7.21, 50.75], [7.21, 53.47], [3.37, 53.47], [3.37, 50.75]]],
};

function geojsonToWkt(geojson: { type: string; coordinates: any }): string {
  if (geojson.type === 'Polygon') {
    const rings = geojson.coordinates.map(
      (ring: number[][]) => '(' + ring.map((c: number[]) => `${c[0]} ${c[1]}`).join(', ') + ')'
    );
    return `POLYGON(${rings.join(', ')})`;
  }
  if (geojson.type === 'MultiPolygon') {
    const polys = geojson.coordinates.map(
      (poly: number[][][]) => '(' + poly.map(
        (ring: number[][]) => '(' + ring.map((c: number[]) => `${c[0]} ${c[1]}`).join(', ') + ')'
      ).join(', ') + ')'
    );
    return `MULTIPOLYGON(${polys.join(', ')})`;
  }
  throw new Error(`Unsupported type: ${geojson.type}`);
}

function makeIntersectsCase(
  name: string,
  description: string,
  geojson: { type: string; coordinates: any },
) {
  const geojsonStr = JSON.stringify(geojson);
  const wkt = geojsonToWkt(geojson);

  return {
    name,
    description,
    fn: async (ctx: import('../types.js').BenchmarkContext) => {
      if (ctx.database === 'postgis') {
        const res = await ctx.pgPool!.query(
          `SELECT f.id, f.name, f.category, ST_AsGeoJSON(f.geom) AS geojson
           FROM geo_features f
           WHERE ST_Intersects(f.geom, ST_SetSRID(ST_GeomFromGeoJSON($1), 4326))`,
          [geojsonStr]
        );
        return { rowsReturned: res.rowCount ?? 0 };
      } else {
        const res = await ctx.mssqlPool!.request()
          .input('wkt', wkt)
          .query(
            `DECLARE @input geometry = geometry::STGeomFromText(@wkt, 4326);
             SELECT f.id, f.name, f.category, f.geom.STAsText() AS wkt
             FROM geo_features f
             WHERE f.geom.STIntersects(@input) = 1`
          );
        return { rowsReturned: res.recordset.length };
      }
    },
  };
}

function makeIntersectsWithGeomCase(
  name: string,
  description: string,
  geojson: { type: string; coordinates: any },
) {
  const geojsonStr = JSON.stringify(geojson);
  const wkt = geojsonToWkt(geojson);

  return {
    name,
    description,
    fn: async (ctx: import('../types.js').BenchmarkContext) => {
      if (ctx.database === 'postgis') {
        const res = await ctx.pgPool!.query(
          `SELECT f.id, f.name, f.category,
                  ST_AsGeoJSON(ST_Intersection(f.geom, ST_SetSRID(ST_GeomFromGeoJSON($1), 4326))) AS intersection_geojson
           FROM geo_features f
           WHERE ST_Intersects(f.geom, ST_SetSRID(ST_GeomFromGeoJSON($1), 4326))`,
          [geojsonStr]
        );
        return { rowsReturned: res.rowCount ?? 0 };
      } else {
        const res = await ctx.mssqlPool!.request()
          .input('wkt', wkt)
          .query(
            `DECLARE @input geometry = geometry::STGeomFromText(@wkt, 4326);
             SELECT f.id, f.name, f.category,
                    f.geom.STIntersection(@input).STAsText() AS intersection_wkt
             FROM geo_features f
             WHERE f.geom.STIntersects(@input) = 1`
          );
        return { rowsReturned: res.recordset.length };
      }
    },
  };
}

const suite: BenchmarkSuite = {
  name: 'intersects',
  description: 'ST_Intersects benchmarks — the core spatial query use case',
  databases: ['postgis', 'mssql'],
  cases: [
    makeIntersectsCase(
      'intersects-simple-rect',
      'Intersects with simple rectangle (4 vertices, Amsterdam area)',
      SIMPLE_RECT,
    ),
    makeIntersectsCase(
      'intersects-moderate-polygon',
      'Intersects with moderate polygon (~20 vertices)',
      MODERATE_POLYGON,
    ),
    makeIntersectsCase(
      'intersects-complex-polygon',
      'Intersects with complex polygon (60 vertices, irregular)',
      COMPLEX_POLYGON,
    ),
    makeIntersectsCase(
      'intersects-multipolygon',
      'Intersects with MultiPolygon (two separate areas)',
      MULTI_POLYGON,
    ),
    makeIntersectsCase(
      'intersects-thin-shape',
      'Intersects with thin elongated polygon (stress-test index)',
      THIN_SHAPE,
    ),
    makeIntersectsCase(
      'intersects-nl-bbox',
      'Intersects with Netherlands-wide bounding box',
      NL_BBOX,
    ),
    makeIntersectsWithGeomCase(
      'intersects-with-geom-simple',
      'Intersects + compute intersection geometry (simple rect)',
      SIMPLE_RECT,
    ),
    makeIntersectsWithGeomCase(
      'intersects-with-geom-complex',
      'Intersects + compute intersection geometry (complex polygon)',
      COMPLEX_POLYGON,
    ),
    // Filtered by category
    {
      name: 'intersects-polygons-only',
      description: 'Intersects filtered to polygon category only',
      fn: async (ctx) => {
        const geojsonStr = JSON.stringify(SIMPLE_RECT);
        const wkt = geojsonToWkt(SIMPLE_RECT);
        if (ctx.database === 'postgis') {
          const res = await ctx.pgPool!.query(
            `SELECT f.id, f.name, ST_AsGeoJSON(f.geom) AS geojson
             FROM geo_features f
             WHERE f.category = 'polygon'
               AND ST_Intersects(f.geom, ST_SetSRID(ST_GeomFromGeoJSON($1), 4326))`,
            [geojsonStr]
          );
          return { rowsReturned: res.rowCount ?? 0 };
        } else {
          const res = await ctx.mssqlPool!.request()
            .input('wkt', wkt)
            .query(
              `DECLARE @input geometry = geometry::STGeomFromText(@wkt, 4326);
               SELECT f.id, f.name, f.geom.STAsText() AS wkt
               FROM geo_features f
               WHERE f.category = N'polygon'
                 AND f.geom.STIntersects(@input) = 1`
            );
          return { rowsReturned: res.recordset.length };
        }
      },
    },
  ],
};

export default suite;
