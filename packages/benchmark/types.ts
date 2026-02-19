/**
 * Benchmark Framework Types
 * 
 * These types define the contract between the runner framework and
 * individual benchmark suite implementations.
 */

// ─── Database Types ──────────────────────────────────────────────

export type DatabaseTarget = 'postgis' | 'mssql';
export type ScaleLevel = 5_000 | 2_000_000;

// ─── Benchmark Result ────────────────────────────────────────────

export interface BenchmarkResult {
  runId: string;
  suite: string;
  benchmark: string;
  database: DatabaseTarget;
  scale: number;
  iteration: number;
  queryTimeMs: number;
  rowsReturned: number;
  queryPlan?: string;
  error?: string;
  timestamp: string; // ISO 8601
}

// ─── Resource Snapshot ───────────────────────────────────────────

export interface ResourceSnapshot {
  runId: string;
  container: string;
  timestamp: string;
  cpuPercent: number;
  memoryUsageMb: number;
  memoryLimitMb: number;
  networkRxBytes: number;
  networkTxBytes: number;
}

// ─── Statistics ──────────────────────────────────────────────────

export interface BenchmarkStats {
  suite: string;
  benchmark: string;
  database: DatabaseTarget;
  scale: number;
  count: number;
  min: number;
  max: number;
  mean: number;
  stddev: number;
  p50: number;
  p95: number;
  p99: number;
}

// ─── Suite Interface ─────────────────────────────────────────────

/**
 * A single benchmark case within a suite.
 */
export interface BenchmarkCase {
  /** Unique name for this benchmark (e.g., 'st-intersects-simple-rect') */
  name: string;
  /** Human-readable description */
  description?: string;
  /** 
   * The function to execute. Returns the number of rows returned.
   * Receives the database target and scale so it can choose the right query.
   */
  fn: (ctx: BenchmarkContext) => Promise<BenchmarkCaseResult>;
}

export interface BenchmarkCaseResult {
  rowsReturned: number;
  queryPlan?: string;
}

export interface BenchmarkContext {
  database: DatabaseTarget;
  scale: ScaleLevel;
  /** PostGIS pg.Pool — only available when database === 'postgis' */
  pgPool: import('pg').Pool | null;
  /** SQL Server connection pool — only available when database === 'mssql' */
  mssqlPool: import('mssql').ConnectionPool | null;
}

/**
 * Interface that all benchmark suites must implement.
 * 
 * Suites are discovered from the `suites/` folder. Each file should
 * default-export an object implementing this interface.
 * 
 * Example:
 * ```ts
 * import type { BenchmarkSuite } from '../types.js';
 * 
 * const suite: BenchmarkSuite = {
 *   name: 'point-in-polygon',
 *   description: 'Point-in-polygon query benchmarks',
 *   databases: ['postgis', 'mssql'],
 *   cases: [
 *     {
 *       name: 'amsterdam-center',
 *       fn: async (ctx) => {
 *         if (ctx.database === 'postgis') {
 *           const res = await ctx.pgPool!.query(`SELECT ... ST_Within ...`);
 *           return { rowsReturned: res.rowCount ?? 0 };
 *         } else {
 *           const res = await ctx.mssqlPool!.request().query(`SELECT ... STWithin ...`);
 *           return { rowsReturned: res.recordset.length };
 *         }
 *       }
 *     }
 *   ],
 * };
 * 
 * export default suite;
 * ```
 */
export interface BenchmarkSuite {
  /** Unique suite name (e.g., 'point-in-polygon', 'st-intersects') */
  name: string;
  /** Human-readable description */
  description?: string;
  /** Which databases this suite supports */
  databases: DatabaseTarget[];
  /** The benchmark cases in this suite */
  cases: BenchmarkCase[];
  /** Optional setup — runs once before all cases for a given db+scale */
  setup?: (ctx: BenchmarkContext) => Promise<void>;
  /** Optional teardown — runs once after all cases */
  teardown?: (ctx: BenchmarkContext) => Promise<void>;
}

// ─── Runner Configuration ────────────────────────────────────────

export interface RunnerConfig {
  /** Run only these suites (empty = all) */
  suites: string[];
  /** Which databases to benchmark */
  databases: DatabaseTarget[];
  /** Scale levels to test */
  scales: ScaleLevel[];
  /** Number of timed iterations per case */
  iterations: number;
  /** Number of warmup iterations to discard */
  warmupIterations: number;
  /** Concurrency levels for concurrent benchmarks */
  concurrencyLevels: number[];
  /** Path to the results SQLite database */
  dbPath: string;
  /** Whether to collect docker stats during runs */
  collectDockerStats: boolean;
  /** Docker container names to monitor */
  dockerContainers: string[];
}

export const DEFAULT_CONFIG: RunnerConfig = {
  suites: [],
  databases: ['postgis', 'mssql'],
  scales: [5_000, 2_000_000],
  iterations: 50,
  warmupIterations: 3,
  concurrencyLevels: [1, 5, 10, 25, 50],
  dbPath: 'results/benchmark-results.db',
  collectDockerStats: true,
  dockerContainers: ['bench-postgis', 'bench-mssql'],
};
