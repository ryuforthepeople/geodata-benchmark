import * as turf from "@turf/turf";

const ROAD_TYPES = ["highway", "secondary", "residential", "cycleway", "footpath", "rail", "waterway", "bus_route"];

export interface GeneratorConfig {
  count: number;
  bbox: [number, number, number, number];
}

export function* generateLines(config: GeneratorConfig): Generator<turf.helpers.Feature> {
  const [west, south, east, north] = config.bbox;
  for (let i = 0; i < config.count; i++) {
    const numVertices = 2 + Math.floor(Math.random() * 9);
    const startLon = west + Math.random() * (east - west);
    const startLat = south + Math.random() * (north - south);
    const coords: [number, number][] = [[startLon, startLat]];

    for (let v = 1; v < numVertices; v++) {
      const prev = coords[v - 1];
      coords.push([
        prev[0] + (Math.random() - 0.5) * 0.02,
        prev[1] + (Math.random() - 0.5) * 0.02,
      ]);
    }

    yield turf.lineString(coords, {
      name: `route_${i}`,
      category: ROAD_TYPES[i % ROAD_TYPES.length],
      value: Math.round(Math.random() * 10000) / 10,
      speed_limit: [30, 50, 80, 100, 120][Math.floor(Math.random() * 5)],
    });
  }
}
