# CATALYST

CATALYST is a macro research terminal for Nasdaq futures and gold. It connects to public news and macro sources and includes a server-side adapter for dated CME futures history. Forecasts remain hidden until a user-provided series passes the app's chronological evaluation gate.

## Why the page can say “insufficient evidence”

The app does not invent a price, market regime, or probability. Its forecast begins in an abstaining state because a fresh browser has no historical NQ/GC series or validated macro model. Import or fetch dated market history, optionally fetch five years of Treasury observations, then run the experimental Model Lab. Neither research baseline is the master-prompt goal of a validated news-driven macro forecast.

## What works

- The overview now automatically requests the current-year U.S. Treasury nominal/real yield curves and GDELT public coverage on page load. **Refresh evidence** reruns both, and the page reports which source succeeded instead of leaving a blank dashboard. Provider outage or browser CORS restrictions remain visible.
- The overview displays dated Treasury yield changes as macro context. It does not mistake rates data for NQ/GC prices. CME's public quote page is delayed by at least 10 minutes and is a human-facing quote display, not this app's historical data feed. CME's documented website API requires OAuth entitlement and an active public-website redistribution license; do not scrape it. Use the Databento history connector or import a dated CSV you are licensed to use.
- GDELT public-document search, with source links, publisher, country/language, and GDELT's seen time. Coverage is not treated as fact verification or market impact.
- A local FastAPI proxy for GDELT metadata to avoid browser CORS restrictions. It only calls GDELT's fixed public endpoint, bounds queries and result counts, validates links, and never fetches article bodies. The static page keeps a direct-browser fallback for GitHub Pages.
- U.S. Treasury daily nominal and real yield curves, with dated values, derived curve spreads, and daily changes.
- Five recent years of Treasury daily yields can be fetched and retained in this browser. The exploratory model joins the latest Treasury observation strictly before each price date; missing rows are dropped, never filled with zero. Treasury publication timestamps and historical vintages are not available, so this does not qualify as a point-in-time macro backtest.
- FRED observations and release dates using a user-owned key entered in the browser. The page sends it to FRED and keeps it in tab memory; current FRED observations are not reconstructed ALFRED vintages.
- Databento CME futures historical OHLCV requests for NQ, MNQ, GC, and MGC through a local FastAPI service. The service estimates provider cost before download, keeps the key server-side, bounds date ranges, and makes the user confirm any non-zero estimate. Continuous-contract bars are unadjusted and can contain roll gaps.
- XAUUSD remains distinct from CME futures and is marked unavailable until a spot provider is configured.
- CSV or provider history can feed the local chart and expanding-window softmax baselines: price-only, or price plus five lagged Treasury features. Reports include Brier score, base-rate Brier, log loss, balanced accuracy, fold date ranges, model inputs, and a dataset digest. Probabilities are suppressed unless there are at least 100 holdout observations and the model beats the training base-rate Brier score. A passing result is still experimental and not a validated macro/news forecast.
- Completed walk-forward study reports are retained in browser-local storage (up to 50) and can be downloaded as JSON. They are not uploaded to the API.
- A 150-candidate factor registry. Only factors with source observations become observed; none silently fills missing values. The price-only model uses none of the registry; the Treasury model uses the five explicitly listed rate features.

## Run locally

### One-command local workspace

Install Docker Desktop, then run:

```sh
docker compose up --build
```

Open `http://localhost:4173`. The static workspace and API start together. Treasury and GDELT work without provider credentials; Databento history stays unavailable until you add a key.

To enable the paid/credit-based Databento connector, copy `.env.example` to `.env` and enter your key as `DATABENTO_API_KEY`. The key is read by the server, never by the public webpage, and never committed to Git. Check provider balance, cost, and licensing first.

### Run without Docker

1. Install Python 3.12 or newer.
2. (Optional) Copy `.env.example` to `.env` and enter a Databento key locally if you have authorized access.
3. Install dependencies and start the API:

   ```sh
   python3 -m venv .venv
   source .venv/bin/activate
   pip install -r requirements.txt
   uvicorn catalyst_api.main:app --reload --port 8000
   ```

4. In a second terminal, serve the website:

   ```sh
   python3 -m http.server 4173
   ```

5. Open `http://localhost:4173`. In **Data sources**, the local news proxy uses the API automatically. For CME history, check the API, choose the instrument and dates, estimate cost, then explicitly approve a non-zero request before loading history. On GitHub Pages, configure a separately hosted API or point it at a local service; the browser may block local API access depending on browser security settings.

Databento historical access requires an account and API key. Check your account's available balance, dataset costs, and licensing terms before downloading. This connector retrieves history; it does not provide a live stream. See the [official Databento quickstart](https://databento.com/docs/quickstart) and [historical API](https://databento.com/docs/api-historical?lang=python). CME's [public delayed quotes](https://www.cmegroup.com/market-data/browse-data/delayed-quotes.html) are delayed at least 10 minutes. Its [F&O website data API documentation](https://cmegroupclientsite.atlassian.net/wiki/spaces/EPICSANDBOX/pages/1892122625/CME+Group+Futures+and+Options+Website+Information+REST+API) says OAuth onboarding and redistribution licensing are required, so the public quote display is not an interchangeable programmatic history source.

## Model Lab

Choose a valid instrument label, provide a close-price series or fetch one from Databento, and set a neutral move threshold plus a cost allowance in the instrument's price units. The horizon is measured in bars because the uploaded data's session calendar and frequency are not independently verified. Evaluation is experimental and does not establish tradable performance or macro causality.

## Validate

```sh
node --check app.js
python3 -m unittest discover -s tests -v
git diff --check
```

## Still not implemented

- Live/streaming CME quotes, trades, depth, or options; the current Databento connector is historical OHLCV only.
- Point-in-time ALFRED release-vintage reconstruction, licensed release consensus/surprises, scheduled ingestion, persistent database, and authenticated multi-user service.
- News extraction, deduplication/clustering, cross-source corroboration, historical event analogs, incremental macro-model benchmarks, or a validated instrument-specific macro model.
- Live spot-XAUUSD price source, exchange calendar, model artifacts, or automatic execution.

The GitHub Pages deployment serves only the static frontend. The FastAPI service must run locally or be deployed separately with the provider key kept in server-side environment configuration.

## Project files

- `index.html`, `styles.css`, `app.js`: browser interface, source-backed observations, local study pipeline, and browser-local study history.
- `catalyst_api/`: FastAPI source provider adapter.
- `data/factors.json`: documented candidate factor registry.
- `docs/architecture.md`: data flow, trust boundaries, and remaining work.
