# ADR 0001: Start with a static research workspace

- Status: Accepted
- Date: 2026-10-25

## Context

The repository is empty and no market-data, consensus, news, or model credentials have been supplied. Publishing fabricated observations or probabilities would violate the product's evidence requirements. A backend and database without a connected, usable source would add setup burden without producing valid analysis.

## Decision

Deliver a dependency-free static terminal with honest unavailable states, a complete descriptive factor registry, and a local historical CSV importer. Keep forecast outputs explicitly unvalidated. Use GitHub Actions for static Pages deployment.

## Consequences

The interface can be hosted without secrets and can support actual user-supplied historical series. It is not yet a live macro intelligence or predictive service. Provider connectors, point-in-time storage, forecasting, and validation must be implemented before those claims are enabled.
