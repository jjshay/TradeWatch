"""
Volatility-Adjusted Label Construction

Replaces raw log returns as ML targets with noise-filtered,
regime-aware labels that better capture tradeable moves.

Implements three labeling strategies from the quantitative finance
literature (primarily Lopez de Prado, "Advances in Financial
Machine Learning"):

1. Triple Barrier Labels  -- directional, ATR-scaled
2. Volatility-Adjusted Threshold Labels -- noise-filtered
3. Meta-Labels -- bet-sizing overlay on a primary model
"""

from __future__ import annotations

import warnings
from dataclasses import dataclass
from typing import Optional

import numpy as np
import pandas as pd
from scipy import stats as sp_stats

from config import (
    ATR_PERIOD,
    TRIPLE_BARRIER_ATR_MULT,
    TRIPLE_BARRIER_MAX_HOLD,
    VOL_LABEL_THRESHOLD,
)
from feature_engineering import TechnicalFeatures

warnings.filterwarnings("ignore", category=FutureWarning)


# ---------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------

@dataclass
class LabelStats:
    """Container for label-distribution diagnostics."""

    counts: dict[int, int]
    proportions: dict[int, float]
    entropy: float
    autocorrelation_lag1: float
    mean_return_per_class: dict[int, float]


# ---------------------------------------------------------------
# 1. Triple Barrier Labels
# ---------------------------------------------------------------

class TripleBarrierLabeler:
    """
    Triple-barrier method (Lopez de Prado, Ch. 3).

    For each entry bar the method defines three exit conditions:

    * Upper barrier  : entry_price * (1 + atr_mult * ATR)
    * Lower barrier  : entry_price * (1 - atr_mult * ATR)
    * Vertical barrier: passage of *max_hold* bars

    The label is determined by which barrier is touched first:
      +1  upper hit first  (profitable long)
      -1  lower hit first  (stop-out)
       0  vertical barrier hit (no conviction)
    """

    def __init__(
        self,
        atr_mult: float = TRIPLE_BARRIER_ATR_MULT,
        max_hold: int = TRIPLE_BARRIER_MAX_HOLD,
        atr_period: int = ATR_PERIOD,
    ):
        self.atr_mult = atr_mult
        self.max_hold = max_hold
        self.atr_period = atr_period
        self._tech = TechnicalFeatures()

    # -- public API ---------------------------------------------------

    def label(self, ohlcv: pd.DataFrame) -> pd.Series:
        """
        Compute triple-barrier labels for every bar in *ohlcv*.

        Parameters
        ----------
        ohlcv : pd.DataFrame
            Must contain columns ``high``, ``low``, ``close``.

        Returns
        -------
        pd.Series
            Integer labels {-1, 0, +1} indexed like *ohlcv* (trailing
            bars that cannot be fully evaluated are set to ``0``).
        """
        close = ohlcv["close"].values
        high = ohlcv["high"].values
        low = ohlcv["low"].values

        atr = self._tech.atr(
            ohlcv["high"], ohlcv["low"], ohlcv["close"], self.atr_period
        ).values

        n = len(close)
        labels = np.zeros(n, dtype=np.int64)

        for i in range(n):
            if np.isnan(atr[i]) or atr[i] == 0:
                continue

            entry = close[i]
            upper = entry + self.atr_mult * atr[i]
            lower = entry - self.atr_mult * atr[i]
            end = min(i + self.max_hold, n)

            label = 0  # default: vertical barrier
            for j in range(i + 1, end):
                if high[j] >= upper:
                    label = 1
                    break
                if low[j] <= lower:
                    label = -1
                    break

            labels[i] = label

        return pd.Series(labels, index=ohlcv.index, name="tb_label")


# ---------------------------------------------------------------
# 2. Volatility-Adjusted Threshold Labels
# ---------------------------------------------------------------

class VolatilityThresholdLabeler:
    """
    Labels based on whether the forward return exceeds a
    volatility-scaled threshold.

    This filters out noise during low-volatility regimes where even
    a "large" return in absolute terms is within the normal range.

    label = +1  if fwd_return >  threshold * vol
    label = -1  if fwd_return < -threshold * vol
    label =  0  otherwise
    """

    def __init__(
        self,
        threshold: float = VOL_LABEL_THRESHOLD,
        vol_window: int = 20,
        fwd_window: int = 1,
        use_atr: bool = True,
        atr_period: int = ATR_PERIOD,
    ):
        self.threshold = threshold
        self.vol_window = vol_window
        self.fwd_window = fwd_window
        self.use_atr = use_atr
        self.atr_period = atr_period
        self._tech = TechnicalFeatures()

    def label(self, ohlcv: pd.DataFrame) -> pd.Series:
        """
        Compute volatility-threshold labels.

        Parameters
        ----------
        ohlcv : pd.DataFrame
            Must contain ``close`` (and ``high``, ``low`` when
            *use_atr* is True).

        Returns
        -------
        pd.Series
            Integer labels {-1, 0, +1}.
        """
        close = ohlcv["close"]

        # Forward return
        fwd_ret = close.pct_change(self.fwd_window).shift(-self.fwd_window)

        # Volatility estimate
        if self.use_atr:
            vol = self._tech.atr(
                ohlcv["high"], ohlcv["low"], close, self.atr_period
            ) / close
        else:
            log_ret = np.log(close / close.shift(1))
            vol = log_ret.rolling(self.vol_window).std()

        upper = self.threshold * vol
        lower = -self.threshold * vol

        labels = pd.Series(np.int64(0), index=ohlcv.index, name="vol_label")
        labels[fwd_ret > upper] = 1
        labels[fwd_ret < lower] = -1

        # NaN positions (insufficient history / look-ahead) -> 0
        labels[fwd_ret.isna() | vol.isna()] = 0

        return labels


# ---------------------------------------------------------------
# 3. Meta-Labeling
# ---------------------------------------------------------------

class MetaLabeler:
    """
    Meta-labeling (Lopez de Prado, Ch. 3.6).

    Given a primary model's directional prediction the meta-labeler
    learns *when* to trust that prediction (bet sizing).

    Output:
      1  = take the trade (primary signal is likely correct)
      0  = skip (primary signal is likely wrong)

    The meta-label is derived from whether the primary model's
    signal was historically correct at a similar confidence level.
    """

    def __init__(self, confidence_bins: int = 10, min_samples: int = 30):
        self.confidence_bins = confidence_bins
        self.min_samples = min_samples
        self._accuracy_table: Optional[pd.Series] = None

    # -- fitting ------------------------------------------------------

    def fit(
        self,
        primary_signals: pd.Series,
        primary_confidences: pd.Series,
        actual_returns: pd.Series,
    ) -> "MetaLabeler":
        """
        Learn the relationship between primary-model confidence and
        historical accuracy.

        Parameters
        ----------
        primary_signals : pd.Series
            Directional predictions from the primary model (+1 / -1).
        primary_confidences : pd.Series
            Scalar confidence (e.g. softmax probability) for each signal.
        actual_returns : pd.Series
            Realised forward returns (same index).

        Returns
        -------
        self
        """
        df = pd.DataFrame({
            "signal": primary_signals,
            "confidence": primary_confidences,
            "return": actual_returns,
        }).dropna()

        # Was the primary signal correct?
        df["correct"] = ((df["signal"] > 0) & (df["return"] > 0)) | (
            (df["signal"] < 0) & (df["return"] < 0)
        )

        # Bin confidence levels
        df["conf_bin"] = pd.qcut(
            df["confidence"],
            q=self.confidence_bins,
            duplicates="drop",
            labels=False,
        )

        accuracy_by_bin = df.groupby("conf_bin")["correct"].agg(["mean", "count"])
        # Only trust bins with enough samples
        accuracy_by_bin.loc[accuracy_by_bin["count"] < self.min_samples, "mean"] = 0.5
        self._accuracy_table = accuracy_by_bin["mean"]
        self._bin_edges = pd.qcut(
            df["confidence"],
            q=self.confidence_bins,
            duplicates="drop",
            retbins=True,
        )[1]

        return self

    # -- prediction ---------------------------------------------------

    def label(
        self,
        primary_confidences: pd.Series,
        accuracy_threshold: float = 0.55,
    ) -> pd.Series:
        """
        Produce meta-labels (0/1) for new data.

        Parameters
        ----------
        primary_confidences : pd.Series
            Confidence values from the primary model.
        accuracy_threshold : float
            Minimum historical accuracy required to take the trade.

        Returns
        -------
        pd.Series
            Binary meta-labels (1 = take, 0 = skip).
        """
        if self._accuracy_table is None:
            raise RuntimeError("MetaLabeler has not been fitted yet.")

        bins = np.digitize(primary_confidences.values, self._bin_edges) - 1
        bins = np.clip(bins, 0, len(self._accuracy_table) - 1)

        expected_acc = self._accuracy_table.values[bins]
        meta_labels = (expected_acc >= accuracy_threshold).astype(np.int64)

        return pd.Series(meta_labels, index=primary_confidences.index, name="meta_label")


# ---------------------------------------------------------------
# Diagnostics & Visualisation
# ---------------------------------------------------------------

class LabelDiagnostics:
    """Utilities for inspecting and comparing label quality."""

    @staticmethod
    def class_balance(labels: pd.Series) -> LabelStats:
        """
        Compute class-balance statistics plus entropy and
        lag-1 autocorrelation of the label sequence.
        """
        counts = labels.value_counts().to_dict()
        total = len(labels)
        proportions = {k: v / total for k, v in counts.items()}

        # Shannon entropy (base-e)
        probs = np.array(list(proportions.values()))
        probs = probs[probs > 0]
        entropy = float(-np.sum(probs * np.log(probs)))

        # Autocorrelation at lag 1
        numeric = labels.astype(float)
        acf1 = float(numeric.autocorr(lag=1)) if len(numeric) > 1 else 0.0
        if np.isnan(acf1):
            acf1 = 0.0

        return LabelStats(
            counts=counts,
            proportions=proportions,
            entropy=entropy,
            autocorrelation_lag1=acf1,
            mean_return_per_class={},
        )

    @staticmethod
    def compare_with_returns(
        labels: pd.Series,
        returns: pd.Series,
    ) -> LabelStats:
        """
        Compute label diagnostics *and* mean realised return per class.
        """
        stats = LabelDiagnostics.class_balance(labels)

        aligned = pd.DataFrame({"label": labels, "ret": returns}).dropna()
        mean_ret = aligned.groupby("label")["ret"].mean().to_dict()
        stats.mean_return_per_class = mean_ret

        return stats

    @staticmethod
    def print_report(name: str, stats: LabelStats) -> None:
        """Pretty-print a label-quality report to stdout."""
        print(f"\n{'=' * 50}")
        print(f"  Label Report: {name}")
        print(f"{'=' * 50}")
        total = sum(stats.counts.values())
        print(f"  Total samples : {total:,}")
        for cls in sorted(stats.counts.keys()):
            cnt = stats.counts[cls]
            pct = stats.proportions[cls] * 100
            ret_str = ""
            if cls in stats.mean_return_per_class:
                ret_str = f"  mean_ret={stats.mean_return_per_class[cls]:+.5f}"
            print(f"  Class {cls:+d} : {cnt:6,} ({pct:5.1f}%){ret_str}")
        print(f"  Entropy        : {stats.entropy:.4f}")
        print(f"  Autocorr(lag=1): {stats.autocorrelation_lag1:+.4f}")
        print(f"{'=' * 50}")

    @staticmethod
    def visualize_distribution(
        labels: pd.Series,
        title: str = "Label Distribution",
        save_path: Optional[str] = None,
    ) -> None:
        """
        Bar chart of label distribution.  Falls back gracefully
        when matplotlib is not available (e.g. headless server).
        """
        try:
            import matplotlib.pyplot as plt
        except ImportError:
            print("[LabelDiagnostics] matplotlib not installed -- skipping plot.")
            return

        counts = labels.value_counts().sort_index()
        fig, ax = plt.subplots(figsize=(6, 4))
        colors = {-1: "#d62728", 0: "#7f7f7f", 1: "#2ca02c"}
        bar_colors = [colors.get(c, "#1f77b4") for c in counts.index]
        ax.bar(counts.index.astype(str), counts.values, color=bar_colors)
        ax.set_xlabel("Label")
        ax.set_ylabel("Count")
        ax.set_title(title)
        for i, (lbl, cnt) in enumerate(zip(counts.index, counts.values)):
            ax.text(i, cnt + max(counts.values) * 0.01, str(cnt),
                    ha="center", va="bottom", fontsize=9)
        plt.tight_layout()
        if save_path:
            fig.savefig(save_path, dpi=150)
            print(f"[LabelDiagnostics] Saved plot to {save_path}")
        else:
            plt.show()

    @staticmethod
    def compare_label_quality(
        raw_returns: pd.Series,
        label_series: dict[str, pd.Series],
    ) -> pd.DataFrame:
        """
        Side-by-side comparison of multiple labeling approaches
        against raw returns.

        Returns a DataFrame with entropy, autocorrelation, and
        class balance for each approach.
        """
        rows = []

        # Raw return discretized at 0
        raw_discrete = pd.Series(
            np.sign(raw_returns).astype(int), index=raw_returns.index
        )
        stats_raw = LabelDiagnostics.compare_with_returns(raw_discrete, raw_returns)
        rows.append({
            "method": "raw_return_sign",
            "entropy": stats_raw.entropy,
            "autocorr_lag1": stats_raw.autocorrelation_lag1,
            "n_classes": len(stats_raw.counts),
            "majority_pct": max(stats_raw.proportions.values()) * 100,
        })

        for name, labels in label_series.items():
            st = LabelDiagnostics.compare_with_returns(labels, raw_returns)
            rows.append({
                "method": name,
                "entropy": st.entropy,
                "autocorr_lag1": st.autocorrelation_lag1,
                "n_classes": len(st.counts),
                "majority_pct": max(st.proportions.values()) * 100,
            })

        return pd.DataFrame(rows).set_index("method")


# ---------------------------------------------------------------
# CLI Entry Point
# ---------------------------------------------------------------

def _generate_synthetic_ohlcv(n: int = 2000, seed: int = 42) -> pd.DataFrame:
    """Generate synthetic OHLCV data for demonstration."""
    rng = np.random.default_rng(seed)
    dates = pd.date_range("2022-01-01", periods=n, freq="h")

    close = 30000 + np.cumsum(rng.normal(0, 50, n))
    close = np.maximum(close, 1000)  # floor
    high = close + rng.uniform(20, 200, n)
    low = close - rng.uniform(20, 200, n)
    opn = close + rng.normal(0, 30, n)
    volume = rng.lognormal(10, 1, n)

    return pd.DataFrame({
        "open": opn,
        "high": high,
        "low": low,
        "close": close,
        "volume": volume,
    }, index=dates)


if __name__ == "__main__":
    print("=" * 60)
    print("CRYPTO RADAR - Label Engineering")
    print("=" * 60)

    ohlcv = _generate_synthetic_ohlcv()
    log_ret = np.log(ohlcv["close"] / ohlcv["close"].shift(1)).fillna(0)

    # --- Triple Barrier Labels ---
    tb = TripleBarrierLabeler()
    tb_labels = tb.label(ohlcv)
    tb_stats = LabelDiagnostics.compare_with_returns(tb_labels, log_ret)
    LabelDiagnostics.print_report("Triple Barrier", tb_stats)

    # --- Volatility Threshold Labels ---
    vt = VolatilityThresholdLabeler()
    vt_labels = vt.label(ohlcv)
    vt_stats = LabelDiagnostics.compare_with_returns(vt_labels, log_ret)
    LabelDiagnostics.print_report("Volatility Threshold", vt_stats)

    # --- Meta-Labeler ---
    print("\n--- Meta-Labeler Demo ---")
    rng = np.random.default_rng(99)
    primary_signals = pd.Series(
        rng.choice([-1, 1], size=len(ohlcv)),
        index=ohlcv.index,
        name="signal",
    )
    primary_confs = pd.Series(
        rng.uniform(0.4, 0.95, size=len(ohlcv)),
        index=ohlcv.index,
        name="confidence",
    )

    ml = MetaLabeler(confidence_bins=5)
    ml.fit(primary_signals, primary_confs, log_ret)
    meta_labels = ml.label(primary_confs, accuracy_threshold=0.52)

    take_rate = meta_labels.mean()
    print(f"  Meta-label take rate: {take_rate:.1%}")
    print(f"  Trades taken: {meta_labels.sum():,.0f} / {len(meta_labels):,}")

    # --- Side-by-side comparison ---
    comparison = LabelDiagnostics.compare_label_quality(
        log_ret,
        {"triple_barrier": tb_labels, "vol_threshold": vt_labels},
    )
    print(f"\n--- Label Quality Comparison ---")
    print(comparison.to_string(float_format="%.4f"))

    # --- Visualisation (optional) ---
    try:
        LabelDiagnostics.visualize_distribution(
            tb_labels, title="Triple Barrier Label Distribution"
        )
    except Exception:
        print("[skip] Could not display plot (headless environment).")

    print("\nLabel engineering pipeline validated successfully.")
