export default defineNuxtConfig({
  devtools: { enabled: true },
  modules: ['@nuxtjs/tailwindcss'],
  css: ['maplibre-gl/dist/maplibre-gl.css'],
  app: {
    head: {
      title: 'Geodata Benchmark — PostGIS vs SQL Server',
      meta: [
        { name: 'description', content: 'Interactive spatial query benchmark comparing PostGIS and SQL Server' }
      ]
    }
  },
  runtimeConfig: {
    pgHost: process.env.PG_HOST || 'localhost',
    pgPort: Number(process.env.PG_PORT || 5432),
    pgDatabase: process.env.PG_DATABASE || 'geobench',
    pgUser: process.env.PG_USER || 'bench',
    pgPassword: process.env.PG_PASSWORD || 'bench',
    mssqlHost: process.env.MSSQL_HOST || 'localhost',
    mssqlPort: Number(process.env.MSSQL_PORT || 1433),
    mssqlDatabase: process.env.MSSQL_DATABASE || 'geobench',
    mssqlUser: process.env.MSSQL_USER || 'sa',
    mssqlPassword: process.env.MSSQL_PASSWORD || 'Bench!Pass123',
    sqlitePath: process.env.SQLITE_PATH || '../../benchmark-results.db',
  },
  compatibilityDate: '2025-01-01',
})
