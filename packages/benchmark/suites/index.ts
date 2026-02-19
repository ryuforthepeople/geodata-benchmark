import type { BenchmarkSuite } from '../types.js';

import importSuite from './import.js';
import indexingSuite from './indexing.js';
import pointInPolygonSuite from './point-in-polygon.js';
import intersectsSuite from './intersects.js';
import bboxSuite from './bbox.js';
import distanceSuite from './distance.js';
import bufferSuite from './buffer.js';
import unionSuite from './union.js';
import complexOpsSuite from './complex-ops.js';
import concurrentSuite from './concurrent.js';
import mixedWorkloadSuite from './mixed-workload.js';

export const allSuites: BenchmarkSuite[] = [
  importSuite,
  indexingSuite,
  pointInPolygonSuite,
  intersectsSuite,
  bboxSuite,
  distanceSuite,
  bufferSuite,
  unionSuite,
  complexOpsSuite,
  concurrentSuite,
  mixedWorkloadSuite,
];

export const suiteMap = new Map<string, BenchmarkSuite>(
  allSuites.map((s) => [s.name, s]),
);

export default allSuites;
