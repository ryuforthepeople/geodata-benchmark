#!/usr/bin/env tsx
/**
 * Benchmark Runner — CLI entry point.
 * 
 * Usage:
 *   tsx runner.ts [options]
 * 
 * Options:
 *   --suite <name>        Run only specific suite(s) (comma-separated)
 *   --db <postgis|mssql>  Run only against specific database(s) (comma-separated)
 *   --scale <number>      Scale levels (comma-separated, default: 5000,2000000)
 *   --iterations <n>      Number of timed iterations (default: 50)
 *   --warmup <n>          Number of warmup iterations (default: 3)
 *   --db-path <path>      Path to results SQLite DB
 *   --no-docker-stats     Disable docker stats collection
 */
import { randomUUID } from 'node:crypto';
import { readdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type {
  BenchmarkSuite,
  RunnerConfig,
  DatabaseTarget,
  ScaleLevel,
  BenchmarkContext,
} from './types.js';
import { DEFAULT_CONFIG } from './types.js';
import { computeStats } from './utils/metrics.js';
import { insertResults, insertRun, finishRun, closeDb } from './utils/results-db.js';
import { createDockerStatsCollector } from './utils/docker-stats.js';
import { getPgPool, getMssqlPool, closeAll } from './utils/db-clients.js';
import { runBenchmarkCase } from './utils/query-runner.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

// ─── CLI Argument Parsing ────────────────────────────────────────

function parseArgs(argv: string[]): RunnerConfig {
  const config = { ...DEFAULT_CONFIG };
  const args = argv.slice(2);

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--suite':
        config.suites = args[++i].split(',').map((s) => s.trim());
        break;
      case '--db':
        config.databases = args[++i].split(',').map((s) => s.trim()) as DatabaseTarget[];
        break;
      case '--scale':
        config.scales = args[++i].split(',').map((s) => parseInt(s, 10)) as ScaleLevel[];
        break;
      case '--iterations':
        config.iterations = parseInt(args[++i], 10);
        break;
      case '--warmup':
        config.warmupIterations = parseInt(args[++i], 10);
        break;
      case '--db-path':
        config.dbPath = args[++i];
        break;
      case '--no-docker-stats':
        config.collectDockerStats = false;
        break;
      default:
        console.warn(`Unknown flag: ${args[i]}`);
    }
  }

  return config;
}

// ─── Suite Discovery ─────────────────────────────────────────────

async function discoverSuites(filter: string[]): Promise<BenchmarkSuite[]> {
  const suitesDir = resolve(__dirname, 'suites');
  let files: string[];

  try {
    files = await readdir(suitesDir);
  } catch {
    console.warn(`No suites directory found at ${suitesDir}`);
    return [];
  }

  const suiteFiles = files.filter(
    (f) => (f.endsWith('.ts') || f.endsWith('.js')) && !f.startsWith('_'),
  );

  const suites: BenchmarkSuite[] = [];

  for (const file of suiteFiles) {
    const mod = await import(join(suitesDir, file));
    const suite: BenchmarkSuite = mod.default;

    if (!suite?.name || !suite?.cases) {
      console.warn(`Skipping ${file}: invalid suite export`);
      continue;
    }

    if (filter.length > 0 && !filter.includes(suite.name)) {
      continue;
    }

    suites.push(suite);
  }

  return suites;
}

// ─── Main Runner ─────────────────────────────────────────────────

async function main(): Promise<void> {
  const config = parseArgs(process.argv);
  const runId = randomUUID();

  console.log(`\n🏁 Benchmark Run: ${runId}`);
  console.log(`   Databases: ${config.databases.join(', ')}`);
  console.log(`   Scales: ${config.scales.join(', ')}`);
  console.log(`   Iterations: ${config.iterations} (warmup: ${config.warmupIterations})`);
  console.log(`   Results DB: ${config.dbPath}\n`);

  // Ensure results directory exists
  const { mkdirSync } = await import('node:fs');
  mkdirSync(resolve(__dirname, 'results'), { recursive: true });

  const dbPath = resolve(__dirname, config.dbPath);
  insertRun(dbPath, runId, JSON.stringify(config));

  // Discover suites
  const suites = await discoverSuites(config.suites);
  if (suites.length === 0) {
    console.log('No suites found. Add benchmark suites to the suites/ directory.');
    finishRun(dbPath, runId);
    closeDb();
    return;
  }

  console.log(`Found ${suites.length} suite(s): ${suites.map((s) => s.name).join(', ')}\n`);

  // Docker stats collector
  let statsCollector: ReturnType<typeof createDockerStatsCollector> | null = null;
  if (config.collectDockerStats) {
    statsCollector = createDockerStatsCollector(dbPath, runId, config.dockerContainers);
    statsCollector.start();
  }

  try {
    for (const suite of suites) {
      for (const database of config.databases) {
        if (!suite.databases.includes(database)) continue;

        for (const scale of config.scales) {
          console.log(`━━━ ${suite.name} | ${database} | scale=${scale} ━━━`);

          // Build context
          const ctx: BenchmarkContext = {
            database,
            scale,
            pgPool: database === 'postgis' ? getPgPool() : null,
            mssqlPool: database === 'mssql' ? await getMssqlPool() : null,
          };

          // Suite setup
          if (suite.setup) {
            await suite.setup(ctx);
          }

          // Run each case
          for (const benchCase of suite.cases) {
            process.stdout.write(`  ▸ ${benchCase.name} ... `);

            const results = await runBenchmarkCase(benchCase, ctx, {
              runId,
              suite: suite.name,
              database,
              scale,
              iterations: config.iterations,
              warmupIterations: config.warmupIterations,
            });

            // Store results
            insertResults(dbPath, results);

            // Print summary
            const times = results.filter((r) => !r.error).map((r) => r.queryTimeMs);
            if (times.length > 0) {
              const stats = computeStats(times);
              console.log(
                `p50=${stats.p50.toFixed(1)}ms  p95=${stats.p95.toFixed(1)}ms  p99=${stats.p99.toFixed(1)}ms  mean=${stats.mean.toFixed(1)}ms  stddev=${stats.stddev.toFixed(1)}ms`,
              );
            } else {
              const errors = results.filter((r) => r.error).length;
              console.log(`FAILED (${errors}/${results.length} errors)`);
            }
          }

          // Suite teardown
          if (suite.teardown) {
            await suite.teardown(ctx);
          }

          console.log();
        }
      }
    }
  } finally {
    statsCollector?.stop();
    finishRun(dbPath, runId);
    closeDb();
    await closeAll();
  }

  console.log(`✅ Run ${runId} complete. Results in ${config.dbPath}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
