"""
Section 3 Implementation: Feature Engineering

Computes technical indicators (MACD, RSI, Bollinger Bands, EMA)
and merges them with on-chain and sentiment features into a
unified feature matrix for the fusion model.
"""

import numpy as np
import pandas as pd


class TechnicalFeatures:
    """Standard technical indicator computation."""

    @staticmethod
    def ema(series: pd.Series, span: int) -> pd.Series:
        """Exponential Moving Average."""
        return series.ewm(span=span, adjust=False).mean()

    @staticmethod
    def sma(series: pd.Series, window: int) -> pd.Series:
        """Simple Moving Average."""
        return series.rolling(window=window, min_periods=1).mean()

    @staticmethod
    def macd(close: pd.Series, fast: int = 12, slow: int = 26, signal: int = 9) -> pd.DataFrame:
        """
        MACD = EMA_12(P) - EMA_26(P)
        Signal = EMA_9(MACD)
        Histogram = MACD - Signal
        """
        ema_fast = close.ewm(span=fast, adjust=False).mean()
        ema_slow = close.ewm(span=slow, adjust=False).mean()
        macd_line = ema_fast - ema_slow
        signal_line = macd_line.ewm(span=signal, adjust=False).mean()
        histogram = macd_line - signal_line
        return pd.DataFrame({
            "macd": macd_line,
            "macd_signal": signal_line,
            "macd_hist": histogram
        })

    @staticmethod
    def rsi(close: pd.Series, period: int = 14) -> pd.Series:
        """
        RSI = 100 - 100 / (1 + RS)
        Uses Wilder's smoothing (exponential moving average of gains/losses).
        """
        delta = close.diff()
        gain = delta.where(delta > 0, 0.0)
        loss = -delta.where(delta < 0, 0.0)

        # Wilder's smoothing
        avg_gain = gain.ewm(alpha=1/period, min_periods=period, adjust=False).mean()
        avg_loss = loss.ewm(alpha=1/period, min_periods=period, adjust=False).mean()

        rs = avg_gain / avg_loss.replace(0, np.inf)
        return 100 - (100 / (1 + rs))

    @staticmethod
    def bollinger_bands(close: pd.Series, window: int = 20,
                        num_std: float = 2.0) -> pd.DataFrame:
        """Bollinger Bands: Middle, Upper, Lower, %B, Bandwidth."""
        middle = close.rolling(window=window, min_periods=1).mean()
        std = close.rolling(window=window, min_periods=1).std()
        upper = middle + num_std * std
        lower = middle - num_std * std
        pct_b = (close - lower) / (upper - lower).replace(0, 1)
        bandwidth = (upper - lower) / middle.replace(0, 1)
        return pd.DataFrame({
            "bb_middle": middle,
            "bb_upper": upper,
            "bb_lower": lower,
            "bb_pct_b": pct_b,
            "bb_bandwidth": bandwidth
        })

    @staticmethod
    def atr(high: pd.Series, low: pd.Series, close: pd.Series,
            period: int = 14) -> pd.Series:
        """Average True Range for volatility and trailing stops."""
        tr1 = high - low
        tr2 = (high - close.shift(1)).abs()
        tr3 = (low - close.shift(1)).abs()
        tr = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)
        return tr.rolling(window=period, min_periods=1).mean()

    @staticmethod
    def obv(close: pd.Series, volume: pd.Series) -> pd.Series:
        """On-Balance Volume — accumulates volume based on price direction."""
        direction = np.sign(close.diff()).fillna(0)
        return (volume * direction).cumsum()

    @staticmethod
    def volume_profile(volume: pd.Series, window: int = 20) -> pd.DataFrame:
        """Volume relative to its moving average."""
        vol_ma = volume.rolling(window=window, min_periods=1).mean()
        return pd.DataFrame({
            "vol_ratio": volume / vol_ma.replace(0, 1),
            "vol_ma": vol_ma
        })


class FeatureBuilder:
    """
    Builds the complete feature matrix by computing all technical
    indicators and merging with external features (sentiment, on-chain).
    """

    def __init__(self):
        self.tech = TechnicalFeatures()

    def build_technical_features(self, ohlcv: pd.DataFrame) -> pd.DataFrame:
        """
        Compute all technical features from OHLCV data.
        Input columns: open, high, low, close, volume
        """
        df = ohlcv.copy()

        # Trend indicators
        macd_df = self.tech.macd(df["close"])
        df = df.join(macd_df)

        # Momentum
        df["rsi"] = self.tech.rsi(df["close"])
        df["rsi_z"] = (df["rsi"] - 50) / 25  # Normalize RSI around 0

        # Volatility
        bb_df = self.tech.bollinger_bands(df["close"])
        df = df.join(bb_df)
        df["atr"] = self.tech.atr(df["high"], df["low"], df["close"])

        # Volume
        df["obv"] = self.tech.obv(df["close"], df["volume"])
        vol_df = self.tech.volume_profile(df["volume"])
        df = df.join(vol_df)

        # Moving averages
        df["ema_9"] = self.tech.ema(df["close"], 9)
        df["ema_21"] = self.tech.ema(df["close"], 21)
        df["sma_50"] = self.tech.sma(df["close"], 50)
        df["sma_200"] = self.tech.sma(df["close"], 200)

        # Cross signals (as features, not trading rules)
        df["ema_cross"] = (df["ema_9"] - df["ema_21"]) / df["close"]
        df["golden_cross"] = (df["sma_50"] - df["sma_200"]) / df["close"]

        # Price position relative to key levels
        df["price_vs_sma50"] = (df["close"] - df["sma_50"]) / df["close"]
        df["price_vs_sma200"] = (df["close"] - df["sma_200"]) / df["close"]

        # Log returns (stationarity)
        df["log_return"] = np.log(df["close"] / df["close"].shift(1))

        # Realized volatility (rolling)
        df["realized_vol_7d"] = df["log_return"].rolling(7).std() * np.sqrt(365)
        df["realized_vol_30d"] = df["log_return"].rolling(30).std() * np.sqrt(365)

        return df.dropna()

    def merge_sentiment(self, features_df: pd.DataFrame,
                        sentiment_df: pd.DataFrame) -> pd.DataFrame:
        """
        Merge daily aggregated sentiment scores into the feature matrix.
        Sentiment columns: positive, negative, neutral, composite
        """
        if sentiment_df is None or sentiment_df.empty:
            features_df["sent_positive"] = 0.5
            features_df["sent_negative"] = 0.2
            features_df["sent_neutral"] = 0.3
            features_df["sent_composite"] = 0.0
            return features_df

        # Aggregate sentiment by date
        sentiment_df["date"] = pd.to_datetime(sentiment_df["timestamp"]).dt.date
        daily_sent = sentiment_df.groupby("date").agg({
            "positive": "mean",
            "negative": "mean",
            "neutral": "mean"
        }).rename(columns={
            "positive": "sent_positive",
            "negative": "sent_negative",
            "neutral": "sent_neutral"
        })
        daily_sent["sent_composite"] = daily_sent["sent_positive"] - daily_sent["sent_negative"]

        # Merge on date
        features_df["date"] = features_df.index.date
        merged = features_df.merge(daily_sent, left_on="date", right_index=True, how="left")
        merged = merged.drop(columns=["date"])

        # Forward-fill missing sentiment (weekends, gaps)
        for col in ["sent_positive", "sent_negative", "sent_neutral", "sent_composite"]:
            merged[col] = merged[col].ffill().fillna(0)

        merged.index = features_df.index
        return merged

    def merge_onchain(self, features_df: pd.DataFrame,
                      onchain_dict: dict) -> pd.DataFrame:
        """
        Add on-chain metrics as static features (latest snapshot).
        For a production system, this would be time-series joined.
        """
        for key in ["mempool_count", "fee_fast", "fee_medium",
                     "hashrate_eh", "fear_greed_value"]:
            features_df[f"onchain_{key}"] = onchain_dict.get(key, 0)
        return features_df

    def get_feature_columns(self) -> list:
        """Return the list of feature columns used for model input."""
        return [
            # Technical
            "log_return", "macd", "macd_signal", "macd_hist",
            "rsi", "rsi_z", "bb_pct_b", "bb_bandwidth", "atr",
            "vol_ratio", "ema_cross", "golden_cross",
            "price_vs_sma50", "price_vs_sma200",
            "realized_vol_7d", "realized_vol_30d",
            # Sentiment
            "sent_positive", "sent_negative", "sent_neutral", "sent_composite",
            # On-chain
            "onchain_mempool_count", "onchain_fee_fast",
            "onchain_hashrate_eh", "onchain_fear_greed_value"
        ]


# --- CLI Entry Point ---
if __name__ == "__main__":
    from data_ingestion import MarketDataIngestor, OnChainIngestor

    print("=" * 60)
    print("CRYPTO RADAR - Feature Engineering")
    print("=" * 60)

    # Fetch data
    market = MarketDataIngestor()
    btc = market.fetch_ohlcv("BTC", days=365)

    onchain = OnChainIngestor()
    btc_onchain = onchain.fetch_btc_onchain()
    fear_greed = onchain.fetch_fear_greed()
    btc_onchain.update(fear_greed)

    # Build features
    builder = FeatureBuilder()
    features = builder.build_technical_features(btc)
    features = builder.merge_onchain(features, btc_onchain)

    print(f"\nFeature matrix shape: {features.shape}")
    print(f"Feature columns ({len(builder.get_feature_columns())}):")
    for col in builder.get_feature_columns():
        if col in features.columns:
            print(f"  {col}: {features[col].iloc[-1]:.4f}")

    print(f"\nLast 5 rows:")
    print(features[builder.get_feature_columns()].tail())
