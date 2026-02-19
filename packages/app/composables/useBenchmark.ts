interface BenchmarkRow {
  benchmark: string
  operation: string
  db: string
  time_ms: number
}

interface GroupedBenchmark {
  name: string
  postgis: { label: string; avgMs: number; p95Ms: number }[]
  mssql: { label: string; avgMs: number; p95Ms: number }[]
}

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0
  const idx = Math.ceil((p / 100) * sorted.length) - 1
  return sorted[Math.max(0, idx)]
}

export function useBenchmark(rows: BenchmarkRow[]): GroupedBenchmark[] {
  // Group by benchmark name
  const benchmarks = new Map<string, Map<string, { postgis: number[]; mssql: number[] }>>()

  for (const row of rows) {
    if (!benchmarks.has(row.benchmark)) benchmarks.set(row.benchmark, new Map())
    const ops = benchmarks.get(row.benchmark)!
    if (!ops.has(row.operation)) ops.set(row.operation, { postgis: [], mssql: [] })
    const entry = ops.get(row.operation)!
    if (row.db === 'postgis') entry.postgis.push(row.time_ms)
    else if (row.db === 'mssql') entry.mssql.push(row.time_ms)
  }

  return Array.from(benchmarks.entries()).map(([name, ops]) => {
    const labels = Array.from(ops.keys())
    return {
      name,
      postgis: labels.map(label => {
        const times = (ops.get(label)!.postgis).sort((a, b) => a - b)
        return {
          label,
          avgMs: times.length ? times.reduce((a, b) => a + b, 0) / times.length : 0,
          p95Ms: percentile(times, 95),
        }
      }),
      mssql: labels.map(label => {
        const times = (ops.get(label)!.mssql).sort((a, b) => a - b)
        return {
          label,
          avgMs: times.length ? times.reduce((a, b) => a + b, 0) / times.length : 0,
          p95Ms: percentile(times, 95),
        }
      }),
    }
  })
}
