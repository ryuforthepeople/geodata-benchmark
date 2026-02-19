import * as turf from "@turf/turf";

const ZONE_TYPES = ["municipality", "district", "protected_area", "industrial_zone", "flood_zone", "agricultural", "urban_area", "nature_reserve"];

export interface GeneratorConfig {
  count: number;
  bbox: [number, number, number, number];
}

function generateComponent(centerLon: number, centerLat: number): [number, number][] {
  const radius = 0.002 + Math.random() * 0.015;
  const vertices = 4 + Math.floor(Math.random() * 8);
  const coords: [number, number][] = [];

  for (let v = 0; v < vertices; v++) {
    const angle = (v / vertices) * Math.PI * 2;
    const jitter = 0.6 + Math.random() * 0.8;
    const aspectRatio = 0.6 + Math.random() * 0.8;
    coords.push([
      centerLon + Math.cos(angle) * radius * jitter,
      centerLat + Math.sin(angle) * radius * jitter * aspectRatio,
    ]);
  }
  coords.push([...coords[0]] as [number, number]);
  return coords;
}

export function* generateMultiPolygons(config: GeneratorConfig): Generator<turf.helpers.Feature> {
  const [west, south, east, north] = config.bbox;
  for (let i = 0; i < config.count; i++) {
    const numComponents = 2 + Math.floor(Math.random() * 4);
    const baseLon = west + Math.random() * (east - west);
    const baseLat = south + Math.random() * (north - south);

    const polygons: [number, number][][] = [];
    for (let c = 0; c < numComponents; c++) {
      const offsetLon = baseLon + (Math.random() - 0.5) * 0.1;
      const offsetLat = baseLat + (Math.random() - 0.5) * 0.1;
      polygons.push(generateComponent(offsetLon, offsetLat));
    }

    let feature = turf.multiPolygon(
      polygons.map((coords) => [coords]),
      {
        name: `zone_${i}`,
        category: ZONE_TYPES[i % ZONE_TYPES.length],
        value: Math.round(Math.random() * 100000) / 10,
        num_components: numComponents,
      }
    );

    feature = turf.rewind(feature) as typeof feature;
    yield feature;
  }
}
