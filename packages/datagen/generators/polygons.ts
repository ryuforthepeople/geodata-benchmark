import * as turf from "@turf/turf";

const LAND_USE = ["residential", "commercial", "industrial", "farmland", "forest", "water", "recreation", "nature"];

export interface GeneratorConfig {
  count: number;
  bbox: [number, number, number, number];
}

function generateIrregularPolygon(centerLon: number, centerLat: number): [number, number][] {
  const baseRadius = 0.001 + Math.random() * 0.049;
  const vertices = 5 + Math.floor(Math.random() * 12);
  const coords: [number, number][] = [];

  for (let v = 0; v < vertices; v++) {
    const angle = (v / vertices) * Math.PI * 2;
    const jitter = 0.6 + Math.random() * 0.8;
    const aspectRatio = 0.6 + Math.random() * 0.8;
    coords.push([
      centerLon + Math.cos(angle) * baseRadius * jitter,
      centerLat + Math.sin(angle) * baseRadius * jitter * aspectRatio,
    ]);
  }
  coords.push([...coords[0]] as [number, number]);
  return coords;
}

export function* generatePolygons(config: GeneratorConfig): Generator<turf.helpers.Feature> {
  const [west, south, east, north] = config.bbox;
  for (let i = 0; i < config.count; i++) {
    const centerLon = west + Math.random() * (east - west);
    const centerLat = south + Math.random() * (north - south);
    const coords = generateIrregularPolygon(centerLon, centerLat);

    let feature = turf.polygon([coords], {
      name: `parcel_${i}`,
      category: LAND_USE[i % LAND_USE.length],
      value: Math.round(Math.random() * 100000) / 10,
      year_built: 1950 + Math.floor(Math.random() * 75),
    });

    feature = turf.rewind(feature) as typeof feature;
    yield feature;
  }
}
