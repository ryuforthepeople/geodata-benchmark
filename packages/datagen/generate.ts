import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { generatePoints } from "./generators/points.js";
import { generateLines } from "./generators/lines.js";
import { generatePolygons } from "./generators/polygons.js";
import { generateMultiPolygons } from "./generators/multipolygons.js";
import { StreamWriter } from "./utils/stream-writer.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const NL_BBOX: [number, number, number, number] = [3.37, 50.75, 7.21, 53.47];

interface ScaleConfig {
  points: number;
  lines: number;
  polygons: number;
  multipolygons: number;
}

const SCALES: Record<string, ScaleConfig> = {
  s: { points: 100, lines: 50, polygons: 75, multipolygons: 25 },
  small: { points: 2000, lines: 1000, polygons: 1500, multipolygons: 500 },
  large: { points: 800000, lines: 400000, polygons: 600000, multipolygons: 200000 },
};

interface GeneratorEntry {
  name: string;
  count: number;
  generator: (config: { count: number; bbox: [number, number, number, number] }) => Generator<any>;
}

async function run() {
  const scaleArg = process.argv.find((_, i, arr) => arr[i - 1] === "--scale") || "small";
  const scale = SCALES[scaleArg];
  if (!scale) {
    console.error(`Unknown scale: ${scaleArg}. Use: s | small | large`);
    process.exit(1);
  }

  const isLarge = scaleArg === "large";
  const outputDir = join(__dirname, "output", scaleArg);
  const totalFeatures = scale.points + scale.lines + scale.polygons + scale.multipolygons;

  console.log(`\n🌍 Generating ${scaleArg} dataset (${totalFeatures.toLocaleString()} features)`);
  console.log(`   Output: ${outputDir}\n`);

  const generators: GeneratorEntry[] = [
    { name: "points", count: scale.points, generator: generatePoints },
    { name: "lines", count: scale.lines, generator: generateLines },
    { name: "polygons", count: scale.polygons, generator: generatePolygons },
    { name: "multipolygons", count: scale.multipolygons, generator: generateMultiPolygons },
  ];

  let totalWritten = 0;
  const startTime = performance.now();

  for (const { name, count, generator } of generators) {
    const geojsonPath = join(outputDir, `${name}.geojson`);
    const csvPath = join(outputDir, `${name}.csv`);
    const writer = new StreamWriter(geojsonPath, csvPath, isLarge);

    console.log(`  📝 Generating ${count.toLocaleString()} ${name}...`);
    const genStart = performance.now();
    writer.open();

    let written = 0;
    const progressInterval = Math.max(1, Math.floor(count / 20));

    for (const feature of generator({ count, bbox: NL_BBOX })) {
      writer.write(feature);
      written++;
      totalWritten++;

      if (isLarge && written % progressInterval === 0) {
        const pct = Math.round((totalWritten / totalFeatures) * 100);
        process.stdout.write(`\r     Progress: ${pct}% (${totalWritten.toLocaleString()}/${totalFeatures.toLocaleString()})`);
      }
    }

    await writer.close();
    const elapsed = ((performance.now() - genStart) / 1000).toFixed(1);
    console.log(`     ✅ ${name}: ${written.toLocaleString()} features in ${elapsed}s`);
  }

  const totalElapsed = ((performance.now() - startTime) / 1000).toFixed(1);
  console.log(`\n🎉 Done! ${totalWritten.toLocaleString()} features generated in ${totalElapsed}s\n`);
}

run().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
