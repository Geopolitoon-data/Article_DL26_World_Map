/* ==========================================================================
   Digital Leaders 2026 scrollytelling behaviour

   Three jobs:
     1. step detection (IntersectionObserver, never a scroll listener)
     2. the native waffle chart, recoloured per step
     3. the reading-progress bar

   Everything degrades: with no JS the text and the first graphic of each
   chapter are already visible, and prefers-reduced-motion drops transitions.
   ========================================================================== */
(function () {
  "use strict";

  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* No count-up on the hero figures. On a page whose whole argument is that the
     numbers are checkable, a counter spends its first second displaying figures
     that are not true, and that is what a screenshot or thumbnail catches. */

  /* -------------------------------------------------------------- the data */
  function loadData() {
    var inline = document.getElementById("story-data");
    if (inline) {
      try { return Promise.resolve(JSON.parse(inline.textContent)); }
      catch (e) { return Promise.resolve(null); }
    }
    return fetch("data/story-data.json")
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; });
  }

  /* ------------------------------------------------------------ the waffle */
  var WAFFLE = {
    country: {
      caption: "The Global 200, by country",
      key: "c",
      order: ["United States", "United Kingdom", "India", "Australia", "France",
              "Canada", "China", "Israel"],
      colors: ["#0F1374", "#4B5BCB", "#FF4901", "#DBB67D", "#860018", "#0E8A5F",
               "#FF9E79", "#98A0DF"],
      restLabel: "33 other countries"
    },
    region: {
      caption: "The same 200, by world region",
      key: "r",
      order: ["Western Europe", "North America", "Asia", "MENA", "Latin America",
              "Oceania", "Eastern Europe", "Sub-Saharan Africa"],
      colors: ["#4B5BCB", "#0F1374", "#FF4901", "#DBB67D", "#0E8A5F", "#FF9E79",
               "#860018", "#98A0DF"],
      restLabel: null
    },
    type: {
      caption: "The same 200, by institution type",
      key: "t",
      order: ["University", "Science & tech", "Business school", "University + business"],
      colors: ["#0F1374", "#4B5BCB", "#FF4901", "#DBB67D"],
      restLabel: null
    }
  };
  var REST = "#DDE0EE";
  var COLS = 25, ROWS = 8, CELL = 10, GAP = 2.2;

  var waffleState = { rows: null, mode: null, cells: null };

  function buildWaffle(rows) {
    var holder = document.getElementById("waffle");
    if (!holder) return;
    var w = COLS * (CELL + GAP) - GAP;
    var h = ROWS * (CELL + GAP) - GAP;
    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 " + w + " " + h);
    svg.setAttribute("width", "100%");
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label",
      "Two hundred squares, one for each institution holding a Global rank, coloured by group.");
    var cells = [];
    rows.forEach(function (row, i) {
      var r = Math.floor(i / COLS), c = i % COLS;
      var rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      rect.setAttribute("x", c * (CELL + GAP));
      rect.setAttribute("y", r * (CELL + GAP));
      rect.setAttribute("width", CELL);
      rect.setAttribute("height", CELL);
      rect.setAttribute("rx", 1.4);
      rect.setAttribute("fill", REST);
      if (!reduced) rect.style.transition = "fill 260ms ease " + ((i % COLS) * 4) + "ms";
      var t = document.createElementNS("http://www.w3.org/2000/svg", "title");
      t.textContent = row.n + ", #" + row.k + " (" + row.c + ")";
      rect.appendChild(t);
      svg.appendChild(rect);
      cells.push(rect);
    });
    holder.innerHTML = "";
    holder.appendChild(svg);
    waffleState.cells = cells;
  }

  function paintWaffle(mode) {
    var spec = WAFFLE[mode];
    if (!spec || !waffleState.cells || !waffleState.rows) return;
    if (waffleState.mode === mode) return;
    waffleState.mode = mode;

    // Order the squares so each group sits together, largest group first.
    var counts = {};
    waffleState.rows.forEach(function (r) {
      var k = r[spec.key];
      counts[k] = (counts[k] || 0) + 1;
    });
    var groups = spec.order.slice();
    var rest = Object.keys(counts).filter(function (k) { return groups.indexOf(k) === -1; });
    var sorted = [];
    groups.forEach(function (g) {
      waffleState.rows.forEach(function (r) { if (r[spec.key] === g) sorted.push(r); });
    });
    rest.forEach(function (g) {
      waffleState.rows.forEach(function (r) { if (r[spec.key] === g) sorted.push(r); });
    });

    sorted.forEach(function (row, i) {
      var idx = groups.indexOf(row[spec.key]);
      var fill = idx === -1 ? REST : spec.colors[idx % spec.colors.length];
      var cell = waffleState.cells[i];
      if (!cell) return;
      cell.setAttribute("fill", fill);
      var t = cell.querySelector("title");
      if (t) t.textContent = row.n + ", #" + row.k + " · " + row[spec.key];
    });

    var cap = document.getElementById("waffleCaption");
    if (cap) cap.textContent = spec.caption;

    var legend = document.getElementById("waffleLegend");
    if (legend) {
      var html = groups.map(function (g, i) {
        return '<span><i style="background:' + spec.colors[i % spec.colors.length] +
               '"></i>' + g + " " + (counts[g] || 0) + "</span>";
      }).join("");
      if (spec.restLabel) {
        var restCount = rest.reduce(function (s, k) { return s + counts[k]; }, 0);
        html += '<span><i style="background:' + REST + '"></i>' +
                spec.restLabel + " " + restCount + "</span>";
      }
      legend.innerHTML = html;
    }
  }

  /* -------------------------------------------------------- step detection

     IntersectionObserver is the cheap trigger; the decision is then made by
     measuring. Reacting to entries directly is fragile - on a jump (anchor
     link, keyboard, restored scroll position) several steps enter and leave in
     one batch and the last entry processed wins, which is not necessarily the
     step the reader is looking at. Measuring every step in the block against
     the viewport centre is a handful of rect reads and is always right.        */
  function activate(scrolly) {
    var steps = scrolly.querySelectorAll(".step");
    if (!steps.length) return;
    var vh = window.innerHeight || document.documentElement.clientHeight || 800;
    var mid = vh / 2;
    var best = null, bestDist = Infinity;
    Array.prototype.forEach.call(steps, function (s) {
      var b = s.getBoundingClientRect();
      var d = Math.abs((b.top + b.bottom) / 2 - mid);
      if (d < bestDist) { bestDist = d; best = s; }
    });
    if (!best || best === scrolly.__active) return;
    scrolly.__active = best;

    Array.prototype.forEach.call(steps, function (s) {
      s.setAttribute("data-active", s === best ? "true" : "false");
    });
    var want = best.getAttribute("data-layer");
    scrolly.querySelectorAll(".layer").forEach(function (layer) {
      layer.classList.toggle("is-active", layer.getAttribute("data-layer") === want);
    });
    var mode = best.getAttribute("data-mode");
    if (mode) paintWaffle(mode);
  }

  function initSteps() {
    var blocks = document.querySelectorAll(".scrolly");
    if (!("IntersectionObserver" in window)) return;

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        var scrolly = entry.target.closest(".scrolly");
        if (scrolly) activate(scrolly);
      });
    }, { rootMargin: "-35% 0px -35% 0px", threshold: [0, 0.25, 0.5, 0.75, 1] });

    Array.prototype.forEach.call(blocks, function (block) {
      block.querySelectorAll(".step").forEach(function (s) { io.observe(s); });
      activate(block);
    });
  }

  /* ------------------------------------------------------------- progress */
  function initProgress() {
    var bar = document.getElementById("progressBar");
    var main = document.querySelector("main");
    if (!bar || !main) return;
    var ticking = false;
    function update() {
      var h = document.documentElement.scrollHeight - window.innerHeight;
      var p = h > 0 ? Math.min(window.scrollY / h, 1) : 0;
      bar.style.width = (p * 100).toFixed(2) + "%";
      ticking = false;
    }
    window.addEventListener("scroll", function () {
      if (!ticking) { ticking = true; requestAnimationFrame(update); }
    }, { passive: true });
    window.addEventListener("resize", update, { passive: true });
    update();
  }

  /* ------------------------------------------------------------------ boot */
  function boot() {
    initSteps();
    initProgress();
    loadData().then(function (data) {
      if (!data || !data.institutions) return;
      waffleState.rows = data.institutions;
      buildWaffle(data.institutions);
      paintWaffle("country");
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
