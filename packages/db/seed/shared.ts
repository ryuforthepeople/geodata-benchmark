import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { stat } from "node:fs/promises";
import path from "node:path";

export interface GeoRow {
  name: string;
  category: string;
  properties: string;
  geom: string; // EWKT: "SRID=4326;POINT(...)"
}

/**
 * Parse a CSV line respecting quoted fields with embedded commas/quotes.
 */
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++; // skip escaped quote
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        fields.push(current);
        current = "";
      } else {
        current += ch;
      }
    }
  }
  fields.push(current);
  return fields;
}

/**
 * Stream CSV rows from a file, skipping the header.
 */
export async function* streamCsv(filePath: string): AsyncGenerator<GeoRow> {
  const rl = createInterface({
    input: createReadStream(filePath, { encoding: "utf-8" }),
    crlfDelay: Infinity,
  });

  let isHeader = true;
  for await (const line of rl) {
    if (isHeader) {
      isHeader = false;
      continue;
    }
    if (!line.trim()) continue;

    const fields = parseCsvLine(line);
    if (fields.length < 4) continue;

    yield {
      name: fields[0],
      category: fields[1],
      properties: fields[2],
      geom: fields[3],
    };
  }
}

/**
 * Strip SRID prefix from EWKT → plain WKT.
 * "SRID=4326;POINT(1 2)" → "POINT(1 2)"
 */
export function ewktToWkt(ewkt: string): string {
  const idx = ewkt.indexOf(";");
  return idx >= 0 ? ewkt.substring(idx + 1) : ewkt;
}

/**
 * Get all CSV file paths for a given scale.
 */
export function getCsvFiles(scale: string): string[] {
  const dir = path.resolve(
    import.meta.dirname,
    `../../datagen/output/${scale}`
  );
  return ["points", "lines", "polygons", "multipolygons"].map(
    (t) => `${dir}/${t}.csv`
  );
}

/**
 * Count lines in a file (minus header) for progress reporting.
 */
export async function countLines(filePath: string): Promise<number> {
  let count = -1; // skip header
  const rl = createInterface({
    input: createReadStream(filePath, { encoding: "utf-8" }),
    crlfDelay: Infinity,
  });
  for await (const _ of rl) count++;
  return Math.max(0, count);
}

/**
 * Progress reporter.
 */
export class ProgressReporter {
  private count = 0;
  private startTime = performance.now();
  private lastReport = 0;
  private intervalMs: number;

  constructor(
    private label: string,
    private total: number,
    intervalMs = 2000
  ) {
    this.intervalMs = intervalMs;
  }

  tick(n = 1) {
    this.count += n;
    const now = performance.now();
    if (now - this.lastReport >= this.intervalMs) {
      this.report();
      this.lastReport = now;
    }
  }

  report() {
    const elapsed = (performance.now() - this.startTime) / 1000;
    const pct = this.total > 0 ? ((this.count / this.total) * 100).toFixed(1) : "?";
    const rate = (this.count / elapsed).toFixed(0);
    console.log(
      `  [${this.label}] ${this.count.toLocaleString()}/${this.total.toLocaleString()} (${pct}%) — ${rate} rows/s — ${elapsed.toFixed(1)}s`
    );
  }

  finish(): number {
    const elapsed = performance.now() - this.startTime;
    this.report();
    return elapsed;
  }
}

/**
 * Parse --scale argument from process.argv.
 */
export function parseScale(): string {
  const idx = process.argv.indexOf("--scale");
  const scale = idx >= 0 ? process.argv[idx + 1] : "small";
  if (!["small", "large"].includes(scale)) {
    console.error(`Invalid scale "${scale}". Use "small" or "large".`);
    process.exit(1);
  }
  return scale;
}

/**
 * Timer utility.
 */
export function timer() {
  const start = performance.now();
  return {
    elapsed: () => performance.now() - start,
    elapsedSec: () => ((performance.now() - start) / 1000).toFixed(2),
  };
}
