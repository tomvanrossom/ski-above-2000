import io
import sys
import tempfile
import unittest
from collections import defaultdict
from contextlib import redirect_stdout
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from alps import contains, in_polygon  # noqa: E402
from areas import assign_slugs, slugify, sub_area_ids, top_parent  # noqa: E402
from build import PRICE_COLUMN, alpine_groups, apply_prices, read_prices, villages  # noqa: E402
from check_output import REQUIRED_AREAS, check_links, check_summary  # noqa: E402
from pistes import figures, group_unnamed, merge_segments, to_run, unnamed_segments, unnamed_share  # noqa: E402


def row(name="", ref="", difficulty="easy", length="100", top="2500", bottom="2400", run_id="x"):
    return {"name": name, "ref": ref, "difficulty": difficulty, "inclined_length_m": length,
            "max_elevation_m": top, "min_elevation_m": bottom, "lat": "45.0", "lng": "6.0", "id": run_id}


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

    def test_same_name_different_ref_stays_separate(self):
        runs = [to_run(row("Combe", "1", run_id="a")), to_run(row("Combe", "2", run_id="b"))]
        self.assertEqual(len(merge_segments(runs)), 2)


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
        self.assertEqual(b["name"], "B")

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


if __name__ == "__main__":
    unittest.main()
