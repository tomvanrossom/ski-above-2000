import json


def in_ring(lng, lat, ring):
    inside = False
    for (x1, y1), (x2, y2) in zip(ring, ring[1:] + ring[:1]):
        if (y1 > lat) != (y2 > lat) and lng < x1 + (lat - y1) * (x2 - x1) / (y2 - y1):
            inside = not inside
    return inside


def in_polygon(lng, lat, polygon):
    outer, *holes = polygon
    return in_ring(lng, lat, outer) and not any(in_ring(lng, lat, h) for h in holes)


def polygons_of(geometry):
    kind = geometry["type"]
    if kind == "Polygon":
        return [geometry["coordinates"]]
    if kind == "MultiPolygon":
        return geometry["coordinates"]
    raise ValueError(f"unsupported geometry type {kind}")


def load_boundary(path):
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    features = data["features"] if data.get("type") == "FeatureCollection" else [data]
    polygons = [p for feat in features for p in polygons_of(feat["geometry"])]
    if not polygons:
        raise ValueError(f"{path}: no polygons")
    return [(bbox(p[0]), p) for p in polygons]


def bbox(ring):
    xs, ys = [x for x, _ in ring], [y for _, y in ring]
    return min(xs), min(ys), max(xs), max(ys)


def contains(boundary, lng, lat):
    return any(x0 <= lng <= x1 and y0 <= lat <= y1 and in_polygon(lng, lat, p)
               for (x0, y0, x1, y1), p in boundary)
