/**
 * Database connection pools for PostGIS and SQL Server.
 */
import pg from 'pg';
import mssql from 'mssql';

// ─── PostGIS (pg) ────────────────────────────────────────────────

let pgPool: pg.Pool | null = null;

export function getPgPool(): pg.Pool {
  if (pgPool) return pgPool;
  pgPool = new pg.Pool({
    host: process.env.PG_HOST ?? 'localhost',
    port: parseInt(process.env.PG_PORT ?? '5432', 10),
    database: process.env.PG_DATABASE ?? 'geobench',
    user: process.env.PG_USER ?? 'bench',
    password: process.env.PG_PASSWORD ?? 'bench',
    max: 20,
  });
  return pgPool;
}

export async function closePgPool(): Promise<void> {
  if (pgPool) {
    await pgPool.end();
    pgPool = null;
  }
}

// ─── SQL Server (mssql) ─────────────────────────────────────────

let mssqlPool: mssql.ConnectionPool | null = null;

const mssqlConfig: mssql.config = {
  server: process.env.MSSQL_HOST ?? 'localhost',
  port: parseInt(process.env.MSSQL_PORT ?? '1433', 10),
  database: process.env.MSSQL_DATABASE ?? 'geobench',
  user: process.env.MSSQL_USER ?? 'sa',
  password: process.env.MSSQL_PASSWORD ?? 'Bench!Pass123',
  options: {
    encrypt: false,
    trustServerCertificate: true,
  },
  pool: {
    max: 20,
    min: 0,
    idleTimeoutMillis: 30000,
  },
};

export async function getMssqlPool(): Promise<mssql.ConnectionPool> {
  if (mssqlPool?.connected) return mssqlPool;
  mssqlPool = await new mssql.ConnectionPool(mssqlConfig).connect();
  return mssqlPool;
}

export async function closeMssqlPool(): Promise<void> {
  if (mssqlPool) {
    await mssqlPool.close();
    mssqlPool = null;
  }
}

// ─── Cleanup ─────────────────────────────────────────────────────

export async function closeAll(): Promise<void> {
  await Promise.all([closePgPool(), closeMssqlPool()]);
}
