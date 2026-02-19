/**
 * Query runner — wraps query execution with timing and result capture.
 */
import type { BenchmarkResult, BenchmarkCase, BenchmarkContext, DatabaseTarget, ScaleLevel } from '../types.js';

export interface QueryRunnerOptions {
  runId: string;
  suite: string;
  database: DatabaseTarget;
  scale: ScaleLevel;
  iterations: number;
  warmupIterations: number;
}

/**
 * Execute a benchmark case with warmup + timed iterations.
 * Returns only the timed results (warmup is discarded).
 */
export async function runBenchmarkCase(
  benchCase: BenchmarkCase,
  ctx: BenchmarkContext,
  opts: QueryRunnerOptions,
): Promise<BenchmarkResult[]> {
  const results: BenchmarkResult[] = [];

  // Warmup runs (discarded)
  for (let i = 0; i < opts.warmupIterations; i++) {
    try {
      await benchCase.fn(ctx);
    } catch {
      // Warmup errors are ignored
    }
  }

  // Timed runs
  for (let i = 0; i < opts.iterations; i++) {
    const start = performance.now();
    let rowsReturned = 0;
    let queryPlan: string | undefined;
    let error: string | undefined;

    try {
      const result = await benchCase.fn(ctx);
      rowsReturned = result.rowsReturned;
      queryPlan = result.queryPlan;
    } catch (err: any) {
      error = err?.message ?? String(err);
    }

    const queryTimeMs = performance.now() - start;

    results.push({
      runId: opts.runId,
      suite: opts.suite,
      benchmark: benchCase.name,
      database: opts.database,
      scale: opts.scale,
      iteration: i + 1,
      queryTimeMs,
      rowsReturned,
      queryPlan,
      error,
      timestamp: new Date().toISOString(),
    });
  }

  return results;
}
