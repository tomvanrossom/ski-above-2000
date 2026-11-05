import argparse
import csv
import datetime
import json
import shutil
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from alps import contains, load_boundary  # noqa: E402
from areas import MERGED_AREAS, MERGE_OF, PASS_NETWORKS, assign_slugs, sub_area_ids  # noqa: E402
from pistes import (figures, group_unnamed, merge_segments, read_piste_rows, to_float, to_run,  # noqa: E402
                    unnamed_segments, unnamed_share)

AREA_COLUMNS = {"name", "countries", "regions", "has_downhill", "id", "lat", "lng"}
PRICE_COLUMN = "skipass_price_eur"
DEFAULT_PRICES = Path(__file__).parent.parent / "refs" / "skipasprijzen.csv"
PRICE_COUNTRIES = {
    "AT": "Austria", "CH": "Switzerland", "FR": "France", "IT": "Italy", "DE": "Germany",
    "SI": "Slovenia", "LI": "Liechtenstein", "BE": "Belgium", "BG": "Bulgaria",
    "CZ": "Czechia", "NO": "Norway", "SE": "Sweden", "US": "United States",
    "CA": "Canada", "TR": "Turkey", "ES": "Spain", "FI": "Finland", "AD": "Andorra", "SK": "Slovakia",
}


def read_prices(prices_csv):
    prices = defaultdict(set)
    with open(prices_csv, encoding="utf-8-sig", newline="") as source:
        reader = csv.DictReader(source)
        if not {"Skigebied", "Land", PRICE_COLUMN} <= set(reader.fieldnames or []):
            raise ValueError(f"{prices_csv}: missing normalized price columns")
        for row in reader:
            value = row[PRICE_COLUMN].strip()
            if not value:
                continue
            if not value.isascii() or not value.isdigit() or int(value) <= 0:
                raise ValueError(f"{prices_csv}: invalid price for {row['Skigebied']}: {value!r}")
            country = PRICE_COUNTRIES.get(row["Land"], row["Land"])
            prices[(row["Skigebied"], country)].add(int(value))
    for key, values in prices.items():
        if len(values) != 1:
            raise ValueError(f"{prices_csv}: conflicting prices for {key}: {sorted(values)}")
    return {key: next(iter(values)) for key, values in prices.items()}


def apply_prices(rows, prices):
    identities = defaultdict(set)
    group_countries = defaultdict(set)
    for area in rows:
        name = MERGE_OF.get(area["name"], area["name"])
        identity = name if name in MERGED_AREAS else area["id"]
        group_countries[name].update(area["countries"].split(";"))
        for country in ["", *area["countries"].split(";")]:
            identities[(name, country)].add(identity)
    matched = set()
    priced = []
    for area in rows:
        name = MERGE_OF.get(area["name"], area["name"])
        countries = group_countries[name] if name in MERGED_AREAS else area["countries"].split(";")
        keys = [(name, country) for country in countries]
        keys.append((name, ""))
        keys = [key for key in keys if key in prices and len(identities[key]) == 1 and name not in PASS_NETWORKS]
        values = {prices[key] for key in keys}
        if len(values) > 1:
            raise ValueError(f"conflicting prices for {name}")
        priced.append({**area, PRICE_COLUMN: str(next(iter(values))) if values else ""})
        matched.update(keys)
    print(f"Prices: {len(matched)} matched source keys, {len(prices) - len(matched)} unmatched")
    return priced


def group_price(members):
    values = {member.get(PRICE_COLUMN, "") for member in members}
    return int(next(iter(values))) if len(values) == 1 and "" not in values else None


def read_runs(runs_csv):
    """(all piste run ids per area, counted runs per area keyed by run id)."""
    run_ids_by_area = defaultdict(set)
    counted_by_area = defaultdict(dict)
    for row in read_piste_rows(runs_csv):
        run = to_run(row)
        for area_id in filter(None, row["ski_area_ids"].split(";")):
            run_ids_by_area[area_id].add(row["id"])
            if run is not None:
                counted_by_area[area_id][row["id"]] = run
    return run_ids_by_area, counted_by_area


def read_areas(areas_csv):
    with open(areas_csv, encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        missing = AREA_COLUMNS - set(reader.fieldnames or [])
        if missing:
            raise ValueError(f"{areas_csv}: missing columns {sorted(missing)}")
        return list(reader)


def multi(members, field):
    return list(dict.fromkeys(v for m in members for v in m[field].split(";") if v))


def rounded(item, keys):
    return {k: (round(v) if k.endswith("_m") else round(v, 5) if k in ("lat", "lng") and v is not None else v)
            for k, v in item.items() if k in keys}


SUMMARY_KEYS = ("slug", "name", "countries", "regions", "lat", "lng", "id", "figures", "unnamed_share", PRICE_COLUMN)
PISTE_KEYS = ("name", "ref", "difficulty", "length_m", "start_m", "end_m", "lat", "lng", "id", "segments")


def summarise(members, counted_by_area):
    runs = list({run_id: run for m in members for run_id, run in counted_by_area[m["id"]].items()}.values())
    pistes = merge_segments(runs)
    unnamed = unnamed_segments(runs)
    first = members[0]
    return {
        "name": MERGE_OF.get(first["name"], first["name"]),
        "countries": multi(members, "countries"),
        "regions": multi(members, "regions"),
        "lat": round(float(first["lat"]), 5),
        "lng": round(float(first["lng"]), 5),
        "id": first["id"],
        PRICE_COLUMN: group_price(members),
        "figures": figures(pistes + unnamed),
        "unnamed_share": unnamed_share(pistes, unnamed),
        "pistes": [rounded(p, PISTE_KEYS) for p in pistes],
        "unnamed": [rounded(u, PISTE_KEYS) for u in unnamed],
        "unnamed_groups": [rounded(g, ("difficulty", "segments", "length_m", "high_m", "start_m", "end_m"))
                           for g in group_unnamed(unnamed)],
    }


def has_point(area):
    return to_float(area["lat"]) is not None and to_float(area["lng"]) is not None


def alpine_groups(all_areas, run_ids_by_area, boundary):
    network_ids = {a["id"] for a in all_areas if a["name"] in PASS_NETWORKS}
    subs = sub_area_ids({k: v for k, v in run_ids_by_area.items() if k not in network_ids})
    candidates = [a for a in all_areas if a["has_downhill"] == "yes" and a["name"] and has_point(a)
                  and a["id"] not in network_ids and a["id"] not in subs]
    groups = defaultdict(list)
    for a in candidates:
        groups[MERGE_OF.get(a["name"], a["id"])].append(a)
    return [members for members in groups.values()
            if any(contains(boundary, float(m["lng"]), float(m["lat"])) for m in members)]


def write_json(path, data):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))


def build(runs_csv, areas_csv, boundary_path, out_dir, prices_csv=DEFAULT_PRICES):
    boundary = load_boundary(boundary_path)
    run_ids_by_area, counted_by_area = read_runs(runs_csv)
    all_areas = apply_prices(read_areas(areas_csv), read_prices(prices_csv))
    summaries = [s for s in (summarise(m, counted_by_area) for m in alpine_groups(all_areas, run_ids_by_area, boundary))
                 if s["figures"]]
    ordered = sorted(summaries, key=lambda s: (s["name"], -s["figures"]["all"][0], s["countries"], s["lat"], s["lng"]))
    slugs = assign_slugs([(i, s["name"], s["countries"]) for i, s in enumerate(ordered)])
    areas = [{"slug": slugs[i], **s} for i, s in enumerate(ordered)]

    out = Path(out_dir)
    if (out / "areas").exists():
        shutil.rmtree(out / "areas")
    (out / "areas").mkdir(parents=True)
    for a in areas:
        write_json(out / "areas" / f"{a['slug']}.json", a)
    write_json(out / "areas.json", [{k: a[k] for k in SUMMARY_KEYS} for a in areas])
    write_json(out / "meta.json", {"built": datetime.date.today().isoformat(), "areas": len(areas)})
    return areas


def main():
    parser = argparse.ArgumentParser(description="Build the site data for Alpine ski areas.")
    parser.add_argument("--runs", required=True)
    parser.add_argument("--areas", required=True)
    parser.add_argument("--prices", default=str(DEFAULT_PRICES))
    parser.add_argument("--boundary", default=str(Path(__file__).parent.parent / "alps" / "alpine-convention.geojson"))
    parser.add_argument("--out", default=str(Path(__file__).parent.parent / "site" / "data"))
    args = parser.parse_args()
    areas = build(args.runs, args.areas, args.boundary, args.out, args.prices)
    print(len(areas), "Alpine ski areas written to", args.out)


if __name__ == "__main__":
    main()
