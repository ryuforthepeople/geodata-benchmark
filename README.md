# Geodata Benchmark: PostgreSQL + PostGIS vs MS SQL Server

Benchmark comparing spatial query performance between PostGIS and SQL Server 2022.

## Prerequisites

- Node.js 20+
- Docker & Docker Compose

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Start databases
npm run docker:up

# 3. Generate test data
npm run generate

# 4. Run benchmarks
npm run benchmark

# 5. Start demo app
npm run dev
```

## Project Structure

- `packages/db` — Database schemas & seed scripts
- `packages/datagen` — Test data generation (Turf.js)
- `packages/benchmark` — Benchmark runner & suites
- `packages/app` — Nuxt 3 demo app with MapLibre + Charts

## Databases

| DB | Port | Credentials |
|---|---|---|
| PostGIS 16 | 5432 | bench / bench |
| SQL Server 2022 | 1433 | sa / Bench!Pass123 |
