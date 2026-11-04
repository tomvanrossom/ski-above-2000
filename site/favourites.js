const Favourites = (() => {
  const KEY = "ski-above-2000:favourites";

  function load() {
    try {
      const stored = JSON.parse(localStorage.getItem(KEY) ?? "[]");
      return new Set(Array.isArray(stored) ? stored.filter((s) => typeof s === "string" && SLUG_RE.test(s)) : []);
    } catch (e) {
      console.warn("Favourites unavailable:", e);
      return new Set();
    }
  }

  function save(set) {
    try {
      localStorage.setItem(KEY, JSON.stringify([...set]));
    } catch (e) {
      console.warn("Favourites not saved:", e);
    }
  }

  let current = load();

  function toggle(slug) {
    const next = new Set(current);
    if (next.has(slug)) next.delete(slug); else next.add(slug);
    current = next;
    save(next);
    return next.has(slug);
  }

  function label(button, isOn) {
    button.setAttribute("aria-pressed", isOn);
    button.setAttribute("aria-label", I18N.t(isOn ? "removeFav" : "addFav"));
    button.title = I18N.t(isOn ? "removeFav" : "addFav");
    button.textContent = isOn ? "★" : "☆";
  }

  function button(slug, onChange = () => {}) {
    const b = el("button", { type: "button", class: "star" });
    label(b, current.has(slug));
    b.addEventListener("click", () => {
      label(b, toggle(slug));
      onChange();
    });
    return b;
  }

  return {
    has: (slug) => current.has(slug),
    list: () => [...current],
    button,
  };
})();
