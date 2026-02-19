-- PostGIS schema for geodata-benchmark
CREATE EXTENSION IF NOT EXISTS postgis;

DROP TABLE IF EXISTS geo_features CASCADE;

CREATE TABLE geo_features (
    id          BIGSERIAL PRIMARY KEY,
    name        VARCHAR(255),
    category    VARCHAR(50),
    properties  JSONB,
    geom        geometry(Geometry, 4326) NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT now()
);

-- B-tree on category for filtered spatial queries
CREATE INDEX idx_geo_features_category ON geo_features (category);

-- GIN on properties for JSONB queries
CREATE INDEX idx_geo_features_props ON geo_features USING GIN (properties);

-- Spatial index created AFTER import for benchmarking
-- CREATE INDEX idx_geo_features_geom ON geo_features USING GIST (geom);
