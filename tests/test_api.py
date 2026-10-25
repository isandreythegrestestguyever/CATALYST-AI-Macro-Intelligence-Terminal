import os
import unittest
from unittest.mock import AsyncMock, Mock, patch

from fastapi.testclient import TestClient

from catalyst_api.main import app


class ApiContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    def test_health_exposes_provider_configuration_without_key(self):
        with patch.dict(os.environ, {"DATABENTO_API_KEY": ""}):
            response = self.client.get("/api/v1/system/health")
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.json()["databento_configured"])
        self.assertNotIn("api_key", response.text.lower())

    def test_supported_futures_keep_distinct_contract_roots(self):
        items = {item["symbol"]: item for item in self.client.get("/api/v1/instruments").json()}
        self.assertEqual(items["NQ"]["provider_symbol"], "NQ.v.0")
        self.assertEqual(items["MNQ"]["provider_symbol"], "MNQ.v.0")
        self.assertEqual(items["GC"]["provider_symbol"], "GC.v.0")
        self.assertEqual(items["MGC"]["provider_symbol"], "MGC.v.0")
        self.assertFalse(items["XAUUSD"]["available"])

    def test_xauusd_is_not_silently_mapped_to_cme_futures(self):
        response = self.client.get(
            "/api/v1/markets/XAUUSD/history/estimate",
            params={"start": "2025-01-01", "end": "2025-01-02", "schema": "ohlcv-1d"},
        )
        self.assertEqual(response.status_code, 422)
        self.assertIn("spot", response.json()["detail"].lower())

    def test_bad_schema_is_rejected_before_provider_access(self):
        response = self.client.get(
            "/api/v1/markets/NQ/history/estimate",
            params={"start": "2025-01-01", "end": "2025-01-02", "schema": "trades"},
        )
        self.assertEqual(response.status_code, 422)
        self.assertIn("ohlcv", response.json()["detail"])

    def test_date_range_is_bounded_before_provider_access(self):
        response = self.client.get(
            "/api/v1/markets/GC/history/estimate",
            params={"start": "2020-01-01", "end": "2026-01-01", "schema": "ohlcv-1d"},
        )
        self.assertEqual(response.status_code, 422)
        self.assertIn("1827", response.json()["detail"])

    def test_missing_provider_key_returns_clear_unavailable_status(self):
        with patch.dict(os.environ, {"DATABENTO_API_KEY": ""}):
            response = self.client.get(
                "/api/v1/markets/NQ/history/estimate",
                params={"start": "2025-01-01", "end": "2025-01-02", "schema": "ohlcv-1d"},
            )
        self.assertEqual(response.status_code, 503)
        self.assertIn("DATABENTO_API_KEY", response.json()["detail"])

    @patch("catalyst_api.main.request_gdelt", new_callable=AsyncMock)
    def test_public_news_proxy_normalizes_source_metadata(self, fetch_news):
        fetch_news.return_value = {"articles": [{
            "title": "Rate decision",
            "url": "https://news.example/story",
            "domain": "news.example",
            "seendate": "20261025T070000Z",
            "language": "English",
            "sourcecountry": "United States",
        }, {"title": "Bad link", "url": "javascript:alert(1)"}]}
        response = self.client.get("/api/v1/news", params={"query": "  Fed   rates ", "timespan": "7d", "maxrecords": 10})
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["count"], 1)
        self.assertEqual(body["articles"][0]["domain"], "news.example")
        fetch_news.assert_awaited_once_with("Fed rates", "7d", 10)

    def test_public_news_proxy_bounds_and_validates_queries(self):
        self.assertEqual(self.client.get("/api/v1/news", params={"query": "   "}).status_code, 422)
        self.assertEqual(self.client.get("/api/v1/news", params={"query": "rates", "timespan": "90d"}).status_code, 422)
        self.assertEqual(self.client.get("/api/v1/news", params={"query": "rates", "maxrecords": 100}).status_code, 422)

    @patch("catalyst_api.main._estimate", return_value=1.25)
    @patch("catalyst_api.main.databento_client")
    def test_nonzero_history_cost_requires_confirmation(self, client_factory, estimate):
        provider = Mock()
        client_factory.return_value = provider
        response = self.client.get(
            "/api/v1/markets/NQ/history",
            params={"start": "2025-01-01", "end": "2025-01-02", "schema": "ohlcv-1d"},
        )
        self.assertEqual(response.status_code, 402)
        self.assertEqual(response.json()["detail"]["estimated_cost_usd"], 1.25)
        provider.timeseries.get_range.assert_not_called()


if __name__ == "__main__":
    unittest.main()
