import type { BenchmarkSuite, BenchmarkContext } from '../types.js';
import pLimit from 'p-limit';

const CONCURRENCY = 10;

function randomPoint(): { lon: number; lat: number } {
  return {
    lon: 3.37 + Math.random() * (7.21 - 3.37),
    lat: 50.75 + Math.random() * (53.47 - 50.75),
  };
}

function randomBbox(): { minLon: number; minLat: number; maxLon: number; maxLat: number } {
  const lon = 4.8 + Math.random() * 0.15;
  const lat = 52.3 + Math.random() * 0.08;
  const size = 0.01 + Math.random() * 0.04;
  return { minLon: lon, minLat: lat, maxLon: lon + size, maxLat: lat + size };
}

async function mixedWorkload(
  ctx: BenchmarkContext,
  totalOps: number,
  writeRatio: number,
  concurrency: number,
): Promise<number> {
  const limit = pLimit(concurrency);
  let totalRows = 0;

  const ops = Array.from({ length: totalOps }, () => Math.random() < writeRatio ? 'write' : 'read');

  await Promise.all(
    ops.map((op) =>
      limit(async () => {
        if (op === 'write') {
          const pt = randomPoint();
          if (ctx.database === 'postgis') {
            const res = await ctx.pgPool!.query(
              `INSERT INTO geo_features (name, category, properties, geom)
               VALUES ($1, 'point', '{}', ST_SetSRID(ST_MakePoint($2, $3), 4326))`,
              [`mixed_${Date.now()}_${Math.random()}`, pt.lon, pt.lat]
            );
            totalRows += res.rowCount ?? 0;
          } else {
            const wkt = `POINT(${pt.lon} ${pt.lat})`;
            const res = await ctx.mssqlPool!.request()
              .input('name', `mixed_${Date.now()}_${Math.random()}`)
              .input('wkt', wkt)
              .query(
                `INSERT INTO geo_features (name, category, properties, geom)
                 VALUES (@name, N'point', N'{}', geometry::STGeomFromText(@wkt, 4326))`
              );
            totalRows += res.rowsAffected[0] ?? 0;
          }
        } else {
          const bbox = randomBbox();
          if (ctx.database === 'postgis') {
            const res = await ctx.pgPool!.query(
              `SELECT id, name FROM geo_features
               WHERE ST_Intersects(geom, ST_MakeEnvelope($1, $2, $3, $4, 4326))`,
              [bbox.minLon, bbox.minLat, bbox.maxLon, bbox.maxLat]
            );
            totalRows += res.rowCount ?? 0;
          } else {
            const wkt = `POLYGON((${bbox.minLon} ${bbox.minLat}, ${bbox.maxLon} ${bbox.minLat}, ${bbox.maxLon} ${bbox.maxLat}, ${bbox.minLon} ${bbox.maxLat}, ${bbox.minLon} ${bbox.minLat}))`;
            const res = await ctx.mssqlPool!.request()
              .input('wkt', wkt)
              .query(
                `DECLARE @bbox geometry = geometry::STGeomFromText(@wkt, 4326);
                 SELECT id, name FROM geo_features
                 WHERE geom.STIntersects(@bbox) = 1`
              );
            totalRows += res.recordset.length;
          }
        }
      })
    )
  );

  return totalRows;
}

const suite: BenchmarkSuite = {
  name: 'mixed-workload',
  description: 'Mixed read/write workload benchmarks — simulates realistic load',
  databases: ['postgis', 'mssql'],
  cases: [
    {
      name: 'mixed-80read-20write',
      description: '500 ops: 80% reads (intersects) + 20% writes (inserts)',
      fn: async (ctx) => {
        const rows = await mixedWorkload(ctx, 500, 0.2, CONCURRENCY);
        return { rowsReturned: rows };
      },
    },
    {
      name: 'mixed-50read-50write',
      description: '500 ops: 50% reads + 50% writes',
      fn: async (ctx) => {
        const rows = await mixedWorkload(ctx, 500, 0.5, CONCURRENCY);
        return { rowsReturned: rows };
      },
    },
    {
      name: 'mixed-95read-5write',
      description: '500 ops: 95% reads + 5% writes (read-heavy)',
      fn: async (ctx) => {
        const rows = await mixedWorkload(ctx, 500, 0.05, CONCURRENCY);
        return { rowsReturned: rows };
      },
    },
  ],
  teardown: async (ctx) => {
    if (ctx.database === 'postgis') {
      await ctx.pgPool!.query(`DELETE FROM geo_features WHERE name LIKE 'mixed_%'`);
    } else {
      await ctx.mssqlPool!.request().query(`DELETE FROM geo_features WHERE name LIKE N'mixed_%'`);
    }
  },
};

export default suite;
