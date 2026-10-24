# CATALYST

CATALYST is an evidence-first macro research terminal for Nasdaq-100 futures and gold. This first release is a static, client-side research workspace: it does not present live prices, economic releases, news, forecast probabilities, or model performance as if they were available.

## What works now

- Switch between NQ / MNQ, GC / MGC, and XAUUSD workspaces.
- Inspect the 150-factor candidate registry and each factor's definition, hypothesis, and data requirements.
- Import a local OHLCV CSV and view the observed close series, return, and realized volatility calculated from that file.
- Adjust a clearly hypothetical scenario and review its assumptions without generating unsupported price targets or probabilities.
- Browse the research, event, and model-status views. Unavailable data and unvalidated forecasts stay explicitly unavailable.
- Use the responsive interface on desktop and mobile.

Imported files stay in the browser session and are not uploaded. The published version uses GitHub Pages and needs no API key.

## Run locally

Open `index.html` in a browser or serve this folder with any static HTTP server. There is no build step and no third-party runtime dependency.

## Historical CSV format

The importer accepts a header row with a date/time column and a close column. Common aliases such as `timestamp`, `datetime`, `date`, `close`, `adj close`, `adj_close`, and `settle` are recognized. OHLCV columns are optional. Dates must be parseable by the browser. Rows with invalid dates or non-finite prices are skipped. The chart and summary describe only the imported observations; they are not a live feed or a forecast.

## Data and model status

No market-data, news, or consensus provider is connected in this release. Every candidate factor is therefore marked `Pending source configuration`. A forecast requires point-in-time inputs, an instrument-specific model, chronological out-of-sample validation, and probability calibration; none is claimed here. The app abstains instead of substituting sample values.

## Deploy to GitHub Pages

The included workflow publishes the repository root when changes land on `main`. In the GitHub repository, set **Settings → Pages → Build and deployment → Source** to **GitHub Actions**. The intended site URL is `https://isandreythegrestestguyever.github.io/CATALYST-AI-Macro-Intelligence-Terminal/`.

## Architecture notes

See [docs/architecture.md](docs/architecture.md) and [docs/decisions/0001-static-research-workspace.md](docs/decisions/0001-static-research-workspace.md). The frontend is intentionally a static foundation. Provider adapters, a point-in-time store, research pipelines, and validated models remain future work and must be implemented before enabling forecast outputs.

## Limitations

- A local file import is not persisted after the tab is closed or refreshed.
- No provider integration, scheduled calendar, news ingestion, backend, account system, live quotes, or automatic trading is included.
- Descriptive CSV statistics are not backtest results and do not establish predictive skill.
- XAUUSD, GC/MGC, and NQ/MNQ remain distinct instrument workspaces.

## License

MIT. See [LICENSE](LICENSE).
