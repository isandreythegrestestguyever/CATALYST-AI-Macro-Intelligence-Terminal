# ADR 0002: Keep futures credentials on a server

- Status: Accepted
- Date: 2026-10-25

## Context

The interface had no NQ/MNQ/GC/MGC price source, so the correct default was “insufficient evidence.” CME futures market data is exchange-licensed. Databento exposes historical CME data through its API and requires a private account key. Embedding that key in a public GitHub Pages bundle would expose it.

## Decision

Add a small FastAPI service that reads `DATABENTO_API_KEY` only from the server environment. The browser calls cost-estimate and history routes; it never receives the key. Validate the instrument, schema, and date range before requests. Require the browser to confirm requests with a non-zero provider cost estimate. Return explicit historical/continuous-contract metadata and keep unsupported XAUUSD distinct from futures.

## Consequences

Local users can run the server and point the GitHub Pages UI at localhost. GitHub Pages itself cannot run the backend, so a shared hosted market service still requires a separately deployed HTTPS API, server-side key management, and appropriate data licensing. This connector returns historical OHLCV only; it does not make the model validated or enable live CME streaming.
