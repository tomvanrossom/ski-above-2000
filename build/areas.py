import re
import unicodedata
from collections import Counter, defaultdict

SUB_AREA_SHARE = 0.9
PASS_NETWORKS = {  # lift passes covering separate ski areas, not one linked area
    "Dolomiti Superski", "Ski amadé", "Schladming Dachstein", "Evasion Mont Blanc", "Espace Haute Maurienne Vanoise",
    "Stubai", "Kleinwalsertal-Oberstdorf", "Cortina d'Ampezzo", "Val di Fassa", "Hochoetz-Kühtai",
    "Klausberg Skiarena", "Domaine Autrans - Méaudre", "Lienzer Bergbahnen",
}
MERGED_AREAS = {  # linked areas that OpenStreetMap maps separately
    "Espace San Bernardo": {"La Rosière", "La Thuile ski"},
    "Via Lattea": {"Sestriere", "Sauze D'Oulx", "Sansicario", "Claviere", "Montgenèvre", "Pragelato"},
    "Le Grand Domaine": {"Le Grand Domaine", "Valmorel"},
    "Andermatt Sedrun Disentis": {"Andermatt + Sedrun + Disentis", "Andermatt+Disentis+Sedrun"},
    "Les Rousses": {"Les Rousses"},
}
MERGE_OF = {member: name for name, members in MERGED_AREAS.items() for member in members}
COUNTRY_CODES = {
    "France": "fr", "Switzerland": "ch", "Italy": "it", "Austria": "at", "Germany": "de",
    "Slovenia": "si", "Liechtenstein": "li", "Monaco": "mc",
}


def sub_area_ids(run_ids_by_area):
    """Map of area id -> parent id, for areas whose runs nearly all belong to one larger area."""
    areas_by_run = defaultdict(set)
    for area_id, run_ids in run_ids_by_area.items():
        for run_id in run_ids:
            areas_by_run[run_id].add(area_id)
    parent_of = {}
    for area_id, run_ids in run_ids_by_area.items():
        shared = Counter(other for run_id in run_ids for other in areas_by_run[run_id] if other != area_id)
        parents = [other for other, n in shared.most_common()
                   if n >= SUB_AREA_SHARE * len(run_ids) and len(run_ids_by_area[other]) > len(run_ids)]
        if parents:
            parent_of[area_id] = parents[0]
    return parent_of


def top_parent(area_id, parent_of):
    seen = {area_id}
    while parent_of.get(area_id) not in (None, *seen):
        area_id = parent_of[area_id]
        seen.add(area_id)
    return area_id


def slugify(name):
    ascii_name = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", ascii_name.lower()).strip("-") or "area"


def name_key(name):
    """Word order and punctuation don't matter: "A+C+B" and "A B C" are one name."""
    return tuple(sorted(slugify(name).split("-")))


def country_code(country):
    return COUNTRY_CODES.get(country, slugify(country)[:2] or "xx")


def assign_slugs(entries):
    """entries: [(key, name, countries)], most important first. The first of each name keeps the bare slug."""
    by_base = defaultdict(list)
    for key, name, countries in entries:
        by_base[slugify(name)].append((key, countries))
    taken = set(by_base)
    slugs = {members[0][0]: base for base, members in by_base.items()}
    for base, members in by_base.items():
        for key, countries in members[1:]:
            candidate = f"{base}-{country_code(countries[0])}" if countries else base
            n = 2
            unique = candidate
            while unique in taken:
                unique = f"{candidate}-{n}"
                n += 1
            taken.add(unique)
            slugs[key] = unique
    return slugs
