import * as turf from "@turf/turf";

const CATEGORIES = ["residential", "commercial", "industrial", "park", "school", "hospital", "restaurant", "shop"];
const NAMES_PREFIX = ["Noord", "Zuid", "Oost", "West", "Centrum", "Nieuw", "Oud", "Klein", "Groot"];
const NAMES_SUFFIX = ["dorp", "stad", "haven", "veld", "berg", "bos", "meer", "dam", "wijk"];

export interface GeneratorConfig {
  count: number;
  bbox: [number, number, number, number];
}

function randomName(i: number): string {
  const prefix = NAMES_PREFIX[i % NAMES_PREFIX.length];
  const suffix = NAMES_SUFFIX[Math.floor(i / NAMES_PREFIX.length) % NAMES_SUFFIX.length];
  return `${prefix}${suffix}_${i}`;
}

export function* generatePoints(config: GeneratorConfig): Generator<turf.helpers.Feature> {
  const [west, south, east, north] = config.bbox;
  for (let i = 0; i < config.count; i++) {
    const lon = west + Math.random() * (east - west);
    const lat = south + Math.random() * (north - south);
    yield turf.point([lon, lat], {
      name: randomName(i),
      category: CATEGORIES[i % CATEGORIES.length],
      value: Math.round(Math.random() * 10000) / 10,
      population: Math.floor(Math.random() * 50000),
    });
  }
}
