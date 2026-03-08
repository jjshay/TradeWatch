"""
Macroeconomic Data Fetcher

Fetches macro indicators from FRED (Federal Reserve Economic Data) and
constructs feature vectors for the ML pipeline. Uses the public CSV
endpoint (no API key required) with optional FRED API key fallback.

Data sources:
  - FRED public CSV: https://fred.stlouisfed.org/graph/fredgraph.csv
  - FRED API (if key set): https://api.stlouisfed.org/fred/series/observations
  - CME FedWatch: stubbed (requires JS rendering or paid feed)

All series are cached locally to avoid redundant network calls.
"""

import io
import json
import logging
import os
import time
from datetime import datetime, timedelta, timezone
from typing import Optional

import numpy as np
import pandas as pd
import requests

from config import DATA_DIR, FRED_API_KEY, FRED_SERIES, MACRO_CACHE_HOURS

logger = logging.getLogger(__name__)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

FRED_CSV_URL = "https://fred.stlouisfed.org/graph/fredgraph.csv"
FRED_API_URL = "https://api.stlouisfed.org/fred/series/observations"

CACHE_DIR = os.path.join(DATA_DIR, "macro_cache")

# Rate-of-change windows (in observations, not calendar days)
ROC_WINDOWS = [5, 21, 63]  # ~1 week, ~1 month, ~1 quarter

# Rolling z-score window
ZSCORE_WINDOW = 252  # ~1 year of trading days


# ---------------------------------------------------------------------------
# Cache helpers
# ---------------------------------------------------------------------------

def _cache_path(series_id: str) -> str:
    """Return the filesystem path for a cached series."""
    return os.path.join(CACHE_DIR, f"{series_id}.csv")


def _cache_meta_path() -> str:
    """Return the path to the cache metadata file."""
    return os.path.join(CACHE_DIR, "_meta.json")


def _read_cache_meta() -> dict:
    """Load cache metadata (last-fetch timestamps)."""
    path = _cache_meta_path()
    if os.path.exists(path):
        try:
            with open(path, "r") as f:
                return json.load(f)
        except (json.JSONDecodeError, OSError):
            logger.warning("Corrupt cache metadata; resetting.")
    return {}


def _write_cache_meta(meta: dict) -> None:
    """Persist cache metadata."""
    os.makedirs(CACHE_DIR, exist_ok=True)
    with open(_cache_meta_path(), "w") as f:
        json.dump(meta, f, indent=2)


def _is_cache_fresh(series_id: str, max_age_hours: float = MACRO_CACHE_HOURS) -> bool:
    """Check whether the cached file for *series_id* is still fresh."""
    meta = _read_cache_meta()
    ts_str = meta.get(series_id)
    if ts_str is None:
        return False
    try:
        fetched_at = datetime.fromisoformat(ts_str)
    except ValueError:
        return False
    age = datetime.now(timezone.utc) - fetched_at
    return age < timedelta(hours=max_age_hours)


def _mark_cached(series_id: str) -> None:
    """Update the cache metadata with the current timestamp."""
    meta = _read_cache_meta()
    meta[series_id] = datetime.now(timezone.utc).isoformat()
    _write_cache_meta(meta)


# ---------------------------------------------------------------------------
# FRED data fetching
# ---------------------------------------------------------------------------

def fetch_fred_csv(series_id: str, start_date: str = "2020-01-01") -> pd.DataFrame:
    """
    Fetch a FRED series via the public CSV endpoint (no API key needed).

    Returns a DataFrame with a DatetimeIndex named 'date' and a single
    column named after the series_id, containing float values.  Missing
    observations (FRED uses '.' for N/A) are forward-filled.
    """
    params = {
        "id": series_id,
        "cosd": start_date,
    }
    logger.info("Fetching %s from FRED CSV endpoint...", series_id)
    try:
        resp = requests.get(FRED_CSV_URL, params=params, timeout=30)
        resp.raise_for_status()
    except requests.RequestException as exc:
        logger.error("FRED CSV request failed for %s: %s", series_id, exc)
        raise

    df = pd.read_csv(
        io.StringIO(resp.text),
        parse_dates=["DATE"],
        index_col="DATE",
        na_values=["."],
    )
    # The CSV column is named after the series ID
    df.index.name = "date"
    if series_id in df.columns:
        df = df[[series_id]].rename(columns={series_id: "value"})
    else:
        # Some CSVs have a generic column name
        df.columns = ["value"]

    df["value"] = pd.to_numeric(df["value"], errors="coerce")
    df = df.sort_index()
    df["value"] = df["value"].ffill()
    return df


def fetch_fred_api(series_id: str, start_date: str = "2020-01-01") -> pd.DataFrame:
    """
    Fetch a FRED series via the JSON API (requires FRED_API_KEY).

    Falls back to :func:`fetch_fred_csv` if no key is configured.
    """
    if not FRED_API_KEY:
        logger.debug("No FRED_API_KEY set; falling back to CSV endpoint.")
        return fetch_fred_csv(series_id, start_date)

    params = {
        "series_id": series_id,
        "api_key": FRED_API_KEY,
        "file_type": "json",
        "observation_start": start_date,
        "sort_order": "asc",
    }
    logger.info("Fetching %s from FRED API...", series_id)
    try:
        resp = requests.get(FRED_API_URL, params=params, timeout=30)
        resp.raise_for_status()
    except requests.RequestException as exc:
        logger.error("FRED API request failed for %s: %s", series_id, exc)
        raise

    observations = resp.json().get("observations", [])
    if not observations:
        logger.warning("No observations returned for %s", series_id)
        return pd.DataFrame(columns=["value"])

    records = [
        {"date": obs["date"], "value": obs["value"]}
        for obs in observations
    ]
    df = pd.DataFrame(records)
    df["date"] = pd.to_datetime(df["date"])
    df = df.set_index("date").sort_index()
    df["value"] = pd.to_numeric(df["value"], errors="coerce")
    df["value"] = df["value"].ffill()
    return df


def fetch_series(series_id: str, start_date: str = "2020-01-01",
                 use_cache: bool = True) -> pd.DataFrame:
    """
    Fetch a single FRED series with local caching.

    1. If cache is fresh, read from disk.
    2. Otherwise fetch from FRED (API if key set, else CSV).
    3. Persist to cache.
    """
    if use_cache and _is_cache_fresh(series_id):
        path = _cache_path(series_id)
        if os.path.exists(path):
            logger.debug("Using cached %s", series_id)
            df = pd.read_csv(path, parse_dates=["date"], index_col="date")
            return df

    # Fetch from network
    if FRED_API_KEY:
        df = fetch_fred_api(series_id, start_date)
    else:
        df = fetch_fred_csv(series_id, start_date)

    # Persist cache
    os.makedirs(CACHE_DIR, exist_ok=True)
    df.to_csv(_cache_path(series_id))
    _mark_cached(series_id)
    return df


# ---------------------------------------------------------------------------
# CME FedWatch (stub)
# ---------------------------------------------------------------------------

def fetch_fedwatch_probabilities() -> dict:
    """
    Fetch CME FedWatch implied rate-change probabilities.

    The CME FedWatch tool requires JavaScript rendering and is not
    available via a simple REST call.  This stub returns a placeholder
    dict.  To integrate real data, either:
      - Use a headless browser (Playwright / Selenium) to scrape
        https://www.cmegroup.com/markets/interest-rates/cme-fedwatch-tool.html
      - Subscribe to CME's paid market data feed.
    """
    logger.info("CME FedWatch: returning placeholder (no public API).")
    return {
        "source": "placeholder",
        "next_meeting": None,
        "probabilities": {
            "cut_50bps": None,
            "cut_25bps": None,
            "hold": None,
            "hike_25bps": None,
            "hike_50bps": None,
        },
        "note": "Stub data. Integrate headless scraper or CME feed for live values.",
    }


# ---------------------------------------------------------------------------
# Bulk fetch and feature construction
# ---------------------------------------------------------------------------

class MacroDataFetcher:
    """
    Orchestrates fetching, caching, and feature-engineering of all
    configured FRED macroeconomic series.
    """

    def __init__(self, series_map: Optional[dict] = None,
                 start_date: str = "2020-01-01",
                 use_cache: bool = True):
        self.series_map = series_map or FRED_SERIES
        self.start_date = start_date
        self.use_cache = use_cache
        self._raw: dict[str, pd.DataFrame] = {}

    # ------------------------------------------------------------------
    # Fetching
    # ------------------------------------------------------------------

    def fetch_all(self, delay: float = 0.5) -> dict[str, pd.DataFrame]:
        """
        Fetch every series defined in *self.series_map*.

        Applies a brief delay between requests to avoid hammering FRED.
        Returns a dict mapping friendly names to DataFrames.
        """
        results: dict[str, pd.DataFrame] = {}
        for name, series_id in self.series_map.items():
            try:
                df = fetch_series(series_id, self.start_date, self.use_cache)
                results[name] = df
                logger.info("  %s (%s): %d observations", name, series_id, len(df))
            except Exception as exc:
                logger.error("Failed to fetch %s (%s): %s", name, series_id, exc)
                results[name] = pd.DataFrame(columns=["value"])
            time.sleep(delay)

        self._raw = results
        return results

    def get_combined_dataframe(self) -> pd.DataFrame:
        """
        Merge all fetched series into a single DataFrame indexed by date.

        Each column is named after the friendly series name (e.g.
        'dollar_index', 'treasury_10y').  Missing dates are forward-filled
        to align series with different publication frequencies.
        """
        if not self._raw:
            self.fetch_all()

        frames = []
        for name, df in self._raw.items():
            if df.empty:
                continue
            series = df["value"].rename(name)
            frames.append(series)

        if not frames:
            logger.warning("No macro series available to combine.")
            return pd.DataFrame()

        combined = pd.concat(frames, axis=1).sort_index()
        combined = combined.ffill()
        return combined

    # ------------------------------------------------------------------
    # Feature engineering
    # ------------------------------------------------------------------

    @staticmethod
    def add_rate_of_change(df: pd.DataFrame,
                           windows: Optional[list[int]] = None) -> pd.DataFrame:
        """
        Append rate-of-change (percentage change) columns for each series
        at each window.  Column naming: ``{series}_roc_{window}``.
        """
        windows = windows or ROC_WINDOWS
        base_cols = list(df.columns)
        for col in base_cols:
            for w in windows:
                roc_col = f"{col}_roc_{w}"
                df[roc_col] = df[col].pct_change(periods=w)
        return df

    @staticmethod
    def add_zscore(df: pd.DataFrame,
                   window: int = ZSCORE_WINDOW) -> pd.DataFrame:
        """
        Append rolling z-score columns for each base series.
        Column naming: ``{series}_zscore``.
        """
        base_cols = [c for c in df.columns if "_roc_" not in c and "_zscore" not in c]
        for col in base_cols:
            roll_mean = df[col].rolling(window=window, min_periods=30).mean()
            roll_std = df[col].rolling(window=window, min_periods=30).std().replace(0, np.nan)
            df[f"{col}_zscore"] = (df[col] - roll_mean) / roll_std
        return df

    def build_feature_matrix(self) -> pd.DataFrame:
        """
        Build the full macro feature matrix:
          1. Combine all raw series
          2. Add rate-of-change features
          3. Add z-score normalization
          4. Drop rows with insufficient history

        Returns a DataFrame ready for model ingestion.
        """
        combined = self.get_combined_dataframe()
        if combined.empty:
            return combined

        featured = self.add_rate_of_change(combined.copy())
        featured = self.add_zscore(featured)

        # Drop initial NaN rows created by rolling calculations
        featured = featured.dropna(how="all")
        return featured

    def build_latest_vector(self) -> pd.Series:
        """
        Return the most recent observation across all features as a
        single-row Series.  Useful for real-time inference.
        """
        matrix = self.build_feature_matrix()
        if matrix.empty:
            return pd.Series(dtype=float)
        latest = matrix.iloc[-1]
        return latest

    def get_summary(self) -> pd.DataFrame:
        """
        Return a summary table of latest values, 1-week and 1-month
        rate-of-change, and z-scores for all base series.
        """
        matrix = self.build_feature_matrix()
        if matrix.empty:
            return pd.DataFrame()

        base_cols = list(self.series_map.keys())
        rows = []
        for col in base_cols:
            if col not in matrix.columns:
                continue
            latest = matrix[col].dropna()
            if latest.empty:
                continue
            row = {
                "series": col,
                "latest_value": latest.iloc[-1],
                "latest_date": latest.index[-1].strftime("%Y-%m-%d"),
            }
            roc5 = f"{col}_roc_5"
            roc21 = f"{col}_roc_21"
            zscore = f"{col}_zscore"
            if roc5 in matrix.columns:
                val = matrix[roc5].dropna()
                row["roc_1w"] = val.iloc[-1] if not val.empty else np.nan
            if roc21 in matrix.columns:
                val = matrix[roc21].dropna()
                row["roc_1m"] = val.iloc[-1] if not val.empty else np.nan
            if zscore in matrix.columns:
                val = matrix[zscore].dropna()
                row["zscore"] = val.iloc[-1] if not val.empty else np.nan
            rows.append(row)

        return pd.DataFrame(rows).set_index("series")


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

def main():
    """Fetch and display all macroeconomic data."""
    print("=" * 70)
    print("CRYPTO RADAR - Macroeconomic Data Fetcher")
    print("=" * 70)

    api_mode = "API" if FRED_API_KEY else "CSV (no key)"
    print(f"\nFRED access mode: {api_mode}")
    print(f"Cache directory:  {CACHE_DIR}")
    print(f"Cache TTL:        {MACRO_CACHE_HOURS} hours")
    print(f"Series to fetch:  {len(FRED_SERIES)}")
    print()

    fetcher = MacroDataFetcher()

    # --- Fetch all series ---
    print("-" * 70)
    print("Fetching FRED series...")
    print("-" * 70)
    raw = fetcher.fetch_all(delay=0.3)
    print()

    # --- Summary table ---
    print("-" * 70)
    print("Macro Summary")
    print("-" * 70)
    summary = fetcher.get_summary()
    if not summary.empty:
        pd.set_option("display.float_format", lambda x: f"{x:,.4f}")
        pd.set_option("display.max_columns", 10)
        pd.set_option("display.width", 120)
        print(summary.to_string())
    else:
        print("  (no data available)")
    print()

    # --- Feature matrix ---
    print("-" * 70)
    print("Feature Matrix")
    print("-" * 70)
    matrix = fetcher.build_feature_matrix()
    if not matrix.empty:
        print(f"Shape: {matrix.shape}")
        print(f"Date range: {matrix.index[0]} to {matrix.index[-1]}")
        print(f"Columns ({len(matrix.columns)}):")
        for col in sorted(matrix.columns):
            print(f"  {col}")
        print(f"\nLast row (latest feature vector):")
        latest = fetcher.build_latest_vector()
        for k, v in latest.items():
            if pd.notna(v):
                print(f"  {k:30s} = {v:>14.4f}")
    print()

    # --- CME FedWatch ---
    print("-" * 70)
    print("CME FedWatch (stub)")
    print("-" * 70)
    fedwatch = fetch_fedwatch_probabilities()
    for k, v in fedwatch.items():
        print(f"  {k}: {v}")
    print()

    # --- Save combined CSV ---
    os.makedirs(DATA_DIR, exist_ok=True)
    combined = fetcher.get_combined_dataframe()
    if not combined.empty:
        out_path = os.path.join(DATA_DIR, "macro_combined.csv")
        combined.to_csv(out_path)
        print(f"Saved combined macro data to {out_path}")

        feat_path = os.path.join(DATA_DIR, "macro_features.csv")
        matrix.to_csv(feat_path)
        print(f"Saved feature matrix to {feat_path}")

    print("\nDone.")


if __name__ == "__main__":
    main()
