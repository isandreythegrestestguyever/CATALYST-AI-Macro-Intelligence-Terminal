# Architecture

## Current release

The app is a dependency-free static site. `index.html` provides semantic structure, `styles.css` contains the design tokens and responsive layout, `app.js` owns local interface state and CSV-derived calculations, and `data/factors.json` defines the factor registry. There is no server, database, network data connector, or model artifact. The Pages workflow copies the checked-in site to GitHub Pages.

The CSV importer processes user-selected files entirely in the browser. No file contents leave the page. A local imported close series supports descriptive calculations only. It is never used to imply a live quote or a trained forecast.

## Data integrity boundary

Every observation introduced by a future adapter should retain source, instrument/series, observation period, publication time, ingestion time, available-at time, revision/vintage, value, unit, and validation state. Forecast feature assembly must use `available_at <= forecast_created_at`. First-release values must remain recoverable after revisions. Missing inputs remain missing; they do not become zero.

## Planned modular monolith

When data access and hosting are available, add a Python API and scheduled ingestion worker behind the existing static frontend. Separate provider clients, timestamped observations, factor definitions, instrument-specific models, chronological evaluation, and news processing into modules. Keep secrets server-side. Keep forecasting disabled until a versioned model passes leakage checks, walk-forward evaluation, and calibration review.

## Source boundaries

- Economic releases: official agency source and publication/vintage metadata.
- Market history: licensed or user-supplied instrument-specific data with explicit resolution and timezone.
- News: source URL and timestamps, deduplication, and corroboration metadata.
- Forecast: model/data versions, horizon, validation and calibration state, contributing inputs, and abstention reason.
