/**
 * Statistical utilities for benchmark metrics.
 */

/**
 * Calculate the percentile value from a sorted or unsorted array.
 * Uses linear interpolation between closest ranks.
 */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  if (values.length === 1) return values[0];

  const sorted = [...values].sort((a, b) => a - b);
  const index = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);

  if (lower === upper) return sorted[lower];

  const fraction = index - lower;
  return sorted[lower] + fraction * (sorted[upper] - sorted[lower]);
}

export function p50(values: number[]): number {
  return percentile(values, 50);
}

export function p95(values: number[]): number {
  return percentile(values, 95);
}

export function p99(values: number[]): number {
  return percentile(values, 99);
}

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

export function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const avg = mean(values);
  const squaredDiffs = values.map((v) => (v - avg) ** 2);
  return Math.sqrt(squaredDiffs.reduce((sum, v) => sum + v, 0) / (values.length - 1));
}

export function min(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.min(...values);
}

export function max(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.max(...values);
}

export interface Stats {
  count: number;
  min: number;
  max: number;
  mean: number;
  stddev: number;
  p50: number;
  p95: number;
  p99: number;
}

/**
 * Compute all statistics for a set of values.
 */
export function computeStats(values: number[]): Stats {
  return {
    count: values.length,
    min: min(values),
    max: max(values),
    mean: mean(values),
    stddev: stddev(values),
    p50: p50(values),
    p95: p95(values),
    p99: p99(values),
  };
}
