# Geodata Benchmark Plan: PostgreSQL + PostGIS vs MS SQL Server

## Table of Contents
1. [Database Setup](#1-database-setup)
2. [Dataset Generation](#2-dataset-generation)
3. [Benchmark Categories](#3-benchmark-categories)
4. [Metrics](#4-metrics-to-capture)
5. [Demo App Architecture](#5-demo-app-architecture)
6. [Tech Stack](#6-tech-stack-recommendations)
7. [Project Structure](#7-project-structure)
8. [PostGIS vs SQL Server Spatial: Known Differences](#8-postgis-vs-sql-server-spatial-known-differences)

---

## 1. Database Setup

### Docker Compose

```yaml
# docker-compose.yml
version: "3.9"

services:
  postgis:
    image: postgis/postgis:16-3.4
    container_name: bench-postgis
    environment:
      POSTGRES_DB: geobench
      POSTGRES_USER: bench
      POSTGRES_PASSWORD: bench
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
    shm_size: "512mb"
    command: >
      postgres
        -c shared_buffers=1GB
        -c work_mem=256MB
        -c maintenance_work_mem=512MB
        -c effective_cache_size=3GB
        -c max_parallel_workers_per_gather=4
        -c random_page_cost=1.1

  mssql:
    image: mcr.microsoft.com/mssql/server:2022-latest
    container_name: bench-mssql
    environment:
      ACCEPT_EULA: "Y"
      MSSQL_SA_PASSWORD: "Bench!Pass123"
      MSSQL_MEMORY_LIMIT_MB: 4096
    ports:
      - "1433:1433"
    volumes:
      - mssqldata:/var/opt/mssql

volumes:
  pgdata:
  mssqldata:
```

### Schema Design

#### PostgreSQL + PostGIS

```sql
CREATE EXTENSION IF NOT EXISTS postgis;

-- Main spatial table
CREATE TABLE geo_features (
    id          BIGSERIAL PRIMARY KEY,
    name        VARCHAR(255),
    category    VARCHAR(50),       -- 'point', 'line', 'polygon', 'multipolygon'
    properties  JSONB,
    geom        geometry(Geometry, 4326) NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT now()
);

-- Spatial index (GiST — default and best for most spatial queries)
CREATE INDEX idx_geo_features_geom ON geo_features USING GIST (geom);

-- Optional: SP-GiST for point-heavy datasets (test both)
-- CREATE INDEX idx_geo_features_geom_spgist ON geo_features USING SPGIST (geom);

-- BRIN index alternative for large ordered datasets
-- CREATE INDEX idx_geo_features_geom_brin ON geo_features USING BRIN (geom);

-- B-tree on category for filtered spatial queries
CREATE INDEX idx_geo_features_category ON geo_features (category);

-- GIN on properties for JSONB queries
CREATE INDEX idx_geo_features_props ON geo_features USING GIN (properties);
```

#### MS SQL Server

```sql
CREATE DATABASE geobench;
GO
USE geobench;
GO

CREATE TABLE geo_features (
    id          BIGINT IDENTITY(1,1) PRIMARY KEY,
    name        NVARCHAR(255),
    category    NVARCHAR(50),
    properties  NVARCHAR(MAX),     -- JSON stored as text (SQL Server 2022 has JSON functions)
    geom        geometry NOT NULL,
    created_at  DATETIME2 DEFAULT SYSUTCDATETIME()
);

-- Spatial index — SQL Server requires a bounding box
CREATE SPATIAL INDEX idx_geo_features_geom
ON geo_features(geom)
USING GEOMETRY_GRID
WITH (
    BOUNDING_BOX = (xmin = -180, ymin = -90, xmax = 180, ymax = 90),
    GRIDS = (LEVEL_1 = HIGH, LEVEL_2 = HIGH, LEVEL_3 = HIGH, LEVEL_4 = HIGH),
    CELLS_PER_OBJECT = 16
);

-- B-tree on category
CREATE INDEX idx_geo_features_category ON geo_features (category);
```

**Key setup note:** SQL Server spatial uses a flat grid hierarchy. You must specify `BOUNDING_BOX` for `geometry` type. For `geography` type, no bounding box is needed but performance characteristics differ. We'll benchmark both.

#### SQL Server geography variant

```sql
CREATE TABLE geo_features_geog (
    id          BIGINT IDENTITY(1,1) PRIMARY KEY,
    name        NVARCHAR(255),
    category    NVARCHAR(50),
    properties  NVARCHAR(MAX),
    geog        geography NOT NULL,
    created_at  DATETIME2 DEFAULT SYSUTCDATETIME()
);

CREATE SPATIAL INDEX idx_geo_features_geog
ON geo_features_geog(geog)
USING GEOGRAPHY_GRID
WITH (
    GRIDS = (LEVEL_1 = HIGH, LEVEL_2 = HIGH, LEVEL_3 = HIGH, LEVEL_4 = HIGH),
    CELLS_PER_OBJECT = 16
);
```

### Spatial Index Strategies to Compare

| Strategy | PostGIS | SQL Server |
|---|---|---|
| Default spatial index | GiST | GEOMETRY_GRID (HIGH all levels) |
| Coarser grid | — | MEDIUM/LOW levels |
| Alternative index type | SP-GiST (points) | GEOGRAPHY_GRID |
| Bulk-oriented | BRIN | — |
| No index (baseline) | Drop index | Drop index |

---

## 2. Dataset Generation

### Approach: Hybrid (Real-world extracts + procedural)

#### Strategy A: OpenStreetMap Extracts (Recommended for realism)

Use `osmium` + `ogr2ogr` to extract real geometries from OSM PBF files.

```bash
# Download Netherlands extract (~1.2GB) — good mix of density
wget https://download.geofabrik.de/europe/netherlands-latest.osm.pbf

# Extract buildings (polygons) — ~10M features, sample down
ogr2ogr -f GeoJSON buildings.geojson \
  netherlands-latest.osm.pbf multipolygons \
  -where "building IS NOT NULL" \
  -limit 2000000

# Extract roads (lines)
ogr2ogr -f GeoJSON roads.geojson \
  netherlands-latest.osm.pbf lines \
  -where "highway IS NOT NULL" \
  -limit 2000000

# Extract POIs (points)
ogr2ogr -f GeoJSON pois.geojson \
  netherlands-latest.osm.pbf points \
  -limit 2000000
```

#### Strategy B: Procedural Generation (Reproducible, controllable)

Node.js script using `@turf/turf`:

```typescript
// scripts/generate-data.ts
import * as turf from "@turf/turf";
import { randomPosition } from "@turf/random";

interface GeneratorConfig {
  count: number;
  bbox: [number, number, number, number]; // [west, south, east, north]
}

// Netherlands bounding box
const NL_BBOX: [number, number, number, number] = [3.37, 50.75, 7.21, 53.47];

function generatePoints(config: GeneratorConfig) {
  return Array.from({ length: config.count }, (_, i) => {
    const pos = randomPosition(config.bbox);
    return turf.point(pos, {
      name: `point_${i}`,
      category: "point",
      value: Math.random() * 1000,
    });
  });
}

function generatePolygons(config: GeneratorConfig) {
  return Array.from({ length: config.count }, (_, i) => {
    const center = randomPosition(config.bbox);
    // Random polygon: 0.001–0.05 degrees (~100m to ~5km)
    const radius = 0.001 + Math.random() * 0.049;
    const vertices = 4 + Math.floor(Math.random() * 12);
    const coords: [number, number][] = [];
    for (let v = 0; v <= vertices; v++) {
      const angle = (v / vertices) * Math.PI * 2;
      const jitter = 0.7 + Math.random() * 0.6;
      coords.push([
        center[0] + Math.cos(angle) * radius * jitter,
        center[1] + Math.sin(angle) * radius * jitter * 0.7,
      ]);
    }
    coords.push(coords[0]); // close ring
    return turf.polygon([coords], {
      name: `polygon_${i}`,
      category: "polygon",
      area_class: radius > 0.025 ? "large" : "small",
    });
  });
}

function generateLines(config: GeneratorConfig) {
  return Array.from({ length: config.count }, (_, i) => {
    const start = randomPosition(config.bbox);
    const numPoints = 2 + Math.floor(Math.random() * 8);
    const coords: [number, number][] = [start as [number, number]];
    for (let p = 1; p < numPoints; p++) {
      const prev = coords[p - 1];
      coords.push([
        prev[0] + (Math.random() - 0.5) * 0.02,
        prev[1] + (Math.random() - 0.5) * 0.02,
      ]);
    }
    return turf.lineString(coords, {
      name: `line_${i}`,
      category: "line",
      length_class: numPoints > 5 ? "long" : "short",
    });
  });
}

function generateMultiPolygons(config: GeneratorConfig) {
  return Array.from({ length: config.count }, (_, i) => {
    const numPolygons = 2 + Math.floor(Math.random() * 4);
    const center = randomPosition(config.bbox);
    const polygons = Array.from({ length: numPolygons }, () => {
      const offset: [number, number] = [
        center[0] + (Math.random() - 0.5) * 0.1,
        center[1] + (Math.random() - 0.5) * 0.1,
      ];
      const radius = 0.002 + Math.random() * 0.01;
      const vertices = 4 + Math.floor(Math.random() * 6);
      const coords: [number, number][] = [];
      for (let v = 0; v <= vertices; v++) {
        const angle = (v / vertices) * Math.PI * 2;
        coords.push([
          offset[0] + Math.cos(angle) * radius,
          offset[1] + Math.sin(angle) * radius * 0.7,
        ]);
      }
      coords.push(coords[0]);
      return [coords];
    });
    return turf.multiPolygon(polygons, {
      name: `multipolygon_${i}`,
      category: "multipolygon",
    });
  });
}
```

#### Dataset Distribution

| Scale | Points | Lines | Polygons | MultiPolygons | Total |
|---|---|---|---|---|---|
| Small | 2,000 | 1,000 | 1,500 | 500 | 5,000 |
| Large | 800,000 | 400,000 | 600,000 | 200,000 | 2,000,000 |

#### Output Format

Generate as GeoJSON (FeatureCollection) and also as:
- CSV with WKT (for `COPY` / `BULK INSERT`)
- NDJSON (line-delimited, for streaming imports)

---

## 3. Benchmark Categories

### 3.1 Bulk Import Speed (GeoJSON → DB)

**PostGIS:**
```sql
-- Method 1: ogr2ogr (fastest for large datasets)
-- ogr2ogr -f "PostgreSQL" PG:"dbname=geobench user=bench" data.geojson -nln geo_features -append

-- Method 2: COPY with WKT
COPY geo_features (name, category, properties, geom)
FROM STDIN WITH (FORMAT csv);
-- Each row: name,category,{json},SRID=4326;POLYGON((...))

-- Method 3: Batch INSERT with ST_GeomFromGeoJSON
INSERT INTO geo_features (name, category, properties, geom)
VALUES
  ('feat_1', 'polygon', '{}', ST_SetSRID(ST_GeomFromGeoJSON('{"type":"Polygon","coordinates":[...]}'), 4326)),
  ('feat_2', 'point', '{}', ST_SetSRID(ST_GeomFromGeoJSON('{"type":"Point","coordinates":[5.1,52.1]}'), 4326));
```

**SQL Server:**
```sql
-- Method 1: BULK INSERT with WKT
-- Requires BCP or BULK INSERT from flat file

-- Method 2: Batch INSERT
INSERT INTO geo_features (name, category, properties, geom)
VALUES
  (N'feat_1', N'polygon', N'{}', geometry::STGeomFromText('POLYGON((...))' , 4326)),
  (N'feat_2', N'point', N'{}', geometry::STGeomFromText('POINT(5.1 52.1)', 4326));

-- Method 3: Using geometry::Parse (shorter)
INSERT INTO geo_features (name, category, properties, geom)
VALUES (N'feat_1', N'polygon', N'{}', geometry::Parse('POLYGON((...))'));
```

**Measure:** Time to insert all records (index disabled during import, then rebuild).

### 3.2 Spatial Indexing Build Time

```sql
-- PostGIS: drop and recreate
DROP INDEX IF EXISTS idx_geo_features_geom;
-- Start timer
CREATE INDEX idx_geo_features_geom ON geo_features USING GIST (geom);
-- End timer
-- Check size:
SELECT pg_size_pretty(pg_relation_size('idx_geo_features_geom'));

-- SQL Server: drop and recreate
DROP INDEX IF EXISTS idx_geo_features_geom ON geo_features;
-- Start timer
CREATE SPATIAL INDEX idx_geo_features_geom
ON geo_features(geom)
USING GEOMETRY_GRID
WITH (BOUNDING_BOX = (-180, -90, 180, 90), GRIDS = (HIGH, HIGH, HIGH, HIGH));
-- End timer
-- Check size:
SELECT
    i.name, s.used_page_count * 8 / 1024.0 AS size_mb
FROM sys.dm_db_partition_stats s
JOIN sys.indexes i ON s.object_id = i.object_id AND s.index_id = i.index_id
WHERE i.name = 'idx_geo_features_geom';
```

### 3.3 Point-in-Polygon Queries

Given a specific polygon, find all points inside it.

**PostGIS:**
```sql
-- Using a test polygon (e.g., Amsterdam city center rough bounds)
WITH query_poly AS (
    SELECT ST_SetSRID(ST_GeomFromGeoJSON('{
        "type": "Polygon",
        "coordinates": [[[4.87, 52.36], [4.92, 52.36], [4.92, 52.38], [4.87, 52.38], [4.87, 52.36]]]
    }'), 4326) AS geom
)
SELECT f.id, f.name
FROM geo_features f, query_poly q
WHERE f.category = 'point'
  AND ST_Within(f.geom, q.geom);
```

**SQL Server:**
```sql
DECLARE @queryPoly geometry = geometry::STGeomFromText(
    'POLYGON((4.87 52.36, 4.92 52.36, 4.92 52.38, 4.87 52.38, 4.87 52.36))', 4326);

SELECT f.id, f.name
FROM geo_features f
WHERE f.category = N'point'
  AND f.geom.STWithin(@queryPoly) = 1;
```

### 3.4 ST_Intersects — Core Use Case

**The primary benchmark:** Given an arbitrary GeoJSON input, find all intersecting records.

**PostGIS:**
```sql
-- Simple intersection
SELECT f.id, f.name, f.category, ST_AsGeoJSON(f.geom) AS geojson
FROM geo_features f
WHERE ST_Intersects(f.geom, ST_SetSRID(ST_GeomFromGeoJSON($1), 4326));

-- With intersection geometry returned
SELECT f.id, f.name, f.category,
       ST_AsGeoJSON(ST_Intersection(f.geom, ST_SetSRID(ST_GeomFromGeoJSON($1), 4326))) AS intersection_geojson
FROM geo_features f
WHERE ST_Intersects(f.geom, ST_SetSRID(ST_GeomFromGeoJSON($1), 4326));

-- Filtered by category
SELECT f.id, f.name, ST_AsGeoJSON(f.geom) AS geojson
FROM geo_features f
WHERE f.category = 'polygon'
  AND ST_Intersects(f.geom, ST_SetSRID(ST_GeomFromGeoJSON($1), 4326));
```

**SQL Server:**
```sql
DECLARE @input geometry = geometry::STGeomFromText(@wkt, 4326);

-- Simple intersection
SELECT f.id, f.name, f.category, f.geom.STAsText() AS wkt
FROM geo_features f
WHERE f.geom.STIntersects(@input) = 1;

-- With intersection geometry
SELECT f.id, f.name, f.category,
       f.geom.STIntersection(@input).STAsText() AS intersection_wkt
FROM geo_features f
WHERE f.geom.STIntersects(@input) = 1;

-- Filtered by category
SELECT f.id, f.name, f.geom.STAsText() AS wkt
FROM geo_features f
WHERE f.category = N'polygon'
  AND f.geom.STIntersects(@input) = 1;
```

**Test with varying input complexity:**
- Simple rectangle (4 vertices)
- Moderate polygon (20 vertices)
- Complex polygon (100+ vertices)
- MultiPolygon input
- Thin/elongated shapes (stress-test index)

### 3.5 Bounding Box Queries

**PostGIS:**
```sql
-- Using && operator (index-only, very fast — tests bounding box overlap)
SELECT id, name FROM geo_features
WHERE geom && ST_MakeEnvelope(4.8, 52.3, 5.0, 52.4, 4326);

-- Explicit envelope intersection
SELECT id, name FROM geo_features
WHERE ST_Intersects(geom, ST_MakeEnvelope(4.8, 52.3, 5.0, 52.4, 4326));
```

**SQL Server:**
```sql
DECLARE @bbox geometry = geometry::STGeomFromText(
    'POLYGON((4.8 52.3, 5.0 52.3, 5.0 52.4, 4.8 52.4, 4.8 52.3))', 4326);

-- Filter uses spatial index for envelope check
SELECT id, name FROM geo_features
WHERE geom.STIntersects(@bbox) = 1;

-- SQL Server also supports Filter() for index-only (less precise but faster)
SELECT id, name FROM geo_features
WHERE geom.Filter(@bbox) = 1;
```

### 3.6 Distance / Nearest Neighbor

**PostGIS:**
```sql
-- KNN using <-> operator (uses GiST index!)
SELECT id, name, ST_AsGeoJSON(geom) AS geojson,
       ST_Distance(geom::geography, ST_SetSRID(ST_MakePoint(4.9, 52.37), 4326)::geography) AS dist_m
FROM geo_features
ORDER BY geom <-> ST_SetSRID(ST_MakePoint(4.9, 52.37), 4326)
LIMIT 10;

-- Distance within radius (meters, using geography cast)
SELECT id, name
FROM geo_features
WHERE ST_DWithin(geom::geography, ST_SetSRID(ST_MakePoint(4.9, 52.37), 4326)::geography, 5000);
```

**SQL Server:**
```sql
-- Nearest neighbor (no native KNN index operator — must use distance sort)
DECLARE @pt geometry = geometry::STGeomFromText('POINT(4.9 52.37)', 4326);

-- Approximate: filter by bounding box first, then sort
SELECT TOP 10 id, name,
       geom.STDistance(@pt) AS dist
FROM geo_features
WHERE geom.STDistance(@pt) IS NOT NULL
ORDER BY geom.STDistance(@pt);

-- Using geography type for meters
DECLARE @ptGeog geography = geography::STGeomFromText('POINT(4.9 52.37)', 4326);
SELECT TOP 10 id, name,
       geog.STDistance(@ptGeog) AS dist_m
FROM geo_features_geog
ORDER BY geog.STDistance(@ptGeog);
```

**Note:** PostGIS has a massive advantage here with the `<->` KNN operator that uses the index directly. SQL Server must compute distances and sort.

### 3.7 Buffer Operations

**PostGIS:**
```sql
-- Buffer 1km around a point (geography for accurate meters)
SELECT ST_AsGeoJSON(
    ST_Buffer(ST_SetSRID(ST_MakePoint(4.9, 52.37), 4326)::geography, 1000)::geometry
) AS buffer_geojson;

-- Find features within 1km buffer
SELECT id, name FROM geo_features
WHERE ST_DWithin(geom::geography, ST_SetSRID(ST_MakePoint(4.9, 52.37), 4326)::geography, 1000);

-- Buffer all polygons by 500m and return
SELECT id, ST_AsGeoJSON(ST_Buffer(geom::geography, 500)::geometry) AS buffered
FROM geo_features
WHERE category = 'polygon'
LIMIT 1000;
```

**SQL Server:**
```sql
-- Buffer (geometry type — units are in SRID units, i.e. degrees for 4326!)
DECLARE @pt geometry = geometry::STGeomFromText('POINT(4.9 52.37)', 4326);
SELECT @pt.STBuffer(0.01).STAsText();  -- ~1km very roughly

-- Buffer with geography (meters, accurate)
DECLARE @ptGeog geography = geography::STGeomFromText('POINT(4.9 52.37)', 4326);
SELECT @ptGeog.STBuffer(1000).STAsText();

-- Buffered features
SELECT id, geog.STBuffer(500).STAsText() AS buffered
FROM geo_features_geog
WHERE category = N'polygon';
```

### 3.8 Union / Aggregation

**PostGIS:**
```sql
-- Union all polygons in a category
SELECT ST_AsGeoJSON(ST_Union(geom)) AS unified
FROM geo_features
WHERE category = 'polygon'
  AND geom && ST_MakeEnvelope(4.8, 52.3, 5.0, 52.4, 4326);

-- Cluster and union (for large datasets)
SELECT ST_AsGeoJSON(ST_MemUnion(geom)) AS unified
FROM geo_features
WHERE category = 'polygon'
  AND geom && ST_MakeEnvelope(4.8, 52.3, 5.0, 52.4, 4326);

-- Count features per grid cell (spatial aggregation)
SELECT
    ST_SnapToGrid(geom, 0.01) AS cell,
    COUNT(*) AS feature_count
FROM geo_features
GROUP BY ST_SnapToGrid(geom, 0.01)
ORDER BY feature_count DESC
LIMIT 20;
```

**SQL Server:**
```sql
-- Union with geometry::UnionAggregate
DECLARE @bbox geometry = geometry::STGeomFromText(
    'POLYGON((4.8 52.3, 5.0 52.3, 5.0 52.4, 4.8 52.4, 4.8 52.3))', 4326);

SELECT geometry::UnionAggregate(geom).STAsText() AS unified
FROM geo_features
WHERE category = N'polygon'
  AND geom.STIntersects(@bbox) = 1;

-- No built-in snap-to-grid; would need a UDF or ROUND coordinates
```

### 3.9 Complex Polygon Operations

**PostGIS:**
```sql
-- Difference
SELECT ST_AsGeoJSON(ST_Difference(a.geom, b.geom))
FROM geo_features a, geo_features b
WHERE a.id = 1 AND b.id = 2;

-- Symmetric difference
SELECT ST_AsGeoJSON(ST_SymDifference(a.geom, b.geom))
FROM geo_features a, geo_features b
WHERE a.id = 1 AND b.id = 2;

-- Convex hull of all features in an area
SELECT ST_AsGeoJSON(ST_ConvexHull(ST_Collect(geom)))
FROM geo_features
WHERE geom && ST_MakeEnvelope(4.8, 52.3, 5.0, 52.4, 4326);

-- Voronoi diagram (PostGIS-specific)
SELECT ST_AsGeoJSON(ST_VoronoiPolygons(ST_Collect(geom)))
FROM geo_features
WHERE category = 'point'
  AND geom && ST_MakeEnvelope(4.8, 52.3, 5.0, 52.4, 4326);
```

**SQL Server:**
```sql
-- Difference
SELECT a.geom.STDifference(b.geom).STAsText()
FROM geo_features a
CROSS JOIN geo_features b
WHERE a.id = 1 AND b.id = 2;

-- Symmetric difference
SELECT a.geom.STSymDifference(b.geom).STAsText()
FROM geo_features a
CROSS JOIN geo_features b
WHERE a.id = 1 AND b.id = 2;

-- Convex hull (single geometry — must union first)
SELECT geometry::UnionAggregate(geom).STConvexHull().STAsText()
FROM geo_features
WHERE geom.STIntersects(
    geometry::STGeomFromText('POLYGON((4.8 52.3, 5.0 52.3, 5.0 52.4, 4.8 52.4, 4.8 52.3))', 4326)
) = 1;

-- No Voronoi equivalent in SQL Server
```

### 3.10 Concurrent Query Performance

Use a load testing tool to send simultaneous spatial queries.

```typescript
// benchmark/concurrent.ts
import pLimit from "p-limit";

const CONCURRENCY_LEVELS = [1, 5, 10, 25, 50];

async function runConcurrentBenchmark(
  db: "postgis" | "mssql",
  queryFn: () => Promise<any>,
  concurrency: number,
  totalQueries: number
) {
  const limit = pLimit(concurrency);
  const results: number[] = [];

  const start = performance.now();
  await Promise.all(
    Array.from({ length: totalQueries }, () =>
      limit(async () => {
        const qStart = performance.now();
        await queryFn();
        results.push(performance.now() - qStart);
      })
    )
  );
  const totalTime = performance.now() - start;

  return {
    concurrency,
    totalTime,
    qps: (totalQueries / totalTime) * 1000,
    p50: percentile(results, 50),
    p95: percentile(results, 95),
    p99: percentile(results, 99),
  };
}
```

**Queries to test concurrently:**
- Random ST_Intersects with different polygons
- Mixed: 80% reads (intersects) + 20% writes (inserts)
- Random nearest-neighbor queries

### 3.11 Mixed Read/Write Workloads

```typescript
// Simulate realistic load: reads + writes simultaneously
async function mixedWorkload(writeRatio: number = 0.2) {
  const operations = Array.from({ length: 1000 }, () => {
    if (Math.random() < writeRatio) {
      // INSERT a new random feature
      return { type: "write", fn: () => insertRandomFeature() };
    } else {
      // Random spatial query
      return { type: "read", fn: () => randomIntersectsQuery() };
    }
  });
  // Execute with concurrency and measure separately for reads vs writes
}
```

---

## 4. Metrics to Capture

### Per Query
| Metric | How |
|---|---|
| Wall clock time (ms) | `performance.now()` or `\timing` in psql |
| p50, p95, p99 latency | Compute from array of measurements |
| Rows returned | Result set count |
| Query plan | `EXPLAIN ANALYZE` (PG) / `SET STATISTICS IO, TIME ON` (MSSQL) |

### Per Benchmark Run
| Metric | How (PostGIS) | How (SQL Server) |
|---|---|---|
| CPU usage | `docker stats` / `cAdvisor` | Same |
| Memory usage | `docker stats` | Same |
| Disk I/O | `iostat` inside container | Same |
| Index size | `pg_relation_size()` | `sys.dm_db_partition_stats` |
| Table size | `pg_total_relation_size()` | `sp_spaceused` |
| Connections | `pg_stat_activity` | `sys.dm_exec_sessions` |

### Collection Strategy

```typescript
// Use a wrapper that captures all metrics
interface BenchmarkResult {
  benchmark: string;
  database: "postgis" | "mssql";
  scale: 5000 | 2000000;
  iteration: number;
  queryTimeMs: number;
  rowsReturned: number;
  queryPlan?: string;
}

// Run each benchmark N times (minimum 10, ideally 50+)
// Discard first 3 runs (warmup)
// Report: min, p50, mean, p95, p99, max, stddev
```

### System Metrics Collection

```yaml
# docker-compose.monitoring.yml (optional, for detailed metrics)
services:
  cadvisor:
    image: gcr.io/cadvisor/cadvisor:latest
    ports:
      - "8080:8080"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - /sys:/sys:ro
      - /var/lib/docker/:/var/lib/docker:ro
```

Or simpler: poll `docker stats --format json` every second during benchmarks.

---

## 5. Demo App Architecture

### Overview

```
┌──────────────────────────────────────────────┐
│               Nuxt 3 Frontend                │
│  ┌──────────┐ ┌──────────┐ ┌──────────────┐ │
│  │ Map View │ │Dashboard │ │ Benchmark    │ │
│  │(MapLibre)│ │ (Charts) │ │ Runner UI    │ │
│  └────┬─────┘ └────┬─────┘ └──────┬───────┘ │
│       │             │              │         │
│       └─────────────┼──────────────┘         │
│                     │                        │
└─────────────────────┼────────────────────────┘
                      │ HTTP / API Routes
┌─────────────────────┼────────────────────────┐
│            Nitro Server (API)                │
│  ┌──────────────────┼──────────────────────┐ │
│  │     /api/query    │   /api/benchmark    │ │
│  │                                         │ │
│  │  ┌─────────────┐  ┌─────────────┐      │ │
│  │  │ PostGIS     │  │ SQL Server  │      │ │
│  │  │ Client      │  │ Client      │      │ │
│  │  └──────┬──────┘  └──────┬──────┘      │ │
│  └─────────┼────────────────┼──────────────┘ │
└────────────┼────────────────┼────────────────┘
             │                │
     ┌───────┴──────┐ ┌──────┴───────┐
     │  PostgreSQL  │ │  SQL Server  │
     │  + PostGIS   │ │  2022        │
     └──────────────┘ └──────────────┘
```

### API Layer Design

```typescript
// server/utils/db.ts
import pg from "pg";
import mssql from "mssql";

// PostGIS connection
const pgPool = new pg.Pool({
  host: "localhost",
  port: 5432,
  database: "geobench",
  user: "bench",
  password: "bench",
  max: 20,
});

// SQL Server connection
const mssqlPool = await mssql.connect({
  server: "localhost",
  port: 1433,
  database: "geobench",
  user: "sa",
  password: "Bench!Pass123",
  options: { trustServerCertificate: true },
  pool: { max: 20 },
});

export { pgPool, mssqlPool };
```

```typescript
// server/api/query/intersects.post.ts
export default defineEventHandler(async (event) => {
  const { geojson, db } = await readBody(event);
  // db: "postgis" | "mssql" | "both"

  const results: Record<string, { data: any[]; timeMs: number }> = {};

  if (db === "postgis" || db === "both") {
    const start = performance.now();
    const pgResult = await pgPool.query(
      `SELECT id, name, category, ST_AsGeoJSON(geom) as geojson
       FROM geo_features
       WHERE ST_Intersects(geom, ST_SetSRID(ST_GeomFromGeoJSON($1), 4326))`,
      [JSON.stringify(geojson)]
    );
    results.postgis = {
      data: pgResult.rows,
      timeMs: performance.now() - start,
    };
  }

  if (db === "mssql" || db === "both") {
    const wkt = geojsonToWkt(geojson); // convert GeoJSON → WKT
    const start = performance.now();
    const msResult = await mssqlPool.request()
      .input("wkt", mssql.NVarChar, wkt)
      .query(`
        DECLARE @input geometry = geometry::STGeomFromText(@wkt, 4326);
        SELECT id, name, category, geom.STAsText() as wkt
        FROM geo_features
        WHERE geom.STIntersects(@input) = 1
      `);
    results.mssql = {
      data: msResult.recordset,
      timeMs: performance.now() - start,
    };
  }

  return results;
});
```

```typescript
// server/api/benchmark/run.post.ts
export default defineEventHandler(async (event) => {
  const { benchmark, scale, iterations } = await readBody(event);
  // Runs the specified benchmark suite
  // Streams results via SSE for live dashboard updates
  // Stores results in a local SQLite DB or JSON file

  const results = await runBenchmarkSuite(benchmark, scale, iterations);
  return results;
});
```

### Frontend: Map View

Use **MapLibre GL JS** (open-source, vector tiles, better perf than Leaflet for large datasets).

```vue
<!-- pages/index.vue -->
<template>
  <div class="grid grid-cols-[1fr_400px] h-screen">
    <MapView
      @draw-complete="onDrawComplete"
      :postgis-results="postgisResults"
      :mssql-results="mssqlResults"
    />
    <ResultsPanel
      :postgis-time="postgisTime"
      :mssql-time="mssqlTime"
      :postgis-count="postgisResults?.length"
      :mssql-count="mssqlResults?.length"
    />
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";

const postgisResults = ref([]);
const mssqlResults = ref([]);
const postgisTime = ref(0);
const mssqlTime = ref(0);

async function onDrawComplete(geojson: GeoJSON.Geometry) {
  const res = await $fetch("/api/query/intersects", {
    method: "POST",
    body: { geojson, db: "both" },
  });
  postgisResults.value = res.postgis.data;
  mssqlResults.value = res.mssql.data;
  postgisTime.value = res.postgis.timeMs;
  mssqlTime.value = res.mssql.timeMs;
}
</script>
```

```vue
<!-- components/MapView.vue -->
<template>
  <div ref="mapContainer" class="w-full h-full" />
</template>

<script setup lang="ts">
import maplibregl from "maplibre-gl";
import MapboxDraw from "@mapbox/mapbox-gl-draw";
// (MapboxDraw works with MapLibre via compatibility)

const emit = defineEmits<{ "draw-complete": [geojson: GeoJSON.Geometry] }>();
const mapContainer = ref<HTMLElement>();

onMounted(() => {
  const map = new maplibregl.Map({
    container: mapContainer.value!,
    style: "https://demotiles.maplibre.org/style.json",
    center: [5.0, 52.3],
    zoom: 8,
  });

  const draw = new MapboxDraw({
    displayControlsDefault: false,
    controls: { polygon: true, trash: true },
  });
  map.addControl(draw);

  map.on("draw.create", (e) => {
    emit("draw-complete", e.features[0].geometry);
  });

  // Add result layers
  map.on("load", () => {
    map.addSource("postgis-results", { type: "geojson", data: emptyFC() });
    map.addSource("mssql-results", { type: "geojson", data: emptyFC() });

    map.addLayer({
      id: "postgis-fill",
      type: "fill",
      source: "postgis-results",
      paint: { "fill-color": "#3b82f6", "fill-opacity": 0.3 },
    });
    map.addLayer({
      id: "mssql-fill",
      type: "fill",
      source: "mssql-results",
      paint: { "fill-color": "#ef4444", "fill-opacity": 0.3 },
    });
  });
});
</script>
```

### Frontend: Dashboard

```vue
<!-- pages/dashboard.vue -->
<template>
  <div class="p-8 space-y-8">
    <h1 class="text-2xl font-bold">Benchmark Results</h1>

    <!-- Scale selector -->
    <select v-model="scale">
      <option :value="5000">5,000 records</option>
      <option :value="2000000">2,000,000 records</option>
    </select>

    <!-- Charts for each benchmark category -->
    <BenchmarkChart
      v-for="bench in benchmarks"
      :key="bench.id"
      :title="bench.name"
      :postgis-data="getResults('postgis', bench.id, scale)"
      :mssql-data="getResults('mssql', bench.id, scale)"
    />

    <!-- Summary table -->
    <SummaryTable :results="allResults" :scale="scale" />
  </div>
</template>
```

Use **Chart.js** (via `vue-chartjs`) or **Apache ECharts** for the comparison charts:
- Grouped bar charts: PostGIS vs SQL Server per benchmark
- Box plots: showing p50/p95/p99 spread
- Line charts: performance vs concurrency level

---

## 6. Tech Stack Recommendations

### Core

| Component | Package | Why |
|---|---|---|
| Frontend | `nuxt@^3.10` | SSR, file-based routing, Nitro server |
| Map | `maplibre-gl@^4` | Free, fast, vector tiles |
| Draw on map | `@mapbox/mapbox-gl-draw@^1.4` | Works with MapLibre |
| Charts | `chart.js@^4` + `vue-chartjs@^5` | Simple, good enough |
| CSS | `@nuxtjs/tailwindcss` | Rapid UI |

### Backend / DB Clients

| Component | Package |
|---|---|
| PostgreSQL client | `pg@^8` |
| SQL Server client | `mssql@^10` (uses `tedious` driver) |
| GeoJSON ↔ WKT | `wellknown@^0.5` or `@terraformer/wkt` |
| Spatial utils | `@turf/turf@^7` |

### Data Generation

| Tool | Use |
|---|---|
| `@turf/turf` | Procedural geometry generation |
| `ogr2ogr` (GDAL) | OSM extract conversion |
| `osmium-tool` | PBF filtering |

### Benchmark Tooling

| Tool | Use |
|---|---|
| Custom Node.js harness | Primary benchmark runner |
| `p-limit` | Concurrency control |
| `better-sqlite3` | Local results storage |
| `docker stats` | Container resource monitoring |

### Docker Images

| DB | Image |
|---|---|
| PostGIS | `postgis/postgis:16-3.4` |
| SQL Server | `mcr.microsoft.com/mssql/server:2022-latest` |

### Dev Tools

| Tool | Purpose |
|---|---|
| `tsx` | Run TypeScript scripts directly |
| `vitest` | Test the benchmark harness itself |
| `concurrently` | Run multiple services |

---

## 7. Project Structure

```
geodata-benchmark/
├── PLAN.md                          # This file
├── README.md                        # Setup & run instructions
├── docker-compose.yml               # Both DBs + optional monitoring
├── .env                             # DB credentials, config
├── package.json                     # Monorepo root (workspaces)
│
├── packages/
│   ├── db/                          # Database setup & migrations
│   │   ├── schemas/
│   │   │   ├── postgis.sql          # PostGIS schema + indexes
│   │   │   └── mssql.sql            # SQL Server schema + indexes
│   │   ├── seed/
│   │   │   ├── import-postgis.ts    # Import GeoJSON → PostGIS
│   │   │   └── import-mssql.ts      # Import GeoJSON → SQL Server
│   │   └── package.json
│   │
│   ├── datagen/                     # Test data generation
│   │   ├── generate.ts              # Main generator script
│   │   ├── generators/
│   │   │   ├── points.ts
│   │   │   ├── lines.ts
│   │   │   ├── polygons.ts
│   │   │   └── multipolygons.ts
│   │   ├── output/                  # Generated files (gitignored)
│   │   │   ├── small/               # 5,000 records
│   │   │   └── large/               # 2,000,000 records
│   │   └── package.json
│   │
│   ├── benchmark/                   # Benchmark runner
│   │   ├── runner.ts                # Main benchmark orchestrator
│   │   ├── suites/
│   │   │   ├── import.ts            # Bulk import benchmark
│   │   │   ├── indexing.ts          # Index build time
│   │   │   ├── intersects.ts        # ST_Intersects (core use case)
│   │   │   ├── point-in-polygon.ts
│   │   │   ├── bbox.ts
│   │   │   ├── distance.ts
│   │   │   ├── buffer.ts
│   │   │   ├── union.ts
│   │   │   ├── complex-ops.ts       # Difference, symmetric diff
│   │   │   ├── concurrent.ts        # Concurrent query load
│   │   │   └── mixed-workload.ts
│   │   ├── utils/
│   │   │   ├── metrics.ts           # Timing, percentile calc
│   │   │   ├── docker-stats.ts      # Container resource polling
│   │   │   └── results-db.ts        # SQLite results storage
│   │   ├── results/                 # Raw results (gitignored)
│   │   └── package.json
│   │
│   └── app/                         # Nuxt 3 demo app
│       ├── nuxt.config.ts
│       ├── pages/
│       │   ├── index.vue            # Interactive map
│       │   └── dashboard.vue        # Benchmark results charts
│       ├── components/
│       │   ├── MapView.vue
│       │   ├── ResultsPanel.vue
│       │   ├── BenchmarkChart.vue
│       │   └── SummaryTable.vue
│       ├── server/
│       │   ├── utils/
│       │   │   └── db.ts            # DB connections
│       │   └── api/
│       │       ├── query/
│       │       │   └── intersects.post.ts
│       │       └── benchmark/
│       │           ├── run.post.ts
│       │           └── results.get.ts
│       ├── composables/
│       │   └── useBenchmark.ts
│       └── package.json
│
├── scripts/
│   ├── setup.sh                     # docker compose up + create DBs + seed
│   ├── run-benchmarks.sh            # Run all benchmarks
│   └── export-results.ts            # Export results to CSV/JSON
│
└── docs/
    ├── results/                     # Benchmark result reports
    └── methodology.md               # Detailed methodology notes
```

---

## 8. PostGIS vs SQL Server Spatial: Known Differences

### Coordinate Systems: geometry vs geography

| Aspect | PostGIS | SQL Server |
|---|---|---|
| **geometry type** | Flat/Cartesian. SRID is metadata, computations are planar. | Same: planar, SRID is metadata. |
| **geography type** | Full geodesic calculations on ellipsoid. Cast with `::geography`. | Built-in `geography` type. Separate column/index. |
| **Default SRID** | 0 (unknown). Must set explicitly. | 0 for geometry, 4326 for geography. |
| **Switching** | Cast: `geom::geography` (runtime) | Separate types, can't freely cast. Must use `.STAsText()` → reparsing. |
| **Performance** | geography is slower than geometry. Common pattern: store as geometry, cast to geography for distance. | Similar: geography is slower. |
| **Ring orientation** | PostGIS is lenient (auto-fixes). | geography type **requires** counter-clockwise exterior rings. Clockwise = complement (the rest of the earth). **Common gotcha!** |

### Spatial Functions Comparison

| Operation | PostGIS | SQL Server | Notes |
|---|---|---|---|
| Intersects | `ST_Intersects(a, b)` | `a.STIntersects(b) = 1` | Comparable |
| Within | `ST_Within(a, b)` | `a.STWithin(b) = 1` | Comparable |
| Contains | `ST_Contains(a, b)` | `a.STContains(b) = 1` | Comparable |
| Distance | `ST_Distance(a, b)` | `a.STDistance(b)` | PG: planar unless geography. MSSQL: same. |
| DWithin | `ST_DWithin(a, b, d)` | No equivalent; use `a.STDistance(b) <= d` | **PostGIS advantage**: DWithin uses index |
| Buffer | `ST_Buffer(geom, d)` | `geom.STBuffer(d)` | Comparable |
| Union | `ST_Union(a, b)` | `a.STUnion(b)` | Comparable |
| Union Aggregate | `ST_Union(geom)` (aggregate) | `geometry::UnionAggregate(geom)` | Comparable |
| Intersection | `ST_Intersection(a, b)` | `a.STIntersection(b)` | Comparable |
| Difference | `ST_Difference(a, b)` | `a.STDifference(b)` | Comparable |
| Symmetric Diff | `ST_SymDifference(a, b)` | `a.STSymDifference(b)` | Comparable |
| Centroid | `ST_Centroid(geom)` | `geom.STCentroid()` | Comparable |
| Area | `ST_Area(geom)` | `geom.STArea()` | Comparable |
| Length | `ST_Length(geom)` | `geom.STLength()` | Comparable |
| Simplify | `ST_Simplify(geom, tol)` | `geom.Reduce(tol)` | Different name |
| GeoJSON output | `ST_AsGeoJSON(geom)` | **None built-in** | **PostGIS advantage**: must manually convert in MSSQL |
| GeoJSON input | `ST_GeomFromGeoJSON(json)` | **None built-in** | Must convert GeoJSON→WKT externally for MSSQL |
| KNN | `ORDER BY geom <-> point` | Not available | **Major PostGIS advantage** |
| Voronoi | `ST_VoronoiPolygons()` | Not available | PostGIS only |
| Clustering | `ST_ClusterDBSCAN()`, `ST_ClusterKMeans()` | Not available | PostGIS only |
| Snap to grid | `ST_SnapToGrid()` | Not available | PostGIS only |
| Make valid | `ST_MakeValid()` | `geom.MakeValid()` | Both have it |
| Subdivide | `ST_Subdivide()` | Not available | PostGIS only (great for large polygons) |
| MVT output | `ST_AsMVT()` | Not available | PostGIS: native vector tiles |

### Index Types and Strategies

| Aspect | PostGIS | SQL Server |
|---|---|---|
| **Primary index** | GiST (R-tree based) | Multi-level grid (4 levels) |
| **Index operator** | `&&` (bbox overlap) uses index; `ST_Intersects` also uses index via filter | `STIntersects` uses index; `Filter()` for index-only |
| **KNN via index** | Yes (`<->` operator) | No |
| **Alternative indexes** | SP-GiST (for points), BRIN (for sorted data) | GEOGRAPHY_GRID (for geography type) |
| **Index tuning** | Mostly automatic; `fillfactor` option | Must specify `BOUNDING_BOX`, `GRIDS`, `CELLS_PER_OBJECT` |
| **Index build** | Single-pass | Requires bounding box knowledge upfront |
| **Partial indexes** | Yes: `CREATE INDEX ... WHERE category = 'polygon'` | Filtered indexes (not on spatial columns) |

### Known Limitations

#### SQL Server
- **No GeoJSON support**: Must convert GeoJSON ↔ WKT externally. This adds overhead in a web app context.
- **No KNN index operator**: Nearest-neighbor queries are slow without manual optimization (bounding box pre-filter + sort).
- **Ring orientation matters for geography**: Counter-clockwise exterior required. Wrong orientation = the polygon covers the entire earth minus your shape. Silent, catastrophic bug.
- **Max geometry size**: 2GB, but practically limited. Very complex geometries can be slow.
- **geography limitations**: No `STContains`, `STCrosses`, `STOverlaps`, `STRelate`, `STTouches`, `STWithin` on geography type prior to SQL Server 2012. Still has fewer functions than PostGIS geography.
- **No spatial aggregate except UnionAggregate and CollectionAggregate**.
- **No vector tile output**: Must generate MVT tiles externally.
- **No geometry subdivision**: Large polygons can't be broken up for index efficiency.
- **Docker on ARM**: SQL Server Docker image is x64 only. On Apple Silicon, must use Rosetta/QEMU.

#### PostGIS
- **geography performance**: Significantly slower than geometry type. For bbox-scale operations, geometry with appropriate projections is preferred.
- **Memory**: Large `ST_Union` aggregations can consume enormous memory. Use `ST_MemUnion` or `ST_Subdivide` first.
- **SRID management**: Must be explicit. Mixing SRIDs causes errors (which is actually good — fails fast).
- **Topology extension**: Powerful but complex; not needed for this benchmark.

### Key Takeaway for This Benchmark

PostGIS has a significantly richer function set, native GeoJSON support (critical for a web app), and KNN index support. SQL Server has solid basic spatial operations but requires more application-level work (GeoJSON conversion, manual KNN). The benchmark will quantify the **raw performance** differences, but developer experience and feature completeness heavily favor PostGIS for a GeoJSON-centric web application.

---

## Execution Order

1. **Setup** (Day 1): Docker compose, schemas, verify connectivity
2. **Data Generation** (Day 1): Generate both scales, verify data quality
3. **Import + Index Benchmarks** (Day 2): Bulk load, index creation
4. **Core Spatial Benchmarks** (Day 2-3): All query categories, both scales
5. **Concurrent + Mixed** (Day 3): Load testing
6. **Demo App** (Day 4-5): Nuxt app with map + dashboard
7. **Analysis** (Day 5): Write up findings, generate charts
