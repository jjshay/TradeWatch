"""
Advanced On-Chain Metrics for Crypto Prediction Pipeline

Provides two tiers of on-chain data:

TIER 1 - FREE SOURCES (fully functional, no API keys required):
  - Blockchain.com: hash rate, tx count, mempool, difficulty, supply
  - Fear & Greed Index (alternative.me)
  - Glassnode public tier (limited free metrics)
  - CoinGlass public endpoints (liquidations, long/short)

TIER 2 - PAID SOURCES (interface built, graceful degradation):
  - CryptoQuant: exchange netflow, MVRV, miner outflow, fund flow
  - Glassnode Pro: MVRV Z-score, NUPL, RHODL, Puell Multiple, exchange flows
"""

import json
import logging
import os
import time
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Optional

import pandas as pd
import requests

from config import (
    DATA_DIR,
    GLASSNODE_API_KEY,
    CRYPTOQUANT_API_KEY,
    COINGLASS_API_KEY,
    ON_CHAIN_CACHE_HOURS,
)

logger = logging.getLogger(__name__)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)

CACHE_DIR = os.path.join(DATA_DIR, "onchain_cache")


# ---------------------------------------------------------------------------
# Cache helpers
# ---------------------------------------------------------------------------

def _cache_path(key: str) -> str:
    """Return the filesystem path for a cache key."""
    os.makedirs(CACHE_DIR, exist_ok=True)
    safe_key = key.replace("/", "_").replace(":", "_").replace("?", "_")
    return os.path.join(CACHE_DIR, f"{safe_key}.json")


def _read_cache(key: str, ttl_hours: float = ON_CHAIN_CACHE_HOURS) -> Optional[dict]:
    """Read from local cache if it exists and has not expired."""
    path = _cache_path(key)
    if not os.path.exists(path):
        return None
    try:
        with open(path, "r") as f:
            cached = json.load(f)
        cached_at = datetime.fromisoformat(cached["_cached_at"])
        if datetime.now(timezone.utc) - cached_at > timedelta(hours=ttl_hours):
            return None
        return cached["data"]
    except (json.JSONDecodeError, KeyError, ValueError):
        return None


def _write_cache(key: str, data) -> None:
    """Write data to local cache with a timestamp."""
    path = _cache_path(key)
    payload = {
        "_cached_at": datetime.now(timezone.utc).isoformat(),
        "data": data,
    }
    with open(path, "w") as f:
        json.dump(payload, f, default=str)


def _safe_get(url: str, params: dict = None, headers: dict = None,
              timeout: int = 30) -> Optional[requests.Response]:
    """HTTP GET with error handling. Returns None on failure."""
    try:
        resp = requests.get(url, params=params, headers=headers, timeout=timeout)
        resp.raise_for_status()
        return resp
    except requests.RequestException as exc:
        logger.warning("GET %s failed: %s", url, exc)
        return None


# ===================================================================
# TIER 1 - FREE SOURCES
# ===================================================================


class BlockchainComClient:
    """
    Fetch free on-chain metrics from blockchain.com/blockchain.info.

    Available charts (no API key):
      - hash-rate          : Network hash rate (TH/s)
      - n-transactions     : Daily transaction count
      - mempool-size       : Mempool size in bytes
      - difficulty         : Mining difficulty
      - total-bitcoins     : Coins in circulation
      - avg-block-size     : Average block size (bytes)
      - n-unique-addresses : Unique addresses used per day
    """

    BASE = "https://api.blockchain.info/charts"

    CHART_DEFAULTS = {
        "hash-rate":          {"timespan": "1year"},
        "n-transactions":     {"timespan": "1year"},
        "mempool-size":       {"timespan": "30days"},
        "difficulty":         {"timespan": "1year"},
        "total-bitcoins":     {"timespan": "1year"},
        "avg-block-size":     {"timespan": "1year"},
        "n-unique-addresses": {"timespan": "1year"},
    }

    def fetch_chart(self, chart_name: str, timespan: str = None,
                    use_cache: bool = True) -> Optional[pd.DataFrame]:
        """
        Fetch a single chart from blockchain.com.

        Returns a DataFrame with columns: [timestamp, value]
        """
        cache_key = f"blockchain_com_{chart_name}_{timespan or 'default'}"
        if use_cache:
            cached = _read_cache(cache_key)
            if cached is not None:
                logger.info("Cache hit: %s", cache_key)
                return pd.DataFrame(cached)

        defaults = self.CHART_DEFAULTS.get(chart_name, {"timespan": "1year"})
        params = {"format": "json", "timespan": timespan or defaults["timespan"]}

        resp = _safe_get(f"{self.BASE}/{chart_name}", params=params)
        if resp is None:
            return None

        data = resp.json()
        values = data.get("values", [])
        if not values:
            logger.warning("No data points for chart %s", chart_name)
            return None

        df = pd.DataFrame(values)
        df["timestamp"] = pd.to_datetime(df["x"], unit="s", utc=True)
        df = df.rename(columns={"y": "value"}).drop(columns=["x"])
        df = df.set_index("timestamp").sort_index()

        if use_cache:
            _write_cache(cache_key, df.reset_index().to_dict(orient="records"))

        return df

    def fetch_hash_rate(self, timespan: str = "1year") -> Optional[pd.DataFrame]:
        """Network hash rate (TH/s)."""
        return self.fetch_chart("hash-rate", timespan)

    def fetch_transaction_count(self, timespan: str = "1year") -> Optional[pd.DataFrame]:
        """Daily transaction count."""
        return self.fetch_chart("n-transactions", timespan)

    def fetch_mempool_size(self, timespan: str = "30days") -> Optional[pd.DataFrame]:
        """Mempool size in bytes."""
        return self.fetch_chart("mempool-size", timespan)

    def fetch_difficulty(self, timespan: str = "1year") -> Optional[pd.DataFrame]:
        """Mining difficulty."""
        return self.fetch_chart("difficulty", timespan)

    def fetch_coins_in_circulation(self, timespan: str = "1year") -> Optional[pd.DataFrame]:
        """Total BTC in circulation."""
        return self.fetch_chart("total-bitcoins", timespan)

    def fetch_avg_block_size(self, timespan: str = "1year") -> Optional[pd.DataFrame]:
        """Average block size (bytes)."""
        return self.fetch_chart("avg-block-size", timespan)

    def fetch_unique_addresses(self, timespan: str = "1year") -> Optional[pd.DataFrame]:
        """Unique addresses used per day."""
        return self.fetch_chart("n-unique-addresses", timespan)

    def fetch_all(self, use_cache: bool = True) -> dict:
        """Fetch all available charts. Returns dict of DataFrames keyed by chart name."""
        results = {}
        for chart_name in self.CHART_DEFAULTS:
            logger.info("[Blockchain.com] Fetching %s ...", chart_name)
            df = self.fetch_chart(chart_name, use_cache=use_cache)
            if df is not None:
                results[chart_name] = df
            time.sleep(0.5)  # polite rate limiting
        return results


class FearGreedClient:
    """
    Crypto Fear & Greed Index from alternative.me.

    Returns a value from 0 (extreme fear) to 100 (extreme greed).
    Free, no API key required.
    """

    URL = "https://api.alternative.me/fng/"

    def fetch(self, limit: int = 365, use_cache: bool = True) -> Optional[pd.DataFrame]:
        """
        Fetch Fear & Greed Index history.

        Returns DataFrame with columns: [timestamp, value, label]
        """
        cache_key = f"fear_greed_{limit}"
        if use_cache:
            cached = _read_cache(cache_key)
            if cached is not None:
                logger.info("Cache hit: %s", cache_key)
                return pd.DataFrame(cached)

        resp = _safe_get(self.URL, params={"limit": limit, "format": "json"})
        if resp is None:
            return None

        data = resp.json().get("data", [])
        if not data:
            return None

        df = pd.DataFrame(data)
        df["timestamp"] = pd.to_datetime(df["timestamp"].astype(int), unit="s", utc=True)
        df["value"] = df["value"].astype(int)
        df = df.rename(columns={"value_classification": "label"})
        df = df[["timestamp", "value", "label"]].set_index("timestamp").sort_index()

        if use_cache:
            _write_cache(cache_key, df.reset_index().to_dict(orient="records"))

        return df


class GlassnodeFreeClient:
    """
    Glassnode public / free-tier API client.

    FREE metrics (daily resolution, no API key required):
      - market/price_usd_close
      - addresses/active_count
      - mining/hash_rate_mean

    PAID metrics (require Glassnode API key + subscription):
      - indicators/mvrv_z_score
      - indicators/nupl
      - indicators/rhodl_ratio
      - indicators/puell_multiple
      - transactions/transfers_volume_exchanges_net
      - distribution/exchange_net_position_change
      (See GlassnodePaidClient below for these.)
    """

    BASE = "https://api.glassnode.com/v1/metrics"

    # Metrics confirmed available on the free tier
    FREE_METRICS = [
        "market/price_usd_close",
        "addresses/active_count",
        "mining/hash_rate_mean",
    ]

    def fetch_metric(self, metric: str, asset: str = "BTC",
                     since: str = None, until: str = None,
                     use_cache: bool = True) -> Optional[pd.DataFrame]:
        """
        Fetch a single Glassnode metric.

        Parameters
        ----------
        metric : str
            Metric path, e.g. "addresses/active_count"
        asset : str
            Asset symbol (default "BTC")
        since : str
            ISO date string for start (optional)
        until : str
            ISO date string for end (optional)

        Returns
        -------
        DataFrame with columns: [timestamp, value]
        """
        cache_key = f"glassnode_free_{asset}_{metric.replace('/', '_')}"
        if use_cache:
            cached = _read_cache(cache_key)
            if cached is not None:
                logger.info("Cache hit: %s", cache_key)
                return pd.DataFrame(cached)

        params = {"a": asset, "i": "24h"}  # daily resolution
        if since:
            params["s"] = int(datetime.fromisoformat(since).timestamp())
        if until:
            params["u"] = int(datetime.fromisoformat(until).timestamp())

        # Glassnode free tier does not require an API key for these endpoints
        # but if one is configured, include it for higher rate limits
        api_key = GLASSNODE_API_KEY
        if api_key:
            params["api_key"] = api_key

        resp = _safe_get(f"{self.BASE}/{metric}", params=params)
        if resp is None:
            return None

        data = resp.json()
        if not data or not isinstance(data, list):
            logger.warning("Glassnode returned empty data for %s", metric)
            return None

        df = pd.DataFrame(data)
        df["timestamp"] = pd.to_datetime(df["t"], unit="s", utc=True)
        df = df.rename(columns={"v": "value"}).drop(columns=["t"], errors="ignore")
        df = df[["timestamp", "value"]].set_index("timestamp").sort_index()

        if use_cache:
            _write_cache(cache_key, df.reset_index().to_dict(orient="records"))

        return df

    def fetch_active_addresses(self, asset: str = "BTC") -> Optional[pd.DataFrame]:
        """Daily active addresses."""
        return self.fetch_metric("addresses/active_count", asset)

    def fetch_price(self, asset: str = "BTC") -> Optional[pd.DataFrame]:
        """Daily close price (USD)."""
        return self.fetch_metric("market/price_usd_close", asset)

    def fetch_hash_rate(self, asset: str = "BTC") -> Optional[pd.DataFrame]:
        """Mean hash rate."""
        return self.fetch_metric("mining/hash_rate_mean", asset)

    def fetch_all_free(self, asset: str = "BTC") -> dict:
        """Fetch all free-tier metrics. Returns dict of DataFrames."""
        results = {}
        for metric in self.FREE_METRICS:
            logger.info("[Glassnode Free] Fetching %s for %s ...", metric, asset)
            df = self.fetch_metric(metric, asset)
            if df is not None:
                results[metric] = df
            time.sleep(1.0)
        return results


class CoinGlassClient:
    """
    CoinGlass public / free-tier data.

    Public endpoints (some may require a free API key):
      - Liquidation data
      - Long/short ratio
      - Open interest

    If COINGLASS_API_KEY is set, it is included in the request header.
    Without a key, many endpoints return 403. This client handles that
    gracefully and returns None.
    """

    BASE = "https://open-api.coinglass.com/public/v2"

    def _headers(self) -> dict:
        headers = {"accept": "application/json"}
        if COINGLASS_API_KEY:
            headers["coinglassSecret"] = COINGLASS_API_KEY
        return headers

    def _fetch(self, endpoint: str, params: dict = None,
               use_cache: bool = True) -> Optional[dict]:
        """Generic fetcher for CoinGlass endpoints."""
        cache_key = f"coinglass_{endpoint.replace('/', '_')}"
        if use_cache:
            cached = _read_cache(cache_key)
            if cached is not None:
                logger.info("Cache hit: %s", cache_key)
                return cached

        resp = _safe_get(
            f"{self.BASE}/{endpoint}",
            params=params,
            headers=self._headers(),
        )
        if resp is None:
            return None

        data = resp.json()
        if data.get("code") != "0" and data.get("success") is not True:
            logger.warning(
                "CoinGlass %s returned code=%s msg=%s (API key may be required)",
                endpoint, data.get("code"), data.get("msg"),
            )
            return None

        result = data.get("data")
        if use_cache and result is not None:
            _write_cache(cache_key, result)
        return result

    def fetch_liquidations(self, symbol: str = "BTC",
                           time_type: int = 2) -> Optional[dict]:
        """
        Fetch liquidation data.

        time_type: 1 = 1h, 2 = 4h, 3 = 12h, 4 = 24h
        Returns dict with long/short liquidation volumes.
        Note: Requires CoinGlass API key (free tier available at coinglass.com).
        """
        return self._fetch("liquidation_chart", params={
            "symbol": symbol, "time_type": time_type,
        })

    def fetch_long_short_ratio(self, symbol: str = "BTC",
                               time_type: int = 2) -> Optional[dict]:
        """
        Global long/short ratio.
        Note: Requires CoinGlass API key.
        """
        return self._fetch("long_short", params={
            "symbol": symbol, "time_type": time_type,
        })

    def fetch_open_interest(self, symbol: str = "BTC",
                            time_type: int = 2) -> Optional[dict]:
        """
        Aggregated open interest across exchanges.
        Note: Requires CoinGlass API key.
        """
        return self._fetch("open_interest", params={
            "symbol": symbol, "time_type": time_type,
        })


# ===================================================================
# TIER 2 - PAID SOURCES (full interfaces, graceful degradation)
# ===================================================================


class CryptoQuantClient:
    """
    CryptoQuant API client (PAID - requires API key).

    Available metrics with a CryptoQuant subscription:
      - Exchange netflow (BTC flowing in/out of exchanges)
      - Fund flow ratio
      - Miner outflow
      - MVRV ratio
      - Exchange reserve

    Base URL: https://api.cryptoquant.com/v1/
    Auth: API key in "Authorization: Bearer <key>" header.

    If CRYPTOQUANT_API_KEY is not set, all methods log a warning and
    return None. No placeholder/mock data is injected.
    """

    BASE = "https://api.cryptoquant.com/v1"

    def __init__(self):
        self.api_key = CRYPTOQUANT_API_KEY
        if not self.api_key:
            logger.warning(
                "[CryptoQuant] No API key configured. Set CRYPTOQUANT_API_KEY "
                "in your .env file. All CryptoQuant calls will return None. "
                "Get a key at https://cryptoquant.com/"
            )

    def _headers(self) -> dict:
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

    def _fetch(self, path: str, params: dict = None,
               use_cache: bool = True) -> Optional[pd.DataFrame]:
        """
        Generic fetcher for CryptoQuant endpoints.
        Returns a DataFrame or None if the API key is missing or the call fails.
        """
        if not self.api_key:
            return None

        cache_key = f"cryptoquant_{path.replace('/', '_')}"
        if use_cache:
            cached = _read_cache(cache_key)
            if cached is not None:
                logger.info("Cache hit: %s", cache_key)
                return pd.DataFrame(cached)

        resp = _safe_get(
            f"{self.BASE}/{path}",
            params=params,
            headers=self._headers(),
        )
        if resp is None:
            return None

        data = resp.json()
        result = data.get("result", {}).get("data", [])
        if not result:
            logger.warning("CryptoQuant returned empty data for %s", path)
            return None

        df = pd.DataFrame(result)
        if "datetime" in df.columns:
            df["timestamp"] = pd.to_datetime(df["datetime"], utc=True)
            df = df.set_index("timestamp").sort_index()

        if use_cache:
            _write_cache(cache_key, df.reset_index().to_dict(orient="records"))

        return df

    def fetch_exchange_netflow(self, asset: str = "btc",
                               window: str = "day") -> Optional[pd.DataFrame]:
        """
        Exchange net inflow/outflow.
        Positive = net inflow (bearish signal), Negative = net outflow (bullish).
        """
        return self._fetch(
            f"btc/exchange-flows/netflow",
            params={"window": window, "limit": 365},
        )

    def fetch_fund_flow_ratio(self, asset: str = "btc") -> Optional[pd.DataFrame]:
        """
        Fund flow ratio = exchange inflow / total on-chain volume.
        High values indicate selling pressure.
        """
        return self._fetch(
            f"btc/exchange-flows/fund-flow-ratio",
            params={"window": "day", "limit": 365},
        )

    def fetch_miner_outflow(self, asset: str = "btc") -> Optional[pd.DataFrame]:
        """
        Miner outflow to exchanges. Spikes may indicate selling pressure.
        """
        return self._fetch(
            f"btc/miner-flows/outflow",
            params={"window": "day", "limit": 365},
        )

    def fetch_mvrv_ratio(self, asset: str = "btc") -> Optional[pd.DataFrame]:
        """
        Market Value to Realized Value ratio.
        > 3.5 historically signals overvaluation; < 1 signals undervaluation.
        """
        return self._fetch(
            f"btc/market-indicator/mvrv",
            params={"window": "day", "limit": 365},
        )

    def fetch_exchange_reserve(self, asset: str = "btc") -> Optional[pd.DataFrame]:
        """
        Total BTC held on exchange wallets.
        Declining reserves are considered bullish (supply squeeze).
        """
        return self._fetch(
            f"btc/exchange-flows/reserve",
            params={"window": "day", "limit": 365},
        )


class GlassnodePaidClient:
    """
    Glassnode Pro/Advanced API client (PAID - requires API key).

    Advanced metrics available with a Glassnode subscription:
      - MVRV Z-Score          : indicators/mvrv_z_score
      - NUPL                  : indicators/nupl
      - RHODL Ratio           : indicators/rhodl_ratio
      - Puell Multiple        : indicators/puell_multiple
      - Exchange Net Flows    : transactions/transfers_volume_exchanges_net
      - Exchange Net Position : distribution/exchange_net_position_change
      - Realized Price        : market/price_realized_usd
      - Supply in Profit      : supply/profit_relative

    Auth: api_key query parameter.

    If GLASSNODE_API_KEY is not set, all methods log a warning and return None.
    """

    BASE = "https://api.glassnode.com/v1/metrics"

    PAID_METRICS = {
        "mvrv_z_score":        "indicators/mvrv_z_score",
        "nupl":                "indicators/nupl",
        "rhodl_ratio":         "indicators/rhodl_ratio",
        "puell_multiple":      "indicators/puell_multiple",
        "exchange_net_flows":  "transactions/transfers_volume_exchanges_net",
        "exchange_net_position": "distribution/exchange_net_position_change",
        "realized_price":      "market/price_realized_usd",
        "supply_in_profit":    "supply/profit_relative",
    }

    def __init__(self):
        self.api_key = GLASSNODE_API_KEY
        if not self.api_key:
            logger.warning(
                "[Glassnode Paid] No API key configured. Set GLASSNODE_API_KEY "
                "in your .env file. All paid Glassnode calls will return None. "
                "Get a key at https://studio.glassnode.com/"
            )

    def _fetch(self, metric_path: str, asset: str = "BTC",
               resolution: str = "24h",
               use_cache: bool = True) -> Optional[pd.DataFrame]:
        """
        Fetch a paid Glassnode metric.
        Returns DataFrame with [timestamp, value] or None.
        """
        if not self.api_key:
            return None

        cache_key = f"glassnode_paid_{asset}_{metric_path.replace('/', '_')}"
        if use_cache:
            cached = _read_cache(cache_key)
            if cached is not None:
                logger.info("Cache hit: %s", cache_key)
                return pd.DataFrame(cached)

        params = {
            "a": asset,
            "i": resolution,
            "api_key": self.api_key,
        }

        resp = _safe_get(f"{self.BASE}/{metric_path}", params=params)
        if resp is None:
            return None

        data = resp.json()
        if not data or not isinstance(data, list):
            logger.warning("Glassnode paid returned empty data for %s", metric_path)
            return None

        df = pd.DataFrame(data)
        if "t" in df.columns:
            df["timestamp"] = pd.to_datetime(df["t"], unit="s", utc=True)
            df = df.rename(columns={"v": "value"}).drop(columns=["t"], errors="ignore")
        df = df.set_index("timestamp").sort_index()

        if use_cache:
            _write_cache(cache_key, df.reset_index().to_dict(orient="records"))

        return df

    def fetch_mvrv_z_score(self, asset: str = "BTC") -> Optional[pd.DataFrame]:
        """
        MVRV Z-Score: how far market value deviates from realized value.
        > 7 historically signals cycle top; < 0 signals cycle bottom.
        """
        return self._fetch(self.PAID_METRICS["mvrv_z_score"], asset)

    def fetch_nupl(self, asset: str = "BTC") -> Optional[pd.DataFrame]:
        """
        Net Unrealized Profit/Loss.
        Ranges from -1 to 1. Above 0.75 = euphoria, below 0 = capitulation.
        """
        return self._fetch(self.PAID_METRICS["nupl"], asset)

    def fetch_rhodl_ratio(self, asset: str = "BTC") -> Optional[pd.DataFrame]:
        """
        RHODL Ratio: ratio of 1-week to 1-2 year realized cap HODL bands.
        High values indicate overheating market.
        """
        return self._fetch(self.PAID_METRICS["rhodl_ratio"], asset)

    def fetch_puell_multiple(self, asset: str = "BTC") -> Optional[pd.DataFrame]:
        """
        Puell Multiple: daily miner revenue / 365-day MA of miner revenue.
        > 4 historically signals top; < 0.5 signals bottom.
        """
        return self._fetch(self.PAID_METRICS["puell_multiple"], asset)

    def fetch_exchange_net_flows(self, asset: str = "BTC") -> Optional[pd.DataFrame]:
        """Net exchange inflow/outflow volume."""
        return self._fetch(self.PAID_METRICS["exchange_net_flows"], asset)

    def fetch_exchange_net_position(self, asset: str = "BTC") -> Optional[pd.DataFrame]:
        """Exchange net position change (30d rolling)."""
        return self._fetch(self.PAID_METRICS["exchange_net_position"], asset)

    def fetch_all_paid(self, asset: str = "BTC") -> dict:
        """Fetch all paid metrics. Returns dict of DataFrames (None values filtered)."""
        if not self.api_key:
            logger.warning("[Glassnode Paid] Skipping all paid metrics (no API key)")
            return {}
        results = {}
        for name, path in self.PAID_METRICS.items():
            logger.info("[Glassnode Paid] Fetching %s for %s ...", name, asset)
            df = self._fetch(path, asset)
            if df is not None:
                results[name] = df
            time.sleep(1.0)
        return results


# ===================================================================
# Unified aggregator
# ===================================================================


class OnChainAggregator:
    """
    Unified interface that collects metrics from all on-chain sources.

    Handles graceful degradation: free sources are always attempted,
    paid sources silently return empty when API keys are absent.
    """

    def __init__(self):
        self.blockchain = BlockchainComClient()
        self.fear_greed = FearGreedClient()
        self.glassnode_free = GlassnodeFreeClient()
        self.coinglass = CoinGlassClient()
        self.cryptoquant = CryptoQuantClient()
        self.glassnode_paid = GlassnodePaidClient()

    def fetch_free_metrics(self, asset: str = "BTC") -> dict:
        """
        Fetch all free-tier on-chain metrics.

        Returns
        -------
        dict with keys:
            "blockchain_com" : dict of DataFrames
            "fear_greed"     : DataFrame
            "glassnode_free" : dict of DataFrames
            "coinglass"      : dict of raw dicts (liquidations, L/S ratio)
        """
        results = {}

        logger.info("--- Blockchain.com metrics ---")
        results["blockchain_com"] = self.blockchain.fetch_all()

        logger.info("--- Fear & Greed Index ---")
        results["fear_greed"] = self.fear_greed.fetch()

        logger.info("--- Glassnode Free Tier ---")
        results["glassnode_free"] = self.glassnode_free.fetch_all_free(asset)

        logger.info("--- CoinGlass (may need API key) ---")
        cg = {}
        liq = self.coinglass.fetch_liquidations(asset)
        if liq is not None:
            cg["liquidations"] = liq
        ls = self.coinglass.fetch_long_short_ratio(asset)
        if ls is not None:
            cg["long_short_ratio"] = ls
        oi = self.coinglass.fetch_open_interest(asset)
        if oi is not None:
            cg["open_interest"] = oi
        results["coinglass"] = cg

        return results

    def fetch_paid_metrics(self, asset: str = "BTC") -> dict:
        """
        Fetch all paid-tier on-chain metrics.
        Returns empty dicts for sources without configured API keys.
        """
        results = {}

        logger.info("--- CryptoQuant (paid) ---")
        cq = {}
        for method_name in [
            "fetch_exchange_netflow", "fetch_fund_flow_ratio",
            "fetch_miner_outflow", "fetch_mvrv_ratio", "fetch_exchange_reserve",
        ]:
            method = getattr(self.cryptoquant, method_name)
            df = method()
            if df is not None:
                key = method_name.replace("fetch_", "")
                cq[key] = df
        results["cryptoquant"] = cq

        logger.info("--- Glassnode Paid ---")
        results["glassnode_paid"] = self.glassnode_paid.fetch_all_paid(asset)

        return results

    def fetch_all(self, asset: str = "BTC") -> dict:
        """Fetch both free and paid metrics."""
        free = self.fetch_free_metrics(asset)
        paid = self.fetch_paid_metrics(asset)
        return {**free, **paid}

    def summary(self) -> dict:
        """
        Return a summary of available data sources and their status.
        """
        return {
            "free_sources": {
                "blockchain_com": {
                    "status": "available",
                    "metrics": list(BlockchainComClient.CHART_DEFAULTS.keys()),
                    "auth": "none required",
                },
                "fear_greed": {
                    "status": "available",
                    "metrics": ["fear_greed_index"],
                    "auth": "none required",
                },
                "glassnode_free": {
                    "status": "available",
                    "metrics": GlassnodeFreeClient.FREE_METRICS,
                    "auth": "none required (key optional for rate limits)",
                },
                "coinglass": {
                    "status": "available" if COINGLASS_API_KEY else "limited (no API key)",
                    "metrics": ["liquidations", "long_short_ratio", "open_interest"],
                    "auth": "API key recommended (free tier at coinglass.com)",
                },
            },
            "paid_sources": {
                "cryptoquant": {
                    "status": "configured" if CRYPTOQUANT_API_KEY else "not configured",
                    "metrics": [
                        "exchange_netflow", "fund_flow_ratio",
                        "miner_outflow", "mvrv_ratio", "exchange_reserve",
                    ],
                    "auth": "API key required (cryptoquant.com)",
                },
                "glassnode_paid": {
                    "status": "configured" if GLASSNODE_API_KEY else "not configured",
                    "metrics": list(GlassnodePaidClient.PAID_METRICS.keys()),
                    "auth": "API key required (studio.glassnode.com)",
                },
            },
        }


# ===================================================================
# CLI entry point
# ===================================================================

def _print_section(title: str) -> None:
    print(f"\n{'=' * 60}")
    print(f"  {title}")
    print(f"{'=' * 60}")


def main():
    """CLI entry point: show available sources and optionally fetch data."""
    import argparse

    parser = argparse.ArgumentParser(
        description="Advanced On-Chain Metrics for Crypto Radar",
    )
    parser.add_argument(
        "--fetch", action="store_true",
        help="Fetch data from all available sources",
    )
    parser.add_argument(
        "--free-only", action="store_true",
        help="Only fetch from free sources",
    )
    parser.add_argument(
        "--asset", default="BTC",
        help="Asset to fetch metrics for (default: BTC)",
    )
    parser.add_argument(
        "--no-cache", action="store_true",
        help="Bypass local cache",
    )
    args = parser.parse_args()

    aggregator = OnChainAggregator()

    # Always show source summary
    _print_section("ON-CHAIN DATA SOURCE STATUS")
    summary = aggregator.summary()

    print("\n  FREE SOURCES:")
    for name, info in summary["free_sources"].items():
        status = info["status"]
        n_metrics = len(info["metrics"])
        print(f"    {name:20s} [{status}] - {n_metrics} metrics")

    print("\n  PAID SOURCES:")
    for name, info in summary["paid_sources"].items():
        status = info["status"]
        n_metrics = len(info["metrics"])
        print(f"    {name:20s} [{status}] - {n_metrics} metrics")

    if not args.fetch:
        print("\n  Run with --fetch to pull data from available sources.")
        print(f"  Cache directory: {CACHE_DIR}")
        print(f"  Cache TTL: {ON_CHAIN_CACHE_HOURS} hours")
        return

    # Fetch data
    _print_section(f"FETCHING ON-CHAIN DATA ({args.asset})")

    if args.free_only:
        results = aggregator.fetch_free_metrics(args.asset)
    else:
        results = aggregator.fetch_all(args.asset)

    # Display results
    _print_section("RESULTS")

    for source_name, source_data in results.items():
        if source_data is None:
            print(f"\n  {source_name}: no data")
            continue

        if isinstance(source_data, pd.DataFrame):
            print(f"\n  {source_name}: {len(source_data)} rows")
            if not source_data.empty:
                print(f"    Latest: {source_data.iloc[-1].to_dict()}")

        elif isinstance(source_data, dict):
            print(f"\n  {source_name}: {len(source_data)} metrics")
            for metric_name, metric_data in source_data.items():
                if isinstance(metric_data, pd.DataFrame):
                    print(f"    {metric_name}: {len(metric_data)} rows", end="")
                    if not metric_data.empty:
                        latest = metric_data.iloc[-1]
                        if "value" in metric_data.columns:
                            print(f" (latest: {latest['value']})", end="")
                    print()
                else:
                    print(f"    {metric_name}: {type(metric_data).__name__}")

    print(f"\n  Cache directory: {CACHE_DIR}")
    print("  Done.")


if __name__ == "__main__":
    main()
