# Architecture

## Current components

```text
Browser (GitHub Pages or localhost)
  ├─ Treasury XML (daily nominal and real yields)
  ├─ FRED API (key entered in page memory; direct request)
  └─ CATALYST FastAPI (localhost or separately deployed)
       ├─ GDELT DOC 2.0 (bounded public document metadata proxy)
       └─ Databento historical API (key held in server environment)
```

The browser owns the interface, public source observations, a five-year Treasury cache, CSV parsing, chart, SHA-256 input digest, and local research evaluation. It sends no CSV, FRED key, or Databento key to the CATALYST server. The server owns the Databento credential, performs provider cost estimates, validates instruments/date ranges/schemas, makes authorized historical requests, normalizes timestamps to UTC, and returns OHLCV bars with source and freshness metadata. Browser-local study records and Treasury XML data never leave the device.

## API routes

- `GET /api/v1/system/health`: API version and whether the Databento key is configured. This checks presence only, not whether the key is valid.
- `GET /api/v1/news`: bounded GDELT document metadata search (`query` up to 200 characters, `timespan` 24h/7d/30d, up to 50 results, 20 requests per minute per client). Successful identical searches are cached for 90 seconds. The server calls a fixed GDELT URL; callers cannot provide a target URL. Only HTTP(S) article links and metadata are returned.
- `GET /api/v1/instruments`: exact futures mapping and unsupported spot-gold state.
- `GET /api/v1/markets/{symbol}/history/estimate`: Databento estimated request cost and request metadata.
- `GET /api/v1/markets/{symbol}/history`: OHLCV bars, only after non-zero estimated cost is explicitly confirmed.

The provider adapter uses `GLBX.MDP3` continuous volume-front-month symbology (`{root}.v.0`) for CME futures OHLCV. This returns unadjusted continuous-contract data; rollover gaps can remain. NQ/MNQ and GC/MGC use distinct roots. XAUUSD is not mapped to a futures series.

## Sources and time

- Databento history is fetched on demand and labeled historical, never real-time. It needs a server-side API key and may consume provider credits or incur cost. The user sees an estimate before the data request.
- Treasury and FRED values preserve observation dates separately from fetch time. The current FRED endpoint returns current observations, not point-in-time ALFRED history, and neither source is joined into the current model.
- GDELT results are public document metadata proxied by the local API (or fetched directly by GitHub Pages as a fallback). Coverage does not establish event truth, novelty, corroboration, relevance, or market impact.
- The interface displays UTC and America/New_York using the IANA timezone database.

## Research model boundary

The browser offers transparent price-only and price-plus-Treasury experimental baselines on one user-supplied close series. Treasury values are matched only from dates strictly before the price row; missing values remove the row. Features are standardized using training history; temperature calibration is fitted on an earlier slice; horizon overlap is embargoed; test predictions are compared with training class priors. The Treasury source has no release-availability timestamp or point-in-time vintages, and these models do not use event consensus or news. Neither is the validated macro model specified in the master prompt. Probabilities are withheld unless the holdout contains at least 100 outcomes and calibrated multiclass Brier score beats the training base-rate Brier score.

## Credentials and network access

`.env` is ignored by Git. `DATABENTO_API_KEY` is read only by the server. The public GitHub Pages frontend can call a locally running API at `http://localhost:8000`; CORS allowlists the project page and local development origins. No API key belongs in the static frontend. FRED keys are user-entered in the page, remain in tab memory, and are sent directly to FRED.

The static GitHub Pages deployment does not run FastAPI. For public multi-user market history, deploy the API separately over HTTPS and configure `CATALYST_ALLOWED_ORIGINS`; never deploy a user secret in a static bundle. There is no persistence or background worker in this release.

## Remaining production work

No live Databento stream, server-side persistent point-in-time store, scheduler, first-release vintage reconstruction, licensed economic consensus, event extraction/corroboration, historical analog engine, cross-asset macro forecasting, exchange calendar, or XAUUSD spot connector exists. Study records are browser-local and user-downloadable, not shared or server-persisted. These are required before describing CATALYST as the complete institutional macro platform in the master prompt.
