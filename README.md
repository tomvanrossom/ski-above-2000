# Ski above 2,000 m

A static site that compares the linked ski areas of the Alps by how much of their piste length lies **fully above 2,000 m**: pistes whose lowest point is at 2,000 m or higher. Each area has a detail page with an altitude chart and a piste list. You can star favourites, which are stored in your browser, and compare 2 to 4 areas side by side. The site is in English and Dutch.

The data is rebuilt from OpenSkiData every month by GitHub Actions and published to GitHub Pages.

## How the figures are made

- **Alps only.** A ski area is in the Alps when its OpenSkiData point lies inside the Alpine Convention perimeter (`alps/alpine-convention.geojson`).
- **Linked areas only.** A sub-area is dropped when at least 90% of its runs belong to one larger area, such as Val Thorens inside Les Trois Vallées. Lift-pass networks of separate resorts (`PASS_NETWORKS` in `build/areas.py`) are not shown as rows and are never used as parents. Linked areas that OpenStreetMap maps separately are merged by hand (`MERGED_AREAS`).
- **Counted pistes.** Only downhill pistes rated novice, easy, intermediate or advanced (green, blue, red, black) count. Expert, freeride, extreme and unrated segments are left out of everything. Segments without a length or elevation are skipped.
- **Merging.** Named segments are merged by (name, ref). The merged piste takes the hardest rating, the summed length, the highest start and the lowest end. Unnamed segments are not merged: they count towards the totals and the chart, and are grouped per colour in the piste table.
- **Slugs.** Each area's URL is `area.html#<slug>`. The slug comes from the area's name, so it stays the same when the data is refreshed. When two areas share a name, the larger one keeps the plain slug and the others get the country code added, or `-2` if that is still taken.

## Build locally

You need Python 3.12 (standard library only). Node is only needed for the JS test.

```sh
mkdir -p .cache
curl --compressed -fsSL -o .cache/runs.csv https://tiles.openskimap.org/csv/runs.csv
curl --compressed -fsSL -o .cache/ski_areas.csv https://tiles.openskimap.org/csv/ski_areas.csv
python build/build.py --runs .cache/runs.csv --areas .cache/ski_areas.csv
python build/check_output.py
python build/test_build.py
node --test test/url-state.test.js test/compare-targets.test.js
python -m http.server 8000 --directory site
```

The build writes `site/data/areas.json` (summary), `site/data/areas/<slug>.json` (one file per area) and `site/data/meta.json` (build date). Generated data is not committed. `check_output.py` runs before every deploy and fails the job when the output looks wrong, so the last good deploy stays live.

## Data sources & licences

- **OpenSkiData / OpenSkiMap.org** ([openskidata.org](https://openskidata.org)): the `runs.csv` and `ski_areas.csv` exports. They are free to use, including commercially, with this credit: "Data from OpenSkiData / OpenSkiMap.org, © OpenStreetMap contributors (ODbL), Skimap.org, Who's On First, © Mapterhorn". Automated downloads are limited to once a day; this site downloads once a month. The site does not use the tiles.openskimap.org vector tiles.
- **OpenStreetMap contributors**: piste data, © OpenStreetMap contributors, [ODbL 1.0](https://www.openstreetmap.org/copyright).
- **Skimap.org**: ski area metadata, via OpenSkiData.
- **Who's On First**: place names (countries, regions), via OpenSkiData.
- **Mapterhorn**: elevation data, via OpenSkiData.
- **Alpine Convention perimeter (Version 2025)**: Eurac Research & Permanent Secretariat of the Alpine Convention (2025), [doi:10.48784/VK93-8P54](https://doi.org/10.48784/VK93-8P54), CC BY 4.0. It was downloaded from the Alpine Convention Atlas (`https://www.atlas.alpconv.org/layers/geonode:Alpine_Convention_Perimeter_2025`) and simplified (Douglas-Peucker, 0.001° tolerance, about 100 m) into `alps/alpine-convention.geojson`. The Annex to the Framework Convention is the only legally binding definition of the perimeter.

**Licences of this repository.** The code is MIT (see `LICENSE`). The generated data in `site/data/` is a derivative database of OpenStreetMap data and is published under the [Open Database License 1.0](https://opendatacommons.org/licenses/odbl/1-0/). You can download it from the deployed site at `data/areas.json` and `data/areas/<slug>.json`.

## Deploy

After the first push, open the repository's **Settings → Pages** and set **Source** to **GitHub Actions**. The workflow runs on every push to `main`, at 04:17 UTC on the 1st of each month, and when you start it by hand.
