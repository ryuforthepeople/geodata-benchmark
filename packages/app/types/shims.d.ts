declare module '@mapbox/mapbox-gl-draw' {
  const MapboxDraw: any
  export default MapboxDraw
}

declare module '@terraformer/wkt' {
  export function geojsonToWkt(geojson: any): string
  export function wktToGeoJSON(wkt: string): any
}
