(() => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const views = ["overview", "events", "research", "scenario", "model", "history", "about"];
  const instruments = {
    NQ: { name: "Nasdaq-100 futures", unit: "index points", prefix: "NQ" },
    MNQ: { name: "Micro Nasdaq-100 futures", unit: "index points", prefix: "MNQ" },
    GC: { name: "Gold futures", unit: "USD per troy ounce", prefix: "GC" },
    MGC: { name: "Micro gold futures", unit: "USD per troy ounce", prefix: "MGC" },
    XAUUSD: { name: "Spot gold", unit: "USD per troy ounce", prefix: "XAUUSD" }
  };
  let imported = null;
  let resizeObserver;

  function updateClock() {
    const now = new Date();
    $("#clock").textContent = `${now.toISOString().slice(11, 19)} UTC`;
    $("#today").textContent = now.toISOString().slice(0, 10);
  }

  function navigate(name) {
    if (!views.includes(name)) return;
    $$(".view").forEach(view => view.classList.toggle("active", view.id === `view-${name}`));
    $$(".nav-link").forEach(button => button.classList.toggle("active", button.dataset.view === name));
    document.body.classList.remove("mobile-nav-open");
    if (name === "overview" && imported) requestAnimationFrame(drawChart);
    window.scrollTo({ top: 0, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }

  document.addEventListener("click", event => {
    const target = event.target.closest("[data-view]");
    if (target) navigate(target.dataset.view);
  });
  $("#menuButton").addEventListener("click", () => document.body.classList.toggle("mobile-nav-open"));
  $("#aboutButton").addEventListener("click", () => navigate("about"));
  $("#scenarioType").addEventListener("change", event => {
    const units = { inflation: "percentage points", policy: "basis points", rates: "basis points", dollar: "%" };
    $("#scenarioUnit").textContent = units[event.target.value];
  });
  $("#saveScenario").addEventListener("click", () => {
    const scenario = $("#scenarioType").selectedOptions[0].textContent;
    const amount = $("#scenarioSize").value;
    const units = $("#scenarioUnit").textContent;
    const horizon = $("#scenarioHorizon").value;
    $("#scenarioSaved").textContent = `Assumption recorded: ${scenario} · ${amount || "0"} ${units} · ${horizon}. This is not a measured release or forecast.`;
  });
  $("#instrument").addEventListener("change", event => {
    const item = instruments[event.target.value];
    $("#instrumentName").textContent = item.name;
    if (imported) {
      $("#priceCaption").textContent = `${imported.rows.length.toLocaleString()} imported observations · instrument label is user-selected`;
      $("#chartUnit").textContent = `${item.unit} · user-supplied data`;
      requestAnimationFrame(drawChart);
    }
  });
  $("#importButton").addEventListener("click", () => $("#csvFile").click());
  $("#csvFile").addEventListener("change", async event => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const parsed = parseCsv(await file.text());
      if (parsed.rows.length < 2) throw new Error("Add at least two valid date and close rows to calculate a return.");
      imported = parsed;
      updateImportedView(file.name);
    } catch (error) {
      window.alert(`Could not import CSV: ${error.message}`);
    } finally {
      event.target.value = "";
    }
  });
  window.addEventListener("resize", () => { if (imported) requestAnimationFrame(drawChart); });

  function parseCsv(source) {
    const lines = source.replace(/^\uFEFF/, "").split(/\r?\n/).filter(line => line.trim());
    if (lines.length < 3) throw new Error("The file needs a header and at least two data rows.");
    const table = lines.map(parseCsvLine);
    const headers = table[0].map(value => value.trim().toLowerCase().replace(/[\s-]+/g, "_"));
    const dateIndex = headers.findIndex(value => ["date", "datetime", "timestamp", "time", "observation_date"].includes(value));
    const closeIndex = headers.findIndex(value => ["close", "adj_close", "settle", "settlement", "last", "price"].includes(value));
    if (dateIndex < 0 || closeIndex < 0) throw new Error("A date or timestamp column and a close, settle, or price column are required.");
    const rows = table.slice(1).map(row => {
      const date = new Date(row[dateIndex]);
      const close = Number(String(row[closeIndex] ?? "").replaceAll(",", ""));
      return { date, close };
    }).filter(row => Number.isFinite(row.date.getTime()) && Number.isFinite(row.close) && row.close > 0)
      .sort((a, b) => a.date - b.date);
    const unique = rows.filter((row, index) => index === 0 || row.date.getTime() !== rows[index - 1].date.getTime());
    return { rows: unique };
  }

  function parseCsvLine(line) {
    const values = [];
    let value = "";
    let quoted = false;
    for (let index = 0; index < line.length; index += 1) {
      const char = line[index];
      if (char === '"' && quoted && line[index + 1] === '"') { value += '"'; index += 1; }
      else if (char === '"') quoted = !quoted;
      else if (char === "," && !quoted) { values.push(value); value = ""; }
      else value += char;
    }
    values.push(value);
    return values;
  }

  function updateImportedView(filename) {
    const { rows } = imported;
    const first = rows[0];
    const last = rows.at(-1);
    const change = last.close / first.close - 1;
    const dailyReturns = rows.slice(1).map((row, index) => row.close / rows[index].close - 1);
    const mean = dailyReturns.reduce((sum, value) => sum + value, 0) / dailyReturns.length;
    const variance = dailyReturns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(1, dailyReturns.length - 1);
    const returnText = `${change >= 0 ? "+" : ""}${(change * 100).toFixed(2)}%`;
    const item = instruments[$("#instrument").value];
    $("#lastPrice").textContent = last.close.toLocaleString(undefined, { maximumFractionDigits: 4 });
    $("#priceCaption").textContent = `${rows.length.toLocaleString()} imported observations · ${last.date.toISOString().slice(0, 10)} · local file`;
    $("#chartUnit").textContent = `${item.unit} · imported history`;
    $("#chartEmpty").hidden = true;
    $("#seriesSummary").textContent = `${filename} · ${first.date.toISOString().slice(0, 10)} → ${last.date.toISOString().slice(0, 10)}`;
    $("#returnSummary").textContent = `Observed change ${returnText}`;
    $("#volSummary").textContent = `Sample stdev ${(Math.sqrt(variance) * 100).toFixed(2)}% / bar`;
    requestAnimationFrame(drawChart);
  }

  function drawChart() {
    if (!imported) return;
    const canvas = $("#priceChart");
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(rect.width * ratio);
    canvas.height = Math.round(rect.height * ratio);
    const context = canvas.getContext("2d");
    context.scale(ratio, ratio);
    const width = rect.width;
    const height = rect.height;
    const pad = { top: 15, right: 50, bottom: 18, left: 10 };
    const values = imported.rows.map(row => row.close);
    let min = Math.min(...values);
    let max = Math.max(...values);
    const spread = max - min || Math.abs(max) * 0.02 || 1;
    min -= spread * 0.09;
    max += spread * 0.09;
    const x = index => pad.left + index / Math.max(1, values.length - 1) * (width - pad.left - pad.right);
    const y = value => pad.top + (max - value) / (max - min) * (height - pad.top - pad.bottom);
    context.strokeStyle = "#29322c";
    context.lineWidth = 1;
    context.font = '9px "DM Mono", monospace';
    for (let step = 0; step < 4; step += 1) {
      const pos = pad.top + step / 3 * (height - pad.top - pad.bottom);
      context.beginPath(); context.moveTo(pad.left, pos); context.lineTo(width - pad.right, pos); context.stroke();
      const label = (max - step / 3 * (max - min)).toLocaleString(undefined, { maximumFractionDigits: 2 });
      context.fillStyle = "#6f7b71"; context.textAlign = "right"; context.fillText(label, width - 4, pos + 3);
    }
    const line = values.length > 600 ? values.filter((_, index) => index % Math.ceil(values.length / 600) === 0 || index === values.length - 1) : values;
    context.beginPath();
    line.forEach((value, index) => {
      const originalIndex = values.length > 600 ? Math.min(values.length - 1, index * Math.ceil(values.length / 600)) : index;
      if (index === 0) context.moveTo(x(originalIndex), y(value)); else context.lineTo(x(originalIndex), y(value));
    });
    context.strokeStyle = "#92b19a"; context.lineWidth = 1.6; context.stroke();
    const gradient = context.createLinearGradient(0, pad.top, 0, height - pad.bottom);
    gradient.addColorStop(0, "rgba(132,173,141,.15)"); gradient.addColorStop(1, "rgba(132,173,141,0)");
    context.lineTo(x(values.length - 1), height - pad.bottom); context.lineTo(x(0), height - pad.bottom); context.closePath(); context.fillStyle = gradient; context.fill();
  }

  async function loadFactors() {
    try {
      const response = await fetch("data/factors.json");
      if (!response.ok) throw new Error("Registry unavailable");
      const groups = await response.json();
      const total = groups.reduce((sum, group) => sum + group.items.length, 0);
      $(".registry-total").innerHTML = `${total} <small>candidates</small>`;
      const select = $("#factorCategory");
      groups.forEach(group => {
        const option = document.createElement("option"); option.value = group.group; option.textContent = group.group; select.append(option);
      });
      renderFactors(groups);
      select.addEventListener("change", () => renderFactors(groups));
      $("#factorSearch").addEventListener("input", () => renderFactors(groups));
    } catch {
      $("#factorList").innerHTML = '<div class="panel no-results">Factor registry could not be loaded. Run this site from a static web server.</div>';
    }
  }

  function renderFactors(groups) {
    const query = $("#factorSearch").value.trim().toLowerCase();
    const category = $("#factorCategory").value;
    const container = $("#factorList");
    container.replaceChildren();
    let shown = 0;
    let number = 0;
    groups.forEach(group => {
      if (category !== "all" && category !== group.group) { number += group.items.length; return; }
      const matches = group.items.map((name, index) => ({ name, index })).filter(item => `${group.group} ${item.name}`.toLowerCase().includes(query));
      if (!matches.length) { number += group.items.length; return; }
      shown += matches.length;
      const details = document.createElement("details"); details.className = "factor-group"; details.open = Boolean(query) || category !== "all";
      const summary = document.createElement("summary"); summary.textContent = group.group;
      const count = document.createElement("span"); count.className = "factor-count"; count.textContent = `${matches.length} / ${group.items.length}`; summary.append(count);
      details.append(summary);
      matches.forEach(({ name, index }) => {
        const ordinal = number + index + 1;
        const row = document.createElement("div"); row.className = "factor-row";
        const factor = document.createElement("span"); factor.className = "factor-name"; factor.textContent = `${String(ordinal).padStart(3, "0")} · ${name}`;
        const status = document.createElement("span"); status.className = "factor-status"; status.textContent = "PENDING SOURCE";
        const detail = document.createElement("span"); detail.className = "factor-detail";
        detail.textContent = `${definitionFor(name)} Required: verified, timestamped observations and source/vintage metadata. Status: pending configuration; contributes nothing to a forecast.`;
        row.append(factor, status, detail); details.append(row);
      });
      container.append(details);
      number += group.items.length;
    });
    if (!shown) container.innerHTML = '<div class="panel no-results">No matching factors. Try another search or category.</div>';
  }

  function definitionFor(name) {
    const n = name.toLowerCase();
    if (n.includes("surprise")) return "Definition: released value less the pre-release consensus, standardized only with a training-window historical scale. Hypothesis: macro repricing may transmit through rates, FX, and risk premia. ";
    if (n.includes("yield") || n.includes("rate") || n.includes("curve")) return "Definition: change or spread in the named rate series over a declared observation window. Hypothesis: discount-rate and opportunity-cost channels may matter, conditional on regime. ";
    if (n.includes("gold")) return "Definition: instrument-specific relationship or state computed from identified gold, rates, FX, positioning, or volatility data. Hypothesis: the transmission can vary by regime and must be estimated historically. ";
    if (n.includes("news") || n.includes("geopolitical") || n.includes("sanction") || n.includes("tariff")) return "Definition: source-linked event attribute, corroboration, novelty, or relevance measure; sentiment alone is not a directional signal. Hypothesis: verified events may alter growth, inflation, policy, or risk expectations. ";
    if (n.includes("options") || n.includes("gamma") || n.includes("delta") || n.includes("vanna") || n.includes("charm")) return "Definition: estimate from declared listed-options inputs and assumptions; dealer positioning is not directly observable. Hypothesis: hedging flows may affect price dynamics, subject to validation. ";
    return "Definition: a timestamped observation or transformation specific to the named macro, market, session, or positioning series. Hypothesis: potential association with instrument outcomes is conditional and requires out-of-sample testing. ";
  }

  updateClock();
  window.setInterval(updateClock, 1000);
  loadFactors();
})();
