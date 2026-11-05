import json
import math
import sys
from pathlib import Path

AREA_COUNT_RANGE = (530, 1240)
REQUIRED_AREAS = ("Les Trois Vallées", "Paradiski", "Via Lattea", "Espace San Bernardo", "Ski Arlberg",
                  "Alta Badia", "Les Deux Alpes")
TROIS_VALLEES_KM = (300, 700)
AREA_KEYS = {"slug", "name", "countries", "regions", "lat", "lng", "id", "figures", "unnamed_share",
             "pistes", "unnamed", "unnamed_groups"}


def figure_errors(name, figures):
    errors = []
    for key, values in figures.items():
        if not (isinstance(values, list) and len(values) == 2):
            errors.append(f"{name}: figures[{key}] is not [total, high]")
        elif any(not isinstance(v, (int, float)) or math.isnan(v) or v < 0 for v in values):
            errors.append(f"{name}: figures[{key}] has a NaN or negative value {values}")
        elif values[1] > values[0] + 0.01:
            errors.append(f"{name}: figures[{key}] has more km above 2,000 m than in total {values}")
    return errors


def check_summary(areas):
    errors = []
    low, high = AREA_COUNT_RANGE
    if not low <= len(areas) <= high:
        errors.append(f"area count {len(areas)} outside plausible range {low}-{high}")
    totals = {}
    for a in areas:
        errors += figure_errors(a.get("name", "?"), a.get("figures", {}))
        total = a.get("figures", {}).get("all", [0])[0]
        totals[a.get("name")] = max(totals.get(a.get("name"), 0), total)
    errors += [f"required area missing or empty: {n}" for n in REQUIRED_AREAS if not totals.get(n, 0) > 0]
    tv = totals.get("Les Trois Vallées", 0)
    if not TROIS_VALLEES_KM[0] <= tv <= TROIS_VALLEES_KM[1]:
        errors.append(f"Les Trois Vallées total {tv} km outside {TROIS_VALLEES_KM[0]}-{TROIS_VALLEES_KM[1]} km")
    return errors


CHILD_LISTS = {"village": "villages", "municipality": "municipalities"}


def check_links(areas):
    by_slug = {a.get("slug"): a for a in areas}
    errors = []
    for a in areas:
        parent = by_slug.get(a.get("parent"), {})
        if "parent" in a and not any(a["slug"] in parent.get(key, []) for key in CHILD_LISTS.values()):
            errors.append(f"{a['slug']}: parent {a['parent']} missing or does not list it")
        errors += [f"{a['slug']}: {kind} {c} missing or has another parent"
                   for kind, key in CHILD_LISTS.items() for c in a.get(key, [])
                   if by_slug.get(c, {}).get("parent") != a["slug"]]
    return errors


def check_area_file(path):
    try:
        area = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as e:
        return [f"{path.name}: unreadable ({e})"]
    missing = AREA_KEYS - set(area)
    if missing:
        return [f"{path.name}: missing keys {sorted(missing)}"]
    return figure_errors(path.name, area["figures"])


def check(out_dir):
    out = Path(out_dir)
    try:
        areas = json.loads((out / "areas.json").read_text(encoding="utf-8"))
        meta = json.loads((out / "meta.json").read_text(encoding="utf-8"))
    except (OSError, ValueError) as e:
        return [f"summary or meta unreadable: {e}"]
    top_level = [a for a in areas if "parent" not in a]
    errors = check_summary(top_level) + check_links(areas)
    if meta.get("areas") != len(top_level):
        errors.append(f"meta.json says {meta.get('areas')} areas, areas.json has {len(top_level)}")
    files = {p.stem for p in (out / "areas").glob("*.json")}
    errors += [f"detail file missing for {a['slug']}" for a in areas if a["slug"] not in files]
    for path in sorted((out / "areas").glob("*.json")):
        errors += check_area_file(path)
    return errors


def main():
    out_dir = sys.argv[1] if len(sys.argv) > 1 else str(Path(__file__).parent.parent / "site" / "data")
    errors = check(out_dir)
    for e in errors:
        print("ERROR:", e, file=sys.stderr)
    if errors:
        sys.exit(1)
    print("output check passed:", out_dir)


if __name__ == "__main__":
    main()
