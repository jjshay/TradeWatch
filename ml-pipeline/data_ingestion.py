"""
Section 2 Implementation: Data Acquisition & Preprocessing

Handles ingestion from three modalities:
  1. Market Data (OHLCV) via CoinGecko/Binance
  2. On-Chain Heuristics via mempool.space / public APIs
  3. Macro Indicators via FRED-compatible sources

Applies log-returns transformation and Z-score normalization
to achieve covariance stationarity for neural network input.
"""

import numpy as np
import pandas as pd
import requests
import time
import os
from datetime import datetime, timezone
from config import DATA_DIR, SEQUENCE_LENGTH, TRACKED_ASSETS


class MarketDataIngestor:
    """Fetch OHLCV data from CoinGecko (free, no API key required)."""

    COINGECKO_BASE = "https://api.coingecko.com/api/v3"

    # CoinGecko ID mapping
    ASSET_MAP = {
        "BTC": "bitcoin", "ETH": "ethereum", "SOL": "solana",
        "BNB": "binancecoin", "XRP": "ripple", "LINK": "chainlink",
        "AVAX": "avalanche-2", "ADA": "cardano", "DOT": "polkadot",
        "MATIC": "matic-network", "RNDR": "render-token", "FET": "fetch-ai",
        "TAO": "bittensor", "NEAR": "near", "KAS": "kaspa",
        "AAVE": "aave", "UNI": "uniswap", "MKR": "maker",
        "DOGE": "dogecoin", "LTC": "litecoin"
    }

    def fetch_ohlcv(self, symbol: str, days: int = 365) -> pd.DataFrame:
        """
        Fetch OHLCV data for a given asset.
        Returns DataFrame with columns: timestamp, open, high, low, close, volume
        """
        coin_id = self.ASSET_MAP.get(symbol, symbol.lower())
        url = f"{self.COINGECKO_BASE}/coins/{coin_id}/ohlc"
        params = {"vs_currency": "usd", "days": days}

        resp = requests.get(url, params=params, timeout=30)
        resp.raise_for_status()
        data = resp.json()

        df = pd.DataFrame(data, columns=["timestamp", "open", "high", "low", "close"])
        df["timestamp"] = pd.to_datetime(df["timestamp"], unit="ms", utc=True)
        df = df.set_index("timestamp").sort_index()

        # Volume from market_chart endpoint
        vol_url = f"{self.COINGECKO_BASE}/coins/{coin_id}/market_chart"
        vol_resp = requests.get(vol_url, params={"vs_currency": "usd", "days": days}, timeout=30)
        if vol_resp.status_code == 200:
            vol_data = vol_resp.json().get("total_volumes", [])
            vol_df = pd.DataFrame(vol_data, columns=["timestamp", "volume"])
            vol_df["timestamp"] = pd.to_datetime(vol_df["timestamp"], unit="ms", utc=True)
            vol_df = vol_df.set_index("timestamp")
            df = df.join(vol_df, how="left")
            df["volume"] = df["volume"].fillna(0)
        else:
            df["volume"] = 0

        return df

    def fetch_multiple(self, symbols: list = None, days: int = 365) -> dict:
        """Fetch OHLCV for multiple assets with rate limiting."""
        symbols = symbols or TRACKED_ASSETS[:5]  # Default to top 5
        results = {}
        for sym in symbols:
            print(f"[MarketData] Fetching {sym}...")
            try:
                results[sym] = self.fetch_ohlcv(sym, days)
                time.sleep(1.5)  # CoinGecko rate limit
            except Exception as e:
                print(f"  [WARN] Failed {sym}: {e}")
        return results


class OnChainIngestor:
    """Fetch on-chain metrics from mempool.space and public APIs."""

    def fetch_btc_onchain(self) -> dict:
        """
        Fetch Bitcoin on-chain heuristics:
        - Mempool size, fee rates, difficulty, hashrate
        """
        metrics = {}
        try:
            # Mempool stats
            resp = requests.get("https://mempool.space/api/mempool", timeout=10)
            if resp.status_code == 200:
                data = resp.json()
                metrics["mempool_count"] = data.get("count", 0)
                metrics["mempool_vsize"] = data.get("vsize", 0)

            # Fee estimates
            resp = requests.get("https://mempool.space/api/v1/fees/recommended", timeout=10)
            if resp.status_code == 200:
                fees = resp.json()
                metrics["fee_fast"] = fees.get("fastestFee", 0)
                metrics["fee_medium"] = fees.get("halfHourFee", 0)
                metrics["fee_slow"] = fees.get("hourFee", 0)

            # Hashrate & difficulty
            resp = requests.get("https://mempool.space/api/v1/mining/hashrate/1m", timeout=10)
            if resp.status_code == 200:
                hr_data = resp.json()
                if hr_data.get("hashrates"):
                    latest = hr_data["hashrates"][-1]
                    metrics["hashrate_eh"] = round(latest.get("avgHashrate", 0) / 1e18, 2)
                if hr_data.get("difficulty"):
                    latest_diff = hr_data["difficulty"][-1]
                    metrics["difficulty"] = latest_diff.get("difficulty", 0)

        except Exception as e:
            print(f"[OnChain] Error fetching BTC metrics: {e}")

        metrics["timestamp"] = datetime.now(timezone.utc).isoformat()
        return metrics

    def fetch_fear_greed(self) -> dict:
        """Fetch Crypto Fear & Greed Index."""
        try:
            resp = requests.get("https://api.alternative.me/fng/?limit=1", timeout=10)
            if resp.status_code == 200:
                data = resp.json()["data"][0]
                return {
                    "fear_greed_value": int(data["value"]),
                    "fear_greed_label": data["value_classification"],
                    "timestamp": data["timestamp"]
                }
        except Exception as e:
            print(f"[OnChain] Fear & Greed error: {e}")
        return {"fear_greed_value": 50, "fear_greed_label": "Neutral"}


class Preprocessor:
    """
    Section 2.2: Preprocessing & Stationarity

    Applies log-returns and Z-score normalization to achieve
    covariance stationarity for neural network ingestion.
    """

    @staticmethod
    def log_returns(prices: pd.Series) -> pd.Series:
        """
        R_t = ln(P_t / P_{t-1})
        Converts non-stationary price series to stationary returns.
        """
        return np.log(prices / prices.shift(1)).dropna()

    @staticmethod
    def zscore_normalize(series: pd.Series, window: int = 30) -> pd.Series:
        """
        z_t = (x_t - mu_window) / sigma_window
        Rolling Z-score normalization to handle volatility regimes.
        """
        rolling_mean = series.rolling(window=window, min_periods=1).mean()
        rolling_std = series.rolling(window=window, min_periods=1).std().replace(0, 1)
        return (series - rolling_mean) / rolling_std

    @staticmethod
    def build_feature_matrix(ohlcv_df: pd.DataFrame, window: int = 30) -> pd.DataFrame:
        """
        Build the full preprocessed feature matrix from raw OHLCV data.
        Columns: log_return, z_close, z_volume, z_high_low_range, z_open_close_range
        """
        df = ohlcv_df.copy()

        # Log returns
        df["log_return"] = Preprocessor.log_returns(df["close"])

        # Z-score normalized features
        df["z_close"] = Preprocessor.zscore_normalize(df["close"], window)
        df["z_volume"] = Preprocessor.zscore_normalize(df["volume"], window)
        df["z_range"] = Preprocessor.zscore_normalize(df["high"] - df["low"], window)
        df["z_body"] = Preprocessor.zscore_normalize(df["close"] - df["open"], window)

        # Drop NaN rows from transformations
        df = df.dropna()

        return df

    @staticmethod
    def create_sequences(features: np.ndarray, targets: np.ndarray,
                         seq_length: int = SEQUENCE_LENGTH) -> tuple:
        """
        Create sliding window sequences for LSTM input.
        Returns: (X, y) where X has shape (samples, seq_length, n_features)
        """
        X, y = [], []
        for i in range(seq_length, len(features)):
            X.append(features[i - seq_length:i])
            y.append(targets[i])
        return np.array(X), np.array(y)


# --- CLI Entry Point ---
if __name__ == "__main__":
    print("=" * 60)
    print("CRYPTO RADAR - Data Ingestion & Preprocessing")
    print("=" * 60)

    # Fetch market data
    market = MarketDataIngestor()
    btc_df = market.fetch_ohlcv("BTC", days=365)
    print(f"\nBTC OHLCV: {len(btc_df)} rows, {btc_df.index[0]} to {btc_df.index[-1]}")
    print(btc_df.tail())

    # Preprocess
    prep = Preprocessor()
    features = prep.build_feature_matrix(btc_df)
    print(f"\nPreprocessed features: {features.shape}")
    print(features.tail())

    # On-chain
    onchain = OnChainIngestor()
    btc_metrics = onchain.fetch_btc_onchain()
    print(f"\nBTC On-Chain: {btc_metrics}")

    fg = onchain.fetch_fear_greed()
    print(f"Fear & Greed: {fg}")

    # Save
    os.makedirs(DATA_DIR, exist_ok=True)
    features.to_csv(os.path.join(DATA_DIR, "btc_features.csv"))
    print(f"\nSaved to {DATA_DIR}/btc_features.csv")
