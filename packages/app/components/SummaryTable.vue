<template>
  <div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
    <div class="px-5 py-4 border-b border-gray-100">
      <h3 class="font-semibold text-gray-900">Summary — {{ scale.toLocaleString() }} records</h3>
    </div>
    <div class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead>
          <tr class="bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
            <th class="px-5 py-3">Benchmark</th>
            <th class="px-5 py-3">Operation</th>
            <th class="px-5 py-3 text-postgis">PostGIS (avg)</th>
            <th class="px-5 py-3 text-mssql">SQL Server (avg)</th>
            <th class="px-5 py-3">Winner</th>
            <th class="px-5 py-3">Speedup</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-100">
          <tr v-for="row in rows" :key="row.key" class="hover:bg-gray-50/50">
            <td class="px-5 py-3 font-medium text-gray-900">{{ row.benchmark }}</td>
            <td class="px-5 py-3 text-gray-600">{{ row.operation }}</td>
            <td class="px-5 py-3 font-mono text-postgis">{{ row.postgisMs?.toFixed(1) ?? '—' }}ms</td>
            <td class="px-5 py-3 font-mono text-mssql">{{ row.mssqlMs?.toFixed(1) ?? '—' }}ms</td>
            <td class="px-5 py-3">
              <span
                class="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold"
                :class="row.winner === 'postgis' ? 'bg-postgis/10 text-postgis' : 'bg-mssql/10 text-mssql'"
              >
                {{ row.winner === 'postgis' ? 'PostGIS' : 'SQL Server' }}
              </span>
            </td>
            <td class="px-5 py-3 font-mono text-gray-700">{{ row.speedup }}×</td>
          </tr>
          <tr v-if="!rows.length">
            <td colspan="6" class="px-5 py-8 text-center text-gray-400">No data available</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  results: any[]
  scale: number
}>()

interface Row {
  key: string
  benchmark: string
  operation: string
  postgisMs: number | null
  mssqlMs: number | null
  winner: 'postgis' | 'mssql'
  speedup: string
}

const rows = computed<Row[]>(() => {
  if (!props.results?.length) return []

  const grouped = new Map<string, { postgis: number[]; mssql: number[] }>()

  for (const r of props.results) {
    const key = `${r.benchmark}::${r.operation}`
    if (!grouped.has(key)) grouped.set(key, { postgis: [], mssql: [] })
    const g = grouped.get(key)!
    if (r.db === 'postgis') g.postgis.push(r.time_ms)
    else if (r.db === 'mssql') g.mssql.push(r.time_ms)
  }

  return Array.from(grouped.entries()).map(([key, g]) => {
    const [benchmark, operation] = key.split('::')
    const pgAvg = g.postgis.length ? g.postgis.reduce((a, b) => a + b, 0) / g.postgis.length : null
    const msAvg = g.mssql.length ? g.mssql.reduce((a, b) => a + b, 0) / g.mssql.length : null
    const winner = (pgAvg ?? Infinity) <= (msAvg ?? Infinity) ? 'postgis' as const : 'mssql' as const
    const faster = Math.min(pgAvg ?? Infinity, msAvg ?? Infinity)
    const slower = Math.max(pgAvg ?? 0, msAvg ?? 0)
    const speedup = faster > 0 ? (slower / faster).toFixed(1) : '—'
    return { key, benchmark, operation, postgisMs: pgAvg, mssqlMs: msAvg, winner, speedup }
  })
})
</script>
