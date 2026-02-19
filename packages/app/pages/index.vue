<template>
  <div class="flex h-[calc(100vh-57px)]">
    <div class="flex-1 relative">
      <MapView @draw-complete="onDrawComplete" :postgis-geojson="postgisGeoJSON" :mssql-geojson="mssqlGeoJSON" />
      <div v-if="loading" class="absolute top-4 left-1/2 -translate-x-1/2 bg-white shadow-lg rounded-full px-4 py-2 text-sm font-medium text-gray-700 flex items-center gap-2">
        <svg class="animate-spin h-4 w-4 text-gray-500" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none" /><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
        Querying both databases…
      </div>
    </div>
    <ResultsPanel :results="results" :loading="loading" />
  </div>
</template>

<script setup lang="ts">
interface QueryResult {
  count: number
  timeMs: number
  data: any[]
}

const loading = ref(false)
const results = ref<{ postgis?: QueryResult; mssql?: QueryResult } | null>(null)
const postgisGeoJSON = ref<any>(null)
const mssqlGeoJSON = ref<any>(null)

async function onDrawComplete(geojson: any) {
  loading.value = true
  results.value = null
  postgisGeoJSON.value = null
  mssqlGeoJSON.value = null

  try {
    const res = await $fetch('/api/query/intersects', {
      method: 'POST',
      body: { geojson, db: 'both' }
    })

    results.value = res as any

    if ((res as any).postgis?.data?.length) {
      postgisGeoJSON.value = {
        type: 'FeatureCollection',
        features: (res as any).postgis.data.map((r: any) => ({
          type: 'Feature',
          geometry: JSON.parse(r.geojson),
          properties: { id: r.id, name: r.name, category: r.category }
        }))
      }
    }

    if ((res as any).mssql?.data?.length) {
      mssqlGeoJSON.value = {
        type: 'FeatureCollection',
        features: (res as any).mssql.data.map((r: any) => ({
          type: 'Feature',
          geometry: JSON.parse(r.geojson),
          properties: { id: r.id, name: r.name, category: r.category }
        }))
      }
    }
  } catch (e: any) {
    console.error('Query failed:', e)
    results.value = { postgis: undefined, mssql: undefined }
  } finally {
    loading.value = false
  }
}
</script>
