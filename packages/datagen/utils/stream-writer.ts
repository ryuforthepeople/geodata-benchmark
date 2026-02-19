import { createWriteStream, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { Feature } from "@turf/turf";
import { featureToWktRow, csvHeader } from "./wkt-converter.js";

export class StreamWriter {
  private geojsonStream: ReturnType<typeof createWriteStream> | null = null;
  private csvStream: ReturnType<typeof createWriteStream> | null = null;
  private count = 0;
  private isFirst = true;
  private useStreaming: boolean;

  constructor(
    private geojsonPath: string,
    private csvPath: string,
    useStreaming: boolean = false
  ) {
    this.useStreaming = useStreaming;
  }

  open(): void {
    mkdirSync(dirname(this.geojsonPath), { recursive: true });
    mkdirSync(dirname(this.csvPath), { recursive: true });

    this.geojsonStream = createWriteStream(this.geojsonPath);
    this.csvStream = createWriteStream(this.csvPath);

    if (!this.useStreaming) {
      this.geojsonStream.write('{"type":"FeatureCollection","features":[\n');
    }
    this.csvStream.write(csvHeader() + "\n");
    this.isFirst = true;
    this.count = 0;
  }

  write(feature: Feature): void {
    if (!this.geojsonStream || !this.csvStream) throw new Error("Writer not opened");

    if (this.useStreaming) {
      this.geojsonStream.write(JSON.stringify(feature) + "\n");
    } else {
      if (!this.isFirst) this.geojsonStream.write(",\n");
      this.geojsonStream.write(JSON.stringify(feature));
      this.isFirst = false;
    }

    this.csvStream.write(featureToWktRow(feature) + "\n");
    this.count++;
  }

  async close(): Promise<void> {
    if (!this.geojsonStream || !this.csvStream) return;

    if (!this.useStreaming) {
      this.geojsonStream.write("\n]}");
    }

    await Promise.all([
      new Promise<void>((resolve) => this.geojsonStream!.end(resolve)),
      new Promise<void>((resolve) => this.csvStream!.end(resolve)),
    ]);
  }

  getCount(): number {
    return this.count;
  }
}
