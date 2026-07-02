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

  /* ---- playoff odds over the season ------------------------------------ */

  window.renderFangraph = function (container, data, spots = 4) {
    if (!data.dates || data.dates.length < 2) return;
    const { svg, width, height, m } = frame(container, 300);
    const parse = d3.utcParse("%Y-%m-%d");
    const dates = data.dates.map(parse);
    const x = d3.scaleUtc(d3.extent(dates), [m.left, width - m.right]);
    const y = d3.scaleLinear([0, 100], [height - m.bottom, m.top]);

    svg.append("g").attr("class", "axis")
      .attr("transform", `translate(0,${height - m.bottom})`)
      .call(d3.axisBottom(x).ticks(6).tickSizeOuter(0));
    svg.append("g").attr("class", "axis")
      .attr("transform", `translate(${m.left},0)`)
      .call(d3.axisLeft(y).tickValues([0, 50, 100]).tickFormat(d => d + "%")
        .tickSize(-(width - m.left - m.right)));

    const ranked = Object.keys(data.teams)
      .sort((a, b) => d3.sum(data.teams[b]) - d3.sum(data.teams[a]));
    const byFinal = Object.keys(data.teams)
      .sort((a, b) => data.teams[b].at(-1) - data.teams[a].at(-1));
    const color = new Map(byFinal.slice(0, spots).map((t, i) => [t, CAT()[i]]));

    const line = d3.line()
      .x((_, i) => x(dates[i]))
      .y(v => y(v))
      .curve(d3.curveMonotoneX);

    // muted first, colored on top
    for (const team of [...ranked].reverse()) {
      svg.append("path")
        .attr("class", color.has(team) ? "fg-line" : "fg-line fg-muted")
        .attr("stroke", color.get(team) || null)
        .attr("d", line(data.teams[team]));
    }

    // identity dots + de-collided ink labels for the highlighted teams
    let prev = -99;
    const labeled = byFinal.slice(0, spots)
      .map(t => ({ t, ey: y(data.teams[t].at(-1)) }))
      .sort((a, b) => a.ey - b.ey);
    for (const { t, ey } of labeled) {
      let ly = Math.max(m.top, ey + 4);
      if (ly - prev < 14) ly = prev + 14;
      prev = ly;
      svg.append("circle").attr("cx", x(dates.at(-1))).attr("cy", ey)
        .attr("r", 3.5).attr("fill", color.get(t)).attr("class", "fg-dot");
      svg.append("text").attr("class", "fg-label")
        .attr("x", x(dates.at(-1)) + 9).attr("y", ly).text(t);
    }

    // crosshair + tooltip listing every team at the hovered date
    const cross = svg.append("line").attr("class", "fg-cross")
      .attr("y1", m.top).attr("y2", height - m.bottom).style("opacity", 0);
    svg.append("rect")
      .attr("x", m.left).attr("y", m.top)
      .attr("width", width - m.left - m.right)
      .attr("height", height - m.top - m.bottom)
      .attr("fill", "transparent")
      .on("mousemove", (ev) => {
        const [mx] = d3.pointer(ev);
        const i = d3.bisectCenter(dates.map(d => x(d)), mx);
        cross.attr("x1", x(dates[i])).attr("x2", x(dates[i])).style("opacity", 1);
        const rows = ranked
          .map(t => ({ t, v: data.teams[t][i] }))
          .sort((a, b) => b.v - a.v)
          .map(({ t, v }) =>
            `<div><span class="k" style="background:${color.get(t) || css("--baseline")}"></span>${t}<b>${v.toFixed(0)}%</b></div>`)
          .join("");
        tooltip().style("opacity", 1)
          .html(`<div class="d">${data.dates[i]}</div>${rows}`)
          .style("left", (ev.pageX + 14) + "px")
          .style("top", (ev.pageY - 10) + "px");
      })
      .on("mouseleave", () => {
        cross.style("opacity", 0);
        tooltip().style("opacity", 0);
      });
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
