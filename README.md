# CATALYST

CATALYST is a macro research terminal for Nasdaq futures and gold. It connects to public news and macro sources and includes a server-side adapter for dated CME futures history. Forecasts remain hidden until a user-provided series passes the app's chronological evaluation gate.

## Why the page can say “insufficient evidence”

The app does not invent a price, market regime, or probability. Its forecast begins in an abstaining state because there is no historical NQ/GC series or validated macro model in a fresh browser session. Fetch macro observations and market history, then run the Model Lab. The current classifier is a price-only research baseline, not the master-prompt goal of a validated macro forecast.

## What works

- The overview now automatically requests the current-year U.S. Treasury nominal/real yield curves and GDELT public coverage on page load. **Refresh evidence** reruns both, and the page reports which source succeeded instead of leaving a blank dashboard. Provider outage or browser CORS restrictions remain visible.
- GDELT public-document search, with source links, publisher, country/language, and GDELT's seen time. Coverage is not treated as fact verification or market impact.
- U.S. Treasury daily nominal and real yield curves, with dated values, derived curve spreads, and daily changes.
- FRED observations and release dates using a user-owned key entered in the browser. The page sends it to FRED and keeps it in tab memory; current FRED observations are not reconstructed ALFRED vintages.
- Databento CME futures historical OHLCV requests for NQ, MNQ, GC, and MGC through a local FastAPI service. The service estimates provider cost before download, keeps the key server-side, bounds date ranges, and makes the user confirm any non-zero estimate. Continuous-contract bars are unadjusted and can contain roll gaps.
- XAUUSD remains distinct from CME futures and is marked unavailable until a spot provider is configured.
- CSV or provider history can feed the local chart and the experimental expanding-window softmax baseline. It reports Brier score, base-rate Brier, log loss, balanced accuracy, fold date ranges, and a dataset digest. Probabilities are suppressed unless it has at least 100 holdout observations and beats the training base-rate Brier score.
- A 150-candidate factor registry. Only factors with source observations become observed; none silently fills missing values or enters the price-only model.

## Run locally

1. Install Python 3.12 or newer.
2. Copy `.env.example` to `.env` and enter your Databento key as `DATABENTO_API_KEY`. The key is read by the server and is never entered into the public webpage or committed to Git.
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

5. Open `http://localhost:4173`. In **Data sources**, keep the API address at `http://localhost:8000`, check the API, choose the instrument and dates, estimate cost, then explicitly approve a non-zero request before loading history. On the public GitHub Pages site, the API address can also point to a local service running on your computer; the browser may ask permission for the site to connect to localhost.

Alternatively, use `docker compose up --build` after creating `.env`.

Databento historical access requires an account and API key. New accounts currently receive introductory data credits, but check your account's available balance, dataset costs, and licensing terms before downloading. This connector retrieves history; it does not provide a live stream. See the [official Databento quickstart](https://databento.com/docs/quickstart) and [historical API](https://databento.com/docs/api-historical?lang=python).

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
- News extraction, deduplication/clustering, cross-source corroboration, historical event analogs, or a validated instrument-specific macro model.
- Live spot-XAUUSD price source, exchange calendar, model artifacts, or automatic execution.

The GitHub Pages deployment serves only the static frontend. The FastAPI service must run locally or be deployed separately with the provider key kept in server-side environment configuration.

## Project files

- `index.html`, `styles.css`, `app.js`: browser interface and local price-only research.
- `catalyst_api/`: FastAPI source provider adapter.
- `data/factors.json`: documented candidate factor registry.
- `docs/architecture.md`: data flow, trust boundaries, and remaining work.
