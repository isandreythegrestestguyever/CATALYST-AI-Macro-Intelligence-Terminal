# ADR 0003: Keep public news search local and research records in the browser

- Status: Accepted
- Date: 2026-10-25

## Context

The static GitHub Pages site can be blocked when requesting public news providers directly from a browser, and completed walk-forward reports disappeared when the Model Lab view changed. The project has no deployed API host or shared database. Public GDELT metadata and Treasury daily curves are available without embedding a private credential, but neither source supplies verified event impact or complete point-in-time release availability.

## Decision

Add a bounded FastAPI proxy for GDELT article metadata. The server calls only the fixed provider endpoint, limits query size and request frequency, validates article links, caches successful searches briefly, and does not download article bodies. Preserve a direct-browser fallback for the static Pages deployment. Save a capped history of experiment metadata and the five-year Treasury research cache in browser local storage; allow each experiment report to be downloaded as JSON. Keep price-only and price-plus-Treasury experiments explicitly labeled as exploratory.

## Consequences

Local users can retrieve news through the API without requiring browser CORS support. GitHub Pages can still use the public browser fallback, so provider availability and CORS policy may affect that route. Local history is private to one browser and can be cleared; it is not a durable server record. GDELT coverage is not corroboration, event extraction, or market-impact analysis. Treasury observations do not include the release-availability timestamps and historical vintages required for a point-in-time macro backtest.

## Follow-up

Deploy the API over HTTPS for a shared service, add a persistent database and scheduler, obtain properly licensed consensus and market data, reconstruct point-in-time vintages, and validate the news-driven model on chronological instrument-specific history before exposing a macro forecast.
