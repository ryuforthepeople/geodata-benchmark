/**
 * Docker stats collector — polls `docker stats` for container resource usage.
 */
import { execSync } from 'node:child_process';
import type { ResourceSnapshot } from '../types.js';
import { insertResourceSnapshot } from './results-db.js';

export interface DockerStatsCollector {
  start(): void;
  stop(): void;
}

/**
 * Create a collector that polls docker stats at the given interval
 * and writes snapshots to the results DB.
 */
export function createDockerStatsCollector(
  dbPath: string,
  runId: string,
  containers: string[],
  intervalMs: number = 1000,
): DockerStatsCollector {
  let timer: ReturnType<typeof setInterval> | null = null;

  function poll(): void {
    for (const container of containers) {
      try {
        const raw = execSync(
          `docker stats ${container} --no-stream --format "{{json .}}"`,
          { timeout: 5000, encoding: 'utf-8' },
        ).trim();

        if (!raw) continue;
        const stats = JSON.parse(raw);

        const snapshot: ResourceSnapshot = {
          runId,
          container,
          timestamp: new Date().toISOString(),
          cpuPercent: parsePercent(stats.CPUPerc),
          memoryUsageMb: parseMemory(stats.MemUsage?.split('/')[0]?.trim()),
          memoryLimitMb: parseMemory(stats.MemUsage?.split('/')[1]?.trim()),
          networkRxBytes: parseBytes(stats.NetIO?.split('/')[0]?.trim()),
          networkTxBytes: parseBytes(stats.NetIO?.split('/')[1]?.trim()),
        };

        insertResourceSnapshot(dbPath, snapshot);
      } catch {
        // Container might not be running — skip silently
      }
    }
  }

  return {
    start() {
      poll(); // immediate first poll
      timer = setInterval(poll, intervalMs);
    },
    stop() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    },
  };
}

function parsePercent(s: string | undefined): number {
  if (!s) return 0;
  return parseFloat(s.replace('%', '')) || 0;
}

function parseMemory(s: string | undefined): number {
  if (!s) return 0;
  const val = parseFloat(s);
  if (s.includes('GiB')) return val * 1024;
  if (s.includes('MiB')) return val;
  if (s.includes('KiB')) return val / 1024;
  return val;
}

function parseBytes(s: string | undefined): number {
  if (!s) return 0;
  const val = parseFloat(s);
  if (s.includes('GB')) return val * 1e9;
  if (s.includes('MB')) return val * 1e6;
  if (s.includes('KB') || s.includes('kB')) return val * 1e3;
  if (s.includes('B')) return val;
  return val;
}
