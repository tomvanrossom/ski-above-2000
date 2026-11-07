import csv
import sys
from collections import defaultdict

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
        "localities": list(dict.fromkeys(filter(None, row["localities"].split(";")))),
    }


def is_named(run):
    return bool(run["name"] or run["ref"])


def high_length(run):
    return run["length_m"] if run["end_m"] >= HIGH_END_M else 0.0


def main_colour(parts):
    """The colour covering most length; a tie goes to the harder colour."""
    lengths = defaultdict(float)
    for r in parts:
        lengths[r["difficulty"]] += r["length_m"]
    return max(lengths, key=lambda d: (lengths[d], COUNTED.index(d)))


def merged(parts):
    longest = max(parts, key=lambda r: r["length_m"])
    main = main_colour(parts)
    hardest = max((r["difficulty"] for r in parts), key=COUNTED.index)
    return {
        **parts[0],
        "difficulty": main,
        **({"hardest": hardest} if hardest != main else {}),
        "id": longest["id"],
        "lat": longest["lat"],
        "lng": longest["lng"],
        "length_m": sum(r["length_m"] for r in parts),
        "high_m": sum(high_length(r) for r in parts),
        "start_m": max(r["start_m"] for r in parts),
        "end_m": min(r["end_m"] for r in parts),
        "segments": len(parts),
        "run_ids": [r["id"] for r in parts],
    }


def merge_segments(runs):
    """Named segments merge by (name, ref): lengths add up, range widens, colour by length."""
    groups = defaultdict(list)
    for r in filter(is_named, runs):
        groups[(r["name"], r["ref"])].append(r)
    return sorted(map(merged, groups.values()), key=lambda p: (-p["start_m"], p["name"], p["ref"]))


def unnamed_segments(runs):
    return sorted(({**r, "high_m": high_length(r)} for r in runs if not is_named(r)), key=lambda r: (-r["start_m"], r["id"]))


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
                "high_m": sum(s["high_m"] for s in of_d),
                "start_m": max(s["start_m"] for s in of_d),
                "end_m": min(s["end_m"] for s in of_d),
            })
    return groups


def figures(items):
    """km totals per group key 'all' and each difficulty: {key: [total_km, high_km]}."""
    out = {}
    for item in items:
        km = item["length_m"] / 1000
        high = high_length(item) / 1000
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
                   "min_elevation_m", "lat", "lng", "id", "ski_area_ids", "localities"} - set(reader.fieldnames or [])
        if missing:
            raise ValueError(f"{runs_csv}: missing columns {sorted(missing)}")
        yield from (r for r in reader if is_piste(r))
