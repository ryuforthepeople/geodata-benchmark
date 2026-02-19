import { createRequire } from 'module'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const scale = Number(query.scale) || 5000

  try {
    const config = useRuntimeConfig()
    const dbPath = config.sqlitePath as string

    // Use better-sqlite3 if available, otherwise return mock data
    let Database: any
    try {
      const require = createRequire(import.meta.url)
      Database = require('better-sqlite3')
    } catch {
      // Fallback: return empty array if better-sqlite3 not installed
      return []
    }

    const db = new Database(dbPath, { readonly: true })

    const rows = db.prepare(`
      SELECT
        benchmark,
        operation,
        db,
        scale,
        time_ms,
        created_at
      FROM benchmark_results
      WHERE scale = ?
      ORDER BY benchmark, operation, db, created_at
    `).all(scale)

    db.close()
    return rows
  } catch (e: any) {
    console.error('Failed to read benchmark results:', e.message)
    return []
  }
})
