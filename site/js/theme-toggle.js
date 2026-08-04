/* ============================================================================
   Mallo theme toggle — vanilla, no dependencies.
   Sets <html data-theme="light|dark">, persists the choice, and (when the user
   has never chosen) follows the OS via prefers-color-scheme automatically.

   Usage in base.html:
     <button class="theme-toggle" id="themeToggle" type="button" aria-label="Vaihda teema">
       <span class="ico"></span><span class="lbl"></span>
     </button>
     <script src="/static/mallo/theme-toggle.js" defer></script>

   The CSS already reacts to [data-theme]; this only records intent + swaps the
   button's icon/label. If you never add the button, the site still auto-switches
   with the OS through the @media rule in mallo.css.
   ============================================================================ */
(function () {
  var KEY = "mallo-theme";                 // "light" | "dark" | null (=auto/OS)
  var root = document.documentElement;

  var SUN =
    '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">' +
    '<circle cx="12" cy="12" r="4"/><line x1="12" y1="2" x2="12" y2="5"/><line x1="12" y1="19" x2="12" y2="22"/>' +
    '<line x1="2" y1="12" x2="5" y2="12"/><line x1="19" y1="12" x2="22" y2="12"/><line x1="4.9" y1="4.9" x2="7" y2="7"/>' +
    '<line x1="17" y1="17" x2="19.1" y2="19.1"/><line x1="4.9" y1="19.1" x2="7" y2="17"/><line x1="17" y1="7" x2="19.1" y2="4.9"/></svg>';
  var MOON =
    '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">' +
    '<path d="M20 14.5A7 7 0 1 1 9.5 4 7 7 0 0 0 20 14.5z"/></svg>';

  function osDark() {
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  }
  function stored() {
    try { return localStorage.getItem(KEY); } catch (e) { return null; }
  }
  // effective theme = stored choice, else OS
  function current() {
    var s = stored();
    return s === "light" || s === "dark" ? s : (osDark() ? "dark" : "light");
  }

  // Apply immediately (data-theme mirrors the effective theme so the toggle is deterministic).
  function apply(theme) {
    root.setAttribute("data-theme", theme);
    paint(theme);
  }

  function paint(theme) {
    var btn = document.getElementById("themeToggle");
    if (!btn) return;
    var ico = btn.querySelector(".ico");
    var lbl = btn.querySelector(".lbl");
    // show the CURRENT mode; click switches to the other
    if (ico) ico.innerHTML = theme === "dark" ? MOON : SUN;
    if (lbl) lbl.textContent = theme === "dark" ? "Tumma" : "Vaalea";
  }

  /* ── Palette ────────────────────────────────────────────────────────────
     A second, independent axis: the colour scheme, on top of light/dark.
     "" is the original berry skin; the others are defined in mallo.css. */
  var PKEY = "mallo-palette";
  var PALETTES = ["", "warm", "electric"];
  var PALETTE_NAMES = { "": "Mallo", warm: "Uuni", electric: "Sähkö" };

  function storedPalette() {
    try {
      var p = localStorage.getItem(PKEY);
      return PALETTES.indexOf(p) >= 0 ? p : "";
    } catch (e) { return ""; }
  }

  function applyPalette(p) {
    if (p) root.setAttribute("data-palette", p);
    else root.removeAttribute("data-palette");
    var btn = document.getElementById("paletteToggle");
    if (btn) {
      btn.textContent = PALETTE_NAMES[p] || PALETTE_NAMES[""];
      btn.setAttribute("title", "Väriteema: " + (PALETTE_NAMES[p] || PALETTE_NAMES[""]));
    }
  }

  // Set the effective theme and palette up front (avoids a flash).
  apply(current());
  applyPalette(storedPalette());

  document.addEventListener("DOMContentLoaded", function () {
    paint(current());
    var btn = document.getElementById("themeToggle");
    if (btn) {
      btn.addEventListener("click", function () {
        var next = current() === "dark" ? "light" : "dark";
        try { localStorage.setItem(KEY, next); } catch (e) {}
        apply(next);
      });
    }
    applyPalette(storedPalette());
    var pbtn = document.getElementById("paletteToggle");
    if (pbtn) {
      pbtn.addEventListener("click", function () {
        var next = PALETTES[(PALETTES.indexOf(storedPalette()) + 1) % PALETTES.length];
        try { localStorage.setItem(PKEY, next); } catch (e) {}
        applyPalette(next);
      });
    }
    // If the user hasn't chosen, keep following the OS live.
    if (window.matchMedia) {
      window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", function () {
        if (!stored()) apply(current());
      });
    }
  });
})();
