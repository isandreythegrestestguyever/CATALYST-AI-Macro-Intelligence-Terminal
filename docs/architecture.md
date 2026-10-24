# Architecture

## Current components

```text
Browser (GitHub Pages or localhost)
  ├─ GDELT DOC 2.0 (public document search)
  ├─ Treasury XML (daily nominal and real yields)
  ├─ FRED API (key entered in page memory; direct request)
  └─ CATALYST FastAPI (localhost or separately deployed)
       └─ Databento historical API (key held in server environment)
```

The browser owns the interface, source observation session, CSV parsing, chart, SHA-256 input digest, and price-only walk-forward baseline. It sends no CSV or Databento key to the CATALYST server. The server owns the Databento credential, performs provider cost estimates, validates instruments/date ranges/schemas, makes authorized historical requests, normalizes timestamps to UTC, and returns OHLCV bars with source and freshness metadata.

## API routes

- `GET /api/v1/system/health`: API version and whether the Databento key is configured. This checks presence only, not whether the key is valid.
- `GET /api/v1/instruments`: exact futures mapping and unsupported spot-gold state.
- `GET /api/v1/markets/{symbol}/history/estimate`: Databento estimated request cost and request metadata.
- `GET /api/v1/markets/{symbol}/history`: OHLCV bars, only after non-zero estimated cost is explicitly confirmed.

The provider adapter uses `GLBX.MDP3` continuous volume-front-month symbology (`{root}.v.0`) for CME futures OHLCV. This returns unadjusted continuous-contract data; rollover gaps can remain. NQ/MNQ and GC/MGC use distinct roots. XAUUSD is not mapped to a futures series.

## Sources and time

- Databento history is fetched on demand and labeled historical, never real-time. It needs a server-side API key and may consume provider credits or incur cost. The user sees an estimate before the data request.
- Treasury and FRED values preserve observation dates separately from fetch time. The current FRED endpoint returns current observations, not point-in-time ALFRED history, and neither source is joined into the current model.
- GDELT results are public document metadata. Coverage does not establish event truth, novelty, corroboration, relevance, or market impact.
- The interface displays UTC and America/New_York using the IANA timezone database.

## Research model boundary

The browser's model is a transparent experimental baseline on one close series. It uses past-only return/volatility/trend features and future-bar labels. Scaling and temperature calibration are fitted on earlier slices; horizon overlap is embargoed; test predictions are compared with training class priors. It is not the macro model specified in the master prompt. The forecast is withheld unless the holdout contains at least 100 outcomes and calibrated multiclass Brier score beats the training base-rate Brier score.

## Credentials and network access

`.env` is ignored by Git. `DATABENTO_API_KEY` is read only by the server. The public GitHub Pages frontend can call a locally running API at `http://localhost:8000`; CORS allowlists the project page and local development origins. No API key belongs in the static frontend. FRED keys are user-entered in the page, remain in tab memory, and are sent directly to FRED.

The static GitHub Pages deployment does not run FastAPI. For public multi-user market history, deploy the API separately over HTTPS and configure `CATALYST_ALLOWED_ORIGINS`; never deploy a user secret in a static bundle. There is no persistence or background worker in this release.

## Remaining production work

No live Databento stream, persistent point-in-time store, scheduler, first-release vintage reconstruction, licensed economic consensus, event extraction/corroboration, historical analog engine, cross-asset macro forecasting, exchange calendar, or XAUUSD spot connector exists. These are required before describing CATALYST as the complete institutional macro platform in the master prompt.
