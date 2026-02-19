import mssql from 'mssql'
import { geojsonToWkt } from '@terraformer/wkt'
import { getPgPool, getMssqlPool } from '~/server/utils/db'

interface QueryResult {
  count: number
  timeMs: number
  data: any[]
}

export default defineEventHandler(async (event) => {
  const { geojson, db = 'both' } = await readBody(event)

  if (!geojson) {
    throw createError({ statusCode: 400, message: 'geojson is required' })
  }

  const results: Record<string, QueryResult> = {}

  // PostGIS query
  if (db === 'postgis' || db === 'both') {
    try {
      const pool = getPgPool()
      const start = performance.now()
      const pgResult = await pool.query(
        `SELECT id, name, category, ST_AsGeoJSON(geom) as geojson
         FROM geo_features
         WHERE ST_Intersects(geom, ST_SetSRID(ST_GeomFromGeoJSON($1), 4326))`,
        [JSON.stringify(geojson)]
      )
      results.postgis = {
        count: pgResult.rowCount ?? 0,
        timeMs: performance.now() - start,
        data: pgResult.rows,
      }
    } catch (e: any) {
      console.error('PostGIS query error:', e.message)
      results.postgis = { count: 0, timeMs: 0, data: [] }
    }
  }

  // SQL Server query
  if (db === 'mssql' || db === 'both') {
    try {
      const pool = await getMssqlPool()
      const wkt = geojsonToWkt(geojson)
      const start = performance.now()
      const msResult = await pool.request()
        .input('wkt', mssql.NVarChar(mssql.MAX), wkt)
        .query(`
          DECLARE @input geometry = geometry::STGeomFromText(@wkt, 4326);
          SELECT id, name, category, geom.STAsText() as wkt
          FROM geo_features
          WHERE geom.STIntersects(@input) = 1
        `)
      // Convert WKT back to GeoJSON for map display
      const { wktToGeoJSON } = await import('@terraformer/wkt')
      results.mssql = {
        count: msResult.recordset.length,
        timeMs: performance.now() - start,
        data: msResult.recordset.map((r: any) => ({
          id: r.id,
          name: r.name,
          category: r.category,
          geojson: JSON.stringify(wktToGeoJSON(r.wkt)),
        })),
      }
    } catch (e: any) {
      console.error('SQL Server query error:', e.message)
      results.mssql = { count: 0, timeMs: 0, data: [] }
    }
  }

  return results
})
