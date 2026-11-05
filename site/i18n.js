const I18N = (() => {
  const LANG_KEY = "ski-above-2000:lang";
  const DICT = {
    en: {
      siteTitle: "Ski areas above 2,000 m",
      eyebrow: "The Alps · Alpine Convention area",
      searchLabel: "Ski area",
      searchPlaceholder: "Search by name",
      countries: "Countries",
      allCountries: "All countries",
      nCountries: "{n} countries",
      clearSelection: "Clear selection",
      minKm: "At least {n} km fully above 2,000 m",
      maxPrice: "Up to {n}",
      favOnly: "Favourites only",
      count: "{n} of {m} ski areas",
      intro: "Total piste length per linked ski area in the Alps, and the length of pistes that lie fully above 2,000 m (they end at 2,000 m or higher), by piste colour. Click any column header to sort.",
      legendHigh: "Fully above 2,000 m",
      legendLow: "Ends below 2,000 m",
      colAll: "All pistes",
      novice: "Green", easy: "Blue", intermediate: "Red", advanced: "Black",
      colArea: "Ski area",
      colFav: "Favourite",
      colCompare: "Compare",
      colCountry: "Country",
      colPrice: "6-day pass",
      colTotal: "Total",
      colHigh: "Above 2,000 m",
      openSkiMap: "OpenSkiMap",
      unnamedHint: "{p} unnamed in OSM",
      unnamedHintTitle: "Pistes without a name in OpenStreetMap can't be merged or listed individually.",
      addFav: "Add to favourites",
      removeFav: "Remove from favourites",
      compareSelected: "Compare selected ({n})",
      selectForCompare: "Select for comparison",
      compareLimit: "Select 2 to 4 ski areas to compare.",
      method: "Ski areas inside the Alpine Convention perimeter. Each row is one linked ski area: sub-areas (such as Val Thorens in Les Trois Vallées) count only as part of it, and lift-pass networks of separate resorts (such as Dolomiti Superski) are split into their resorts. Only pistes rated green, blue, red or black count; expert, freeride and unrated pistes are left out. Segments of one named piste are merged by name and piste number and take the colour of their hardest part.",
      loadError: "The ski area data could not be loaded. Reload the page to try again.",
      builtOn: "Data built on {date}.",
      boundaryCredit: "Alps boundary: Alpine Convention perimeter (Version 2025), Eurac Research & Permanent Secretariat of the Alpine Convention, CC BY 4.0, simplified.",
      dataLicence: "The data on this site is derived from OpenStreetMap via OpenSkiData and is available under the {odbl}.",
      download: "Download the data",
      backToSummary: "← All ski areas",
      statNamed: "named pistes",
      statUnnamed: "unnamed segments",
      statTotal: "total length",
      statHigh: "fully above 2,000 m",
      statTop: "highest start",
      statBottom: "lowest finish",
      qualityLine: "{p} of the counted length is unnamed in OpenStreetMap: those segments can't be merged into pistes or listed individually.",
      byDifficulty: "By difficulty",
      colDifficulty: "Difficulty",
      colNamed: "Named pistes",
      colSegments: "Unnamed segments",
      colLength: "Total length",
      colFullyHigh: "Fully above 2,000 m",
      filterLabel: "Filter by difficulty",
      chartTitle: "Altitude range per piste",
      chartNote: "Each bar runs from the bottom to the top of one piste or unnamed segment, sorted by start height. Pistes that end below 2,000 m are grey with a border in their piste colour. Hover over a bar for details, or click it to jump to the piste in the table.",
      chartAria: "Altitude range of every piste",
      chartThreshold: "ends below 2,000 m: grey with colour border",
      chartCount: "{n} bars, highest start on the left",
      tableTitle: "All pistes",
      colPiste: "Piste",
      colStart: "Start",
      colEnd: "End",
      colDrop: "Drop",
      unnamed_novice: "Unnamed green pistes",
      unnamed_easy: "Unnamed blue pistes",
      unnamed_intermediate: "Unnamed red pistes",
      unnamed_advanced: "Unnamed black pistes",
      segments: "{n} segments",
      unnamedPiste: "Unnamed",
      tableNote: "Start and end are the highest and lowest points of each piste. Unnamed segments are grouped per colour at the bottom, with the range of all their heights.",
      notFound: "Ski area not found",
      notFoundText: "There is no ski area at this address. It may have been renamed or dropped in the latest data.",
      openOnMap: "Open on OpenSkiMap",
      tooltip: "{name} · {len} m long · {top} → {bot} m",
      barAria: "{name}, {top} to {bot} metres",
      compareTitle: "Compare ski areas",
      compareEmpty: "Nothing to compare yet. Star some favourites or select 2 to 4 ski areas on the summary page.",
      rowTotal: "Total length",
      rowHigh: "Fully above 2,000 m",
      rowPctHigh: "Share above 2,000 m",
      rowNamed: "Named pistes",
      rowUnnamed: "Unnamed segments",
      rowTop: "Highest piste start",
      rowBottom: "Lowest piste end",
      rowQuality: "Unnamed in OSM",
      rowColourTotal: "{colour}: total",
      rowColourHigh: "{colour}: above 2,000 m",
      detailPage: "Detail page",
      compareMissing: "Not found: {slugs}",
      best: "best",
    },
    nl: {
      siteTitle: "Skigebieden boven 2.000 m",
      eyebrow: "De Alpen · gebied van de Alpenconventie",
      searchLabel: "Skigebied",
      searchPlaceholder: "Zoek op naam",
      countries: "Landen",
      allCountries: "Alle landen",
      nCountries: "{n} landen",
      clearSelection: "Selectie wissen",
      minKm: "Minstens {n} km volledig boven 2.000 m",
      maxPrice: "Tot {n}",
      favOnly: "Alleen favorieten",
      count: "{n} van {m} skigebieden",
      intro: "Totale pistelengte per verbonden skigebied in de Alpen, en de lengte van pistes die volledig boven 2.000 m liggen (ze eindigen op 2.000 m of hoger), per pistekleur. Klik op een kolomkop om te sorteren.",
      legendHigh: "Volledig boven 2.000 m",
      legendLow: "Eindigt onder 2.000 m",
      colAll: "Alle pistes",
      novice: "Groen", easy: "Blauw", intermediate: "Rood", advanced: "Zwart",
      colArea: "Skigebied",
      colFav: "Favoriet",
      colCompare: "Vergelijk",
      colCountry: "Land",
      colPrice: "6-daagse skipas",
      colTotal: "Totaal",
      colHigh: "Boven 2.000 m",
      openSkiMap: "OpenSkiMap",
      unnamedHint: "{p} zonder naam in OSM",
      unnamedHintTitle: "Pistes zonder naam in OpenStreetMap kunnen niet samengevoegd of afzonderlijk getoond worden.",
      addFav: "Toevoegen aan favorieten",
      removeFav: "Verwijderen uit favorieten",
      compareSelected: "Vergelijk selectie ({n})",
      selectForCompare: "Selecteren om te vergelijken",
      compareLimit: "Selecteer 2 tot 4 skigebieden om te vergelijken.",
      method: "Skigebieden binnen de grens van de Alpenconventie. Elke rij is één verbonden skigebied: deelgebieden (zoals Val Thorens in Les Trois Vallées) tellen alleen mee als deel ervan, en skipasverbanden van losse gebieden (zoals Dolomiti Superski) worden opgesplitst. Alleen groene, blauwe, rode en zwarte pistes tellen mee; expert-, freeride- en pistes zonder classificatie vallen weg. Segmenten van één piste met naam worden samengevoegd op naam en pistenummer en krijgen de kleur van hun moeilijkste deel.",
      loadError: "De gegevens konden niet geladen worden. Herlaad de pagina om het opnieuw te proberen.",
      builtOn: "Gegevens opgebouwd op {date}.",
      boundaryCredit: "Grens van de Alpen: perimeter van de Alpenconventie (versie 2025), Eurac Research & Permanent Secretariaat van de Alpenconventie, CC BY 4.0, vereenvoudigd.",
      dataLicence: "De gegevens op deze site zijn afgeleid van OpenStreetMap via OpenSkiData en beschikbaar onder de {odbl}.",
      download: "Download de gegevens",
      backToSummary: "← Alle skigebieden",
      statNamed: "pistes met naam",
      statUnnamed: "segmenten zonder naam",
      statTotal: "totale lengte",
      statHigh: "volledig boven 2.000 m",
      statTop: "hoogste start",
      statBottom: "laagste einde",
      qualityLine: "{p} van de getelde lengte heeft geen naam in OpenStreetMap: die segmenten kunnen niet tot pistes samengevoegd of afzonderlijk getoond worden.",
      byDifficulty: "Per moeilijkheid",
      colDifficulty: "Moeilijkheid",
      colNamed: "Pistes met naam",
      colSegments: "Segmenten zonder naam",
      colLength: "Totale lengte",
      colFullyHigh: "Volledig boven 2.000 m",
      filterLabel: "Filter op moeilijkheid",
      chartTitle: "Hoogtebereik per piste",
      chartNote: "Elke balk loopt van onder tot boven van één piste of segment zonder naam, gesorteerd op starthoogte. Pistes die onder 2.000 m eindigen zijn grijs met een rand in hun pistekleur. Beweeg over een balk voor details of klik erop om naar de piste in de tabel te gaan.",
      chartAria: "Hoogtebereik van elke piste",
      chartThreshold: "eindigt onder 2.000 m: grijs met gekleurde rand",
      chartCount: "{n} balken, hoogste start links",
      tableTitle: "Alle pistes",
      colPiste: "Piste",
      colStart: "Start",
      colEnd: "Einde",
      colDrop: "Hoogteverschil",
      unnamed_novice: "Groene pistes zonder naam",
      unnamed_easy: "Blauwe pistes zonder naam",
      unnamed_intermediate: "Rode pistes zonder naam",
      unnamed_advanced: "Zwarte pistes zonder naam",
      segments: "{n} segmenten",
      unnamedPiste: "Zonder naam",
      tableNote: "Start en einde zijn het hoogste en laagste punt van elke piste. Segmenten zonder naam staan onderaan per kleur gegroepeerd, met het bereik van al hun hoogtes.",
      notFound: "Skigebied niet gevonden",
      notFoundText: "Op dit adres staat geen skigebied. Misschien is het hernoemd of weggevallen in de nieuwste gegevens.",
      openOnMap: "Openen op OpenSkiMap",
      tooltip: "{name} · {len} m lang · {top} → {bot} m",
      barAria: "{name}, {top} tot {bot} meter",
      compareTitle: "Skigebieden vergelijken",
      compareEmpty: "Nog niets te vergelijken. Markeer favorieten of selecteer 2 tot 4 skigebieden op de overzichtspagina.",
      rowTotal: "Totale lengte",
      rowHigh: "Volledig boven 2.000 m",
      rowPctHigh: "Aandeel boven 2.000 m",
      rowNamed: "Pistes met naam",
      rowUnnamed: "Segmenten zonder naam",
      rowTop: "Hoogste start piste",
      rowBottom: "Laagste einde piste",
      rowQuality: "Zonder naam in OSM",
      rowColourTotal: "{colour}: totaal",
      rowColourHigh: "{colour}: boven 2.000 m",
      detailPage: "Detailpagina",
      compareMissing: "Niet gevonden: {slugs}",
      best: "beste",
    },
  };
  const COUNTRIES_NL = {
    France: "Frankrijk", Switzerland: "Zwitserland", Italy: "Italië", Austria: "Oostenrijk",
    Germany: "Duitsland", Slovenia: "Slovenië", Liechtenstein: "Liechtenstein", Monaco: "Monaco",
  };
  const listeners = [];

  function initialLang() {
    try {
      const saved = localStorage.getItem(LANG_KEY);
      if (saved in DICT) return saved;
    } catch (e) {
      console.warn("Language preference unavailable:", e);
    }
    return (navigator.language || "en").toLowerCase().startsWith("nl") ? "nl" : "en";
  }

  let lang = initialLang();
  const locale = () => (lang === "nl" ? "nl-NL" : "en-GB");

  function t(key, vars = {}) {
    const text = DICT[lang][key] ?? DICT.en[key] ?? key;
    return text.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`));
  }

  const num = (n, digits = 0) =>
    new Intl.NumberFormat(locale(), { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n);
  const km = (n) => `${num(n, 1)} km`;
  const m = (n) => `${num(n)} m`;
  const pct = (share) => new Intl.NumberFormat(locale(), { style: "percent", maximumFractionDigits: 0 }).format(share);
  const date = (iso) => new Intl.DateTimeFormat(locale(), { dateStyle: "long" }).format(new Date(`${iso}T00:00:00Z`));
  const country = (name) => (lang === "nl" ? COUNTRIES_NL[name] ?? name : name);
  const collator = () => new Intl.Collator(locale());

  function apply(root = document) {
    document.documentElement.lang = lang;
    root.querySelectorAll("[data-i18n]").forEach((node) => { node.textContent = t(node.dataset.i18n); });
    root.querySelectorAll("[data-i18n-placeholder]").forEach((node) => { node.placeholder = t(node.dataset.i18nPlaceholder); });
    root.querySelectorAll("[data-i18n-aria]").forEach((node) => { node.setAttribute("aria-label", t(node.dataset.i18nAria)); });
    root.querySelectorAll("[data-lang-switch] button").forEach((b) => b.setAttribute("aria-pressed", b.value === lang));
  }

  function setLang(next) {
    if (!(next in DICT) || next === lang) return;
    lang = next;
    try {
      localStorage.setItem(LANG_KEY, next);
    } catch (e) {
      console.warn("Language preference not saved:", e);
    }
    apply();
    listeners.forEach((fn) => fn(lang));
  }

  function mountSwitch() {
    document.querySelectorAll("[data-lang-switch]").forEach((box) => {
      box.setAttribute("role", "group");
      box.setAttribute("aria-label", "Language / Taal");
      box.replaceChildren(...["en", "nl"].map((code) => {
        const b = document.createElement("button");
        b.type = "button";
        b.value = code;
        b.textContent = code.toUpperCase();
        b.addEventListener("click", () => setLang(code));
        return b;
      }));
    });
  }

  return {
    t, num, km, m, pct, date, country, collator, apply, mountSwitch,
    get lang() { return lang; },
    onChange: (fn) => listeners.push(fn),
  };
})();
