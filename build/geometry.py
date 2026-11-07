import gzip
import json
import math

ID_MARKER = '"properties":{"id":"'
MIN_STEP_DEG = 0.00008
M_PER_DEG = 111_195
ASPECTS = ("N", "NE", "E", "SE", "S", "SW", "W", "NW")


def thin(coords):
    """Rounded [lng, lat] points, dropping those within ~9 m of the previous kept point."""
    kept = [coords[0]]
    for point in coords[1:-1]:
        last = kept[-1]
        step = abs(point[0] - last[0]) * math.cos(math.radians(point[1])) + abs(point[1] - last[1])
        if step >= MIN_STEP_DEG:
            kept.append(point)
    kept.append(coords[-1])
    return [[round(c[0], 5), round(c[1], 5)] for c in kept]


def feature_id(line):
    start = line.find(ID_MARKER)
    if start < 0:
        return None
    start += len(ID_MARKER)
    return line[start:line.index('"', start)]


def to_lift(feature):
    """An operating LineString lift as {name, type, bottom_m, top_m, line}, or None."""
    props, geometry = feature["properties"], feature["geometry"]
    coords = geometry["coordinates"] if geometry["type"] == "LineString" else []
    heights = [c[2] for c in coords if len(c) > 2]
    if props.get("status") != "operating" or not props.get("skiAreas") or len(coords) < 2 or len(heights) < 2:
        return None
    return {"name": (props.get("name") or "").strip(), "type": props.get("liftType") or "",
            "bottom_m": round(min(heights)), "top_m": round(max(heights)), "line": thin(coords)}


def read_lifts(geojson_gz):
    """All operating lifts in an OpenSkiData lifts.geojson.gz."""
    with gzip.open(geojson_gz, "rt", encoding="utf-8") as source:
        features = (json.loads(line.strip().rstrip(",")) for line in source if line.startswith('{"type":"Feature"'))
        return [lift for lift in map(to_lift, features) if lift]


def inside(point, box):
    lng, lat = point
    return box[0] <= lng <= box[2] and box[1] <= lat <= box[3]


def padded_box(lines, pad_deg):
    """[min lng, min lat, max lng, max lat] around all points of the lines."""
    points = [p for line in lines for p in line]
    lngs, lats = [p[0] for p in points], [p[1] for p in points]
    return [min(lngs) - pad_deg, min(lats) - pad_deg, max(lngs) + pad_deg, max(lats) + pad_deg]


def aspect(coords):
    """Metres of the line per downhill compass direction (ASPECTS order); flat steps and points without height are skipped."""
    # ponytail: direction of travel downhill, so a traverse counts sideways to the fall line; use a DEM if that matters.
    metres = [0.0] * len(ASPECTS)
    for (lng0, lat0, *z0), (lng1, lat1, *z1) in zip(coords, coords[1:]):
        if not z0 or not z1 or z0[0] == z1[0]:
            continue
        dx = (lng1 - lng0) * M_PER_DEG * math.cos(math.radians(lat0))
        dy = (lat1 - lat0) * M_PER_DEG
        if z1[0] > z0[0]:
            dx, dy = -dx, -dy
        bearing = math.degrees(math.atan2(dx, dy)) % 360
        metres[round(bearing / (360 / len(ASPECTS))) % len(ASPECTS)] += math.hypot(dx, dy)
    return metres


def read_lines(geojson_gz, wanted):
    """({run id: thinned [lng, lat] line}, {run id: aspect metres}) for the wanted LineString runs in a runs.geojson.gz."""
    lines, aspects = {}, {}
    with gzip.open(geojson_gz, "rt", encoding="utf-8") as source:
        for line in source:
            run_id = feature_id(line)
            if run_id not in wanted:
                continue
            geometry = json.loads(line.strip().rstrip(","))["geometry"]
            if geometry["type"] == "LineString" and len(geometry["coordinates"]) >= 2:
                lines[run_id] = thin(geometry["coordinates"])
                aspects[run_id] = aspect(geometry["coordinates"])
    return lines, aspects
