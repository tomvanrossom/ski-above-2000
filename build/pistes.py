import csv
import sys

PISTE_USES = {"downhill", "snow_park"}
COUNTED = ("novice", "easy", "intermediate", "advanced")
HIGH_END_M = 2000

csv.field_size_limit(min(sys.maxsize, 2**31 - 1))


def is_piste(row):
    return bool(PISTE_USES & set(row["uses"].split(";")))


def to_float(value):
    try:
        return float(value) if value else None
    except ValueError:
        return None


def to_run(row):
    """A counted downhill segment, or None when unrated/expert or missing length or elevation."""
    if row["difficulty"] not in COUNTED:
        return None
    length, top, bottom = (to_float(row[k]) for k in ("inclined_length_m", "max_elevation_m", "min_elevation_m"))
    if None in (length, top, bottom) or length <= 0:
        return None
    return {
        "name": row["name"].strip(),
        "ref": row["ref"].strip(),
        "difficulty": row["difficulty"],
        "length_m": length,
        "start_m": top,
        "end_m": bottom,
        "lat": to_float(row["lat"]),
        "lng": to_float(row["lng"]),
        "id": row["id"],
    }


def is_named(run):
    return bool(run["name"] or run["ref"])


def harder(a, b):
    return a if COUNTED.index(a) >= COUNTED.index(b) else b


def merge_segments(runs):
    """Named segments merge by (name, ref): hardest rating wins, lengths add up, range widens."""
    pistes = {}
    for r in filter(is_named, runs):
        key = (r["name"], r["ref"])
        p = pistes.get(key)
        if p is None:
            pistes[key] = {**r, "segments": 1}
            continue
        longest = p if p["length_m"] >= r["length_m"] else r
        pistes[key] = {
            **p,
            "difficulty": harder(p["difficulty"], r["difficulty"]),
            "id": longest["id"],
            "lat": longest["lat"],
            "lng": longest["lng"],
            "length_m": p["length_m"] + r["length_m"],
            "start_m": max(p["start_m"], r["start_m"]),
            "end_m": min(p["end_m"], r["end_m"]),
            "segments": p["segments"] + 1,
        }
    return sorted(pistes.values(), key=lambda p: (-p["start_m"], p["name"], p["ref"]))


def unnamed_segments(runs):
    return sorted((r for r in runs if not is_named(r)), key=lambda r: (-r["start_m"], r["id"]))


def group_unnamed(segments):
    """One summary per difficulty, in COUNTED order."""
    groups = []
    for d in COUNTED:
        of_d = [s for s in segments if s["difficulty"] == d]
        if of_d:
            groups.append({
                "difficulty": d,
                "segments": len(of_d),
                "length_m": sum(s["length_m"] for s in of_d),
                "high_m": sum(s["length_m"] for s in of_d if s["end_m"] >= HIGH_END_M),
                "start_m": max(s["start_m"] for s in of_d),
                "end_m": min(s["end_m"] for s in of_d),
            })
    return groups


def figures(items):
    """km totals per group key 'all' and each difficulty: {key: [total_km, high_km]}."""
    out = {}
    for item in items:
        km = item["length_m"] / 1000
        high = km if item["end_m"] >= HIGH_END_M else 0.0
        for key in ("all", item["difficulty"]):
            total, above = out.get(key, (0.0, 0.0))
            out = {**out, key: (total + km, above + high)}
    return {k: [round(t, 2), round(h, 2)] for k, (t, h) in out.items()}


def unnamed_share(named, unnamed):
    total = sum(p["length_m"] for p in named) + sum(u["length_m"] for u in unnamed)
    return round(sum(u["length_m"] for u in unnamed) / total, 3) if total else 0.0


def read_piste_rows(runs_csv):
    with open(runs_csv, encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        missing = {"name", "ref", "uses", "difficulty", "inclined_length_m", "max_elevation_m",
                   "min_elevation_m", "lat", "lng", "id", "ski_area_ids"} - set(reader.fieldnames or [])
        if missing:
            raise ValueError(f"{runs_csv}: missing columns {sorted(missing)}")
        yield from (r for r in reader if is_piste(r))
