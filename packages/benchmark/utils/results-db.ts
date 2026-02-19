/**
 * SQLite results storage using better-sqlite3.
 */
import Database from 'better-sqlite3';
import type { BenchmarkResult, ResourceSnapshot, BenchmarkStats } from '../types.js';
import { computeStats } from './metrics.js';

let db: Database.Database | null = null;

export function getDb(dbPath: string): Database.Database {
  if (db) return db;
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  initSchema(db);
  return db;
}

function initSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS benchmark_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id TEXT NOT NULL,
      suite TEXT NOT NULL,
      benchmark TEXT NOT NULL,
      database TEXT NOT NULL,
      scale INTEGER NOT NULL,
      iteration INTEGER NOT NULL,
      query_time_ms REAL NOT NULL,
      rows_returned INTEGER NOT NULL,
      query_plan TEXT,
      error TEXT,
      timestamp TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_results_run ON benchmark_results(run_id);
    CREATE INDEX IF NOT EXISTS idx_results_suite ON benchmark_results(suite, benchmark, database);

    CREATE TABLE IF NOT EXISTS resource_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id TEXT NOT NULL,
      container TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      cpu_percent REAL NOT NULL,
      memory_usage_mb REAL NOT NULL,
      memory_limit_mb REAL NOT NULL,
      network_rx_bytes INTEGER NOT NULL,
      network_tx_bytes INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_resources_run ON resource_snapshots(run_id);

    CREATE TABLE IF NOT EXISTS runs (
      run_id TEXT PRIMARY KEY,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      config_json TEXT
    );
  `);
}

// ─── Insert Operations ───────────────────────────────────────────

const insertResultStmt = (db: Database.Database) =>
  db.prepare(`
    INSERT INTO benchmark_results (run_id, suite, benchmark, database, scale, iteration, query_time_ms, rows_returned, query_plan, error, timestamp)
    VALUES (@runId, @suite, @benchmark, @database, @scale, @iteration, @queryTimeMs, @rowsReturned, @queryPlan, @error, @timestamp)
  `);

export function insertResult(dbPath: string, result: BenchmarkResult): void {
  const d = getDb(dbPath);
  insertResultStmt(d).run(result);
}

export function insertResults(dbPath: string, results: BenchmarkResult[]): void {
  const d = getDb(dbPath);
  const stmt = insertResultStmt(d);
  const tx = d.transaction((rows: BenchmarkResult[]) => {
    for (const r of rows) stmt.run(r);
  });
  tx(results);
}

export function insertResourceSnapshot(dbPath: string, snapshot: ResourceSnapshot): void {
  const d = getDb(dbPath);
  d.prepare(`
    INSERT INTO resource_snapshots (run_id, container, timestamp, cpu_percent, memory_usage_mb, memory_limit_mb, network_rx_bytes, network_tx_bytes)
    VALUES (@runId, @container, @timestamp, @cpuPercent, @memoryUsageMb, @memoryLimitMb, @networkRxBytes, @networkTxBytes)
  `).run(snapshot);
}

export function insertRun(dbPath: string, runId: string, configJson: string): void {
  const d = getDb(dbPath);
  d.prepare(`INSERT INTO runs (run_id, started_at, config_json) VALUES (?, ?, ?)`)
    .run(runId, new Date().toISOString(), configJson);
}

export function finishRun(dbPath: string, runId: string): void {
  const d = getDb(dbPath);
  d.prepare(`UPDATE runs SET finished_at = ? WHERE run_id = ?`)
    .run(new Date().toISOString(), runId);
}

// ─── Query Operations ────────────────────────────────────────────

export function getResultsByRun(dbPath: string, runId: string): BenchmarkResult[] {
  const d = getDb(dbPath);
  return d.prepare(`SELECT * FROM benchmark_results WHERE run_id = ?`).all(runId) as any[];
}

export function getStatsForRun(dbPath: string, runId: string): BenchmarkStats[] {
  const d = getDb(dbPath);
  const groups = d.prepare(`
    SELECT DISTINCT suite, benchmark, database, scale
    FROM benchmark_results WHERE run_id = ?
  `).all(runId) as { suite: string; benchmark: string; database: string; scale: number }[];

  return groups.map((g) => {
    const times = d.prepare(`
      SELECT query_time_ms FROM benchmark_results
      WHERE run_id = ? AND suite = ? AND benchmark = ? AND database = ? AND scale = ?
      AND error IS NULL
    `).all(runId, g.suite, g.benchmark, g.database, g.scale)
      .map((r: any) => r.query_time_ms);

    const stats = computeStats(times);
    return {
      suite: g.suite,
      benchmark: g.benchmark,
      database: g.database as any,
      scale: g.scale,
      ...stats,
    };
  });
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
