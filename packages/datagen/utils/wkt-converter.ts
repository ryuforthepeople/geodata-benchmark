import type { Feature, Geometry, Position } from "@turf/turf";

function coordToWkt(coord: Position): string {
  return `${coord[0]} ${coord[1]}`;
}

function ringToWkt(ring: Position[]): string {
  return `(${ring.map(coordToWkt).join(", ")})`;
}

function geometryToWkt(geom: Geometry): string {
  switch (geom.type) {
    case "Point":
      return `POINT(${coordToWkt(geom.coordinates)})`;
    case "LineString":
      return `LINESTRING(${geom.coordinates.map(coordToWkt).join(", ")})`;
    case "Polygon":
      return `POLYGON(${geom.coordinates.map(ringToWkt).join(", ")})`;
    case "MultiPoint":
      return `MULTIPOINT(${geom.coordinates.map(coordToWkt).join(", ")})`;
    case "MultiLineString":
      return `MULTILINESTRING(${geom.coordinates.map((ls) => ringToWkt(ls)).join(", ")})`;
    case "MultiPolygon":
      return `MULTIPOLYGON(${geom.coordinates.map((poly) => `(${poly.map(ringToWkt).join(", ")})`).join(", ")})`;
    case "GeometryCollection":
      return `GEOMETRYCOLLECTION(${(geom as any).geometries.map(geometryToWkt).join(", ")})`;
    default:
      throw new Error(`Unsupported geometry type: ${(geom as any).type}`);
  }
}

export function featureToWktRow(feature: Feature): string {
  const props = feature.properties || {};
  const wkt = geometryToWkt(feature.geometry!);
  const name = (props.name || "").replace(/"/g, '""');
  const category = (props.category || "").replace(/"/g, '""');
  const propsJson = JSON.stringify(props).replace(/"/g, '""');
  return `"${name}","${category}","${propsJson}","SRID=4326;${wkt}"`;
}

export function csvHeader(): string {
  return "name,category,properties,geom";
}

export { geometryToWkt };
