import gzip
import io
import json
import sys
import tempfile
import unittest
from collections import defaultdict
from contextlib import redirect_stdout
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from alps import contains, in_polygon  # noqa: E402
from areas import assign_slugs, slugify, sub_area_ids, top_parent  # noqa: E402
from build import (PRICE_COLUMN, alpine_groups, apply_prices, children, duplicate_tops, municipalities,  # noqa: E402
                   read_prices, summarise, villages)
from check_output import REQUIRED_AREAS, check_links, check_summary  # noqa: E402
from geometry import read_lines, thin  # noqa: E402
from pistes import figures, group_unnamed, merge_segments, to_run, unnamed_segments, unnamed_share  # noqa: E402


def row(name="", ref="", difficulty="easy", length="100", top="2500", bottom="2400", run_id="x", localities="",
        lat="45.0", lng="6.0"):
    return {"name": name, "ref": ref, "difficulty": difficulty, "inclined_length_m": length,
            "max_elevation_m": top, "min_elevation_m": bottom, "lat": lat, "lng": lng, "id": run_id,
            "localities": localities}


class MergeSegments(unittest.TestCase):
    def test_cimalegna_segments_merge_into_one_intermediate_piste(self):
        runs = [to_run(row("Cimalegna", "V4", "intermediate", "264", "3030", "2970", "a")),
                to_run(row("Cimalegna", "V4", "easy", "1756", "2970", "2646", "b")),
                to_run(row("Cimalegna", "V4", "easy", "31", "2658", "2651", "c"))]

        [piste] = merge_segments(runs)

        self.assertEqual(piste["difficulty"], "intermediate")
        self.assertEqual(piste["length_m"], 2051)
        self.assertEqual((piste["start_m"], piste["end_m"]), (3030, 2646))
        self.assertEqual(piste["segments"], 3)
        self.assertEqual(piste["id"], "b")
        self.assertEqual(piste["run_ids"], ["a", "b", "c"])

    def test_same_name_different_ref_stays_separate(self):
        runs = [to_run(row("Combe", "1", run_id="a")), to_run(row("Combe", "2", run_id="b"))]
        self.assertEqual(len(merge_segments(runs)), 2)


class Geometry(unittest.TestCase):
    def test_thin_keeps_ends_and_drops_points_closer_than_the_step(self):
        coords = [[6.0, 45.0, 2500], [6.00001, 45.00001, 2499], [6.001, 45.001, 2450], [6.00101, 45.00101, 2449]]
        self.assertEqual(thin(coords), [[6.0, 45.0], [6.001, 45.001], [6.00101, 45.00101]])

    def test_read_lines_streams_only_wanted_line_strings(self):
        features = [
            {"type": "Feature", "geometry": {"type": "LineString", "coordinates": [[6.0, 45.0, 1], [6.01, 45.01, 2]]},
             "properties": {"id": "keep"}},
            {"type": "Feature", "geometry": {"type": "LineString", "coordinates": [[7.0, 46.0, 1], [7.01, 46.01, 2]]},
             "properties": {"id": "other"}},
            {"type": "Feature", "geometry": {"type": "Polygon", "coordinates": [[[6, 45, 1], [6, 46, 1], [7, 45, 1]]]},
             "properties": {"id": "area"}},
        ]
        body = '{"type": "FeatureCollection", "features":[\n'
        body += ",\n".join(json.dumps(f, separators=(",", ":")) for f in features) + "\n]}\n"
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "runs.geojson.gz"
            with gzip.open(path, "wt", encoding="utf-8") as f:
                f.write(body)
            self.assertEqual(read_lines(path, {"keep", "area"}), {"keep": [[6.0, 45.0], [6.01, 45.01]]})


class Counting(unittest.TestCase):
    def test_uncounted_difficulties_and_incomplete_segments_are_dropped(self):
        for r in (row(difficulty="expert"), row(difficulty="freeride"), row(difficulty="extreme"),
                  row(difficulty=""), row(length=""), row(bottom="")):
            self.assertIsNone(to_run(r))

    def test_figures_split_total_and_fully_above_2000(self):
        items = [to_run(row(difficulty="advanced", length="1000", bottom="2000")),
                 to_run(row(difficulty="advanced", length="500", bottom="1999"))]
        self.assertEqual(figures(items), {"all": [1.5, 1.0], "advanced": [1.5, 1.0]})


class Unnamed(unittest.TestCase):
    def test_unnamed_segments_are_not_merged_but_grouped_per_colour(self):
        runs = [to_run(row(difficulty="intermediate", length="400", top="2600", bottom="2100", run_id="a")),
                to_run(row(difficulty="intermediate", length="600", top="2200", bottom="1900", run_id="b")),
                to_run(row(difficulty="novice", length="50", run_id="c")),
                to_run(row("Named", run_id="d"))]

        segments = unnamed_segments(runs)

        self.assertEqual(len(merge_segments(runs)), 1)
        self.assertEqual(len(segments), 3)
        self.assertEqual(group_unnamed(segments), [
            {"difficulty": "novice", "segments": 1, "length_m": 50, "high_m": 50, "start_m": 2500, "end_m": 2400},
            {"difficulty": "intermediate", "segments": 2, "length_m": 1000, "high_m": 400,
             "start_m": 2600, "end_m": 1900},
        ])


    def test_unnamed_share_is_fraction_of_counted_length(self):
        named = [to_run(row("A", length="700"))]
        unnamed = [to_run(row(length="300"))]
        self.assertEqual(unnamed_share(named, unnamed), 0.3)
        self.assertEqual(unnamed_share([], []), 0.0)


def summary(name, total, high=0.0):
    return {"name": name, "figures": {"all": [total, high]}}


class OutputCheck(unittest.TestCase):
    def plausible(self):
        fillers = [summary(f"Area {i}", 5) for i in range(600)]
        return fillers + [summary(n, 500 if n == "Les Trois Vallées" else 50) for n in REQUIRED_AREAS]

    def test_plausible_output_passes(self):
        self.assertEqual(check_summary(self.plausible()), [])

    def test_missing_required_area_and_bad_values_are_reported(self):
        areas = [a for a in self.plausible() if a["name"] != "Alta Badia"] + [summary("Broken", -1)]
        errors = check_summary(areas)
        self.assertIn("required area missing or empty: Alta Badia", errors)
        self.assertTrue(any("Broken" in e and "negative" in e for e in errors))

    def test_parent_and_village_links_must_resolve_both_ways(self):
        areas = [{"slug": "p", "villages": ["v", "ghost"]}, {"slug": "v", "parent": "p"},
                 {"slug": "orphan", "parent": "nobody"}]
        self.assertEqual(check_links(areas), ["p: village ghost missing or has another parent",
                                              "orphan: parent nobody missing or does not list it"])
        self.assertEqual(check_links([{"slug": "p", "villages": ["v"]}, {"slug": "v", "parent": "p"}]), [])

    def test_municipality_links_must_resolve_both_ways(self):
        areas = [{"slug": "p", "municipalities": ["m", "ghost"]}, {"slug": "m", "parent": "p", "kind": "municipality"},
                 {"slug": "stray", "parent": "p", "kind": "municipality"}]
        self.assertEqual(check_links(areas), ["p: municipality ghost missing or has another parent",
                                              "stray: parent p missing or does not list it"])
        self.assertEqual(check_links([{"slug": "p", "municipalities": ["m"]}, areas[1]]), [])

    def test_too_few_areas_and_implausible_trois_vallees(self):
        errors = check_summary([summary("Les Trois Vallées", 90)])
        self.assertTrue(any(e.startswith("area count 1") for e in errors))
        self.assertTrue(any("Les Trois Vallées total 90" in e for e in errors))


class PointInPolygon(unittest.TestCase):
    SQUARE = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]
    HOLE = [[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]]

    def test_inside_outside_and_hole(self):
        polygon = [self.SQUARE, self.HOLE]
        self.assertTrue(in_polygon(2, 2, polygon))
        self.assertFalse(in_polygon(11, 2, polygon))
        self.assertFalse(in_polygon(5, 5, polygon))

    def test_multipolygon_boundary(self):
        far = [[20, 20], [30, 20], [30, 30], [20, 30], [20, 20]]
        boundary = [((0, 0, 10, 10), [self.SQUARE]), ((20, 20, 30, 30), [far])]
        self.assertTrue(contains(boundary, 25, 25))
        self.assertFalse(contains(boundary, 15, 15))


class Slugs(unittest.TestCase):
    def test_slugify_folds_accents(self):
        self.assertEqual(slugify("Les Deux Alpes"), "les-deux-alpes")
        self.assertEqual(slugify("Sauze D'Oulx · Ü"), "sauze-d-oulx-u")

    def test_first_keeps_bare_slug_and_later_collisions_get_country_then_number(self):
        slugs = assign_slugs([(1, "Sankt Jakob", ["Austria"]), (2, "Sankt Jakob", ["Italy"]),
                              (3, "Sankt Jakob", ["Italy"]), (4, "Arosa", ["Switzerland"])])
        self.assertEqual(slugs, {1: "sankt-jakob", 2: "sankt-jakob-it", 3: "sankt-jakob-it-2", 4: "arosa"})


class ReadPrices(unittest.TestCase):
    def prices(self, *lines, header="Skigebied,Land,skipass_price_eur"):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        path = Path(directory.name) / "prices.csv"
        path.write_text("\n".join([header, *lines]) + "\n", encoding="utf-8")
        return read_prices(path)

    def test_country_codes_are_mapped_and_empty_prices_skipped(self):
        self.assertEqual(self.prices("Arosa,CH,350", "Ischgl,AT,", "Elsewhere,Narnia,200"),
                         {("Arosa", "Switzerland"): 350, ("Elsewhere", "Narnia"): 200})

    def test_invalid_price_raises(self):
        for value in ("abc", "0", "-5", "12.5"):
            with self.assertRaises(ValueError):
                self.prices(f"Arosa,CH,{value}")

    def test_conflicting_prices_raise(self):
        with self.assertRaises(ValueError):
            self.prices("Arosa,CH,350", "Arosa,CH,360")

    def test_missing_columns_raise(self):
        with self.assertRaises(ValueError):
            self.prices("Arosa,CH", header="Skigebied,Land")


def area(name, country, area_id):
    return {"name": name, "countries": country, "id": area_id}


class ApplyPrices(unittest.TestCase):
    def priced(self, rows, prices):
        with redirect_stdout(io.StringIO()):
            return [a[PRICE_COLUMN] for a in apply_prices(rows, prices)]

    def test_plain_match_by_name_and_country(self):
        rows = [area("Arosa", "Switzerland", "a"), area("Arosa", "Austria", "b")]
        self.assertEqual(self.priced(rows, {("Arosa", "Switzerland"): 350}), ["350", ""])

    def test_merged_area_members_share_the_group_price(self):
        rows = [area("La Rosière", "France", "a"), area("La Thuile ski", "Italy", "b")]
        self.assertEqual(self.priced(rows, {("Espace San Bernardo", "Italy"): 300}), ["300", "300"])

    def test_pass_network_gets_no_price(self):
        self.assertEqual(self.priced([area("Stubai", "Austria", "a")], {("Stubai", "Austria"): 400}), [""])

    def test_name_shared_by_several_ids_gets_no_price(self):
        rows = [area("Sankt Jakob", "Austria", "a"), area("Sankt Jakob", "Austria", "b")]
        self.assertEqual(self.priced(rows, {("Sankt Jakob", "Austria"): 250}), ["", ""])


class SubAreas(unittest.TestCase):
    def test_area_inside_a_larger_area_is_a_sub_area(self):
        run_ids = {"val-thorens": {1, 2, 3, 4, 5, 6, 7, 8, 9, 10},
                   "trois-vallees": set(range(1, 40)),
                   "neighbour": {9, 10, 50, 51}}
        self.assertEqual(sub_area_ids(run_ids), {"val-thorens": "trois-vallees"})

    def test_top_parent_follows_the_chain_and_stops_on_a_cycle(self):
        self.assertEqual(top_parent("leaf", {"leaf": "mid", "mid": "top"}), "top")
        self.assertEqual(top_parent("solo", {}), "solo")
        self.assertIn(top_parent("a", {"a": "b", "b": "a"}), {"a", "b"})


def ski_area(name, area_id, downhill="yes", lat="5", lng="5"):
    return {"name": name, "id": area_id, "has_downhill": downhill, "lat": lat, "lng": lng,
            "countries": "France", "regions": "Savoie", PRICE_COLUMN: ""}


def counted(*area_ids):
    return defaultdict(dict, {a: {f"{a}-run": to_run(row(f"{a} piste", run_id=f"{a}-run"))} for a in area_ids})


class Summarise(unittest.TestCase):
    def test_merged_group_takes_id_and_point_of_its_longest_member(self):
        members = [ski_area("Pragelato", "small", lat="1", lng="2"), ski_area("Sestriere", "big", lat="3", lng="4"),
                   ski_area("Claviere", "mid", lat="5", lng="6")]
        runs = defaultdict(dict, {
            "small": {"s": to_run(row("S", length="280", run_id="s"))},
            "big": {"b1": to_run(row("B", length="900", run_id="b1")),
                    "b2": to_run(row("B2", length="900", run_id="b2"))},
            "mid": {"m": to_run(row("M", length="1500", run_id="m"))}})

        result = summarise(members, runs)

        self.assertEqual((result["name"], result["id"], result["lat"], result["lng"]), ("Via Lattea", "big", 3, 4))

    def test_tie_keeps_the_first_member(self):
        members = [ski_area("Pragelato", "a", lat="1", lng="2"), ski_area("Sestriere", "b", lat="3", lng="4")]

        result = summarise(members, counted("a", "b"))

        self.assertEqual((result["id"], result["lat"], result["lng"]), ("a", 1, 2))


class VillageCandidates(unittest.TestCase):
    BOUNDARY = [((0, 0, 10, 10), [PointInPolygon.SQUARE])]

    def groups(self, areas, run_ids):
        return {members[0]["name"]: [v["name"] for v in villages]
                for members, villages in alpine_groups(areas, run_ids, self.BOUNDARY)}

    def test_sub_area_of_a_sub_area_is_a_village_of_the_top_parent(self):
        areas = [ski_area("Top", "top"), ski_area("Mid", "mid"), ski_area("Leaf", "leaf"),
                 ski_area("Lifts only", "lifts", downhill="no"), ski_area("", "nameless"),
                 ski_area("Nowhere", "nowhere", lat="")]
        run_ids = {"top": set(range(1, 41)), "mid": set(range(1, 28)) | {100, 101, 102},
                   "leaf": {100, 101, 102}, "lifts": {1, 2}, "nameless": {3, 4}, "nowhere": {5, 6}}
        self.assertEqual(self.groups(areas, run_ids), {"Top": ["Mid", "Leaf"]})

    def test_members_of_a_merged_area_are_its_villages(self):
        areas = [ski_area("La Rosière", "a"), ski_area("La Thuile ski", "b"), ski_area("Les Rousses", "c")]
        run_ids = {"a": {1, 2}, "b": {3, 4}, "c": {5, 6}}
        self.assertEqual(self.groups(areas, run_ids),
                         {"La Rosière": ["La Rosière", "La Thuile ski"], "Les Rousses": []})


class Villages(unittest.TestCase):
    def names(self, parent, candidates, runs):
        return [v["name"] for v in villages(parent, candidates, runs)]

    def test_villages_get_their_own_figures_and_no_price(self):
        rows = [{**ski_area("A", "a"), PRICE_COLUMN: "300"}, ski_area("B", "b")]
        a, b = villages("Parent", rows, counted("a", "b"))
        self.assertEqual((a["name"], a[PRICE_COLUMN], [p["name"] for p in a["pistes"]]), ("A", None, ["a piste"]))
        self.assertEqual((b["name"], b["kind"]), ("B", "village"))

    def test_village_named_like_the_parent_is_dropped(self):
        rows = [ski_area("Parent", "p"), ski_area("A", "a"), ski_area("B", "b")]
        self.assertEqual(self.names("Parent", rows, counted("p", "a", "b")), ["A", "B"])

    def test_names_with_the_same_words_count_as_the_same_name(self):
        rows = [ski_area("Andermatt + Sedrun + Disentis", "a"), ski_area("Andermatt+Disentis+Sedrun", "b")]
        self.assertEqual(self.names("Andermatt Sedrun Disentis", rows, counted("a", "b")), [])

    def test_villages_sharing_a_name_are_merged(self):
        rows = [ski_area("A", "a1"), ski_area("A", "a2"), ski_area("B", "b")]
        merged, _ = villages("Parent", rows, counted("a1", "a2", "b"))
        self.assertEqual(sorted(p["name"] for p in merged["pistes"]), ["a1 piste", "a2 piste"])

    def test_villages_without_counted_runs_are_dropped(self):
        rows = [ski_area("A", "a"), ski_area("B", "b"), ski_area("C", "c")]
        self.assertEqual(self.names("Parent", rows, counted("a", "c")), ["A", "C"])

    def test_fewer_than_two_villages_means_none(self):
        rows = [ski_area("A", "a"), ski_area("B", "b")]
        self.assertEqual(self.names("Parent", rows, counted("a")), [])


PARENT = {"name": "Parent", "countries": ["France"], "regions": ["Savoie"], "lat": 45.5, "lng": 6.5, "id": "p"}


def km_run(km, localities, run_id, lat="45.0", lng="6.0"):
    return to_run(row(f"{run_id} piste", length=str(km * 1000), run_id=run_id, localities=localities, lat=lat, lng=lng))


class Municipalities(unittest.TestCase):
    def found(self, runs):
        return {m["name"]: m for m in municipalities(PARENT, runs)}

    def test_a_run_in_several_localities_counts_in_each(self):
        found = self.found([km_run(3, "A;B", "ab"), km_run(3, "A", "a"), km_run(3, "B", "b")])
        self.assertEqual({n: m["figures"]["all"][0] for n, m in found.items()}, {"A": 6.0, "B": 6.0})
        self.assertEqual(sorted(p["name"] for p in found["A"]["pistes"]), ["a piste", "ab piste"])

    def test_municipality_needs_two_km(self):
        found = self.found([km_run(3, "A", "a"), km_run(3, "B", "b"), km_run(1.9, "C", "c")])
        self.assertEqual(sorted(found), ["A", "B"])

    def test_municipality_needs_five_percent_of_the_area(self):
        found = self.found([km_run(30, "A", "a"), km_run(30, "B", "b"), km_run(40, "", "x"), km_run(4.9, "C", "c")])
        self.assertEqual(sorted(found), ["A", "B"])

    def test_fewer_than_two_municipalities_means_none(self):
        self.assertEqual(self.found([km_run(10, "A", "a"), km_run(1, "B", "b"), km_run(10, "", "x")]), {})

    def test_municipality_is_unpriced_and_located_at_its_runs(self):
        a, _ = municipalities({**PARENT, PRICE_COLUMN: 300}, [
            km_run(3, "A", "a1", lat="45.0", lng="6.0"), km_run(1, "A", "a2", lat="46.0", lng="7.0"),
            km_run(3, "B", "b", lat="", lng="")])
        self.assertEqual((a["kind"], a[PRICE_COLUMN], a["lat"], a["lng"]), ("municipality", None, 45.25, 6.25))
        self.assertEqual((a["countries"], a["regions"], a["id"]), (["France"], ["Savoie"], "p"))

    def test_municipality_without_located_runs_takes_the_parent_point(self):
        _, b = municipalities(PARENT, [km_run(3, "A", "a"), km_run(3, "B", "b", lat="", lng="")])
        self.assertEqual((b["lat"], b["lng"]), (45.5, 6.5))


class DuplicateTops(unittest.TestCase):
    RUN_IDS = {"p": {1, 2, 3}, "dup": {3, 4}, "far": {9}, "q": {20, 21}}

    def dropped(self, tops, child_names):
        return duplicate_tops([(n, [{"id": i}]) for n, i in tops], child_names, self.RUN_IDS)

    def test_top_level_area_shown_as_a_linked_child_is_dropped(self):
        self.assertEqual(self.dropped([("Parent", "p"), ("Val Dup", "dup")], [("Dup Val", 0)]), {1})

    def test_same_name_without_shared_runs_is_kept(self):
        self.assertEqual(self.dropped([("Parent", "p"), ("Sankt Jakob", "far")], [("Sankt Jakob", 0)]), set())

    def test_area_that_is_itself_the_parent_of_a_dropped_area_is_kept(self):
        tops = [("Parent", "p"), ("Dup", "dup"), ("Other", "q")]
        self.assertEqual(self.dropped(tops, [("Dup", 0), ("Parent", 1)]), set())


class Children(unittest.TestCase):
    def test_area_with_villages_gets_no_municipalities(self):
        runs = [km_run(3, "M1", "a-run"), km_run(3, "M2", "b-run")]
        by_area = defaultdict(dict, {"a": {"a-run": runs[0]}, "b": {"b-run": runs[1]}})
        found = children(PARENT, runs, [ski_area("A", "a"), ski_area("B", "b")], by_area)
        self.assertEqual([(c["name"], c["kind"]) for c in found], [("A", "village"), ("B", "village")])

    def test_area_without_villages_gets_municipalities(self):
        runs = [km_run(3, "M1", "a-run"), km_run(3, "M2", "b-run")]
        found = children(PARENT, runs, [], defaultdict(dict))
        self.assertEqual([(c["name"], c["kind"]) for c in found], [("M1", "municipality"), ("M2", "municipality")])


if __name__ == "__main__":
    unittest.main()
