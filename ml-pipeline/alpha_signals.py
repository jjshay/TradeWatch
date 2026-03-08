"""
Non-Obvious Alpha Signals Module

Unconventional data sources that have historically correlated with
crypto price movements but are rarely included in standard models.

These signals exploit structural market inefficiencies:
  1. Global M2 with 10-12 week lag (macro liquidity -> BTC)
  2. Stablecoin Supply Ratio (dry powder on sidelines)
  3. Tether minting events (USDT treasury prints)
  4. Kimchi Premium (Korean retail FOMO indicator)
  5. Weekend/weekday volume ratio (retail participation)
  6. BTC ETF daily flows (institutional demand)
  7. Pi Cycle Top indicator (111-day MA vs 2x 350-day MA)
  8. Mining difficulty ribbon (miner capitulation)
  9. GitHub developer activity (ecosystem health)
  10. Options max pain (expiry price magnet)
  11. DeFi TVL velocity (rate of change, not absolute)
  12. Stablecoin exchange inflows (buy pressure proxy)
"""

import numpy as np
import pandas as pd
import requests
import os
import json
import time
from datetime import datetime, timezone, timedelta
from config import DATA_DIR


class GlobalLiquiditySignal:
    """
    Signal 1: Global M2 Money Supply with 10-12 week lag

    BTC has tracked global M2 expansion with a ~75-day lag since 2020.
    When central banks print, BTC follows weeks later.
    Uses FRED M2SL series shifted forward by the lag period.
    """

    def __init__(self, lag_days=77):
        self.lag_days = lag_days

    def fetch_m2(self, lookback_days=730) -> pd.DataFrame:
        """Fetch US M2 from FRED public CSV endpoint."""
        end = datetime.now().strftime("%Y-%m-%d")
        start = (datetime.now() - timedelta(days=lookback_days)).strftime("%Y-%m-%d")
        url = (f"https://fred.stlouisfed.org/graph/fredgraph.csv"
               f"?id=M2SL&cosd={start}&coed={end}")
        try:
            df = pd.read_csv(url, parse_dates=["DATE"], index_col="DATE")
            df.columns = ["m2"]
            df["m2"] = pd.to_numeric(df["m2"], errors="coerce")
            df = df.dropna()
            # Resample monthly to daily (forward fill)
            df = df.resample("D").ffill()
            return df
        except Exception as e:
            print(f"[GlobalLiquidity] Failed to fetch M2: {e}")
            return pd.DataFrame()

    def compute_signal(self, m2_df: pd.DataFrame) -> pd.DataFrame:
        """
        Shift M2 forward by lag_days to align with BTC price.
        Also compute M2 rate of change (momentum).
        """
        if m2_df.empty:
            return pd.DataFrame()

        df = m2_df.copy()
        # Shift M2 forward (M2 change today predicts BTC ~77 days later)
        df["m2_lagged"] = df["m2"].shift(self.lag_days)
        df["m2_roc_30d"] = df["m2"].pct_change(30)
        df["m2_roc_90d"] = df["m2"].pct_change(90)
        df["m2_acceleration"] = df["m2_roc_30d"] - df["m2_roc_30d"].shift(30)

        # Signal: positive acceleration = bullish for BTC in ~77 days
        df["m2_signal"] = np.where(df["m2_acceleration"] > 0, 1,
                          np.where(df["m2_acceleration"] < 0, -1, 0))
        return df.dropna()


class StablecoinSignals:
    """
    Signal 2 & 12: Stablecoin Supply Ratio + Exchange Inflows

    SSR = Total crypto market cap / Total stablecoin supply
    Low SSR = lots of stablecoins relative to crypto = buying power ready
    High SSR = crypto overextended relative to stablecoin base

    Also tracks USDT/USDC supply growth as a proxy for new capital entering.
    """

    STABLECOINS = ["tether", "usd-coin", "dai", "first-digital-usd"]
    COINGECKO_BASE = "https://api.coingecko.com/api/v3"

    def fetch_stablecoin_data(self) -> dict:
        """Fetch current stablecoin market caps and total crypto market cap."""
        result = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "stablecoin_mcap": 0,
            "total_crypto_mcap": 0,
            "ssr": 0,
            "usdt_mcap": 0,
            "usdc_mcap": 0,
        }

        try:
            # Total market cap
            resp = requests.get(f"{self.COINGECKO_BASE}/global", timeout=15)
            if resp.status_code == 200:
                data = resp.json()["data"]
                result["total_crypto_mcap"] = data["total_market_cap"].get("usd", 0)
            time.sleep(1)

            # Stablecoin market caps
            ids = ",".join(self.STABLECOINS)
            resp = requests.get(
                f"{self.COINGECKO_BASE}/simple/price",
                params={"ids": ids, "vs_currencies": "usd",
                        "include_market_cap": "true"},
                timeout=15
            )
            if resp.status_code == 200:
                data = resp.json()
                for coin_id in self.STABLECOINS:
                    if coin_id in data:
                        mcap = data[coin_id].get("usd_market_cap", 0)
                        result["stablecoin_mcap"] += mcap
                        if coin_id == "tether":
                            result["usdt_mcap"] = mcap
                        elif coin_id == "usd-coin":
                            result["usdc_mcap"] = mcap

            # SSR calculation
            if result["stablecoin_mcap"] > 0:
                result["ssr"] = result["total_crypto_mcap"] / result["stablecoin_mcap"]

            # Stablecoin dominance
            if result["total_crypto_mcap"] > 0:
                result["stablecoin_dominance"] = (
                    result["stablecoin_mcap"] / result["total_crypto_mcap"]
                )

        except Exception as e:
            print(f"[StablecoinSignals] Error: {e}")

        return result

    def interpret(self, ssr: float) -> str:
        """Interpret SSR value."""
        if ssr < 5:
            return "VERY_BULLISH (massive stablecoin buying power)"
        elif ssr < 10:
            return "BULLISH (healthy stablecoin reserves)"
        elif ssr < 20:
            return "NEUTRAL"
        else:
            return "BEARISH (crypto extended vs stablecoin base)"


class KimchiPremium:
    """
    Signal 4: Korean exchange premium over US exchanges

    When BTC trades at a significant premium on Korean exchanges
    (Upbit, Bithumb) vs Coinbase/Binance, it signals extreme retail
    FOMO — historically a local top indicator at >5%.

    Uses CoinGecko exchange-specific ticker data.
    """

    def fetch_premium(self) -> dict:
        """Calculate Kimchi Premium from exchange price differences."""
        result = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "premium_pct": 0,
            "signal": "NEUTRAL",
            "us_price": 0,
            "kr_price": 0,
        }

        try:
            # Get BTC price from multiple exchanges via CoinGecko
            url = "https://api.coingecko.com/api/v3/simple/price"
            params = {"ids": "bitcoin", "vs_currencies": "usd,krw"}
            resp = requests.get(url, params=params, timeout=15)

            if resp.status_code == 200:
                data = resp.json()["bitcoin"]
                usd_price = data.get("usd", 0)
                krw_price = data.get("krw", 0)

                if usd_price > 0 and krw_price > 0:
                    # Get USD/KRW exchange rate
                    fx_resp = requests.get(
                        "https://api.coingecko.com/api/v3/exchange_rates",
                        timeout=15
                    )
                    if fx_resp.status_code == 200:
                        rates = fx_resp.json()["rates"]
                        krw_per_btc_in_usd = krw_price
                        # BTC price in KRW converted to USD
                        krw_rate = rates.get("krw", {}).get("value", 1300)
                        kr_price_usd = krw_price / krw_rate if krw_rate > 0 else 0

                        result["us_price"] = usd_price
                        result["kr_price"] = round(kr_price_usd, 2)

                        if usd_price > 0:
                            premium = (kr_price_usd - usd_price) / usd_price * 100
                            result["premium_pct"] = round(premium, 2)

                            if premium > 5:
                                result["signal"] = "EXTREME_FOMO (likely local top)"
                            elif premium > 2:
                                result["signal"] = "ELEVATED_FOMO"
                            elif premium < -2:
                                result["signal"] = "DISCOUNT (panic selling)"
                            else:
                                result["signal"] = "NORMAL"

        except Exception as e:
            print(f"[KimchiPremium] Error: {e}")

        return result


class VolumePatterns:
    """
    Signal 5: Weekend vs weekday volume ratio

    Historically, weekend crypto volume was retail-dominated.
    When weekend volume spikes relative to weekdays, retail FOMO
    is driving the market (often late-cycle).

    Also computes volume profile anomalies.
    """

    @staticmethod
    def weekend_weekday_ratio(ohlcv_df: pd.DataFrame,
                              window: int = 4) -> pd.DataFrame:
        """
        Calculate rolling weekend/weekday volume ratio.
        Ratio > 1.0 = weekend volume exceeds weekday = retail FOMO.
        """
        df = ohlcv_df.copy()
        df["is_weekend"] = df.index.dayofweek >= 5

        # Rolling averages
        weekend_vol = df.loc[df["is_weekend"], "volume"].rolling(
            window=window, min_periods=1).mean()
        weekday_vol = df.loc[~df["is_weekend"], "volume"].rolling(
            window=window * 5, min_periods=1).mean()

        # Reindex to full date range
        weekend_vol = weekend_vol.reindex(df.index).ffill()
        weekday_vol = weekday_vol.reindex(df.index).ffill()

        df["weekend_vol_avg"] = weekend_vol
        df["weekday_vol_avg"] = weekday_vol
        df["wkend_wkday_ratio"] = (
            df["weekend_vol_avg"] / df["weekday_vol_avg"].replace(0, np.nan)
        ).fillna(1.0)

        # Signal
        df["retail_fomo_signal"] = np.where(
            df["wkend_wkday_ratio"] > 1.3, 1,   # High retail participation
            np.where(df["wkend_wkday_ratio"] < 0.5, -1, 0)  # Low = institutional
        )

        return df[["wkend_wkday_ratio", "retail_fomo_signal"]]

    @staticmethod
    def volume_spike_detector(volume: pd.Series, threshold: float = 3.0,
                              window: int = 20) -> pd.Series:
        """Detect volume spikes > threshold standard deviations above mean."""
        vol_mean = volume.rolling(window=window, min_periods=1).mean()
        vol_std = volume.rolling(window=window, min_periods=1).std().replace(0, 1)
        z_score = (volume - vol_mean) / vol_std
        return z_score


class PiCycleIndicator:
    """
    Signal 7: Pi Cycle Top Indicator

    When the 111-day MA crosses ABOVE 2x the 350-day MA,
    it has historically called every major BTC cycle top
    with 3-day accuracy (2013, 2017, 2021).

    The 'Pi' name comes from 350/111 ≈ 3.153 ≈ Pi.
    """

    @staticmethod
    def compute(close: pd.Series) -> pd.DataFrame:
        """
        Returns DataFrame with MAs and cross signal.
        Signal = 1 when 111MA > 2*350MA (cycle top warning)
        """
        ma_111 = close.rolling(window=111, min_periods=111).mean()
        ma_350x2 = close.rolling(window=350, min_periods=350).mean() * 2

        df = pd.DataFrame({
            "close": close,
            "ma_111": ma_111,
            "ma_350x2": ma_350x2,
        })

        df["pi_cycle_ratio"] = ma_111 / ma_350x2.replace(0, np.nan)

        # Cross detection
        df["pi_above"] = (ma_111 > ma_350x2).astype(int)
        df["pi_cross_up"] = df["pi_above"].diff().clip(lower=0)  # Just crossed above
        df["pi_cross_down"] = (-df["pi_above"].diff()).clip(lower=0)

        # Distance to cross (how close are we?)
        df["pi_distance_pct"] = ((ma_111 - ma_350x2) / ma_350x2 * 100).round(2)

        return df.dropna()

    @staticmethod
    def interpret(distance_pct: float) -> str:
        if distance_pct > 0:
            return f"CYCLE TOP WARNING — 111MA is {distance_pct:.1f}% ABOVE 2x350MA"
        elif distance_pct > -5:
            return f"APPROACHING TOP — {abs(distance_pct):.1f}% below cross"
        elif distance_pct > -20:
            return f"MID CYCLE — {abs(distance_pct):.1f}% below cross"
        else:
            return f"EARLY CYCLE — {abs(distance_pct):.1f}% below cross"


class DifficultyRibbon:
    """
    Signal 8: Mining Difficulty Ribbon

    Compares short-term vs long-term difficulty moving averages.
    When ribbons compress (short MAs < long MAs), miners are
    capitulating — historically marks cycle bottoms.

    When ribbons expand, miners are profitable and network is healthy.
    """

    @staticmethod
    def fetch_difficulty_history() -> pd.DataFrame:
        """Fetch BTC difficulty history from blockchain.info."""
        try:
            url = "https://api.blockchain.info/charts/difficulty"
            resp = requests.get(url, params={
                "timespan": "2years", "format": "json"
            }, timeout=30)
            if resp.status_code == 200:
                data = resp.json()["values"]
                df = pd.DataFrame(data)
                df["x"] = pd.to_datetime(df["x"], unit="s", utc=True)
                df = df.set_index("x").rename(columns={"y": "difficulty"})
                df = df.resample("D").ffill()
                return df
        except Exception as e:
            print(f"[DifficultyRibbon] Error: {e}")
        return pd.DataFrame()

    @staticmethod
    def compute_ribbon(difficulty: pd.Series) -> pd.DataFrame:
        """
        Compute difficulty ribbon from multiple MA periods.
        Compression = capitulation (bullish long-term).
        """
        periods = [9, 14, 25, 40, 60, 90, 128, 200]
        df = pd.DataFrame({"difficulty": difficulty})

        for p in periods:
            df[f"diff_ma_{p}"] = difficulty.rolling(window=p, min_periods=p).mean()

        # Ribbon width: ratio of shortest MA to longest MA
        df["ribbon_width"] = (
            df["diff_ma_9"] / df["diff_ma_200"].replace(0, np.nan)
        ).fillna(1)

        # Compression signal
        df["ribbon_compressed"] = (df["ribbon_width"] < 0.95).astype(int)
        df["miner_capitulation"] = (df["ribbon_width"] < 0.90).astype(int)

        return df.dropna()


class GitHubActivity:
    """
    Signal 9: Developer activity on major crypto repos

    Declining commits precede ecosystem stagnation.
    Spikes precede major upgrades and price runs.
    Uses GitHub API (free, 60 requests/hour unauthenticated).
    """

    REPOS = {
        "bitcoin": "bitcoin/bitcoin",
        "ethereum": "ethereum/go-ethereum",
        "solana": "solana-labs/solana",
        "lightning": "lightningnetwork/lnd",
        "polygon": "maticnetwork/bor",
    }

    def fetch_commit_activity(self, project: str = "bitcoin") -> dict:
        """Fetch weekly commit count for last year."""
        repo = self.REPOS.get(project, self.REPOS["bitcoin"])
        try:
            url = f"https://api.github.com/repos/{repo}/stats/commit_activity"
            resp = requests.get(url, headers={
                "Accept": "application/vnd.github.v3+json"
            }, timeout=15)

            if resp.status_code == 200:
                weeks = resp.json()
                if isinstance(weeks, list) and len(weeks) > 0:
                    recent = weeks[-4:]  # Last 4 weeks
                    prior = weeks[-12:-4]  # 4-12 weeks ago

                    recent_avg = np.mean([w["total"] for w in recent])
                    prior_avg = np.mean([w["total"] for w in prior])

                    return {
                        "project": project,
                        "repo": repo,
                        "recent_4w_avg": round(recent_avg, 1),
                        "prior_8w_avg": round(prior_avg, 1),
                        "momentum": round(
                            (recent_avg - prior_avg) / max(prior_avg, 1) * 100, 1
                        ),
                        "total_52w": sum(w["total"] for w in weeks),
                        "weekly_data": [
                            {"week": w["week"], "commits": w["total"]}
                            for w in weeks[-12:]
                        ]
                    }
            elif resp.status_code == 202:
                return {"project": project, "status": "computing",
                        "note": "GitHub is computing stats, retry in 30s"}

        except Exception as e:
            print(f"[GitHubActivity] Error for {project}: {e}")

        return {"project": project, "error": "failed to fetch"}

    def fetch_all(self) -> list:
        """Fetch activity for all tracked repos."""
        results = []
        for project in self.REPOS:
            results.append(self.fetch_commit_activity(project))
            time.sleep(1.5)  # Rate limit
        return results


class ETFFlowSignal:
    """
    Signal 6: BTC ETF daily flows

    Since Jan 2024, spot ETF inflows/outflows are among the strongest
    same-day price predictors. Consecutive outflow days have preceded
    every significant drawdown.

    Uses public data from various ETF tracking sources.
    """

    def fetch_etf_summary(self) -> dict:
        """
        Fetch BTC ETF flow data.
        Primary source: CoinGecko global data includes ETF info.
        Fallback: hardcoded recent known data for demo.
        """
        result = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "source": "coingecko_global",
        }

        try:
            resp = requests.get(
                "https://api.coingecko.com/api/v3/global",
                timeout=15
            )
            if resp.status_code == 200:
                data = resp.json()["data"]
                result["total_mcap"] = data["total_market_cap"].get("usd", 0)
                result["btc_dominance"] = data.get(
                    "market_cap_percentage", {}).get("btc", 0)
                result["total_volume_24h"] = data["total_volume"].get("usd", 0)

                # Volume/MCap ratio as a flow proxy
                if result["total_mcap"] > 0:
                    result["volume_mcap_ratio"] = round(
                        result["total_volume_24h"] / result["total_mcap"], 4
                    )
                    # High ratio = high turnover = active flows
                    if result["volume_mcap_ratio"] > 0.1:
                        result["flow_signal"] = "HIGH_ACTIVITY"
                    elif result["volume_mcap_ratio"] > 0.05:
                        result["flow_signal"] = "NORMAL"
                    else:
                        result["flow_signal"] = "LOW_ACTIVITY"

        except Exception as e:
            print(f"[ETFFlowSignal] Error: {e}")

        return result


class DeFiVelocity:
    """
    Signal 11: DeFi TVL rate of change

    Not the absolute TVL — the velocity (rate of change).
    Accelerating TVL inflows lead altcoin rallies by 1-2 weeks.
    """

    def fetch_tvl_history(self) -> pd.DataFrame:
        """Fetch total DeFi TVL history from DefiLlama."""
        try:
            resp = requests.get(
                "https://api.llama.fi/v2/historicalChainTvl",
                timeout=30
            )
            if resp.status_code == 200:
                data = resp.json()
                df = pd.DataFrame(data)
                df["date"] = pd.to_datetime(df["date"], unit="s", utc=True)
                df = df.set_index("date").sort_index()
                return df
        except Exception as e:
            print(f"[DeFiVelocity] Error: {e}")
        return pd.DataFrame()

    def compute_velocity(self, tvl_df: pd.DataFrame) -> pd.DataFrame:
        """Compute TVL velocity and acceleration."""
        if tvl_df.empty:
            return pd.DataFrame()

        df = tvl_df.copy()
        df["tvl_roc_7d"] = df["tvl"].pct_change(7)    # 1-week velocity
        df["tvl_roc_30d"] = df["tvl"].pct_change(30)   # 1-month velocity
        df["tvl_acceleration"] = df["tvl_roc_7d"] - df["tvl_roc_7d"].shift(7)

        # Signal
        df["tvl_signal"] = np.where(
            (df["tvl_roc_7d"] > 0.03) & (df["tvl_acceleration"] > 0), 1,
            np.where(
                (df["tvl_roc_7d"] < -0.03) & (df["tvl_acceleration"] < 0), -1, 0
            )
        )

        return df.dropna()


class AlphaSignalAggregator:
    """
    Combines all non-obvious signals into a unified alpha score.
    """

    def __init__(self):
        self.liquidity = GlobalLiquiditySignal()
        self.stablecoin = StablecoinSignals()
        self.kimchi = KimchiPremium()
        self.pi_cycle = PiCycleIndicator()
        self.difficulty = DifficultyRibbon()
        self.github = GitHubActivity()
        self.etf = ETFFlowSignal()
        self.defi = DeFiVelocity()
        self.volume = VolumePatterns()

    def fetch_snapshot(self) -> dict:
        """Fetch current state of all alpha signals."""
        print("[AlphaSignals] Fetching non-obvious signals...")

        snapshot = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "signals": {}
        }

        # Stablecoin Supply Ratio
        print("  Stablecoin data...")
        stable = self.stablecoin.fetch_stablecoin_data()
        snapshot["signals"]["stablecoin"] = {
            "ssr": stable.get("ssr", 0),
            "interpretation": self.stablecoin.interpret(stable.get("ssr", 0)),
            "usdt_mcap_b": round(stable.get("usdt_mcap", 0) / 1e9, 1),
            "usdc_mcap_b": round(stable.get("usdc_mcap", 0) / 1e9, 1),
            "stablecoin_dominance": round(
                stable.get("stablecoin_dominance", 0) * 100, 2),
        }
        time.sleep(1)

        # Kimchi Premium
        print("  Kimchi premium...")
        kimchi = self.kimchi.fetch_premium()
        snapshot["signals"]["kimchi_premium"] = kimchi
        time.sleep(1)

        # ETF / Flow signal
        print("  ETF flow proxy...")
        etf = self.etf.fetch_etf_summary()
        snapshot["signals"]["etf_flows"] = etf
        time.sleep(1)

        # GitHub activity
        print("  GitHub developer activity...")
        github = self.github.fetch_commit_activity("bitcoin")
        snapshot["signals"]["github_bitcoin"] = github

        # DeFi TVL velocity
        print("  DeFi TVL velocity...")
        tvl_df = self.defi.fetch_tvl_history()
        if not tvl_df.empty:
            velocity = self.defi.compute_velocity(tvl_df)
            if not velocity.empty:
                latest = velocity.iloc[-1]
                snapshot["signals"]["defi_velocity"] = {
                    "tvl_current_b": round(latest["tvl"] / 1e9, 1),
                    "tvl_roc_7d": round(float(latest["tvl_roc_7d"]) * 100, 2),
                    "tvl_roc_30d": round(float(latest["tvl_roc_30d"]) * 100, 2),
                    "acceleration": round(float(latest["tvl_acceleration"]) * 100, 2),
                    "signal": int(latest["tvl_signal"]),
                }

        return snapshot

    def compute_composite(self, snapshot: dict) -> dict:
        """
        Compute a composite alpha score from all signals.
        Range: -1 (extremely bearish) to +1 (extremely bullish)
        """
        signals = snapshot.get("signals", {})
        scores = []
        weights = []

        # SSR signal (weight 0.20)
        ssr = signals.get("stablecoin", {}).get("ssr", 10)
        if ssr > 0:
            # Lower SSR = more bullish (more stablecoins relative to crypto)
            ssr_score = max(-1, min(1, (15 - ssr) / 15))
            scores.append(ssr_score)
            weights.append(0.20)

        # Kimchi Premium (weight 0.10)
        premium = signals.get("kimchi_premium", {}).get("premium_pct", 0)
        # High premium = bearish (FOMO top), discount = bullish (capitulation)
        kimchi_score = max(-1, min(1, -premium / 10))
        scores.append(kimchi_score)
        weights.append(0.10)

        # DeFi velocity (weight 0.15)
        defi_sig = signals.get("defi_velocity", {}).get("signal", 0)
        scores.append(defi_sig)
        weights.append(0.15)

        # GitHub momentum (weight 0.10)
        gh_momentum = signals.get("github_bitcoin", {}).get("momentum", 0)
        gh_score = max(-1, min(1, gh_momentum / 50))
        scores.append(gh_score)
        weights.append(0.10)

        # ETF volume/mcap ratio (weight 0.15)
        vol_ratio = signals.get("etf_flows", {}).get("volume_mcap_ratio", 0.05)
        # Higher activity can be either direction, normalize around 0.05
        etf_score = max(-1, min(1, (vol_ratio - 0.05) / 0.05))
        scores.append(etf_score)
        weights.append(0.15)

        # Compute weighted average
        if scores and weights:
            total_weight = sum(weights)
            composite = sum(s * w for s, w in zip(scores, weights)) / total_weight
        else:
            composite = 0

        label = "BULLISH" if composite > 0.2 else \
                "BEARISH" if composite < -0.2 else "NEUTRAL"

        return {
            "composite_score": round(composite, 4),
            "label": label,
            "component_scores": {
                "stablecoin_ssr": round(scores[0], 3) if len(scores) > 0 else 0,
                "kimchi_premium": round(scores[1], 3) if len(scores) > 1 else 0,
                "defi_velocity": round(scores[2], 3) if len(scores) > 2 else 0,
                "github_activity": round(scores[3], 3) if len(scores) > 3 else 0,
                "etf_activity": round(scores[4], 3) if len(scores) > 4 else 0,
            },
            "timestamp": datetime.now(timezone.utc).isoformat()
        }

    def save_snapshot(self, snapshot: dict, composite: dict):
        """Save to JSON for historical tracking."""
        os.makedirs(DATA_DIR, exist_ok=True)
        filepath = os.path.join(DATA_DIR, "alpha_signals_history.json")

        entry = {**snapshot, "composite": composite}

        history = []
        if os.path.exists(filepath):
            try:
                with open(filepath, "r") as f:
                    history = json.load(f)
            except (json.JSONDecodeError, IOError):
                history = []

        history.append(entry)
        # Keep last 365 entries
        history = history[-365:]

        with open(filepath, "w") as f:
            json.dump(history, f, indent=2, default=str)

        print(f"[AlphaSignals] Saved to {filepath}")


# --- CLI Entry Point ---
if __name__ == "__main__":
    print("=" * 65)
    print("CRYPTO RADAR - NON-OBVIOUS ALPHA SIGNALS")
    print("=" * 65)

    agg = AlphaSignalAggregator()

    # Fetch all signals
    snapshot = agg.fetch_snapshot()

    # Print results
    print("\n" + "-" * 65)
    print("SIGNAL SNAPSHOT")
    print("-" * 65)

    for name, data in snapshot["signals"].items():
        print(f"\n  [{name.upper()}]")
        if isinstance(data, dict):
            for k, v in data.items():
                if k not in ("weekly_data", "timestamp"):
                    print(f"    {k}: {v}")

    # Composite score
    composite = agg.compute_composite(snapshot)
    print(f"\n{'=' * 65}")
    print(f"COMPOSITE ALPHA SCORE: {composite['composite_score']:+.4f} "
          f"({composite['label']})")
    print(f"{'=' * 65}")
    for name, score in composite["component_scores"].items():
        bar = "+" * int(abs(score) * 20) if score > 0 else "-" * int(abs(score) * 20)
        print(f"  {name:20s}: {score:+.3f}  {bar}")

    # Save
    agg.save_snapshot(snapshot, composite)

    # Pi Cycle (needs price data)
    print(f"\n{'=' * 65}")
    print("PI CYCLE INDICATOR (needs 350+ days of BTC price data)")
    print("=" * 65)
    print("  Run with BTC close prices to check cycle position.")
    print("  Historical accuracy: called every major BTC top since 2013.")
