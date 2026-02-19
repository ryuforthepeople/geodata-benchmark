import type { BenchmarkSuite, BenchmarkContext } from '../types.js';
import pLimit from 'p-limit';

const CONCURRENCY = 10;
const TOTAL_QUERIES = 100;

// Random bbox generators for varied queries
function randomAmsterdamBbox(): { minLon: number; minLat: number; maxLon: number; maxLat: number } {
  const lon = 4.8 + Math.random() * 0.15;
  const lat = 52.3 + Math.random() * 0.08;
  const size = 0.01 + Math.random() * 0.04;
  return { minLon: lon, minLat: lat, maxLon: lon + size, maxLat: lat + size };
}

async function runConcurrentPostgis(ctx: BenchmarkContext, totalQueries: number, concurrency: number): Promise<number> {
  const limit = pLimit(concurrency);
  let totalRows = 0;

  await Promise.all(
    Array.from({ length: totalQueries }, () =>
      limit(async () => {
        const bbox = randomAmsterdamBbox();
        const res = await ctx.pgPool!.query(
          `SELECT id, name FROM geo_features
           WHERE ST_Intersects(geom, ST_MakeEnvelope($1, $2, $3, $4, 4326))`,
          [bbox.minLon, bbox.minLat, bbox.maxLon, bbox.maxLat]
        );
        totalRows += res.rowCount ?? 0;
      })
    )
  );

  return totalRows;
}

async function runConcurrentMssql(ctx: BenchmarkContext, totalQueries: number, concurrency: number): Promise<number> {
  const limit = pLimit(concurrency);
  let totalRows = 0;

  await Promise.all(
    Array.from({ length: totalQueries }, () =>
      limit(async () => {
        const bbox = randomAmsterdamBbox();
        const wkt = `POLYGON((${bbox.minLon} ${bbox.minLat}, ${bbox.maxLon} ${bbox.minLat}, ${bbox.maxLon} ${bbox.maxLat}, ${bbox.minLon} ${bbox.maxLat}, ${bbox.minLon} ${bbox.minLat}))`;
        const res = await ctx.mssqlPool!.request()
          .input('wkt', wkt)
          .query(
            `DECLARE @bbox geometry = geometry::STGeomFromText(@wkt, 4326);
             SELECT id, name FROM geo_features
             WHERE geom.STIntersects(@bbox) = 1`
          );
        totalRows += res.recordset.length;
      })
    )
  );

  return totalRows;
}

const suite: BenchmarkSuite = {
  name: 'concurrent',
  description: 'Concurrent query performance — multiple simultaneous spatial queries',
  databases: ['postgis', 'mssql'],
  cases: [
    {
      name: 'concurrent-intersects-c5',
      description: '100 random intersects queries at concurrency 5',
      fn: async (ctx) => {
        if (ctx.database === 'postgis') {
          const rows = await runConcurrentPostgis(ctx, TOTAL_QUERIES, 5);
          return { rowsReturned: rows };
        } else {
          const rows = await runConcurrentMssql(ctx, TOTAL_QUERIES, 5);
          return { rowsReturned: rows };
        }
      },
    },
    {
      name: 'concurrent-intersects-c10',
      description: '100 random intersects queries at concurrency 10',
      fn: async (ctx) => {
        if (ctx.database === 'postgis') {
          const rows = await runConcurrentPostgis(ctx, TOTAL_QUERIES, 10);
          return { rowsReturned: rows };
        } else {
          const rows = await runConcurrentMssql(ctx, TOTAL_QUERIES, 10);
          return { rowsReturned: rows };
        }
      },
    },
    {
      name: 'concurrent-intersects-c25',
      description: '100 random intersects queries at concurrency 25',
      fn: async (ctx) => {
        if (ctx.database === 'postgis') {
          const rows = await runConcurrentPostgis(ctx, TOTAL_QUERIES, 25);
          return { rowsReturned: rows };
        } else {
          const rows = await runConcurrentMssql(ctx, TOTAL_QUERIES, 25);
          return { rowsReturned: rows };
        }
      },
    },
    {
      name: 'concurrent-intersects-c50',
      description: '200 random intersects queries at concurrency 50',
      fn: async (ctx) => {
        if (ctx.database === 'postgis') {
          const rows = await runConcurrentPostgis(ctx, 200, 50);
          return { rowsReturned: rows };
        } else {
          const rows = await runConcurrentMssql(ctx, 200, 50);
          return { rowsReturned: rows };
        }
      },
    },
  ],
};

export default suite;
