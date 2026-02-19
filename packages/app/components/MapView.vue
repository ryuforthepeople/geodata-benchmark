<template>
  <div ref="mapContainer" class="w-full h-full" />
</template>

<script setup lang="ts">
import maplibregl from 'maplibre-gl'

const props = defineProps<{
  postgisGeojson?: any
  mssqlGeojson?: any
}>()

const emit = defineEmits<{
  'draw-complete': [geojson: any]
}>()

const mapContainer = ref<HTMLElement>()
let map: maplibregl.Map | null = null

const emptyFC = () => ({ type: 'FeatureCollection' as const, features: [] })

onMounted(async () => {
  // Dynamic import for mapbox-gl-draw (no types needed)
  const MapboxDraw = (await import('@mapbox/mapbox-gl-draw')).default

  map = new maplibregl.Map({
    container: mapContainer.value!,
    style: 'https://demotiles.maplibre.org/style.json',
    center: [5.0, 52.3],
    zoom: 8,
  })

  map.addControl(new maplibregl.NavigationControl(), 'top-left')

  const draw = new MapboxDraw({
    displayControlsDefault: false,
    controls: { polygon: true, trash: true },
  })
  map.addControl(draw as any)

  map.on('draw.create', (e: any) => {
    emit('draw-complete', e.features[0].geometry)
  })

  map.on('load', () => {
    map!.addSource('postgis-results', { type: 'geojson', data: emptyFC() })
    map!.addSource('mssql-results', { type: 'geojson', data: emptyFC() })

    // PostGIS layers (blue)
    map!.addLayer({
      id: 'postgis-fill',
      type: 'fill',
      source: 'postgis-results',
      paint: { 'fill-color': '#3b82f6', 'fill-opacity': 0.25 },
    })
    map!.addLayer({
      id: 'postgis-line',
      type: 'line',
      source: 'postgis-results',
      paint: { 'line-color': '#3b82f6', 'line-width': 1.5 },
    })

    // SQL Server layers (red)
    map!.addLayer({
      id: 'mssql-fill',
      type: 'fill',
      source: 'mssql-results',
      paint: { 'fill-color': '#ef4444', 'fill-opacity': 0.25 },
    })
    map!.addLayer({
      id: 'mssql-line',
      type: 'line',
      source: 'mssql-results',
      paint: { 'line-color': '#ef4444', 'line-width': 1.5 },
    })

    // Point layers
    map!.addLayer({
      id: 'postgis-points',
      type: 'circle',
      source: 'postgis-results',
      filter: ['==', '$type', 'Point'],
      paint: { 'circle-color': '#3b82f6', 'circle-radius': 4, 'circle-opacity': 0.7 },
    })
    map!.addLayer({
      id: 'mssql-points',
      type: 'circle',
      source: 'mssql-results',
      filter: ['==', '$type', 'Point'],
      paint: { 'circle-color': '#ef4444', 'circle-radius': 4, 'circle-opacity': 0.7 },
    })
  })
})

watch(() => props.postgisGeojson, (val) => {
  if (map?.getSource('postgis-results')) {
    (map.getSource('postgis-results') as maplibregl.GeoJSONSource).setData(val || emptyFC())
  }
})

watch(() => props.mssqlGeojson, (val) => {
  if (map?.getSource('mssql-results')) {
    (map.getSource('mssql-results') as maplibregl.GeoJSONSource).setData(val || emptyFC())
  }
})

onUnmounted(() => {
  map?.remove()
})
</script>
