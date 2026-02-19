<template>
  <div class="w-80 bg-white border-l border-gray-200 flex flex-col">
    <div class="p-4 border-b border-gray-100">
      <h2 class="font-semibold text-gray-900">Query Results</h2>
      <p class="text-xs text-gray-400 mt-1">Draw a polygon on the map to query both databases</p>
    </div>

    <div v-if="!results && !loading" class="flex-1 flex items-center justify-center p-6">
      <div class="text-center text-gray-300">
        <svg class="w-12 h-12 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l5.447 2.724A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
        </svg>
        <p class="text-sm">No query yet</p>
      </div>
    </div>

    <div v-else class="flex-1 overflow-y-auto p-4 space-y-4">
      <!-- Timing comparison -->
      <div v-if="results" class="space-y-3">
        <!-- PostGIS -->
        <div class="rounded-lg border-2 border-postgis/20 bg-postgis/5 p-3">
          <div class="flex items-center justify-between mb-2">
            <span class="text-sm font-semibold text-postgis flex items-center gap-1.5">
              <span class="w-2 h-2 rounded-full bg-postgis"></span>
              PostGIS
            </span>
            <span v-if="results.postgis" class="text-xs font-mono bg-postgis/10 text-postgis px-2 py-0.5 rounded">
              {{ results.postgis.timeMs.toFixed(1) }}ms
            </span>
          </div>
          <div v-if="results.postgis" class="text-2xl font-bold text-gray-900">
            {{ results.postgis.count.toLocaleString() }}
            <span class="text-sm font-normal text-gray-400">features</span>
          </div>
          <div v-else class="text-sm text-gray-400">No result</div>
        </div>

        <!-- SQL Server -->
        <div class="rounded-lg border-2 border-mssql/20 bg-mssql/5 p-3">
          <div class="flex items-center justify-between mb-2">
            <span class="text-sm font-semibold text-mssql flex items-center gap-1.5">
              <span class="w-2 h-2 rounded-full bg-mssql"></span>
              SQL Server
            </span>
            <span v-if="results.mssql" class="text-xs font-mono bg-mssql/10 text-mssql px-2 py-0.5 rounded">
              {{ results.mssql.timeMs.toFixed(1) }}ms
            </span>
          </div>
          <div v-if="results.mssql" class="text-2xl font-bold text-gray-900">
            {{ results.mssql.count.toLocaleString() }}
            <span class="text-sm font-normal text-gray-400">features</span>
          </div>
          <div v-else class="text-sm text-gray-400">No result</div>
        </div>

        <!-- Speed comparison -->
        <div v-if="results.postgis && results.mssql" class="text-center py-2 px-3 rounded-lg bg-gray-50 border border-gray-100">
          <p class="text-xs text-gray-500">
            <template v-if="speedup > 1">
              <span class="font-semibold text-postgis">PostGIS</span> was
              <span class="font-bold text-gray-900">{{ speedup.toFixed(1) }}×</span> faster
            </template>
            <template v-else-if="speedup < 1">
              <span class="font-semibold text-mssql">SQL Server</span> was
              <span class="font-bold text-gray-900">{{ (1 / speedup).toFixed(1) }}×</span> faster
            </template>
            <template v-else>Both performed equally</template>
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  results: {
    postgis?: { count: number; timeMs: number; data: any[] }
    mssql?: { count: number; timeMs: number; data: any[] }
  } | null
  loading: boolean
}>()

const speedup = computed(() => {
  if (!props.results?.postgis || !props.results?.mssql) return 1
  return props.results.mssql.timeMs / props.results.postgis.timeMs
})
</script>
