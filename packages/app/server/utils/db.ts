import pg from 'pg'
import mssql from 'mssql'

let _pgPool: pg.Pool | null = null
let _mssqlPool: mssql.ConnectionPool | null = null

export function getPgPool(): pg.Pool {
  if (!_pgPool) {
    const config = useRuntimeConfig()
    _pgPool = new pg.Pool({
      host: config.pgHost as string,
      port: config.pgPort as number,
      database: config.pgDatabase as string,
      user: config.pgUser as string,
      password: config.pgPassword as string,
      max: 20,
    })
  }
  return _pgPool
}

export async function getMssqlPool(): Promise<mssql.ConnectionPool> {
  if (!_mssqlPool || !_mssqlPool.connected) {
    const config = useRuntimeConfig()
    _mssqlPool = await new mssql.ConnectionPool({
      server: config.mssqlHost as string,
      port: config.mssqlPort as number,
      database: config.mssqlDatabase as string,
      user: config.mssqlUser as string,
      password: config.mssqlPassword as string,
      options: { trustServerCertificate: true },
      pool: { max: 20 },
    }).connect()
  }
  return _mssqlPool
}
