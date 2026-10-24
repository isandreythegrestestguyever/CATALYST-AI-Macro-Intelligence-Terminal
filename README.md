# CATALYST

CATALYST is an evidence-first macro research workspace for Nasdaq-100 futures and gold. The site connects to public source APIs on demand and supports a reproducible price-only research study on user-supplied instrument history. It is not an automatic trading system.

## Working features

- Switch between NQ, MNQ, GC, MGC, and XAUUSD. These instruments remain distinct; the selected label must match the imported file.
- Fetch source-linked news documents from the GDELT DOC 2.0 API. The site displays publisher titles, URLs, source domain, country/language, and GDELT's seen time. Coverage is not treated as event verification, sentiment, or a trading signal.
- Fetch daily nominal and real U.S. Treasury curve observations from the Treasury XML feed. The dashboard derives the 2s10s spread and daily yield changes from dated observations. These are descriptive daily context and do not enter the price-only model.
- Bring a personal FRED API key in the browser to retrieve selected macro series and source-published economic release dates. The key stays in page memory and is sent directly to the St. Louis Fed API. It is not saved to local storage, uploaded to CATALYST, or included in the repository. Review and accept the linked FRED API terms before using the connector.
- Import a dated close-price CSV. The file stays in the browser; the site charts observed prices, computes descriptive returns/volatility, and records a SHA-256 fingerprint for each research run.
- Run an expanding-window three-class softmax baseline. Inputs are lagged log returns and past-only volatility/trend; labels use the selected future-bar horizon and user-entered neutral band/cost allowance. Horizon-overlapping observations are embargoed between training, calibration, and test partitions. The study reports fold-level out-of-sample Brier score, base-rate Brier, skill, log loss, and balanced accuracy. It suppresses current probabilities unless there are at least 100 holdout outcomes and the calibrated model beats the training base-rate Brier score.
- Inspect 150 documented macro factor candidates. A factor changes from pending only when a supported source observation or derivation is available; it remains descriptive and contributes nothing to the price-only model.
- Enter hypothetical scenario assumptions without presenting them as causal effects or guaranteed outcomes.

## Run locally

Open `index.html` from a static HTTP server so the factor registry can load. There is no build step or third-party runtime dependency. Live source fetches require browser network access. Treasury and GDELT are attempted without a key; FRED requires a user-owned key.

## Historical CSV format

The importer accepts a header row with a date/time column and a close column. Common aliases include `timestamp`, `datetime`, `date`, `close`, `adj close`, `adj_close`, and `settle`. Dates must be parseable by the browser. Invalid rows are skipped and duplicate timestamps are de-duplicated. The selected instrument is recorded with the file; re-import after changing instrument. The horizon is measured in bars because the file's bar frequency is supplied by the user, not verified against an exchange calendar.

## Not enabled

- No licensed NQ/GC price feed, options/depth data, consensus calendar, scheduled ingestion, server, database, user accounts, or live execution.
- FRED current observations are not point-in-time ALFRED vintages. They are displayed for context and excluded from historical forecasting.
- The walk-forward classifier is experimental and price-only. Passing its explicit holdout gate does not establish stable predictive skill, macro causality, or tradable profitability. Results depend on the supplied series, bar frequency, label band, and cost assumption.
- The FRED key and fetched data exist only in the current browser tab. This is a public project; never put a private key in source code or commit history.

## Deploy

GitHub Pages publishes the repository root through `.github/workflows/pages.yml`: https://isandreythegrestestguyever.github.io/CATALYST-AI-Macro-Intelligence-Terminal/

## Architecture

See [docs/architecture.md](docs/architecture.md) and [docs/decisions/0001-static-research-workspace.md](docs/decisions/0001-static-research-workspace.md). Provider outputs, observation dates, fetch times, and source links stay visible. The static architecture cannot preserve a server-side point-in-time store or safely share licensed API keys.
