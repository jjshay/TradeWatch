"""
Social Media Sentiment Aggregator for Crypto Prediction Pipeline

Aggregates sentiment from multiple social data sources:
  1. LunarCrush API (social volume, galaxy score, alt rank)
  2. Reddit public JSON API (post sentiment, velocity, engagement)
  3. Google Trends (search interest for crypto keywords)
  4. CoinGecko Trending (retail attention indicator)

Produces a composite social signal in [-1, +1] for downstream fusion.
"""

import hashlib
import json
import logging
import os
import time
from datetime import datetime, timezone, timedelta
from typing import Optional

import numpy as np
import pandas as pd
import requests

from config import (
    DATA_DIR,
    TRACKED_ASSETS,
    SOCIAL_CACHE_HOURS,
    SOCIAL_WEIGHTS,
    REDDIT_SUBREDDITS,
    GOOGLE_TRENDS_KEYWORDS,
)

logger = logging.getLogger(__name__)
logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] %(name)s %(levelname)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)

# ---------------------------------------------------------------------------
# Disk Cache
# ---------------------------------------------------------------------------

CACHE_DIR = os.path.join(DATA_DIR, "social_cache")


class DiskCache:
    """Simple JSON-based disk cache with TTL support."""

    def __init__(self, cache_dir: str = CACHE_DIR, ttl_hours: float = SOCIAL_CACHE_HOURS):
        self.cache_dir = cache_dir
        self.ttl_seconds = ttl_hours * 3600
        os.makedirs(self.cache_dir, exist_ok=True)

    def _key_path(self, key: str) -> str:
        safe = hashlib.sha256(key.encode()).hexdigest()[:16]
        return os.path.join(self.cache_dir, f"{safe}.json")

    def get(self, key: str) -> Optional[dict]:
        path = self._key_path(key)
        if not os.path.exists(path):
            return None
        try:
            with open(path, "r") as f:
                entry = json.load(f)
            if time.time() - entry.get("ts", 0) > self.ttl_seconds:
                os.remove(path)
                return None
            return entry["data"]
        except (json.JSONDecodeError, KeyError, OSError):
            return None

    def set(self, key: str, data) -> None:
        path = self._key_path(key)
        try:
            with open(path, "w") as f:
                json.dump({"ts": time.time(), "data": data}, f)
        except OSError as exc:
            logger.warning("Cache write failed for %s: %s", key, exc)

    def clear(self) -> int:
        removed = 0
        for fname in os.listdir(self.cache_dir):
            try:
                os.remove(os.path.join(self.cache_dir, fname))
                removed += 1
            except OSError:
                pass
        return removed


# ---------------------------------------------------------------------------
# HTTP helpers
# ---------------------------------------------------------------------------

def _request_with_backoff(
    url: str,
    params: Optional[dict] = None,
    headers: Optional[dict] = None,
    max_retries: int = 3,
    base_delay: float = 1.0,
    timeout: int = 15,
) -> requests.Response:
    """GET request with exponential backoff on rate-limit (429) or server errors."""
    for attempt in range(max_retries):
        try:
            resp = requests.get(url, params=params, headers=headers, timeout=timeout)
            if resp.status_code == 429:
                wait = base_delay * (2 ** attempt)
                retry_after = resp.headers.get("Retry-After")
                if retry_after and retry_after.isdigit():
                    wait = max(wait, int(retry_after))
                logger.warning("Rate-limited on %s, retrying in %.1fs", url, wait)
                time.sleep(wait)
                continue
            if resp.status_code >= 500:
                wait = base_delay * (2 ** attempt)
                logger.warning("Server error %d on %s, retrying in %.1fs", resp.status_code, url, wait)
                time.sleep(wait)
                continue
            resp.raise_for_status()
            return resp
        except requests.exceptions.Timeout:
            if attempt < max_retries - 1:
                time.sleep(base_delay * (2 ** attempt))
                continue
            raise
    raise requests.exceptions.RetryError(f"Failed after {max_retries} retries: {url}")


# ---------------------------------------------------------------------------
# Keyword-based sentiment fallback
# ---------------------------------------------------------------------------

# Positive / negative word lists tuned for crypto context
_POSITIVE_WORDS = frozenset([
    "bull", "bullish", "surge", "soar", "rally", "pump", "moon", "gain",
    "profit", "breakout", "uptrend", "buy", "long", "growth", "recover",
    "adoption", "milestone", "record", "high", "success", "upgrade",
    "boost", "optimistic", "approval", "green", "accumulate", "halving",
    "institutional", "etf", "launch", "innovation", "partnership",
])

_NEGATIVE_WORDS = frozenset([
    "bear", "bearish", "crash", "dump", "plunge", "drop", "fall", "sell",
    "short", "loss", "scam", "hack", "exploit", "ban", "fraud", "fear",
    "panic", "collapse", "liquidation", "sec", "lawsuit", "regulation",
    "warning", "risk", "bubble", "ponzi", "rug", "rugpull", "negative",
    "concern", "decline", "slump", "tank", "capitulation", "fud",
])


def keyword_sentiment(text: str) -> float:
    """
    Simple keyword-based sentiment scorer.
    Returns a value in [-1, +1].
    """
    words = set(text.lower().split())
    pos_hits = len(words & _POSITIVE_WORDS)
    neg_hits = len(words & _NEGATIVE_WORDS)
    total = pos_hits + neg_hits
    if total == 0:
        return 0.0
    return (pos_hits - neg_hits) / total


# ---------------------------------------------------------------------------
# Attempt to import FinBERT from local sentiment engine
# ---------------------------------------------------------------------------

_finbert_analyzer = None


def _get_finbert_analyzer():
    """Lazy-load the FinBERT sentiment engine. Falls back to keyword method."""
    global _finbert_analyzer
    if _finbert_analyzer is not None:
        return _finbert_analyzer

    try:
        from sentiment_engine import SentimentEngine
        engine = SentimentEngine()
        _finbert_analyzer = engine
        logger.info("FinBERT sentiment engine loaded successfully.")
        return engine
    except Exception as exc:
        logger.warning("FinBERT unavailable (%s), using keyword fallback.", exc)
        return None


def analyze_text_sentiment(text: str) -> float:
    """
    Analyze text sentiment, returning a score in [-1, +1].
    Uses FinBERT if available, otherwise keyword fallback.
    """
    engine = _get_finbert_analyzer()
    if engine is not None:
        try:
            result = engine.analyze_headline(text)
            return result.get("positive", 0) - result.get("negative", 0)
        except Exception:
            pass
    return keyword_sentiment(text)


# ===========================================================================
# Source 1: LunarCrush
# ===========================================================================

class LunarCrushSource:
    """
    Fetch social metrics from LunarCrush v4 public API.

    Metrics: social_volume, social_score, social_dominance, galaxy_score, alt_rank.
    """

    BASE_URL = "https://lunarcrush.com/api4/public/"

    def __init__(self, cache: Optional[DiskCache] = None):
        self.cache = cache or DiskCache()
        self.session = requests.Session()
        self.session.headers.update({
            "User-Agent": "CryptoRadar/1.0",
            "Accept": "application/json",
        })

    def _get(self, endpoint: str, params: Optional[dict] = None) -> dict:
        url = f"{self.BASE_URL}{endpoint}"
        resp = _request_with_backoff(url, params=params, headers=dict(self.session.headers))
        return resp.json()

    def fetch_coin_metrics(self, symbol: str) -> dict:
        """Fetch social metrics for a single coin."""
        cache_key = f"lunarcrush_{symbol}"
        cached = self.cache.get(cache_key)
        if cached is not None:
            return cached

        try:
            data = self._get(f"coins/{symbol}/time-series", params={"interval": "1d"})
            # LunarCrush v4 response structure can vary; extract safely
            timeseries = data.get("timeSeries", data.get("data", []))
            if isinstance(timeseries, list) and len(timeseries) > 0:
                latest = timeseries[-1] if isinstance(timeseries, list) else timeseries
            else:
                latest = data.get("data", data)

            result = {
                "symbol": symbol,
                "social_volume": latest.get("social_volume", latest.get("socialVolume", 0)),
                "social_score": latest.get("social_score", latest.get("socialScore", 0)),
                "social_dominance": latest.get("social_dominance", latest.get("socialDominance", 0)),
                "galaxy_score": latest.get("galaxy_score", latest.get("galaxyScore", 0)),
                "alt_rank": latest.get("alt_rank", latest.get("altRank", 0)),
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
            self.cache.set(cache_key, result)
            return result

        except Exception as exc:
            logger.warning("LunarCrush fetch failed for %s: %s", symbol, exc)
            return {
                "symbol": symbol,
                "social_volume": 0,
                "social_score": 0,
                "social_dominance": 0,
                "galaxy_score": 0,
                "alt_rank": 0,
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "error": str(exc),
            }

    def fetch_all(self, symbols: Optional[list] = None) -> pd.DataFrame:
        """Fetch metrics for all tracked symbols."""
        symbols = symbols or TRACKED_ASSETS
        records = []
        for sym in symbols:
            records.append(self.fetch_coin_metrics(sym))
        return pd.DataFrame(records)

    def normalized_score(self, symbols: Optional[list] = None) -> float:
        """
        Return a single normalized score in [-1, +1].
        Based on galaxy_score distribution: 0-30 = bearish, 30-70 = neutral, 70-100 = bullish.
        """
        df = self.fetch_all(symbols)
        if df.empty or "galaxy_score" not in df.columns:
            return 0.0
        avg_galaxy = df["galaxy_score"].mean()
        # Galaxy score is 0-100; map to [-1, +1]
        return max(-1.0, min(1.0, (avg_galaxy - 50) / 50))


# ===========================================================================
# Source 2: Reddit
# ===========================================================================

class RedditSource:
    """
    Fetch posts from crypto subreddits via Reddit's public JSON API.
    Analyze sentiment, compute velocity, and engagement metrics.
    """

    USER_AGENT = "CryptoRadar/1.0"

    def __init__(self, subreddits: Optional[list] = None, cache: Optional[DiskCache] = None):
        self.subreddits = subreddits or REDDIT_SUBREDDITS
        self.cache = cache or DiskCache()
        self.session = requests.Session()
        self.session.headers.update({
            "User-Agent": self.USER_AGENT,
            "Accept": "application/json",
        })

    def fetch_subreddit(self, subreddit: str, limit: int = 25) -> list:
        """Fetch hot posts from a subreddit."""
        cache_key = f"reddit_{subreddit}_{limit}"
        cached = self.cache.get(cache_key)
        if cached is not None:
            return cached

        url = f"https://www.reddit.com/r/{subreddit}/hot.json"
        params = {"limit": limit}
        try:
            resp = _request_with_backoff(
                url, params=params, headers=dict(self.session.headers)
            )
            data = resp.json()
            children = data.get("data", {}).get("children", [])
            posts = []
            for child in children:
                post = child.get("data", {})
                # Skip pinned / stickied
                if post.get("stickied", False):
                    continue
                posts.append({
                    "subreddit": subreddit,
                    "title": post.get("title", ""),
                    "score": post.get("score", 0),
                    "num_comments": post.get("num_comments", 0),
                    "upvote_ratio": post.get("upvote_ratio", 0.5),
                    "created_utc": post.get("created_utc", 0),
                })
            self.cache.set(cache_key, posts)
            return posts
        except Exception as exc:
            logger.warning("Reddit fetch failed for r/%s: %s", subreddit, exc)
            return []

    def fetch_all(self, limit_per_sub: int = 25) -> pd.DataFrame:
        """Fetch posts from all configured subreddits."""
        all_posts = []
        for sub in self.subreddits:
            posts = self.fetch_subreddit(sub, limit=limit_per_sub)
            all_posts.extend(posts)
            # Polite delay between subreddits to avoid rate-limiting
            time.sleep(1.0)
        if not all_posts:
            return pd.DataFrame()
        return pd.DataFrame(all_posts)

    def analyze(self, limit_per_sub: int = 25) -> dict:
        """
        Fetch all posts, run sentiment analysis, and return aggregate metrics.

        Returns dict with:
            avg_sentiment: mean sentiment [-1, +1]
            post_velocity: posts per hour (based on timestamp spread)
            engagement_ratio: mean(comments / max(score, 1))
            bullish_pct: fraction of positive-sentiment posts
            bearish_pct: fraction of negative-sentiment posts
            post_count: total posts analyzed
        """
        df = self.fetch_all(limit_per_sub)
        if df.empty:
            return {
                "avg_sentiment": 0.0,
                "post_velocity": 0.0,
                "engagement_ratio": 0.0,
                "bullish_pct": 0.0,
                "bearish_pct": 0.0,
                "post_count": 0,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }

        # Sentiment per title
        sentiments = df["title"].apply(analyze_text_sentiment)
        df = df.copy()
        df["sentiment"] = sentiments

        # Post velocity: posts per hour
        now_ts = time.time()
        if "created_utc" in df.columns and len(df) > 1:
            oldest = df["created_utc"].min()
            span_hours = max((now_ts - oldest) / 3600, 0.1)
            post_velocity = len(df) / span_hours
        else:
            post_velocity = 0.0

        # Engagement ratio
        df["engagement"] = df["num_comments"] / df["score"].clip(lower=1)
        engagement_ratio = df["engagement"].mean()

        avg_sentiment = sentiments.mean()
        bullish_pct = (sentiments > 0.1).mean()
        bearish_pct = (sentiments < -0.1).mean()

        return {
            "avg_sentiment": round(float(avg_sentiment), 4),
            "post_velocity": round(float(post_velocity), 4),
            "engagement_ratio": round(float(engagement_ratio), 4),
            "bullish_pct": round(float(bullish_pct), 4),
            "bearish_pct": round(float(bearish_pct), 4),
            "post_count": len(df),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

    def normalized_score(self, limit_per_sub: int = 25) -> float:
        """Return a normalized score in [-1, +1] based on Reddit analysis."""
        metrics = self.analyze(limit_per_sub)
        return max(-1.0, min(1.0, metrics["avg_sentiment"]))


# ===========================================================================
# Source 3: Google Trends
# ===========================================================================

class GoogleTrendsSource:
    """
    Track search interest for crypto-related keywords via Google Trends.
    Uses pytrends library. Aggressively cached due to rate limits.
    """

    def __init__(
        self,
        keywords: Optional[list] = None,
        cache: Optional[DiskCache] = None,
    ):
        self.keywords = keywords or GOOGLE_TRENDS_KEYWORDS
        # Use a longer TTL for Google Trends due to aggressive rate-limiting
        self.cache = cache or DiskCache(ttl_hours=SOCIAL_CACHE_HOURS)

    def fetch(self) -> dict:
        """
        Fetch Google Trends data for configured keywords.

        Returns dict with per-keyword metrics:
            current_interest, 7d_change, 30d_change
        and an aggregate composite score.
        """
        cache_key = "gtrends_" + "_".join(sorted(self.keywords))
        cached = self.cache.get(cache_key)
        if cached is not None:
            logger.info("Google Trends: returning cached result.")
            return cached

        try:
            from pytrends.request import TrendReq
        except ImportError:
            logger.warning("pytrends not installed. Skipping Google Trends source.")
            return self._empty_result()

        try:
            pytrends = TrendReq(hl="en-US", tz=360, timeout=(10, 25))

            # Google Trends limits to 5 keywords per request
            batch_size = 5
            all_keyword_data = {}

            for i in range(0, len(self.keywords), batch_size):
                batch = self.keywords[i : i + batch_size]
                pytrends.build_payload(batch, timeframe="today 3-m", geo="")
                interest_df = pytrends.interest_over_time()

                if interest_df.empty:
                    continue

                # Drop the "isPartial" column if present
                if "isPartial" in interest_df.columns:
                    interest_df = interest_df.drop(columns=["isPartial"])

                for kw in batch:
                    if kw not in interest_df.columns:
                        continue
                    series = interest_df[kw]
                    current = float(series.iloc[-1])
                    avg_7d = float(series.iloc[-7:].mean()) if len(series) >= 7 else current
                    avg_30d = float(series.iloc[-30:].mean()) if len(series) >= 30 else current

                    change_7d = (current - avg_7d) / max(avg_7d, 1)
                    change_30d = (current - avg_30d) / max(avg_30d, 1)

                    all_keyword_data[kw] = {
                        "current_interest": round(current, 2),
                        "7d_change": round(change_7d, 4),
                        "30d_change": round(change_30d, 4),
                    }

                # Polite delay between batches
                if i + batch_size < len(self.keywords):
                    time.sleep(2.0)

            # Build composite
            if all_keyword_data:
                avg_interest = np.mean([v["current_interest"] for v in all_keyword_data.values()])
                avg_7d_change = np.mean([v["7d_change"] for v in all_keyword_data.values()])

                # Detect "crash" keyword spikes as bearish signal
                crash_keywords = [k for k in all_keyword_data if "crash" in k.lower()]
                buy_keywords = [k for k in all_keyword_data if "buy" in k.lower()]

                crash_interest = (
                    np.mean([all_keyword_data[k]["current_interest"] for k in crash_keywords])
                    if crash_keywords else 0
                )
                buy_interest = (
                    np.mean([all_keyword_data[k]["current_interest"] for k in buy_keywords])
                    if buy_keywords else 0
                )

                # If "crash" interest > "buy" interest, negative signal
                directional = (buy_interest - crash_interest) / max(buy_interest + crash_interest, 1)

                composite = float(np.clip(
                    0.5 * ((avg_interest - 50) / 50) + 0.3 * avg_7d_change + 0.2 * directional,
                    -1.0, 1.0
                ))
            else:
                composite = 0.0

            result = {
                "keywords": all_keyword_data,
                "composite": round(composite, 4),
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
            self.cache.set(cache_key, result)
            return result

        except Exception as exc:
            logger.warning("Google Trends fetch failed: %s", exc)
            return self._empty_result()

    def _empty_result(self) -> dict:
        return {
            "keywords": {},
            "composite": 0.0,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "error": "unavailable",
        }

    def normalized_score(self) -> float:
        """Return normalized score in [-1, +1]."""
        data = self.fetch()
        return max(-1.0, min(1.0, data.get("composite", 0.0)))


# ===========================================================================
# Source 4: CoinGecko Trending
# ===========================================================================

class CoinGeckoTrendingSource:
    """
    Fetch trending coins from CoinGecko search API.
    Acts as a retail attention / hype indicator.
    """

    TRENDING_URL = "https://api.coingecko.com/api/v3/search/trending"

    def __init__(self, cache: Optional[DiskCache] = None):
        self.cache = cache or DiskCache()

    def fetch(self) -> dict:
        """
        Fetch CoinGecko trending coins.

        Returns dict with:
            coins: list of trending coin dicts
            tracked_in_trending: number of our TRACKED_ASSETS that appear
            hype_score: 0-1 measure of overlap with our tracked list
        """
        cache_key = "coingecko_trending"
        cached = self.cache.get(cache_key)
        if cached is not None:
            return cached

        try:
            resp = _request_with_backoff(
                self.TRENDING_URL,
                headers={"Accept": "application/json", "User-Agent": "CryptoRadar/1.0"},
            )
            data = resp.json()
            coins_raw = data.get("coins", [])

            coins = []
            for entry in coins_raw:
                item = entry.get("item", {})
                coins.append({
                    "id": item.get("id", ""),
                    "symbol": item.get("symbol", "").upper(),
                    "name": item.get("name", ""),
                    "market_cap_rank": item.get("market_cap_rank", 0),
                    "score": item.get("score", 0),
                })

            trending_symbols = {c["symbol"] for c in coins}
            tracked_set = {s.upper() for s in TRACKED_ASSETS}
            overlap = trending_symbols & tracked_set
            tracked_in_trending = len(overlap)

            # Hype score: if many of our tracked assets are trending, market
            # attention is high (neutral-to-bullish). We use overlap ratio
            # relative to total trending.
            hype_score = tracked_in_trending / max(len(coins), 1)

            result = {
                "coins": coins,
                "trending_count": len(coins),
                "tracked_in_trending": tracked_in_trending,
                "tracked_trending_symbols": sorted(overlap),
                "hype_score": round(hype_score, 4),
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
            self.cache.set(cache_key, result)
            return result

        except Exception as exc:
            logger.warning("CoinGecko Trending fetch failed: %s", exc)
            return {
                "coins": [],
                "trending_count": 0,
                "tracked_in_trending": 0,
                "tracked_trending_symbols": [],
                "hype_score": 0.0,
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "error": str(exc),
            }

    def normalized_score(self) -> float:
        """
        Return normalized score in [-1, +1].
        High hype maps to bullish, low hype maps neutral.
        This source is purely an attention indicator; it skews positive
        when tracked assets are trending.
        """
        data = self.fetch()
        # hype_score is 0-1; map to [-0.5, +1] range (lack of hype is not bearish)
        hype = data.get("hype_score", 0.0)
        return max(-1.0, min(1.0, hype * 2 - 0.5))


# ===========================================================================
# Composite Social Signal
# ===========================================================================

class SocialSentimentAggregator:
    """
    Aggregates all social sentiment sources into a single composite signal.

    Weights (configurable via config.py):
        LunarCrush:       0.30
        Reddit:           0.30
        Google Trends:    0.20
        CoinGecko Trend:  0.20

    Output: composite score in [-1, +1] with per-source breakdown.
    """

    def __init__(
        self,
        weights: Optional[dict] = None,
        cache_hours: float = SOCIAL_CACHE_HOURS,
    ):
        self.weights = weights or SOCIAL_WEIGHTS
        self.cache = DiskCache(ttl_hours=cache_hours)
        self.history_file = os.path.join(DATA_DIR, "social_composite_history.csv")

        # Initialize sources
        self.lunarcrush = LunarCrushSource(cache=self.cache)
        self.reddit = RedditSource(cache=self.cache)
        self.google_trends = GoogleTrendsSource(cache=self.cache)
        self.coingecko = CoinGeckoTrendingSource(cache=self.cache)

    def fetch_all_sources(self) -> dict:
        """
        Fetch scores from all sources with graceful degradation.
        Returns dict with per-source scores and metadata.
        """
        scores = {}
        errors = []

        # --- LunarCrush ---
        try:
            lc_score = self.lunarcrush.normalized_score()
            scores["lunarcrush"] = lc_score
            logger.info("LunarCrush score: %+.4f", lc_score)
        except Exception as exc:
            logger.error("LunarCrush source failed: %s", exc)
            errors.append(("lunarcrush", str(exc)))

        # --- Reddit ---
        try:
            reddit_score = self.reddit.normalized_score()
            scores["reddit"] = reddit_score
            logger.info("Reddit score: %+.4f", reddit_score)
        except Exception as exc:
            logger.error("Reddit source failed: %s", exc)
            errors.append(("reddit", str(exc)))

        # --- Google Trends ---
        try:
            gtrends_score = self.google_trends.normalized_score()
            scores["google_trends"] = gtrends_score
            logger.info("Google Trends score: %+.4f", gtrends_score)
        except Exception as exc:
            logger.error("Google Trends source failed: %s", exc)
            errors.append(("google_trends", str(exc)))

        # --- CoinGecko Trending ---
        try:
            cg_score = self.coingecko.normalized_score()
            scores["coingecko_trending"] = cg_score
            logger.info("CoinGecko Trending score: %+.4f", cg_score)
        except Exception as exc:
            logger.error("CoinGecko source failed: %s", exc)
            errors.append(("coingecko_trending", str(exc)))

        return {"scores": scores, "errors": errors}

    def compute_composite(self, scores: dict) -> float:
        """
        Weighted average of available source scores.
        If a source is missing, redistribute its weight proportionally.
        Returns composite in [-1, +1].
        """
        if not scores:
            return 0.0

        weight_map = {
            "lunarcrush": self.weights.get("lunarcrush", 0.3),
            "reddit": self.weights.get("reddit", 0.3),
            "google_trends": self.weights.get("google_trends", 0.2),
            "coingecko_trending": self.weights.get("coingecko_trending", 0.2),
        }

        total_weight = sum(weight_map[k] for k in scores if k in weight_map)
        if total_weight == 0:
            return 0.0

        composite = sum(
            scores[k] * (weight_map[k] / total_weight)
            for k in scores
            if k in weight_map
        )
        return float(np.clip(composite, -1.0, 1.0))

    def compute_velocity(self) -> dict:
        """
        Compute rate of change of composite score over 24h and 7d
        by comparing against historical records.
        """
        velocity = {"24h": 0.0, "7d": 0.0}

        if not os.path.exists(self.history_file):
            return velocity

        try:
            hist = pd.read_csv(self.history_file, parse_dates=["timestamp"])
            if hist.empty:
                return velocity

            now = datetime.now(timezone.utc)

            # 24h velocity
            cutoff_24h = now - timedelta(hours=24)
            recent_24h = hist[hist["timestamp"] >= cutoff_24h]
            if not recent_24h.empty:
                oldest_val = recent_24h.iloc[0]["composite"]
                newest_val = recent_24h.iloc[-1]["composite"]
                velocity["24h"] = round(newest_val - oldest_val, 4)

            # 7d velocity
            cutoff_7d = now - timedelta(days=7)
            recent_7d = hist[hist["timestamp"] >= cutoff_7d]
            if not recent_7d.empty:
                oldest_val = recent_7d.iloc[0]["composite"]
                newest_val = recent_7d.iloc[-1]["composite"]
                velocity["7d"] = round(newest_val - oldest_val, 4)

        except Exception as exc:
            logger.warning("Velocity calculation failed: %s", exc)

        return velocity

    def _save_history(self, composite: float, scores: dict) -> None:
        """Append current composite to history CSV."""
        os.makedirs(DATA_DIR, exist_ok=True)
        row = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "composite": composite,
            **{f"score_{k}": v for k, v in scores.items()},
        }
        df = pd.DataFrame([row])
        write_header = not os.path.exists(self.history_file)
        df.to_csv(self.history_file, mode="a", header=write_header, index=False)

    def run(self) -> dict:
        """
        Execute the full social sentiment pipeline.

        Returns dict with:
            composite: float in [-1, +1]
            label: bullish / bearish / neutral
            scores: per-source breakdown
            velocity: 24h and 7d rate of change
            errors: list of source failures
            sources_available: number of sources that returned data
            timestamp: ISO timestamp
        """
        result = self.fetch_all_sources()
        scores = result["scores"]
        errors = result["errors"]

        composite = self.compute_composite(scores)

        # Save to history for velocity tracking
        self._save_history(composite, scores)

        velocity = self.compute_velocity()

        if composite > 0.15:
            label = "bullish"
        elif composite < -0.15:
            label = "bearish"
        else:
            label = "neutral"

        return {
            "composite": round(composite, 4),
            "label": label,
            "scores": {k: round(v, 4) for k, v in scores.items()},
            "velocity": velocity,
            "errors": errors,
            "sources_available": len(scores),
            "sources_total": 4,
            "weights": self.weights,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

    def get_detailed_report(self) -> dict:
        """
        Run full pipeline and also return per-source detail data.
        Useful for debugging and deeper analysis.
        """
        summary = self.run()

        detail = {}

        # Reddit detail
        try:
            detail["reddit"] = self.reddit.analyze()
        except Exception:
            detail["reddit"] = {}

        # Google Trends detail
        try:
            detail["google_trends"] = self.google_trends.fetch()
        except Exception:
            detail["google_trends"] = {}

        # CoinGecko detail
        try:
            detail["coingecko_trending"] = self.coingecko.fetch()
        except Exception:
            detail["coingecko_trending"] = {}

        # LunarCrush detail (top 5 by galaxy_score)
        try:
            lc_df = self.lunarcrush.fetch_all(symbols=TRACKED_ASSETS[:5])
            detail["lunarcrush"] = lc_df.to_dict(orient="records") if not lc_df.empty else []
        except Exception:
            detail["lunarcrush"] = []

        summary["detail"] = detail
        return summary


# ===========================================================================
# CLI Entry Point
# ===========================================================================

def main():
    """Fetch all social sentiment sources and display the composite signal."""
    print("=" * 72)
    print("  CRYPTO RADAR - Social Sentiment Aggregator")
    print("=" * 72)
    print()

    aggregator = SocialSentimentAggregator()
    result = aggregator.run()

    # --- Per-Source Scores ---
    print("  Source Scores:")
    print("  " + "-" * 50)
    source_labels = {
        "lunarcrush": "LunarCrush",
        "reddit": "Reddit",
        "google_trends": "Google Trends",
        "coingecko_trending": "CoinGecko Trending",
    }
    for key, label in source_labels.items():
        score = result["scores"].get(key)
        weight = result["weights"].get(key, 0)
        if score is not None:
            bar_len = int(abs(score) * 20)
            bar_char = "+" if score >= 0 else "-"
            bar = bar_char * bar_len
            print(f"    {label:22s}  {score:+.4f}  (w={weight:.2f})  |{bar}")
        else:
            print(f"    {label:22s}  FAILED")

    # --- Composite ---
    print()
    print("  " + "=" * 50)
    composite = result["composite"]
    label = result["label"].upper()
    print(f"  COMPOSITE SIGNAL:  {composite:+.4f}  [{label}]")
    print(
        f"  Sources: {result['sources_available']}/{result['sources_total']} available"
    )

    # --- Velocity ---
    vel = result["velocity"]
    print(f"  Velocity (24h): {vel['24h']:+.4f}   (7d): {vel['7d']:+.4f}")

    # --- Errors ---
    if result["errors"]:
        print()
        print("  Errors:")
        for source, err in result["errors"]:
            print(f"    [{source}] {err}")

    print()
    print("  " + "=" * 50)
    print(f"  Timestamp: {result['timestamp']}")
    print("=" * 72)


if __name__ == "__main__":
    main()
