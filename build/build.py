import argparse
import csv
import datetime
import json
import shutil
import sys
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from alps import contains, load_boundary  # noqa: E402
from geometry import inside, padded_box, read_lifts, read_lines  # noqa: E402
from areas import (MERGED_AREAS, MERGE_OF, PASS_NETWORKS, assign_slugs, name_key, sub_area_ids,  # noqa: E402
                   top_parent)
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
CHILD_LISTS = {"village": "villages", "municipality": "municipalities"}
LINK_KEYS = ("parent", "kind", *CHILD_LISTS.values())
PISTE_KEYS = ("name", "ref", "difficulty", "hardest", "length_m", "high_m", "start_m", "end_m", "lat", "lng", "id",
              "segments")
MUNICIPALITY_MIN_KM = 2
MUNICIPALITY_MIN_SHARE = 0.05
MAP_KEY = "_map"
LIFT_PAD_DEG = 0.002


def area_runs(members, counted_by_area):
    return list({run_id: run for m in members for run_id, run in counted_by_area[m["id"]].items()}.values())


def longest_member(members, counted_by_area):
    return max(members, key=lambda m: sum(r["length_m"] for r in counted_by_area[m["id"]].values()))


def summarise(members, counted_by_area):
    first = members[0]
    main = longest_member(members, counted_by_area)
    return {
        "name": MERGE_OF.get(first["name"], first["name"]),
        "countries": multi(members, "countries"),
        "regions": multi(members, "regions"),
        "lat": round(float(main["lat"]), 5),
        "lng": round(float(main["lng"]), 5),
        "id": main["id"],
        PRICE_COLUMN: group_price(members),
        **run_figures(area_runs(members, counted_by_area)),
    }


def map_part(run):
    return {"id": run["id"], "difficulty": run["difficulty"], "start_m": round(run["start_m"]), "end_m": round(run["end_m"])}


def run_figures(runs):
    pistes = merge_segments(runs)
    unnamed = unnamed_segments(runs)
    by_id = {r["id"]: r for r in runs}
    parts = lambda ids: [map_part(by_id[i]) for i in ids]  # noqa: E731
    return {
        "figures": figures(runs),
        "unnamed_share": unnamed_share(pistes, unnamed),
        "pistes": [rounded(p, PISTE_KEYS) for p in pistes],
        "unnamed": [rounded(u, PISTE_KEYS) for u in unnamed],
        "unnamed_groups": [rounded(g, ("difficulty", "segments", "length_m", "high_m", "start_m", "end_m"))
                           for g in group_unnamed(unnamed)],
        MAP_KEY: {"pistes": [parts(p["run_ids"]) for p in pistes], "unnamed": [parts([u["id"]]) for u in unnamed]},
    }


def order_key(summary):
    return summary["name"], -summary["figures"]["all"][0], summary["countries"], summary["lat"], summary["lng"]


def has_point(area):
    return to_float(area["lat"]) is not None and to_float(area["lng"]) is not None


def alpine_groups(all_areas, run_ids_by_area, boundary):
    """[(members, village candidate rows)] per linked Alpine area."""
    network_ids = {a["id"] for a in all_areas if a["name"] in PASS_NETWORKS}
    subs = sub_area_ids({k: v for k, v in run_ids_by_area.items() if k not in network_ids})
    candidates = [a for a in all_areas if a["has_downhill"] == "yes" and a["name"] and has_point(a)
                  and a["id"] not in network_ids]
    groups = defaultdict(list)
    subs_by_top = defaultdict(list)
    for a in candidates:
        if a["id"] in subs:
            subs_by_top[top_parent(a["id"], subs)].append(a)
        else:
            groups[MERGE_OF.get(a["name"], a["id"])].append(a)
    return [(members, [s for m in members for s in subs_by_top[m["id"]]] + (members if len(members) > 1 else []))
            for members in groups.values()
            if any(contains(boundary, float(m["lng"]), float(m["lat"])) for m in members)]


def villages(parent_name, candidates, counted_by_area):
    by_name = defaultdict(list)
    for c in candidates:
        if name_key(c["name"]) != name_key(parent_name):
            by_name[name_key(c["name"])].append(c)
    found = [{**summarise(members, counted_by_area), "name": members[0]["name"], PRICE_COLUMN: None, "kind": "village"}
             for members in by_name.values()]
    found = [v for v in found if v["figures"]]
    return found if len(found) >= 2 else []


def length_km(runs):
    return sum(r["length_m"] for r in runs) / 1000


def weighted_point(runs, fallback):
    located = [r for r in runs if r["lat"] is not None and r["lng"] is not None]
    weight = sum(r["length_m"] for r in located)
    if not weight:
        return fallback["lat"], fallback["lng"]
    return tuple(round(sum(r[k] * r["length_m"] for r in located) / weight, 5) for k in ("lat", "lng"))


def municipality(parent, name, runs):
    lat, lng = weighted_point(runs, parent)
    return {"name": name, "countries": parent["countries"], "regions": parent["regions"], "lat": lat, "lng": lng,
            "id": parent["id"], PRICE_COLUMN: None, "kind": "municipality", **run_figures(runs)}


def municipalities(parent, runs):
    """Runs grouped by locality; a run in several localities counts in each, so they may overlap."""
    by_locality = defaultdict(list)
    for r in runs:
        for locality in r["localities"]:
            by_locality[locality].append(r)
    min_km = max(MUNICIPALITY_MIN_KM, MUNICIPALITY_MIN_SHARE * length_km(runs))
    kept = {name: rs for name, rs in by_locality.items() if length_km(rs) >= min_km}
    return [municipality(parent, name, rs) for name, rs in kept.items()] if len(kept) >= 2 else []


def children(parent, runs, candidates, counted_by_area):
    return villages(parent["name"], candidates, counted_by_area) or municipalities(parent, runs)


def duplicate_tops(tops, child_names, run_ids_by_area):
    """Indexes of tops [(name, members)] also shown as a child [(name, parent index)] of a top they share runs with."""
    by_key = defaultdict(list)
    for i, (name, _) in enumerate(tops):
        by_key[name_key(name)].append(i)
    ids = [set().union(*(run_ids_by_area.get(m["id"], set()) for m in members)) for _, members in tops]
    shown_under = {i: p for name, p in child_names for i in by_key[name_key(name)] if i != p and ids[i] & ids[p]}
    return {i for i in shown_under if i not in shown_under.values()}


def write_json(path, data):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))


def lifts_near(lifts, piste_lines):
    # ponytail: picks lifts by bounding box, so a neighbouring resort's lifts inside it show too; filter by ski area id if that matters.
    if not piste_lines:
        return []
    box = padded_box(piste_lines, LIFT_PAD_DEG)
    return [lift for lift in lifts if inside(lift["line"][len(lift["line"]) // 2], box)]


def write_maps(out, parts_by_slug, geojson_gz, lifts_gz=None):
    """data/maps/<slug>.json: per piste and unnamed segment (same order as the area file), its segments with lines,
    plus the operating lifts around them."""
    wanted = {p["id"] for groups in parts_by_slug.values() for kind in groups.values() for parts in kind for p in parts}
    lines = read_lines(geojson_gz, wanted)
    all_lifts = read_lifts(lifts_gz) if lifts_gz else []
    alpine_box = padded_box(lines.values(), LIFT_PAD_DEG) if lines else None
    lifts = [lift for lift in all_lifts if alpine_box and inside(lift["line"][0], alpine_box)]
    (out / "maps").mkdir()
    for slug, groups in parts_by_slug.items():
        data = {kind: [[{**{k: v for k, v in p.items() if k != "id"}, "line": lines[p["id"]]} for p in parts if p["id"] in lines]
                       for parts in groups[kind]]
                for kind in groups}
        piste_lines = [s["line"] for kind in data.values() for segments in kind for s in segments]
        write_json(out / "maps" / f"{slug}.json", {**data, "lifts": lifts_near(lifts, piste_lines)})
    print(f"Maps: {len(lines)} of {len(wanted)} piste lines found, {len(lifts)} Alpine lifts")


def build(runs_csv, areas_csv, boundary_path, out_dir, prices_csv=DEFAULT_PRICES, runs_geojson=None, lifts_geojson=None):
    boundary = load_boundary(boundary_path)
    run_ids_by_area, counted_by_area = read_runs(runs_csv)
    all_areas = apply_prices(read_areas(areas_csv), read_prices(prices_csv))
    groups = [(summarise(m, counted_by_area), m, c) for m, c in alpine_groups(all_areas, run_ids_by_area, boundary)]
    tops = sorted((g for g in groups if g[0]["figures"]), key=lambda g: order_key(g[0]))
    kids = [children(s, area_runs(m, counted_by_area), c, counted_by_area) for s, m, c in tops]
    drop = duplicate_tops([(s["name"], m) for s, m, _ in tops],
                          [(k["name"], i) for i, ks in enumerate(kids) for k in ks], run_ids_by_area)
    print(f"Dropped {len(drop)} top-level areas shown as a child elsewhere:",
          sorted(tops[i][0]["name"] for i in drop))
    ordered = [(s, ks) for i, ((s, _, _), ks) in enumerate(zip(tops, kids)) if i not in drop]
    found = sorted(((child, i) for i, (_, ks) in enumerate(ordered) for child in ks),
                   key=lambda ci: (list(CHILD_LISTS).index(ci[0]["kind"]), order_key(ci[0])))
    slugs = assign_slugs([(("area", i), s["name"], s["countries"]) for i, (s, _) in enumerate(ordered)] +
                         [(("child", j), c["name"], c["countries"]) for j, (c, _) in enumerate(found)])
    links = defaultdict(lambda: defaultdict(list))
    for j, (c, i) in enumerate(found):
        links[i][CHILD_LISTS[c["kind"]]].append(slugs[("child", j)])
    with_maps = [{"slug": slugs[("area", i)], **s, **links[i]} for i, (s, _) in enumerate(ordered)]
    with_maps += [{"slug": slugs[("child", j)], **c, "parent": with_maps[i]["slug"]} for j, (c, i) in enumerate(found)]
    parts_by_slug = {a["slug"]: a[MAP_KEY] for a in with_maps}
    stripped = [{k: v for k, v in a.items() if k != MAP_KEY} for a in with_maps]
    areas, child_areas = stripped[:len(ordered)], stripped[len(ordered):]

    out = Path(out_dir)
    for folder in ("areas", "maps"):
        if (out / folder).exists():
            shutil.rmtree(out / folder)
    (out / "areas").mkdir(parents=True)
    for a in areas + child_areas:
        write_json(out / "areas" / f"{a['slug']}.json", a)
    if runs_geojson:
        write_maps(out, parts_by_slug, runs_geojson, lifts_geojson)
    write_json(out / "areas.json", [{k: a[k] for k in (*SUMMARY_KEYS, *LINK_KEYS) if k in a}
                                    for a in areas + child_areas])
    write_json(out / "meta.json", {"built": datetime.date.today().isoformat(), "areas": len(areas)})
    return areas, child_areas


def main():
    parser = argparse.ArgumentParser(description="Build the site data for Alpine ski areas.")
    parser.add_argument("--runs", required=True)
    parser.add_argument("--areas", required=True)
    parser.add_argument("--prices", default=str(DEFAULT_PRICES))
    parser.add_argument("--runs-geojson", help="OpenSkiData runs.geojson.gz; writes data/maps when given")
    parser.add_argument("--lifts-geojson", help="OpenSkiData lifts.geojson.gz; adds lifts to data/maps")
    parser.add_argument("--boundary", default=str(Path(__file__).parent.parent / "alps" / "alpine-convention.geojson"))
    parser.add_argument("--out", default=str(Path(__file__).parent.parent / "site" / "data"))
    args = parser.parse_args()
    areas, child_areas = build(args.runs, args.areas, args.boundary, args.out, args.prices, args.runs_geojson,
                                 args.lifts_geojson)
    kinds = Counter(c["kind"] for c in child_areas)
    print(len(areas), "Alpine ski areas,", kinds["village"], "villages and", kinds["municipality"],
          "municipalities written to", args.out)


if __name__ == "__main__":
    main()
