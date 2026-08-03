/* Mallo charts — D3 renderers.
 *
 * Conventions (shared with the CSS token palette in base.html):
 *  - lines 2px, round joins; muted series thin + gray; top finishers get
 *    categorical colors with an identity dot + ink-colored direct label
 *  - one shared tooltip div (.chart-tip); crosshair on hover
 *  - never a dual axis: different-scale measures get their own mini chart
 */

(function () {
  const css = (name) =>
    getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const CAT = () => [css("--cat1"), css("--cat2"), css("--cat3"), css("--cat4")];

  let tip = null;
  function tooltip() {
    if (!tip) {
      tip = d3.select("body").append("div").attr("class", "chart-tip")
        .style("opacity", 0);
    }
    return tip;
  }

  function frame(container, height) {
    const el = d3.select(container);
    el.selectAll("*").remove();
    const width = container.clientWidth || 680;
    const m = { top: 14, right: 86, bottom: 24, left: 40 };
    const svg = el.append("svg")
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("width", "100%");
    return { svg, width, height, m };
  }

  /* ---- defensive field map (zone chart) --------------------------------
     Opponent balls in play binned into eight field zones, shaded by the
     defending team's koppi rate versus the league rate in the same zone.
     Diverging fill (validated pair per theme), neutral at league average;
     every zone carries direct ink labels so identity never rides on color. */

  const FIELD_ZONES = (() => {
    const L = 10, R = 350, T = 10, W = R - L, CX = (L + R) / 2;
    const yB = 105, yM = 228, yA = 320;         // band edges + apex
    const x3 = [L, L + W / 3, L + 2 * W / 3, R];
    const rect = (x0, x1, y0, y1) =>
      [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
    return {
      bl: rect(x3[0], x3[1], T, yB), bc: rect(x3[1], x3[2], T, yB),
      br: rect(x3[2], x3[3], T, yB),
      ml: rect(x3[0], x3[1], yB, yM), mc: rect(x3[1], x3[2], yB, yM),
      mr: rect(x3[2], x3[3], yB, yM),
      fl: [[L, yM], [CX, yM], [CX, yA]],
      fr: [[R, yM], [CX, yM], [CX, yA]],
    };
  })();

  function zoneCenter(pts) {
    const n = pts.length;
    return [d3.sum(pts, p => p[0]) / n, d3.sum(pts, p => p[1]) / n];
  }

  window.renderFieldMap = function (container, zoneMap, teamName, L) {
    const el = d3.select(container);
    el.selectAll("*").remove();
    const team = (zoneMap.teams || []).find(x => x.team === teamName);
    if (!team) return;
    const svg = el.append("svg")
      .attr("viewBox", "0 0 360 330")
      .style("max-width", "440px").style("display", "block")
      .style("margin", "0 auto").attr("width", "100%");

    const scale = d3.scaleLinear()
      .domain([-10, 0, 10]).clamp(true)
      .range([css("--div-neg"), css("--div-mid"), css("--div-pos")])
      .interpolate(d3.interpolateRgb);

    for (const [z, pts] of Object.entries(FIELD_ZONES)) {
      const tz = team.zones[z] || {};
      const lg = (zoneMap.league || {})[z] || {};
      const delta = (tz.koppi_pct != null && lg.koppi_pct != null)
        ? tz.koppi_pct - lg.koppi_pct : null;
      svg.append("polygon")
        .attr("points", pts.map(p => p.join(",")).join(" "))
        .attr("fill", delta == null ? css("--track") : scale(delta))
        .attr("fill-opacity", 0.85)
        .attr("stroke", css("--surface")).attr("stroke-width", 2)
        .on("mousemove", (ev) => {
          tooltip().style("opacity", 1)
            .html(`<div class="d">${teamName}</div>` +
              `<div>Koppi-% <b>${tz.koppi_pct ?? "—"}</b></div>` +
              `<div>${L.league} <b>${lg.koppi_pct ?? "—"}</b></div>` +
              `<div>${tz.n ?? 0} ${L.balls}</div>`)
            .style("left", (ev.pageX + 14) + "px")
            .style("top", (ev.pageY - 10) + "px");
        })
        .on("mouseleave", () => tooltip().style("opacity", 0));
      const [cx, cy] = zoneCenter(pts);
      const ty = z[0] === "f" ? cy - 12 : cy;   // lift labels in the wedges
      svg.append("text").attr("class", "fm-pct")
        .attr("x", cx).attr("y", ty).text(
          tz.koppi_pct != null ? tz.koppi_pct.toFixed(0) + " %" : "—");
      svg.append("text").attr("class", "fm-n")
        .attr("x", cx).attr("y", ty + 14).text(tz.n ?? 0);
    }
  };

  /* ---- run-expectancy grid ----------------------------------------------
     The 24-state RE table as a matrix: rows = base states, columns = outs.
     Sequential single-hue fill (accent at graded opacity), values in ink. */

  window.renderReGrid = function (container, reTable, L) {
    const el = d3.select(container);
    el.selectAll("*").remove();
    const masks = ["000", "100", "010", "001", "110", "101", "011", "111"];
    const names = { "000": "—", "100": "1", "010": "2", "001": "3",
                    "110": "1+2", "101": "1+3", "011": "2+3", "111": L.loaded };
    const max = d3.max(Object.values(reTable)) || 1;
    let html = `<table class="regrid"><thead><tr><th class="name">${L.bases}</th>`
      + [0, 1, 2].map(o => `<th>${o} ${L.outs}</th>`).join("") + "</tr></thead><tbody>";
    for (const mask of masks) {
      html += `<tr><td class="name">${names[mask]}</td>`;
      for (const outs of [0, 1, 2]) {
        const v = reTable[`${mask}_${outs}`];
        const a = v == null ? 0 : Math.round(55 * v / max);
        html += `<td style="background:color-mix(in srgb, var(--accent) ${a}%, transparent)">`
          + (v == null ? "—" : v.toFixed(2)) + "</td>";
      }
      html += "</tr>";
    }
    el.node().innerHTML = html + "</tbody></table>";
  };

  /* ---- Mallo index bars (league-relative, 100 = average) --------------- */

  window.renderIndexBars = function (container, items, baseline = 100) {
    const rows = items.filter(d => d.value != null);
    const el = d3.select(container);
    el.selectAll("*").remove();
    if (!rows.length) return;
    const width = container.clientWidth || 640;
    const rowH = 34, m = { top: 16, right: 40, bottom: 8, left: 92 };
    const height = m.top + m.bottom + rows.length * rowH;
    const svg = el.append("svg")
      .attr("viewBox", `0 0 ${width} ${height}`).attr("width", "100%");
    const maxV = Math.max(baseline * 1.25, d3.max(rows, d => d.value) * 1.05);
    const x = d3.scaleLinear([0, maxV], [m.left, width - m.right]);
    const y = d3.scaleBand(rows.map(d => d.label), [m.top, height - m.bottom]).padding(0.3);
    const accent = css("--series-1"), muted = css("--baseline");

    // league-average reference line at 100
    svg.append("line").attr("class", "fg-base")
      .attr("x1", x(baseline)).attr("x2", x(baseline))
      .attr("y1", m.top - 4).attr("y2", height - m.bottom);
    svg.append("text").attr("class", "fg-baselabel")
      .attr("x", x(baseline)).attr("y", m.top - 7).attr("text-anchor", "middle")
      .text(baseline);

    const g = svg.selectAll("g.b").data(rows).join("g").attr("class", "b");
    g.append("rect").attr("class", "fg-bar")
      .attr("x", m.left).attr("y", d => y(d.label))
      .attr("width", d => Math.max(2, x(d.value) - m.left))
      .attr("height", y.bandwidth()).attr("rx", 3)
      .attr("fill", d => d.value >= baseline ? accent : muted);
    g.append("text").attr("class", "fg-cat")
      .attr("x", m.left - 10).attr("y", d => y(d.label) + y.bandwidth() / 2)
      .attr("dy", "0.32em").attr("text-anchor", "end").text(d => d.label);
    g.append("text").attr("class", "fg-val")
      .attr("x", d => x(d.value) + 6).attr("y", d => y(d.label) + y.bandwidth() / 2)
      .attr("dy", "0.32em").text(d => d.value);
    g.append("title").text(d => `${d.full || d.label}: ${d.value} (100 = sarjan keskiarvo)`);
  };

  /* ---- career mini charts (small multiples, never a dual axis) --------- */

  window.renderCareer = function (container, seasons, key, opts = {}) {
    const vals = seasons.filter(s => s[key] != null);
    if (vals.length < 2) { container.closest(".mini")?.remove(); return; }
    const { svg, width, height, m } = frame(container, 170);
    m.right = 16;
    const x = d3.scaleLinear(d3.extent(seasons, s => s.year),
                             [m.left, width - m.right]);
    const [lo, hi] = d3.extent(vals, s => s[key]);
    const pad = (hi - lo) * 0.15 || 1;
    const y = d3.scaleLinear([Math.max(0, lo - pad), hi + pad],
                             [height - m.bottom, m.top]);

    svg.append("g").attr("class", "axis")
      .attr("transform", `translate(0,${height - m.bottom})`)
      .call(d3.axisBottom(x).ticks(Math.min(6, vals.length))
        .tickFormat(d3.format("d")).tickSizeOuter(0));
    svg.append("g").attr("class", "axis")
      .attr("transform", `translate(${m.left},0)`)
      .call(d3.axisLeft(y).ticks(3).tickFormat(opts.fmt || (d => d))
        .tickSize(-(width - m.left - m.right)));

    svg.append("path").attr("class", "fg-line")
      .attr("stroke", css("--series-1"))
      .attr("d", d3.line()
        .defined(s => s[key] != null)
        .x(s => x(s.year)).y(s => y(s[key]))
        .curve(d3.curveMonotoneX)(seasons));

    svg.selectAll(".pt").data(vals).join("circle")
      .attr("class", "fg-dot")
      .attr("cx", s => x(s.year)).attr("cy", s => y(s[key]))
      .attr("r", 3.5).attr("fill", css("--series-1"))
      .on("mousemove", (ev, s) => {
        tooltip().style("opacity", 1)
          .html(`<div class="d">${s.year}</div><div>${opts.label || key}` +
                `<b>${(opts.fmt || (d => d))(s[key])}</b></div>`)
          .style("left", (ev.pageX + 14) + "px")
          .style("top", (ev.pageY - 10) + "px");
      })
      .on("mouseleave", () => tooltip().style("opacity", 0));
  };
})();
