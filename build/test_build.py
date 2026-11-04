import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from alps import contains, in_polygon  # noqa: E402
from areas import assign_slugs, slugify, sub_area_ids  # noqa: E402
from check_output import REQUIRED_AREAS, check_summary  # noqa: E402
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


class SubAreas(unittest.TestCase):
    def test_area_inside_a_larger_area_is_a_sub_area(self):
        run_ids = {"val-thorens": {1, 2, 3, 4, 5, 6, 7, 8, 9, 10},
                   "trois-vallees": set(range(1, 40)),
                   "neighbour": {9, 10, 50, 51}}
        self.assertEqual(sub_area_ids(run_ids), {"val-thorens": "trois-vallees"})


if __name__ == "__main__":
    unittest.main()
