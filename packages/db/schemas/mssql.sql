-- SQL Server schema for geodata-benchmark
-- Run against the geobench database

IF NOT EXISTS (SELECT * FROM sys.databases WHERE name = 'geobench')
    CREATE DATABASE geobench;
GO
USE geobench;
GO

-- ============================================================
-- geometry variant
-- ============================================================
IF OBJECT_ID('dbo.geo_features', 'U') IS NOT NULL
    DROP TABLE dbo.geo_features;
GO

CREATE TABLE geo_features (
    id          BIGINT IDENTITY(1,1) PRIMARY KEY,
    name        NVARCHAR(255),
    category    NVARCHAR(50),
    properties  NVARCHAR(MAX),
    geom        geometry NOT NULL,
    created_at  DATETIME2 DEFAULT SYSUTCDATETIME()
);
GO

CREATE INDEX idx_geo_features_category ON geo_features (category);
GO

-- Spatial index created AFTER import for benchmarking:
-- CREATE SPATIAL INDEX idx_geo_features_geom
-- ON geo_features(geom)
-- USING GEOMETRY_GRID
-- WITH (
--     BOUNDING_BOX = (xmin = -180, ymin = -90, xmax = 180, ymax = 90),
--     GRIDS = (LEVEL_1 = HIGH, LEVEL_2 = HIGH, LEVEL_3 = HIGH, LEVEL_4 = HIGH),
--     CELLS_PER_OBJECT = 16
-- );

-- ============================================================
-- geography variant
-- ============================================================
IF OBJECT_ID('dbo.geo_features_geog', 'U') IS NOT NULL
    DROP TABLE dbo.geo_features_geog;
GO

CREATE TABLE geo_features_geog (
    id          BIGINT IDENTITY(1,1) PRIMARY KEY,
    name        NVARCHAR(255),
    category    NVARCHAR(50),
    properties  NVARCHAR(MAX),
    geog        geography NOT NULL,
    created_at  DATETIME2 DEFAULT SYSUTCDATETIME()
);
GO

CREATE INDEX idx_geo_features_geog_category ON geo_features_geog (category);
GO

-- Spatial index created AFTER import for benchmarking:
-- CREATE SPATIAL INDEX idx_geo_features_geog
-- ON geo_features_geog(geog)
-- USING GEOGRAPHY_GRID
-- WITH (
--     GRIDS = (LEVEL_1 = HIGH, LEVEL_2 = HIGH, LEVEL_3 = HIGH, LEVEL_4 = HIGH),
--     CELLS_PER_OBJECT = 16
-- );
