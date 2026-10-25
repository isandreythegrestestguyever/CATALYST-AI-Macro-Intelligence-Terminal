(() => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const views = ["overview", "events", "sources", "research", "scenario", "model", "history", "about"];
  const instruments = {
    NQ: { name: "Nasdaq-100 futures", unit: "index points", prefix: "NQ" },
    MNQ: { name: "Micro Nasdaq-100 futures", unit: "index points", prefix: "MNQ" },
    GC: { name: "Gold futures", unit: "USD per troy ounce", prefix: "GC" },
    MGC: { name: "Micro gold futures", unit: "USD per troy ounce", prefix: "MGC" },
    XAUUSD: { name: "Spot gold", unit: "USD per troy ounce", prefix: "XAUUSD" }
  };
  let imported = null;
  let resizeObserver;
  let lastMarketEstimate = null;
  const macroObservations = [];
  const activeFactorValues = new Map();
  let factorGroups = [];
  const TREASURY_HISTORY_KEY = "catalyst.treasury-history.v1";
  const TREASURY_FEATURE_NAMES = ["US 2-year yield change", "US 10-year yield change", "2s10s spread change", "10Y real yield change", "10Y nominal-real spread change"];
  let treasuryBuckets = readTreasuryBuckets();
  let treasuryHistory = buildTreasuryHistory(treasuryBuckets);
  const STUDY_HISTORY_KEY = "catalyst.study-history.v1";

  function updateClock() {
    const now = new Date();
    $("#clock").textContent = `${now.toISOString().slice(11, 19)} UTC`;
    $("#newYorkClock").textContent = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZoneName: "short" }).format(now);
    $("#today").textContent = now.toISOString().slice(0, 10);
  }

  function navigate(name) {
    if (!views.includes(name)) return;
    $$(".view").forEach(view => view.classList.toggle("active", view.id === `view-${name}`));
    $$(".nav-link").forEach(button => button.classList.toggle("active", button.dataset.view === name));
    document.body.classList.remove("mobile-nav-open");
    if (name === "overview" && imported) requestAnimationFrame(drawChart);
    if (name === "history") renderHistory();
    window.scrollTo({ top: 0, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }

  document.addEventListener("click", event => {
    const target = event.target.closest("[data-view]");
    if (target) navigate(target.dataset.view);
  });
  $("#menuButton").addEventListener("click", () => document.body.classList.toggle("mobile-nav-open"));
  $("#aboutButton").addEventListener("click", () => navigate("about"));
  $("#clearStudyHistory").addEventListener("click", () => {
    localStorage.removeItem(STUDY_HISTORY_KEY);
    renderHistory();
  });
  initializeSources();
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
      clearCurrentStudy("Instrument changed; rerun the study after importing matching data.");
      if (imported.instrument !== event.target.value) {
        $("#lastPrice").textContent = "—";
        $("#priceCaption").textContent = `History belongs to ${imported.instrument}; selected ${event.target.value}. Re-import matching data.`;
        $("#chartUnit").textContent = `Instrument mismatch · source is ${imported.instrument}`;
        $("#studySeriesName").textContent = `${imported.filename} · imported as ${imported.instrument}; re-import for ${event.target.value}`;
      } else {
        $("#lastPrice").textContent = imported.rows.at(-1).close.toLocaleString(undefined, { maximumFractionDigits: 4 });
        $("#priceCaption").textContent = `${imported.rows.length.toLocaleString()} imported observations · ${imported.rows.at(-1).date.toISOString().slice(0, 10)} · ${imported.provider || "local file"}`;
        $("#chartUnit").textContent = `${item.unit} · ${imported.provider || "user-supplied history"}`;
        $("#studySeriesName").textContent = `${imported.filename} · ${imported.rows.length.toLocaleString()} bars · ${instruments[event.target.value].prefix}`;
      }
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
      parsed.filename = file.name;
      parsed.instrument = $("#instrument").value;
      parsed.fingerprint = await fingerprintFile(file);
      imported = parsed;
      updateImportedView(file.name);
    } catch (error) {
      window.alert(`Could not import CSV: ${error.message}`);
    } finally {
      event.target.value = "";
    }
  });
  window.addEventListener("resize", () => { if (imported) requestAnimationFrame(drawChart); });
  $("#runStudy").addEventListener("click", runWalkForwardStudy);

  function initializeSources() {
    const yearSelect = $("#treasuryYear");
    const currentYear = new Date().getUTCFullYear();
    for (let year = currentYear; year >= currentYear - 10; year -= 1) {
      const option = document.createElement("option"); option.value = String(year); option.textContent = String(year); yearSelect.append(option);
    }
    $("#treasuryFetch").addEventListener("click", fetchTreasury);
    $("#treasuryHistoryFetch").addEventListener("click", fetchTreasuryHistory);
    $("#fredFetch").addEventListener("click", fetchFred);
    $("#calendarRefresh").addEventListener("click", fetchReleaseCalendar);
    initializeMarketProvider();
    $("#homeNewsRefresh").addEventListener("click", refreshPublicEvidence);
    // Load the keyless public evidence as soon as the workspace opens.
    refreshPublicEvidence();
    $("#clearObservations").addEventListener("click", () => {
      macroObservations.length = 0; activeFactorValues.clear(); $("#fredKey").value = ""; renderObservations();
      treasuryBuckets = {}; treasuryHistory = []; localStorage.removeItem(TREASURY_HISTORY_KEY);
      $("#treasuryHistoryStatus").textContent = "No stored daily history";
      $("#driverData").className = "driver-empty";
      $("#driverData").innerHTML = '<div class="empty-glyph">∅</div><strong>No macro observations loaded</strong><p>Connect Treasury XML or add your FRED API key in Data sources. Values retain source and observation date.</p>';
      if (factorGroups.length) renderFactors(factorGroups);
      $("#sourceOverall").textContent = "NOT FETCHED";
      setStatus("#treasuryStatus", "Not fetched"); setStatus("#fredStatus", "Key not entered");
    });
    if (treasuryHistory.length) updateTreasuryHistoryStatus("Cached history is local to this browser.");
    $("#newsRefresh").addEventListener("click", () => fetchNews($("#newsQuery").value, $("#newsWindow").value));
  }

  async function refreshPublicEvidence() {
    const summary = $("#publicSourceSummary");
    if (summary) summary.textContent = "Refreshing Treasury and GDELT…";
    $("#headerSourceState").innerHTML = "<i></i> Refreshing public evidence";
    await Promise.allSettled([
      fetchTreasury(),
      fetchNews(instrumentNewsQuery(), "7d", true)
    ]);
    const treasuryReady = $("#treasuryStatus").classList.contains("ok");
    const newsReady = $("#newsStatus").classList.contains("ok");
    const providers = [];
    if (treasuryReady) providers.push("Treasury");
    if (newsReady) providers.push("GDELT");
    const fetchedAt = new Date().toISOString().slice(11, 16);
    if (summary) {
      summary.textContent = providers.length
        ? `${providers.join(" + ")} · updated ${fetchedAt} UTC`
        : "Public feeds unavailable · retry or check source status";
    }
    $("#sourceOverall").textContent = providers.length
      ? `${providers.length} PUBLIC SOURCE${providers.length === 1 ? "" : "S"} CONNECTED`
      : "PUBLIC FEEDS UNAVAILABLE";
    $("#headerSourceState").innerHTML = `<i></i> ${providers.length ? `${providers.join(" + ")} updated` : "Public sources unavailable"}`;
  }

  function initializeMarketProvider() {
    const today = new Date();
    const start = new Date(today); start.setUTCDate(start.getUTCDate() - 3 * 365);
    $("#marketStart").value = start.toISOString().slice(0, 10);
    $("#marketEnd").value = today.toISOString().slice(0, 10);
    $("#checkBackend").addEventListener("click", checkBackend);
    $("#estimateMarket").addEventListener("click", estimateMarketHistory);
    $("#loadMarketHistory").addEventListener("click", loadMarketHistory);
    ["#instrument", "#marketStart", "#marketEnd", "#marketSchema", "#apiOrigin"].forEach(selector => {
      $(selector).addEventListener("change", () => { lastMarketEstimate = null; setStatus("#marketEstimate", "Settings changed; estimate again before loading."); });
    });
    setStatus("#backendStatus", "Not checked. Select Check API when your local service is running.");
  }

  function apiBase() {
    let url;
    try { url = new URL($("#apiOrigin").value.trim()); }
    catch { throw new Error("Enter a complete API address, such as http://localhost:8000."); }
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
      throw new Error("Use an http or https API address without credentials, query parameters, or a fragment.");
    }
    return url.origin + url.pathname.replace(/\/$/, "");
  }

  async function backendFetch(path, timeoutMs = 12000) {
    const response = await fetchTimed(`${apiBase()}${path}`, timeoutMs);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detail = typeof payload.detail === "string" ? payload.detail : payload.detail?.message || JSON.stringify(payload.detail || `HTTP ${response.status}`);
      const error = new Error(detail);
      error.status = response.status;
      throw error;
    }
    return payload;
  }

  async function checkBackend() {
    setStatus("#backendStatus", "Checking CATALYST API…", "working");
    try {
      const result = await backendFetch("/api/v1/system/health");
      const ready = result.databento_configured;
      setStatus("#backendStatus", ready ? `Ready · ${result.provider} · v${result.version}` : "API responds, but no Databento server key is configured.", ready ? "ok" : "error");
      $("#headerSourceState").innerHTML = `<i></i> ${ready ? "Market API ready" : "Market API needs setup"}`;
    } catch (error) {
      setStatus("#backendStatus", `${error.message} Start the local API and configure its server key.`, "error");
      $("#headerSourceState").innerHTML = "<i></i> Market API unavailable";
    }
  }

  function marketRequestBounds() {
    const start = $("#marketStart").value;
    const end = $("#marketEnd").value;
    if (!start || !end || start >= end) throw new Error("Choose a start date earlier than the end date.");
    const exclusiveEnd = new Date(`${end}T00:00:00Z`);
    exclusiveEnd.setUTCDate(exclusiveEnd.getUTCDate() + 1);
    const params = new URLSearchParams({ start: `${start}T00:00:00Z`, end: exclusiveEnd.toISOString(), schema: $("#marketSchema").value });
    return { params, start, end, schema: $("#marketSchema").value, instrument: $("#instrument").value };
  }

  async function estimateMarketHistory() {
    setStatus("#marketEstimate", "Requesting provider cost estimate…", "working");
    try {
      const request = marketRequestBounds();
      const estimate = await backendFetch(`/api/v1/markets/${encodeURIComponent(request.instrument)}/history/estimate?${request.params}`);
      lastMarketEstimate = { ...request, cost: estimate.estimated_cost_usd };
      setStatus("#marketEstimate", `Estimated provider charge: $${estimate.estimated_cost_usd.toFixed(4)} · ${estimate.count ?? "historical"} bars · ${estimate.provider_symbol} · ${estimate.dataset}. Check account credits and fees in your provider portal.`, "ok");
      $("#marketCostConfirm").checked = false;
    } catch (error) {
      lastMarketEstimate = null;
      setStatus("#marketEstimate", error.message, "error");
    }
  }

  async function loadMarketHistory() {
    if (!lastMarketEstimate) { setStatus("#marketHistoryStatus", "Estimate the request first.", "error"); return; }
    if (lastMarketEstimate.instrument !== $("#instrument").value || lastMarketEstimate.schema !== $("#marketSchema").value || lastMarketEstimate.start !== $("#marketStart").value || lastMarketEstimate.end !== $("#marketEnd").value) {
      lastMarketEstimate = null; setStatus("#marketHistoryStatus", "The request settings changed. Estimate again first.", "error"); return;
    }
    if (lastMarketEstimate.cost > 0 && !$("#marketCostConfirm").checked) {
      setStatus("#marketHistoryStatus", "This request has a non-zero estimated cost. Review the estimate and check the confirmation box before loading.", "error"); return;
    }
    setStatus("#marketHistoryStatus", "Fetching historical bars from Databento…", "working");
    try {
      const params = new URLSearchParams({ ...Object.fromEntries(lastMarketEstimate.params), confirm_cost: String($("#marketCostConfirm").checked) });
      const response = await backendFetch(`/api/v1/markets/${encodeURIComponent(lastMarketEstimate.instrument)}/history?${params}`);
      const rows = response.bars.map(bar => ({ date: new Date(bar.timestamp), close: Number(bar.close) })).filter(row => Number.isFinite(row.close) && row.date.toString() !== "Invalid Date");
      if (!rows.length) throw new Error("The provider returned no valid bars.");
      const descriptor = `${response.provider} ${response.provider_symbol} ${response.schema} ${response.start.slice(0, 10)} to ${response.end.slice(0, 10)}`;
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(response.bars)));
      const fingerprint = [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, "0")).join("");
      imported = { rows, filename: descriptor, instrument: response.instrument, fingerprint, provider: response.provider, sourceSchema: response.schema };
      updateImportedView(descriptor);
      setStatus("#marketHistoryStatus", `${rows.length.toLocaleString()} dated bars loaded · fetched ${response.fetched_at} · ${response.freshness} ${response.price_adjustment}`, "ok");
      $("#sourceOverall").textContent = "DATABENTO HISTORY LOADED";
      $("#headerSourceState").innerHTML = "<i></i> Historical bars loaded";
      lastMarketEstimate = null;
    } catch (error) {
      setStatus("#marketHistoryStatus", error.message, "error");
    }
  }

  async function fetchTreasuryYear(year) {
    const base = "https://home.treasury.gov/resource-center/data-chart-center/interest-rates/pages/xml";
    const nominalUrl = new URL(base);
    nominalUrl.search = new URLSearchParams({ data: "daily_treasury_yield_curve", field_tdr_date_value: String(year) });
    const realUrl = new URL(base);
    realUrl.search = new URLSearchParams({ data: "daily_treasury_real_yield_curve", field_tdr_date_value: String(year) });
    const [nominalResponse, realResponse] = await Promise.all([fetchTimed(nominalUrl), fetchTimed(realUrl)]);
    if (!nominalResponse.ok || !realResponse.ok) throw new Error(`Treasury returned HTTP ${nominalResponse.status}/${realResponse.status} for ${year}.`);
    const [nominalXml, realXml] = await Promise.all([nominalResponse.text(), realResponse.text()]);
    const nominal = parseTreasuryXml(nominalXml);
    const real = parseTreasuryXml(realXml);
    if (!nominal.length) throw new Error(`Treasury returned no recognized nominal yields for ${year}.`);
    return { nominal, real, fetchedAt: new Date().toISOString() };
  }

  function persistTreasuryBuckets() {
    try { localStorage.setItem(TREASURY_HISTORY_KEY, JSON.stringify(treasuryBuckets)); return true; }
    catch { return false; }
  }

  function readTreasuryBuckets() {
    try {
      const parsed = JSON.parse(localStorage.getItem(TREASURY_HISTORY_KEY) || "{}");
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
      return Object.fromEntries(Object.entries(parsed).filter(([, bucket]) => bucket && Array.isArray(bucket.nominal) && Array.isArray(bucket.real)).map(([year, bucket]) => [year, {
        nominal: bucket.nominal.filter(row => row && /^\d{4}-\d{2}-\d{2}$/.test(row.date || "") && row.values && typeof row.values === "object"),
        real: bucket.real.filter(row => row && /^\d{4}-\d{2}-\d{2}$/.test(row.date || "") && row.values && typeof row.values === "object"),
        fetchedAt: typeof bucket.fetchedAt === "string" ? bucket.fetchedAt : ""
      }]));
    } catch { return {}; }
  }

  function buildTreasuryHistory(buckets) {
    const nominalByDate = new Map(); const realByDate = new Map(); const fetchedAtByDate = new Map();
    Object.values(buckets).forEach(bucket => {
      bucket.nominal.forEach(row => { if (row?.date && row.values) { nominalByDate.set(row.date, row.values); fetchedAtByDate.set(row.date, bucket.fetchedAt); } });
      bucket.real.forEach(row => { if (row?.date && row.values) realByDate.set(row.date, row.values); });
    });
    const dates = [...nominalByDate.keys()].sort();
    let previousNominal = null; let previousReal = null; let previousSpread = null; let previousNominalRealSpread = null;
    return dates.map(date => {
      const nominal = nominalByDate.get(date); const realValues = realByDate.get(date);
      const realTen = realValues?.TC_10YEAR ?? realValues?.BC_10YEAR ?? null;
      const spread = Number.isFinite(nominal.BC_10YEAR) && Number.isFinite(nominal.BC_2YEAR) ? nominal.BC_10YEAR - nominal.BC_2YEAR : null;
      const nominalRealSpread = Number.isFinite(nominal.BC_10YEAR) && Number.isFinite(realTen) ? nominal.BC_10YEAR - realTen : null;
      const values = {
        "US 2-year yield change": Number.isFinite(nominal.BC_2YEAR) && Number.isFinite(previousNominal?.BC_2YEAR) ? nominal.BC_2YEAR - previousNominal.BC_2YEAR : null,
        "US 5-year yield change": Number.isFinite(nominal.BC_5YEAR) && Number.isFinite(previousNominal?.BC_5YEAR) ? nominal.BC_5YEAR - previousNominal.BC_5YEAR : null,
        "US 10-year yield change": Number.isFinite(nominal.BC_10YEAR) && Number.isFinite(previousNominal?.BC_10YEAR) ? nominal.BC_10YEAR - previousNominal.BC_10YEAR : null,
        "US 30-year yield change": Number.isFinite(nominal.BC_30YEAR) && Number.isFinite(previousNominal?.BC_30YEAR) ? nominal.BC_30YEAR - previousNominal.BC_30YEAR : null,
        "2s10s curve spread": spread,
        "2s10s spread change": spread !== null && previousSpread !== null ? spread - previousSpread : null,
        "10Y nominal yield": nominal.BC_10YEAR ?? null,
        "10Y real yield": realTen,
        "10Y real yield change": Number.isFinite(realTen) && Number.isFinite(previousReal) ? realTen - previousReal : null,
        "10Y nominal-real spread": nominalRealSpread,
        "10Y nominal-real spread change": nominalRealSpread !== null && previousNominalRealSpread !== null ? nominalRealSpread - previousNominalRealSpread : null,
      };
      previousNominal = nominal; previousSpread = spread; previousNominalRealSpread = nominalRealSpread; if (Number.isFinite(realTen)) previousReal = realTen;
      return { provider: "U.S. Treasury", series: "Daily par yield curves", observationDate: date, fetchedAt: fetchedAtByDate.get(date) || "Fetch timestamp unavailable", values };
    });
  }

  function updateTreasuryHistoryStatus(message = "") {
    const status = $("#treasuryHistoryStatus"); if (!status) return;
    if (!treasuryHistory.length) { status.textContent = message || "No stored daily history"; return; }
    const first = treasuryHistory[0].observationDate; const last = treasuryHistory.at(-1).observationDate;
    status.textContent = `${treasuryHistory.length.toLocaleString()} Treasury observations · ${first} to ${last}${message ? ` · ${message}` : " · saved in this browser"}`;
  }

  function activateTreasuryFactors(record) {
    activateFactor("Two-year / ten-year curve spread", record.values["2s10s curve spread"], "percentage points", record);
    activateFactor("Nominal-real yield divergence", record.values["10Y nominal-real spread"], "percentage points", record);
    activateFactor("US two-year yield changes", record.values["US 2-year yield change"], "percentage points per Treasury observation", record);
    activateFactor("US five-year yield changes", record.values["US 5-year yield change"], "percentage points per Treasury observation", record);
    activateFactor("US ten-year yield changes", record.values["US 10-year yield change"], "percentage points per Treasury observation", record);
    activateFactor("US thirty-year yield changes", record.values["US 30-year yield change"], "percentage points per Treasury observation", record);
    activateFactor("Ten-year TIPS real yield changes", record.values["10Y real yield change"], "percentage points per Treasury observation", record);
  }

  function showLatestTreasuryObservation() {
    const latest = treasuryHistory.at(-1);
    if (!latest) return;
    for (let i = macroObservations.length - 1; i >= 0; i -= 1) if (macroObservations[i].provider === "U.S. Treasury") macroObservations.splice(i, 1);
    macroObservations.unshift(latest);
    renderObservations(); renderDrivers(latest); updateResearchBrief(); activateTreasuryFactors(latest);
    if (factorGroups.length) renderFactors(factorGroups);
  }

  async function fetchTreasury() {
    const year = Number($("#treasuryYear").value);
    setStatus("#treasuryStatus", `Fetching official ${year} XML…`, "working");
    try {
      treasuryBuckets[year] = await fetchTreasuryYear(year);
      persistTreasuryBuckets(); treasuryHistory = buildTreasuryHistory(treasuryBuckets);
      showLatestTreasuryObservation(); updateTreasuryHistoryStatus();
      const count = treasuryBuckets[year].nominal.length;
      setStatus("#treasuryStatus", `${count} ${year} daily yield rows loaded`, "ok");
      $("#sourceOverall").textContent = "TREASURY CONNECTED";
      $("#headerSourceState").innerHTML = "<i></i> Treasury loaded";
    } catch (error) {
      setStatus("#treasuryStatus", `${error.message} Check browser access to home.treasury.gov.`, "error");
      $("#sourceOverall").textContent = "SOURCE UNAVAILABLE";
    }
  }

  async function fetchTreasuryHistory() {
    const currentYear = new Date().getUTCFullYear();
    const years = Array.from({ length: 5 }, (_, index) => currentYear - index).filter(year => !treasuryBuckets[year]);
    const button = $("#treasuryHistoryFetch"); button.disabled = true;
    try {
      for (let index = 0; index < years.length; index += 1) {
        const year = years[index];
        updateTreasuryHistoryStatus(`Fetching ${year} (${index + 1}/${years.length})`);
        treasuryBuckets[year] = await fetchTreasuryYear(year);
        treasuryHistory = buildTreasuryHistory(treasuryBuckets);
        persistTreasuryBuckets(); updateTreasuryHistoryStatus(`Fetched through ${year}`);
      }
      if (!years.length) updateTreasuryHistoryStatus("Recent five-year window is already cached.");
      showLatestTreasuryObservation();
      setStatus("#treasuryStatus", `Research history ready · ${treasuryHistory.length.toLocaleString()} observations`, "ok");
    } catch (error) {
      updateTreasuryHistoryStatus(`Partial history retained · ${error.message}`);
    } finally { button.disabled = false; }
  }

  function parseTreasuryXml(xmlText) {
    const xml = new DOMParser().parseFromString(xmlText, "application/xml");
    if (xml.querySelector("parsererror")) throw new Error("Treasury returned malformed XML.");
    const entries = [...xml.getElementsByTagNameNS("*", "entry")];
    return entries.map(entry => {
      const properties = entry.getElementsByTagNameNS("*", "properties")[0];
      if (!properties) return null;
      const values = {};
      for (const node of [...properties.children]) {
        const key = node.localName.toUpperCase();
        const raw = node.textContent.trim();
        if (key === "NEW_DATE" || key === "DATE") values.date = raw.slice(0, 10);
        else if (raw !== "" && Number.isFinite(Number(raw))) values[key] = Number(raw);
      }
      return values.date ? { date: values.date, values } : null;
    }).filter(Boolean).sort((a, b) => a.date.localeCompare(b.date));
  }

  async function fetchFred() {
    const key = $("#fredKey").value.trim();
    const series = $("#fredSeries").value;
    if (!key) { setStatus("#fredStatus", "Enter a FRED API key in this tab first.", "error"); return; }
    if (!$("#fredTerms").checked) { setStatus("#fredStatus", "Review and accept the FRED API terms before requesting data.", "error"); return; }
    setStatus("#fredStatus", `Fetching ${series}…`, "working");
    try {
      const url = new URL("https://api.stlouisfed.org/fred/series/observations");
      url.search = new URLSearchParams({ series_id: series, api_key: key, file_type: "json", sort_order: "desc", limit: "8" });
      const response = await fetchTimed(url);
      const payload = await response.json();
      if (!response.ok || payload.error_code || !Array.isArray(payload.observations)) throw new Error(payload.error_message || `FRED returned HTTP ${response.status}.`);
      const observations = payload.observations.filter(item => item.value !== ".").map(item => ({ date: item.date, value: Number(item.value), realtimeStart: item.realtime_start, realtimeEnd: item.realtime_end }));
      if (!observations.length) throw new Error("FRED returned no numeric observations for that series.");
      const latest = observations[0];
      const record = { provider: "FRED API", series, observationDate: latest.date, fetchedAt: new Date().toISOString(), values: { [series]: latest.value }, vintage: `${latest.realtimeStart} to ${latest.realtimeEnd}`, recent: observations };
      macroObservations.unshift(record);
      renderObservations();
      renderDrivers(record);
      updateResearchBrief();
      if (series === "CPIAUCSL" && observations.length > 1) {
        const change = (observations[0].value / observations[1].value - 1) * 100;
        activateFactor("CPI month-over-month momentum", change, "% per observation", record);
        if (factorGroups.length) renderFactors(factorGroups);
      }
      if (series === "DGS10" && observations.length > 1) {
        const change = observations[0].value - observations[1].value;
        activateFactor("US ten-year yield changes", change, "percentage points per observation", record);
        if (factorGroups.length) renderFactors(factorGroups);
      }
      if (series === "DFII10" && observations.length > 1) {
        const change = observations[0].value - observations[1].value;
        activateFactor("Ten-year TIPS real yield changes", change, "percentage points per observation", record);
        if (factorGroups.length) renderFactors(factorGroups);
      }
      setStatus("#fredStatus", `${series} loaded · observation ${latest.date} · ${observations.length} values`, "ok");
      $("#sourceOverall").textContent = "FRED CONNECTED";
      $("#headerSourceState").innerHTML = "<i></i> FRED loaded";
    } catch (error) {
      setStatus("#fredStatus", `${error.message} Your key is kept only in this tab's memory.`, "error");
      $("#sourceOverall").textContent = "SOURCE UNAVAILABLE";
    }
  }

  async function fetchReleaseCalendar() {
    const key = $("#fredKey").value.trim();
    if (!key) { setStatus("#calendarStatus", "Enter your FRED API key under Data sources.", "error"); return; }
    if (!$("#fredTerms").checked) { setStatus("#calendarStatus", "Review and accept the FRED API terms under Data sources.", "error"); return; }
    setStatus("#calendarStatus", "Fetching source-published dates…", "working");
    try {
      const url = new URL("https://api.stlouisfed.org/fred/releases/dates");
      url.search = new URLSearchParams({ api_key: key, file_type: "json", realtime_start: new Date().toISOString().slice(0, 10), include_release_dates_with_no_data: "true", limit: "1000", sort_order: "asc" });
      const response = await fetchTimed(url); const payload = await response.json();
      if (!response.ok || payload.error_code || !Array.isArray(payload.release_dates)) throw new Error(payload.error_message || `FRED returned HTTP ${response.status}.`);
      const keywords = /consumer price index|employment situation|producer price index|personal income and outlays|gross domestic product|federal open market|retail sales|jobless claims|industrial production|consumer confidence|pce/i;
      const today = new Date().toISOString().slice(0, 10);
      const entries = payload.release_dates.filter(item => item.date >= today && keywords.test(item.release_name || "")).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 60);
      const target = $("#calendarList"); target.replaceChildren();
      if (!entries.length) target.innerHTML = '<div class="empty-row"><span class="empty-row-icon">∅</span><span>No matching future release dates in the response.</span></div>';
      entries.forEach(item => {
        const row = document.createElement("div"); row.className = "calendar-row";
        const date = document.createElement("time"); date.dateTime = item.date; date.textContent = item.date;
        const link = document.createElement("a"); link.href = `https://fred.stlouisfed.org/releases/${encodeURIComponent(item.release_id)}`; link.target = "_blank"; link.rel = "noreferrer"; link.textContent = item.release_name;
        const source = document.createElement("span"); source.textContent = "FRED · date only";
        row.append(date, link, source); target.append(row);
      });
      setStatus("#calendarStatus", `${entries.length} source-published dates · fetched ${new Date().toISOString()}`, "ok");
    } catch (error) { setStatus("#calendarStatus", `${error.message} Check FRED access and the API key.`, "error"); }
  }

  async function fetchNews(query, timespan, homeOnly = false) {
    const statusSelector = homeOnly ? "#newsStatus" : "#newsStatus";
    if (!homeOnly) setStatus(statusSelector, "Searching GDELT…", "working");
    if (homeOnly) $("#homeNewsList").innerHTML = '<div class="empty-row"><span class="empty-row-icon">…</span><span>Searching GDELT public coverage</span></div>';
    let proxyError = null;
    try {
      const url = new URL("https://api.gdeltproject.org/api/v2/doc/doc");
      url.search = new URLSearchParams({ query: query.trim(), mode: "ArtList", format: "json", maxrecords: "50", sort: "HybridRel", timespan });
      let payload;
      let source = "GDELT DOC 2.0";
      try {
        const params = new URLSearchParams({ query: query.trim(), timespan, maxrecords: "50" });
        payload = await backendFetch(`/api/v1/news?${params}`, 1800);
        source = `${payload.provider} · local proxy`;
      } catch (error) {
        proxyError = error;
        if (error.status) throw error;
        const response = await fetchTimed(url, 8000);
        if (!response.ok) throw new Error(`GDELT returned HTTP ${response.status}.`);
        payload = await response.json();
      }
      if (!Array.isArray(payload.articles)) throw new Error("GDELT returned no article list for this query.");
      const results = payload.articles.map(article => {
        const url = String(article.url || "");
        let domain = article.domain || "Unknown publisher";
        try { if (!article.domain && /^https?:/.test(url)) domain = new URL(url).hostname; } catch { /* Keep an explicit unknown publisher. */ }
        return { title: article.title || "Untitled article", url, domain, seen: parseGdeltDate(article.seendate), language: article.language || "Unknown", country: article.sourcecountry || "Unknown" };
      }).filter(item => /^https?:/.test(item.url));
      if (homeOnly) renderHomeNews(results.slice(0, 3)); else renderNews(results);
      setStatus(statusSelector, `${results.length} documents · ${source} · ${new Date().toISOString().slice(11, 16)} UTC`, "ok");
    } catch (error) {
      const proxyNote = proxyError && proxyError !== error ? ` Local API proxy: ${proxyError.message}.` : "";
      const message = `${String(error.message).replace(/[.]+$/, "")}.${proxyNote} This may be a source outage or browser network restriction.`;
      if (homeOnly) { $("#homeNewsList").innerHTML = `<div class="empty-row"><span class="empty-row-icon">!</span><span>${escapeHtml(message)}</span></div>`; setStatus(statusSelector, "GDELT unavailable", "error"); }
      else { $("#newsList").innerHTML = `<div class="empty-view"><div class="empty-glyph">!</div><h2>GDELT request failed</h2><p>${escapeHtml(message)}</p></div>`; setStatus(statusSelector, "Unavailable", "error"); }
    }
  }

  function instrumentNewsQuery() {
    const label = $("#instrument").value;
    return label === "NQ" || label === "MNQ" ? '(Nasdaq OR "Federal Reserve" OR inflation OR Treasury)' : '(gold OR "real yields" OR dollar OR Treasury)';
  }

  function parseGdeltDate(raw) {
    const match = /^(\d{4})(\d{2})(\d{2})T?(\d{2})?(\d{2})?(\d{2})?Z?$/.exec(String(raw || ""));
    if (!match) return String(raw || "Time unavailable");
    return `${match[1]}-${match[2]}-${match[3]} ${match[4] || "00"}:${match[5] || "00"} UTC`;
  }

  function renderNews(articles) {
    const target = $("#newsList"); target.replaceChildren();
    if (!articles.length) { target.innerHTML = '<div class="empty-view"><div class="empty-glyph">∅</div><h2>No documents returned</h2><p>Try broader terms or a longer lookback window.</p></div>'; return; }
    const fragment = document.createDocumentFragment();
    articles.forEach(article => fragment.append(createNewsItem(article)));
    target.append(fragment);
  }

  function renderHomeNews(articles) {
    const target = $("#homeNewsList"); target.replaceChildren();
    if (!articles.length) { target.innerHTML = '<div class="empty-row"><span class="empty-row-icon">∅</span><span>No matching documents returned</span></div>'; return; }
    articles.forEach(article => target.append(createNewsItem(article, true)));
  }

  function createNewsItem(article, compact = false) {
    const item = document.createElement("article"); item.className = compact ? "news-item compact" : "news-item";
    const heading = document.createElement("a"); heading.className = "news-title"; heading.href = article.url; heading.target = "_blank"; heading.rel = "noreferrer"; heading.textContent = article.title;
    const meta = document.createElement("div"); meta.className = "news-meta";
    const source = document.createElement("span"); source.textContent = article.domain;
    const seen = document.createElement("span"); seen.textContent = `GDELT seen ${article.seen}`;
    const origin = document.createElement("span"); origin.textContent = [article.country, article.language].filter(Boolean).join(" · ");
    meta.append(source, seen, origin); item.append(heading, meta); return item;
  }

  function setStatus(selector, text, kind = "") {
    const node = $(selector); if (!node) return;
    node.textContent = text; node.className = `source-status ${kind}`;
  }

  function renderObservations() {
    const target = $("#observations"); target.replaceChildren();
    if (!macroObservations.length) { target.innerHTML = '<div class="empty-row"><span class="empty-row-icon">◷</span><span>No source observations loaded</span></div>'; return; }
    macroObservations.forEach(record => {
      const block = document.createElement("div"); block.className = "observation-record";
      const header = document.createElement("div"); header.className = "observation-heading";
      const title = document.createElement("strong"); title.textContent = `${record.provider} · ${record.series}`;
      const date = document.createElement("span"); date.textContent = `Observed ${record.observationDate}`;
      header.append(title, date); block.append(header);
      const values = Object.entries(record.values).filter(([, value]) => value !== null && Number.isFinite(Number(value)));
      if (values.length) {
        const list = document.createElement("div"); list.className = "observation-values";
        values.forEach(([name, value]) => { const span = document.createElement("span"); span.textContent = `${name}  ${Number(value).toFixed(3)}`; list.append(span); });
        block.append(list);
      }
      const provenance = document.createElement("small"); provenance.textContent = `Fetched ${record.fetchedAt} · source availability time is not supplied`;
      block.append(provenance); target.append(block);
    });
  }

  function renderDrivers(record) {
    const target = $("#driverData"); target.className = "driver-data"; target.replaceChildren();
    const numeric = Object.entries(record.values).filter(([, value]) => value !== null && Number.isFinite(Number(value)));
    numeric.slice(0, 4).forEach(([name, value]) => {
      const row = document.createElement("div"); row.className = "driver-observation";
      const label = document.createElement("span"); label.textContent = name;
      const number = document.createElement("strong"); number.textContent = Number(value).toLocaleString(undefined, { maximumFractionDigits: 3 });
      row.append(label, number); target.append(row);
    });
    const note = document.createElement("p"); note.className = "driver-provenance"; note.textContent = `${record.provider} · observation ${record.observationDate} · research context only`;
    target.append(note);
  }

  function updateResearchBrief() {
    const treasury = macroObservations.find(record => record.provider === "U.S. Treasury");
    const brief = $("#researchBrief");
    if (!brief) return;
    if (!treasury) {
      const latest = macroObservations[0];
      brief.textContent = latest
        ? `${latest.provider} ${latest.series} is loaded for observation ${latest.observationDate}. This is macro context only. Verified NQ/GC price history and a model that passes chronological validation are still missing, so CATALYST abstains.`
        : "Treasury macro context loads automatically. Directional forecasts remain unavailable until verified NQ/GC prices and a model that passes chronological validation are available.";
      return;
    }
    const dailyChange = name => {
      const value = treasury.values[name];
      if (!Number.isFinite(value)) return `${name.replace("US ", "")} unavailable`;
      const basisPoints = Math.round(value * 100);
      return `${name.replace("US ", "")} ${basisPoints > 0 ? "+" : ""}${basisPoints} bp`;
    };
    brief.textContent = `The latest U.S. Treasury observation (${treasury.observationDate}) shows ${[
      dailyChange("US 2-year yield change"),
      dailyChange("US 5-year yield change"),
      dailyChange("US 10-year yield change"),
      dailyChange("US 30-year yield change")
    ].join(", ")} versus the prior Treasury observation. This is rates context, not a Nasdaq or gold forecast. Verified instrument prices and a model that passes chronological validation are still missing, so CATALYST abstains.`;
  }

  function activateFactor(name, value, unit, record) {
    if (value === null || !Number.isFinite(value)) return;
    activeFactorValues.set(name.toLowerCase(), { value, unit, provider: record.provider, date: record.observationDate, series: record.series });
  }

  async function fetchTimed(url, timeoutMs = 15000) {
    const controller = new AbortController();
    let timedOut = false;
    const timeout = window.setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    try {
      return await fetch(url, { signal: controller.signal, cache: "no-store" });
    } catch (error) {
      if (timedOut) throw new Error(`Request timed out after ${Math.round(timeoutMs / 1000)} seconds.`);
      throw error;
    } finally {
      window.clearTimeout(timeout);
    }
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  }

  async function fingerprintFile(file) {
    try {
      const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
      return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, "0")).join("");
    } catch { return `unavailable-${file.size}-${file.lastModified}`; }
  }

  function treasuryFeaturesBefore(priceDate) {
    if (!treasuryHistory.length || !(priceDate instanceof Date) || Number.isNaN(priceDate.valueOf())) return null;
    const cutoff = priceDate.toISOString().slice(0, 10);
    let low = 0; let high = treasuryHistory.length;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (treasuryHistory[middle].observationDate < cutoff) low = middle + 1;
      else high = middle;
    }
    const record = treasuryHistory[low - 1];
    if (!record) return null;
    const features = TREASURY_FEATURE_NAMES.map(name => record.values[name]);
    return features.every(Number.isFinite) ? { features, sourceDate: record.observationDate } : null;
  }

  const PRICE_FEATURE_NAMES = ["1-bar log return", "2-bar cumulative log return", "5-bar cumulative log return", "20-bar realized volatility", "20-bar cumulative return"];

  function makeExamples(horizon, neutralThreshold, inputs) {
    const rows = imported.rows;
    const returns = rows.map((row, index) => index ? Math.log(row.close / rows[index - 1].close) : 0);
    const examples = [];
    for (let i = 20; i + horizon < rows.length; i += 1) {
      const r1 = returns[i];
      const r2 = returns[i] + returns[i - 1];
      const r5 = returns.slice(i - 4, i + 1).reduce((sum, value) => sum + value, 0);
      const r20 = returns.slice(i - 19, i + 1);
      const mean = r20.reduce((sum, value) => sum + value, 0) / r20.length;
      const vol = Math.sqrt(r20.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (r20.length - 1));
      const trend20 = rows[i].close / rows[i - 20].close - 1;
      const move = rows[i + horizon].close - rows[i].close;
      const label = move > neutralThreshold ? 2 : move < -neutralThreshold ? 0 : 1;
      const x = [r1, r2, r5, vol, trend20];
      const macro = inputs === "treasury" ? treasuryFeaturesBefore(rows[i].date) : null;
      if (inputs === "treasury" && !macro) continue;
      if (macro) x.push(...macro.features);
      examples.push({ i, x, y: label, move, macroSourceDate: macro?.sourceDate || null });
    }
    return examples;
  }

  function scalerFor(examples) {
    const count = examples.length;
    const dimensions = examples[0]?.x.length || 0;
    const means = Array.from({ length: dimensions }, (_, j) => examples.reduce((sum, row) => sum + row.x[j], 0) / count);
    const scales = means.map((mean, j) => Math.sqrt(examples.reduce((sum, row) => sum + (row.x[j] - mean) ** 2, 0) / Math.max(1, count - 1)) || 1);
    return { means, scales };
  }

  function standardize(x, scaler) { return x.map((value, j) => (value - scaler.means[j]) / scaler.scales[j]); }

  function softmax(weights, x) {
    const input = [1, ...x];
    const logits = weights.map(row => Math.max(-35, Math.min(35, row.reduce((sum, weight, j) => sum + weight * input[j], 0))));
    const peak = Math.max(...logits);
    const exps = logits.map(value => Math.exp(value - peak));
    const total = exps.reduce((sum, value) => sum + value, 0);
    return exps.map(value => value / total);
  }

  function fitSoftmax(examples, scaler) {
    const d = scaler.means.length + 1;
    const weights = Array.from({ length: 3 }, () => Array(d).fill(0));
    const epochs = 180;
    const learningRate = 0.055;
    const penalty = 0.01;
    for (let epoch = 0; epoch < epochs; epoch += 1) {
      const gradient = Array.from({ length: 3 }, () => Array(d).fill(0));
      for (const row of examples) {
        const x = [1, ...standardize(row.x, scaler)];
        const p = softmax(weights, x);
        for (let k = 0; k < 3; k += 1) {
          const error = p[k] - (row.y === k ? 1 : 0);
          for (let j = 0; j < d; j += 1) gradient[k][j] += error * x[j];
        }
      }
      for (let k = 0; k < 3; k += 1) for (let j = 0; j < d; j += 1) {
        const regularization = j === 0 ? 0 : penalty * weights[k][j];
        weights[k][j] -= learningRate * (gradient[k][j] / examples.length + regularization);
      }
    }
    return weights;
  }

  function nll(rows, probabilities) {
    return -rows.reduce((sum, row, index) => sum + Math.log(Math.max(1e-9, probabilities[index][row.y])), 0) / rows.length;
  }

  function temperatureScale(probability, temperature) {
    const logits = probability.map(value => Math.log(Math.max(value, 1e-10)) / temperature);
    const peak = Math.max(...logits);
    const exps = logits.map(value => Math.exp(value - peak));
    const total = exps.reduce((sum, value) => sum + value, 0);
    return exps.map(value => value / total);
  }

  function calibrateTemperature(rows, probabilities) {
    let best = { temperature: 1, loss: nll(rows, probabilities) };
    for (let temperature = 0.5; temperature <= 3.001; temperature += 0.05) {
      const scaled = probabilities.map(probability => temperatureScale(probability, temperature));
      const loss = nll(rows, scaled);
      if (loss < best.loss) best = { temperature, loss };
    }
    return best.temperature;
  }

  function scoreModel(rows, probabilities, baseProbabilities) {
    const pred = probabilities.map(values => values.indexOf(Math.max(...values)));
    const counts = [0, 0, 0]; const correct = [0, 0, 0];
    rows.forEach((row, i) => { counts[row.y] += 1; if (pred[i] === row.y) correct[row.y] += 1; });
    let brier = 0; let baselineBrier = 0;
    rows.forEach((row, i) => {
      for (let k = 0; k < 3; k += 1) {
        brier += (probabilities[i][k] - (row.y === k ? 1 : 0)) ** 2;
        baselineBrier += (baseProbabilities[k] - (row.y === k ? 1 : 0)) ** 2;
      }
    });
    brier /= rows.length; baselineBrier /= rows.length;
    return { brier, baselineBrier, logLoss: nll(rows, probabilities), accuracy: pred.filter((value, i) => value === rows[i].y).length / rows.length, balancedAccuracy: counts.reduce((sum, count, k) => sum + (count ? correct[k] / count : 0), 0) / counts.filter(Boolean).length, counts };
  }

  function trainProbabilities(trainRows, applyRows) {
    const scaler = scalerFor(trainRows);
    const weights = fitSoftmax(trainRows, scaler);
    return { scaler, weights, probabilities: applyRows.map(row => softmax(weights, standardize(row.x, scaler))) };
  }

  function runWalkForwardStudy() {
    if (!imported) return;
    const horizon = Number($("#studyHorizon").value);
    const band = Number($("#neutralBand").value);
    const cost = Number($("#roundTripCost").value);
    if (!Number.isFinite(band) || band <= 0 || !Number.isFinite(cost) || cost < 0) {
      window.alert("Enter a positive neutral move band and a non-negative round-trip cost, both in the uploaded series price units."); return;
    }
    if (imported.instrument !== $("#instrument").value) {
      window.alert("The selected instrument changed after import. Re-import its price file so the study cannot silently relabel another instrument."); return;
    }
    const effectiveBand = Math.max(band, cost);
    const inputs = $("#studyInputs").value;
    if (inputs === "treasury" && !treasuryHistory.length) {
      renderStudyError("Fetch five years of U.S. Treasury history before choosing the Treasury feature set. No values are substituted when the source is missing."); return;
    }
    const examples = makeExamples(horizon, effectiveBand, inputs);
    const n = examples.length;
    const calibrationSize = Math.max(30, Math.floor(n * 0.1));
    const testSize = Math.max(30, Math.floor(n * 0.1));
    const embargo = horizon;
    let trainingEnd = Math.floor(n * 0.4);
    const allTests = [];
    const foldReports = [];
    let fold = 0;
    while (trainingEnd >= 60 && fold < 8) {
      const calibrationStart = trainingEnd + embargo;
      const calibrationEnd = calibrationStart + calibrationSize;
      const testStart = calibrationEnd + embargo;
      const testEnd = Math.min(n, testStart + testSize);
      if (calibrationEnd > n || testStart >= n || testEnd - testStart < 10) break;
      const training = examples.slice(0, trainingEnd);
      const calibration = examples.slice(calibrationStart, calibrationEnd);
      const test = examples.slice(testStart, testEnd);
      const calibrationFit = trainProbabilities(training, calibration);
      const temperature = calibrateTemperature(calibration, calibrationFit.probabilities);
      const testFit = trainProbabilities(training, test);
      const calibratedTest = testFit.probabilities.map(probability => temperatureScale(probability, temperature));
      const base = classPriors(training);
      const metrics = scoreModel(test, calibratedTest, base);
      allTests.push(...test.map((row, i) => ({ row, probability: calibratedTest[i], base })));
      const dateAt = row => imported.rows[row.i].date.toISOString().slice(0, 10);
      foldReports.push({ fold: ++fold, train: training.length, calibration: calibration.length, test: test.length, trainDates: [dateAt(training[0]), dateAt(training.at(-1))], calibrationDates: [dateAt(calibration[0]), dateAt(calibration.at(-1))], testDates: [dateAt(test[0]), dateAt(test.at(-1))], temperature, metrics });
      trainingEnd = testEnd;
    }
    if (!foldReports.length) {
      renderStudyError(`Only ${n} eligible rows. Need more history to form separated training, calibration, and holdout windows.`); return;
    }
    const combinedRows = allTests.map(item => item.row);
    const combinedProbabilities = allTests.map(item => item.probability);
    const combinedBase = classPriors(examples.slice(0, Math.floor(n * 0.4)));
    const metrics = scoreModel(combinedRows, combinedProbabilities, combinedBase);
    const brierSkill = metrics.baselineBrier > 0 ? 1 - metrics.brier / metrics.baselineBrier : 0;
    const enoughHoldout = allTests.length >= 100;
    const beatsBaseline = metrics.brier < metrics.baselineBrier;
    const passes = enoughHoldout && beatsBaseline;
    const finalTraining = examples.slice(0, Math.max(1, n - horizon));
    const latestFeature = currentFeatures(imported.rows);
    const latestTreasury = inputs === "treasury" ? treasuryFeaturesBefore(imported.rows.at(-1).date) : null;
    if (inputs === "treasury" && !latestTreasury) {
      renderStudyError("No complete Treasury observation exists strictly before the latest price row. Fetch the matching years or use the price-only baseline."); return;
    }
    if (latestTreasury) latestFeature.push(...latestTreasury.features);
    const finalFit = trainProbabilities(finalTraining, [{ x: latestFeature, y: 1 }]);
    const meanTemperature = foldReports.reduce((sum, report) => sum + report.temperature, 0) / foldReports.length;
    const forecast = temperatureScale(finalFit.probabilities[0], meanTemperature);
    const report = { horizon, inputs, featureNames: inputs === "treasury" ? [...PRICE_FEATURE_NAMES, ...TREASURY_FEATURE_NAMES] : PRICE_FEATURE_NAMES, treasuryLag: inputs === "treasury" ? "latest official observation strictly earlier than each price date" : null, latestTreasurySourceDate: latestTreasury?.sourceDate || null, band, cost, effectiveBand, n, folds: foldReports.length, tests: allTests.length, metrics, brierSkill, passes, forecast, temperature: meanTemperature, fingerprint: imported.fingerprint, filename: imported.filename, instrument: imported.instrument, first: imported.rows[0].date.toISOString().slice(0, 10), last: imported.rows.at(-1).date.toISOString().slice(0, 10), foldsDetail: foldReports };
    window.catalystLastStudy = report;
    saveStudy(report);
    renderStudy(report);
  }

  function classPriors(rows) {
    const counts = [0, 0, 0]; rows.forEach(row => { counts[row.y] += 1; });
    const total = rows.length;
    return counts.map(count => (count + 0.5) / (total + 1.5));
  }

  function currentFeatures(rows) {
    const returns = rows.map((row, index) => index ? Math.log(row.close / rows[index - 1].close) : 0);
    const i = rows.length - 1;
    const r20 = returns.slice(i - 19, i + 1);
    const mean = r20.reduce((sum, value) => sum + value, 0) / r20.length;
    const vol = Math.sqrt(r20.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(1, r20.length - 1));
    return [returns[i], returns[i] + returns[i - 1], returns.slice(i - 4, i + 1).reduce((sum, value) => sum + value, 0), vol, rows[i].close / rows[i - 20].close - 1];
  }

  function renderStudyError(message) {
    $("#modelStatus").textContent = "INSUFFICIENT HISTORY";
    $("#forecastUnavailableTitle").textContent = "Insufficient history for evaluation";
    $("#forecastUnavailableReason").textContent = message;
    $(".forecast-box").innerHTML = '<div><span class="readout-label">Directional forecast</span><strong>Abstaining</strong></div><span class="model-chip">INSUFFICIENT HISTORY</span><p>The selected file does not provide enough separated training, calibration, and holdout observations.</p>';
    $("#studyResults").innerHTML = `<section class="panel empty-view"><div class="empty-glyph">!</div><h2>Study could not run</h2><p>${escapeHtml(message)}</p></section>`;
  }

  function renderStudy(report) {
    const metric = report.metrics;
    const badge = report.passes ? "EXPERIMENTAL · GATE PASSED" : "ABSTAIN · GATE FAILED";
    $("#modelStatus").textContent = badge;
    const classes = ["Bearish", "Neutral", "Bullish"];
    const percent = value => `${(100 * value).toFixed(1)}%`;
    const forecasts = classes.map((name, i) => `<div class="forecast-class"><span>${name}</span><strong>${percent(report.forecast[i])}</strong></div>`).join("");
    $("#forecastUnavailableTitle").textContent = report.passes ? "Experimental study passed its holdout gate" : "Insufficient evidence for a directional forecast";
    $("#forecastUnavailableReason").textContent = report.passes
      ? report.inputs === "treasury" ? "This exploratory result uses prior prices and Treasury observations dated before each price row. It is not a point-in-time or news-driven macro forecast, and does not establish tradable performance. Review dates and metrics in Model Lab." : "This result uses only the selected historical price series. It is not a macro/news forecast or proof of tradable performance. Review holdout metrics and fold dates in Model Lab."
      : report.tests < 100
        ? `The study has ${report.tests} unseen outcomes; at least 100 are required. No directional probability is shown.`
        : "The calibrated price-only baseline did not beat its training class-prior Brier benchmark. No directional probability is shown.";
    const rows = report.foldsDetail.map(fold => `<tr><td>${fold.fold}</td><td>${fold.train.toLocaleString()}<small>${fold.trainDates[0]}–${fold.trainDates[1]}</small></td><td>${fold.calibration.toLocaleString()}<small>${fold.calibrationDates[0]}–${fold.calibrationDates[1]}</small></td><td>${fold.test.toLocaleString()}<small>${fold.testDates[0]}–${fold.testDates[1]}</small></td><td>${fold.temperature.toFixed(2)}</td><td>${fold.metrics.brier.toFixed(3)}</td></tr>`).join("");
    const modelName = report.inputs === "treasury" ? "softmax-price-treasury-v1" : "softmax-price-v1";
    const inputDescription = report.inputs === "treasury" ? "Price history plus five prior-date Treasury features. Release timestamps and vintages are unavailable; this is not a validated macro/news forecast." : "One user-supplied price series; no macro/news inputs; not a live or institutional forecast.";
    $("#studyResults").innerHTML = `<section class="panel study-outcome"><div class="panel-heading"><div><div class="eyebrow">NEXT ${report.horizon} BAR${report.horizon === 1 ? "" : "S"} · ${escapeHtml(report.instrument)} · ${report.inputs === "treasury" ? "PRICE + TREASURY" : "PRICE ONLY"}</div><h2>${report.passes ? "Experimental probabilities" : "Forecast withheld by evaluation gate"}</h2></div><span class="status-tag ${report.passes ? "positive" : "neutral"}">${badge}</span></div><div class="study-warning">${inputDescription}</div>${report.passes ? `<div class="forecast-classes">${forecasts}</div>` : `<div class="abstain-reason">${report.tests < 100 ? `Holdout has ${report.tests} outcomes; minimum gate is 100.` : "Calibrated model did not beat the training class-prior Brier benchmark on multiclass Brier score."} Directional probabilities are suppressed.</div>`}<div class="metric-grid"><div><span>Walk-forward outcomes</span><strong>${report.tests.toLocaleString()}</strong></div><div><span>Multiclass Brier</span><strong>${metric.brier.toFixed(4)}</strong></div><div><span>Base-rate Brier</span><strong>${metric.baselineBrier.toFixed(4)}</strong></div><div><span>Brier skill vs base rate</span><strong>${percent(report.brierSkill)}</strong></div><div><span>Balanced accuracy</span><strong>${percent(metric.balancedAccuracy)}</strong></div><div><span>Log loss</span><strong>${metric.logLoss.toFixed(4)}</strong></div></div><div class="class-counts">Test outcomes: Bearish ${metric.counts[0]} · Neutral ${metric.counts[1]} · Bullish ${metric.counts[2]} · Coverage 100% (no abstentions in test)</div></section><section class="panel fold-panel"><div class="panel-heading"><div><div class="eyebrow">CHRONOLOGICAL FOLDS</div><h2>Expanding-window evaluation</h2></div><button class="text-button" id="downloadStudy">Download report JSON ↓</button></div><div class="table-scroll"><table><thead><tr><th>Fold</th><th>Train</th><th>Calibrate</th><th>Test</th><th>Temp.</th><th>Brier</th></tr></thead><tbody>${rows}</tbody></table></div><div class="study-provenance">Dataset SHA-256 ${escapeHtml(report.fingerprint)} · ${escapeHtml(report.filename)} · ${report.first} to ${report.last} · horizon in bars · neutral band ${report.effectiveBand} price units · ${modelName} / L2=0.01 / 180 epochs${report.latestTreasurySourceDate ? ` · Latest Treasury feature ${escapeHtml(report.latestTreasurySourceDate)}` : ""}</div></section>`;
    $("#downloadStudy").addEventListener("click", () => downloadJson(report));
    updateForecastReadout(report);
  }

  function readStudyHistory() {
    try {
      const value = JSON.parse(localStorage.getItem(STUDY_HISTORY_KEY) || "[]");
      return Array.isArray(value) ? value.filter(item => item && typeof item === "object" && item.metrics && item.instrument) : [];
    } catch { return []; }
  }

  function saveStudy(report) {
    const record = { ...report, generatedAt: new Date().toISOString(), model: report.inputs === "treasury" ? "softmax-price-treasury-v1" : "softmax-price-v1" };
    try {
      const history = [record, ...readStudyHistory()].slice(0, 50);
      localStorage.setItem(STUDY_HISTORY_KEY, JSON.stringify(history));
    } catch {
      // The downloadable report remains available when browser storage is disabled or full.
    }
  }

  function renderHistory() {
    const target = $("#historyList");
    if (!target) return;
    const history = readStudyHistory();
    if (!history.length) {
      target.innerHTML = '<section class="panel empty-view"><div class="empty-glyph">⌁</div><h2>No local study records</h2><p>Run a walk-forward study in Model Lab. Reports are saved only in this browser and can be downloaded as JSON.</p><div class="source-list"><span>Record contents</span><strong>Dataset digest · date splits · model version · metrics · abstention result</strong></div></section>';
      return;
    }
    target.innerHTML = history.map((item, index) => {
      const status = item.passes ? "Experimental gate passed" : "Abstained";
      const metric = item.metrics || {};
      const inputLabel = item.inputs === "treasury" ? "Price + lagged Treasury" : "Price-only baseline";
      return `<article class="panel history-record"><div class="panel-heading"><div><div class="eyebrow">${escapeHtml(item.instrument)} · NEXT ${Number(item.horizon) || "—"} BARS · ${inputLabel}</div><h2>${escapeHtml(item.filename || "Imported series")}</h2></div><span class="status-tag neutral">${status}</span></div><div class="history-meta"><span>${escapeHtml(item.first || "?")} → ${escapeHtml(item.last || "?")}</span><span>${Number(item.tests) || 0} holdout outcomes</span><span>Saved ${escapeHtml(item.generatedAt || "time unavailable")}</span></div><div class="metric-grid"><div><span>Multiclass Brier</span><strong>${Number.isFinite(metric.brier) ? metric.brier.toFixed(4) : "—"}</strong></div><div><span>Base-rate Brier</span><strong>${Number.isFinite(metric.baselineBrier) ? metric.baselineBrier.toFixed(4) : "—"}</strong></div><div><span>Balanced accuracy</span><strong>${Number.isFinite(metric.balancedAccuracy) ? `${(metric.balancedAccuracy * 100).toFixed(1)}%` : "—"}</strong></div><div><span>Log loss</span><strong>${Number.isFinite(metric.logLoss) ? metric.logLoss.toFixed(4) : "—"}</strong></div></div><div class="study-provenance">${escapeHtml(item.model || "softmax-price-v1")} · SHA-256 ${escapeHtml(item.fingerprint || "unavailable")} · ${Number(item.folds) || 0} chronological folds${item.latestTreasurySourceDate ? ` · Latest Treasury feature ${escapeHtml(item.latestTreasurySourceDate)}` : ""}</div><button class="text-button" data-download-study="${index}">Download report JSON ↓</button></article>`;
    }).join("");
    $$('[data-download-study]').forEach(button => button.addEventListener("click", () => downloadJson(history[Number(button.dataset.downloadStudy)])));
  }

  function updateForecastReadout(report) {
    const box = $(".forecast-box");
    if (!box) return;
    if (!report.passes) {
      box.innerHTML = '<div><span class="readout-label">Directional forecast</span><strong>Abstaining</strong></div><span class="model-chip">MODEL NOT VALIDATED</span><p>The current study failed its predefined sample or benchmark gate. Directional probabilities are suppressed.</p>';
      return;
    }
    const percent = value => `${(100 * value).toFixed(1)}%`;
    const label = report.inputs === "treasury" ? "Experimental price + Treasury model" : "Experimental price-only model";
    const boundary = report.inputs === "treasury" ? `Treasury source date ${report.latestTreasurySourceDate}; still not a validated macro/news forecast.` : "User CSV only; not a macro forecast.";
    box.innerHTML = `<div><span class="readout-label">${label}</span><strong>${escapeHtml(report.instrument)} · next ${report.horizon} bar${report.horizon === 1 ? "" : "s"}</strong></div><span class="model-chip">HOLDOUT GATE PASSED</span><p>Bearish ${percent(report.forecast[0])} · Neutral ${percent(report.forecast[1])} · Bullish ${percent(report.forecast[2])}. ${boundary}</p>`;
  }

  function downloadJson(report) {
    const isTreasury = report.inputs === "treasury";
    const blob = new Blob([JSON.stringify({ ...report, generatedAt: report.generatedAt || new Date().toISOString(), model: { name: isTreasury ? "softmax-price-treasury-v1" : "softmax-price-v1", features: report.featureNames || PRICE_FEATURE_NAMES, calibration: "temperature fitted on prior calibration slice per fold", limitations: isTreasury ? "user-supplied price series plus daily Treasury observations dated before each price row; availability time and point-in-time vintage unknown; not a validated macro/news model" : "single supplied close series; no macro/news data; bar frequency unverified; no fees/slippage beyond configured neutral band" } }, null, 2)], { type: "application/json" });
    const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `catalyst-study-${report.instrument}-${report.last}.json`; link.click(); URL.revokeObjectURL(link.href);
  }

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
    clearCurrentStudy("Results from an earlier import were cleared. Set the neutral band and cost allowance, then run the chronological evaluation.");
    const { rows } = imported;
    const first = rows[0];
    const last = rows.at(-1);
    const change = last.close / first.close - 1;
    const dailyReturns = rows.slice(1).map((row, index) => row.close / rows[index].close - 1);
    const mean = dailyReturns.length ? dailyReturns.reduce((sum, value) => sum + value, 0) / dailyReturns.length : 0;
    const variance = dailyReturns.length > 1 ? dailyReturns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (dailyReturns.length - 1) : 0;
    const returnText = `${change >= 0 ? "+" : ""}${(change * 100).toFixed(2)}%`;
    const item = instruments[$("#instrument").value];
    $("#lastPrice").textContent = last.close.toLocaleString(undefined, { maximumFractionDigits: 4 });
    $("#priceCaption").textContent = `${rows.length.toLocaleString()} imported observations · ${last.date.toISOString().slice(0, 10)} · ${imported.provider ? `source: ${imported.provider}` : "local file"}`;
    $("#chartUnit").textContent = `${item.unit} · ${imported.provider || "user-supplied history"}`;
    $("#chartEmpty").hidden = true;
    $("#seriesSummary").textContent = `${filename} · ${first.date.toISOString().slice(0, 10)} → ${last.date.toISOString().slice(0, 10)}`;
    $("#returnSummary").textContent = `Observed change ${returnText}`;
    $("#volSummary").textContent = `Sample stdev ${(Math.sqrt(variance) * 100).toFixed(2)}% / bar`;
    $("#studySeriesName").textContent = `${filename} · ${rows.length.toLocaleString()} bars · ${instruments[$("#instrument").value].prefix}`;
    $("#runStudy").disabled = false;
    requestAnimationFrame(drawChart);
  }

  function clearCurrentStudy(message) {
    window.catalystLastStudy = null;
    $("#modelStatus").textContent = "NO STUDY";
    $("#forecastUnavailableTitle").textContent = "Price history loaded; forecast still unavailable";
    $("#forecastUnavailableReason").textContent = `${message} A directional forecast appears only if the chronological holdout contains at least 100 outcomes and beats its baseline.`;
    $("#studyResults").innerHTML = `<section class="panel empty-view"><div class="empty-glyph">⌁</div><h2>Run a new study for this file</h2><p>${escapeHtml(message)}</p></section>`;
    $(".forecast-box").innerHTML = '<div><span class="readout-label">Directional forecast</span><strong>Abstaining</strong></div><span class="model-chip">MODEL NOT VALIDATED</span><p>Outcome probabilities will appear only after instrument-specific training, chronological evaluation, and calibration.</p>';
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
      factorGroups = groups;
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
        const active = activeFactorValues.get(name.toLowerCase());
        const status = document.createElement("span"); status.className = "factor-status"; status.textContent = active ? "OBSERVED" : "PENDING SOURCE";
        const detail = document.createElement("span"); detail.className = "factor-detail";
        detail.textContent = active ? `${definitionFor(name)} Observed ${Number(active.value).toFixed(4)} ${active.unit} on ${active.date}; source: ${active.provider} (${active.series}). Descriptive observation only; no forecast contribution.` : `${definitionFor(name)} Required: verified, timestamped observations and source/vintage metadata. Status: pending configuration; contributes nothing to a forecast.`;
        row.append(factor, status, detail); details.append(row);
      });
      container.append(details);
      number += group.items.length;
    });
    if (!shown) container.innerHTML = '<div class="panel no-results">No matching factors. Try another search or category.</div>';
    const activeCount = activeFactorValues.size;
    $(".registry-tools .pending-label").textContent = `${activeCount} observed · ${150 - activeCount} pending`;
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
