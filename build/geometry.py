import gzip
import json
import math

ID_MARKER = '"properties":{"id":"'
MIN_STEP_DEG = 0.00008


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


def read_lines(geojson_gz, wanted):
    """{run id: thinned [lng, lat] line} for the wanted LineString runs in an OpenSkiData runs.geojson.gz."""
    lines = {}
    with gzip.open(geojson_gz, "rt", encoding="utf-8") as source:
        for line in source:
            run_id = feature_id(line)
            if run_id not in wanted:
                continue
            geometry = json.loads(line.strip().rstrip(","))["geometry"]
            if geometry["type"] == "LineString" and len(geometry["coordinates"]) >= 2:
                lines[run_id] = thin(geometry["coordinates"])
    return lines
