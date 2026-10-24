# Architecture

## Current release

The app is a dependency-free static site. `index.html` provides the application views, `styles.css` contains the responsive design system, `app.js` owns source requests, local state, CSV-derived calculations, and research computations, and `data/factors.json` defines 150 macro factor candidates. The GitHub Pages workflow publishes these files.

### Source connectors

- GDELT DOC 2.0: on-demand public document search, bounded to a selected lookback; title, URL, domain, GDELT seen time, country, and language are preserved. GDELT coverage metadata is not a measure of truth, market relevance, or impact.
- U.S. Treasury XML: daily nominal and real par-yield feeds. Current observations, 2s10s spread, and daily changes are derived from dated observations. Feed publication timing is not suitable for point-in-time model reconstruction.
- FRED API: user-entered key remains in the page memory and is sent by the browser directly to the St. Louis Fed API. Selected series and source-published release dates are fetched on demand. The user must accept the linked FRED terms. Current FRED values do not reconstruct ALFRED historical vintages.
- User CSV: parsing, charting, descriptive statistics, and research calculations run in the browser; file contents are not uploaded or saved. A SHA-256 digest identifies the study input.

All provider errors remain visible. Fetch timestamps are recorded separately from source observation dates. Source series displayed for macro context do not automatically enter the classifier.

## Price-only research baseline

The model creates three labels from a user-entered price-move band and round-trip cost floor. Features are five past-only transformations of log returns and price: 1-, 2-, and 5-bar returns, 20-bar realized volatility, and 20-bar cumulative return. The three-class softmax is L2-regularized, with scaling fit on each training slice. Expanding folds separate training, temperature calibration, and test slices; horizon overlap is embargoed at split boundaries. Fold test predictions are compared with training class-prior probabilities using multiclass Brier score, log loss, and balanced accuracy. The current estimate is suppressed unless total holdout coverage reaches 100 observations and aggregated Brier beats the training base-rate Brier. Results are still experimental and depend on the user's price series and labeling choices.

The current model has no macro, news, cross-asset, or licensed futures inputs. It is not a macro forecast and cannot establish trading profitability.

## Data integrity boundary

A future production data store should retain source, instrument/series, observation period, publication time, ingestion time, available-at time, revision/vintage, value, unit, and validation state. Forecast features must satisfy `available_at <= forecast_created_at`. Revisions must not overwrite first-release values. Missing inputs remain missing, never zero.

## Planned modular monolith

A server-backed follow-up may add an API, scheduled ingestion, point-in-time database, instrument-specific macro feature pipelines, licensed futures data, and walk-forward research service. Keep credentials server-side, isolate news extraction from market impact estimation, and leave trade execution out of scope.
