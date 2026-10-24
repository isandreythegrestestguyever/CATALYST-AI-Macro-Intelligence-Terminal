# ADR 0001: Start with a static research workspace

- Status: Accepted
- Date: 2026-10-25

## Context

The repository began empty and no price feed, consensus license, or server hosting was available. A fabricated live signal would violate the brief. A public site should remain usable without embedded credentials.

## Decision

Publish a static browser workspace with on-demand public GDELT and Treasury requests, a bring-your-own-key FRED connector, local CSV research, and explicit abstention rules. Do not claim that descriptive Treasury/FRED data is point-in-time or that a price-only baseline is macro forecasting.

## Consequences

The site can fetch public source records and run descriptive and empirical calculations on actual user data without uploading it. It cannot provide licensed intraday futures data, a shared server-side observation store, point-in-time economic vintages, consensus surprises, persistent study history, or a validated macro model. Those require additional data access and backend infrastructure.
