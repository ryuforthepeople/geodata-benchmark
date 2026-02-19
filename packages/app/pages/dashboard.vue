<template>
  <div class="max-w-7xl mx-auto px-6 py-8 space-y-8">
    <div class="flex items-center justify-between">
      <h1 class="text-2xl font-bold text-gray-900">Benchmark Results</h1>
      <div class="flex items-center gap-3">
        <label class="text-sm text-gray-500">Scale:</label>
        <select v-model="scale" class="border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white">
          <option :value="5000">5,000 records</option>
          <option :value="50000">50,000 records</option>
          <option :value="500000">500,000 records</option>
          <option :value="2000000">2,000,000 records</option>
        </select>
        <button @click="() => refresh()" class="px-3 py-1.5 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-700 transition-colors">
          Refresh
        </button>
      </div>
    </div>

    <div v-if="pending" class="text-center py-20 text-gray-400">Loading benchmark data…</div>

    <template v-else-if="benchmarks?.length">
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <BenchmarkChart
          v-for="bench in groupedBenchmarks"
          :key="bench.name"
          :title="bench.name"
          :postgis-times="bench.postgis"
          :mssql-times="bench.mssql"
        />
      </div>

      <SummaryTable :results="benchmarks" :scale="scale" />
    </template>

    <div v-else class="text-center py-20 text-gray-400">
      <p class="text-lg">No benchmark data found</p>
      <p class="text-sm mt-2">Run the benchmark suite first to generate results.</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useBenchmark } from '~/composables/useBenchmark'

const scale = ref(5000)

const { data: benchmarks, pending, refresh } = await useFetch('/api/benchmark/results', {
  query: { scale },
  watch: [scale],
})

const groupedBenchmarks = computed(() => {
  if (!benchmarks.value) return []
  return useBenchmark(benchmarks.value as any[])
})
</script>
