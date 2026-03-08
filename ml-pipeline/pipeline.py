"""
Crypto Radar - Full Pipeline Orchestrator (v2)

Wires together ALL modules for end-to-end prediction:
  1. Data ingestion: market (CoinGecko), on-chain (blockchain.info),
     macro (FRED), sentiment (FinBERT), social (Reddit/Trends), alpha signals
  2. Feature engineering: 40+ features from 6 data pillars
  3. Label construction: triple barrier (Lopez de Prado)
  4. Model training: LSTM fusion + XGBoost + LightGBM + stacking ensemble
  5. Evaluation: Sharpe, Sortino, MDD, directional accuracy

Usage:
  python pipeline.py --mode full        # Full pipeline with all data sources
  python pipeline.py --mode fast        # Skip slow sources (FinBERT, social)
  python pipeline.py --mode sentiment   # Sentiment analysis only
  python pipeline.py --mode signals     # Alpha signals snapshot only
"""

import argparse
import os
import json
import numpy as np
import pandas as pd
import torch
from torch.utils.data import DataLoader
from datetime import datetime, timezone

from config import (
    DATA_DIR, MODEL_DIR, SEQUENCE_LENGTH, BATCH_SIZE, EPOCHS,
    TRACKED_ASSETS
)

# Core modules (always loaded)
from data_ingestion import MarketDataIngestor, OnChainIngestor, Preprocessor
from feature_engineering import FeatureBuilder
from fusion_model import FusionModel, CryptoDataset, ModelTrainer
from backtester import RiskManager
from metrics import ModelEvaluator

# Extended modules (imported with error handling)
def _safe_import(module_name, class_name):
    """Import a class, return None if module unavailable."""
    try:
        mod = __import__(module_name, fromlist=[class_name])
        return getattr(mod, class_name)
    except (ImportError, AttributeError) as e:
        print(f"  [SKIP] {module_name}.{class_name}: {e}")
        return None


class CryptoRadarPipeline:
    """End-to-end crypto prediction pipeline with all data sources."""

    def __init__(self, asset="BTC", fast_mode=False):
        self.asset = asset
        self.fast_mode = fast_mode
        self.market = MarketDataIngestor()
        self.onchain = OnChainIngestor()
        self.preprocessor = Preprocessor()
        self.feature_builder = FeatureBuilder()
        self.evaluator = ModelEvaluator()

        os.makedirs(DATA_DIR, exist_ok=True)
        os.makedirs(MODEL_DIR, exist_ok=True)

    # ================================================================
    # STEP 1: DATA INGESTION (6 pillars)
    # ================================================================
    def ingest_all(self, days=365):
        """Fetch data from all available sources."""
        print("\n" + "=" * 65)
        print("[Step 1] DATA INGESTION")
        print("=" * 65)

        results = {}

        # 1A. Market OHLCV (required)
        print("\n  [1A] Market OHLCV...")
        results["ohlcv"] = self.market.fetch_ohlcv(self.asset, days=days)
        print(f"       {len(results['ohlcv'])} rows fetched")

        # 1B. On-Chain basics
        print("\n  [1B] On-Chain metrics...")
        onchain = self.onchain.fetch_btc_onchain()
        fg = self.onchain.fetch_fear_greed()
        onchain.update(fg)
        results["onchain"] = onchain
        print(f"       {len(onchain)} fields | Fear & Greed: "
              f"{fg.get('fear_greed_value', '?')} ({fg.get('fear_greed_label', '?')})")

        # 1C. Advanced On-Chain (blockchain.info)
        print("\n  [1C] Advanced on-chain (blockchain.info)...")
        OnChainAgg = _safe_import("onchain_advanced", "OnChainAggregator")
        if OnChainAgg:
            try:
                agg = OnChainAgg()
                adv_onchain = agg.fetch_free_metrics()
                results["onchain_advanced"] = adv_onchain
                n_metrics = sum(1 for v in adv_onchain.values()
                               if v is not None and v != {})
                print(f"       {n_metrics} metric groups fetched")
            except Exception as e:
                print(f"       [WARN] {e}")
                results["onchain_advanced"] = {}
        else:
            results["onchain_advanced"] = {}

        # 1D. Macro data (FRED)
        print("\n  [1D] Macro data (FRED)...")
        MacroFetcher = _safe_import("macro_data", "MacroDataFetcher")
        if MacroFetcher:
            try:
                macro = MacroFetcher()
                macro_features = macro.build_feature_matrix()
                results["macro"] = macro_features
                print(f"       {macro_features.shape[1]} macro features, "
                      f"{len(macro_features)} rows")
            except Exception as e:
                print(f"       [WARN] {e}")
                results["macro"] = pd.DataFrame()
        else:
            results["macro"] = pd.DataFrame()

        # 1E. FinBERT Sentiment (skip in fast mode)
        if not self.fast_mode:
            print("\n  [1E] FinBERT sentiment (7 RSS feeds)...")
            SentEngine = _safe_import("sentiment_engine", "SentimentEngine")
            if SentEngine:
                try:
                    engine = SentEngine()
                    sent_df = engine.analyze_all_feeds(max_per_feed=3)
                    agg_sent = engine.aggregate_sentiment(sent_df)
                    results["sentiment"] = sent_df
                    results["sentiment_agg"] = agg_sent
                    print(f"       {agg_sent['label'].upper()} "
                          f"(composite={agg_sent['composite']:+.4f}, "
                          f"n={agg_sent['count']})")
                except Exception as e:
                    print(f"       [WARN] {e}")
                    results["sentiment"] = pd.DataFrame()
            else:
                results["sentiment"] = pd.DataFrame()
        else:
            print("\n  [1E] FinBERT sentiment... SKIPPED (fast mode)")
            results["sentiment"] = pd.DataFrame()

        # 1F. Social sentiment (skip in fast mode)
        if not self.fast_mode:
            print("\n  [1F] Social sentiment (Reddit, Trends)...")
            SocialAgg = _safe_import("social_sentiment", "SocialSentimentAggregator")
            if SocialAgg:
                try:
                    social = SocialAgg()
                    social_result = social.fetch_all_sources()
                    results["social"] = social_result
                    composite = social.compute_composite(social_result)
                    results["social_composite"] = composite
                    print(f"       Composite: {composite.get('composite_score', 0):+.3f} "
                          f"({composite.get('label', 'N/A')})")
                except Exception as e:
                    print(f"       [WARN] {e}")
                    results["social"] = {}
            else:
                results["social"] = {}
        else:
            print("\n  [1F] Social sentiment... SKIPPED (fast mode)")
            results["social"] = {}

        # 1G. Alpha signals
        print("\n  [1G] Non-obvious alpha signals...")
        AlphaAgg = _safe_import("alpha_signals", "AlphaSignalAggregator")
        if AlphaAgg:
            try:
                alpha = AlphaAgg()
                snapshot = alpha.fetch_snapshot()
                composite = alpha.compute_composite(snapshot)
                results["alpha"] = snapshot
                results["alpha_composite"] = composite
                print(f"       Alpha score: {composite['composite_score']:+.4f} "
                      f"({composite['label']})")
            except Exception as e:
                print(f"       [WARN] {e}")
                results["alpha"] = {}
                results["alpha_composite"] = {}
        else:
            results["alpha"] = {}
            results["alpha_composite"] = {}

        return results

    # ================================================================
    # STEP 2: FEATURE ENGINEERING
    # ================================================================
    def build_features(self, data: dict):
        """Build unified feature matrix from all data sources."""
        print("\n" + "=" * 65)
        print("[Step 2] FEATURE ENGINEERING")
        print("=" * 65)

        ohlcv = data["ohlcv"]

        # Technical features (MACD, RSI, BB, ATR, OBV, vol, EMAs)
        print("\n  [2A] Technical indicators...")
        features = self.feature_builder.build_technical_features(ohlcv)
        print(f"       {features.shape[1]} columns after technicals")

        # Merge sentiment
        print("  [2B] Merging sentiment...")
        sent_df = data.get("sentiment", pd.DataFrame())
        features = self.feature_builder.merge_sentiment(features, sent_df)

        # Merge on-chain
        print("  [2C] Merging on-chain...")
        features = self.feature_builder.merge_onchain(features, data["onchain"])

        # Merge macro features
        print("  [2D] Merging macro...")
        macro_df = data.get("macro", pd.DataFrame())
        if not macro_df.empty:
            # Align macro data to feature index by date
            macro_daily = macro_df.copy()
            macro_daily.index = pd.to_datetime(macro_daily.index).tz_localize(None)
            features_idx = features.index.tz_localize(None) if features.index.tz else features.index

            # Select key macro columns
            macro_cols = [c for c in macro_daily.columns if c.startswith("z_") or c.endswith("_roc_21d")]
            macro_subset = macro_daily[macro_cols] if macro_cols else macro_daily.iloc[:, :5]

            # Merge on nearest date
            features_temp = features.copy()
            features_temp["_date"] = features_idx.date
            macro_subset["_date"] = macro_daily.index.date

            merged = features_temp.merge(macro_subset, on="_date", how="left", suffixes=("", "_macro"))
            merged = merged.drop(columns=["_date"])
            merged.index = features.index

            # Forward-fill macro data
            new_cols = [c for c in merged.columns if c not in features.columns]
            for col in new_cols:
                merged[col] = merged[col].ffill().fillna(0)
            features = merged
            print(f"       Added {len(new_cols)} macro features")
        else:
            print("       No macro data available")

        # Merge alpha signal composite as a feature
        print("  [2E] Merging alpha signals...")
        alpha_composite = data.get("alpha_composite", {})
        alpha_score = alpha_composite.get("composite_score", 0)
        features["alpha_composite"] = alpha_score
        components = alpha_composite.get("component_scores", {})
        for key, val in components.items():
            features[f"alpha_{key}"] = val
        print(f"       Alpha composite: {alpha_score:+.4f}")

        # Merge social composite
        social_composite = data.get("social_composite", {})
        features["social_composite"] = social_composite.get("composite_score", 0)

        features = features.dropna()

        # Determine feature columns for model
        exclude_cols = {"open", "high", "low", "close", "volume",
                        "obv", "ema_9", "ema_21", "sma_50", "sma_200",
                        "bb_middle", "bb_upper", "bb_lower", "vol_ma",
                        "weekend_vol_avg", "weekday_vol_avg"}
        feature_cols = [c for c in features.columns if c not in exclude_cols]

        print(f"\n  Total features: {len(feature_cols)}")
        print(f"  Total samples: {len(features)}")

        return features, feature_cols

    # ================================================================
    # STEP 3: LABEL CONSTRUCTION
    # ================================================================
    def build_labels(self, features: pd.DataFrame):
        """Create triple barrier labels instead of raw returns."""
        print("\n" + "=" * 65)
        print("[Step 3] LABEL CONSTRUCTION")
        print("=" * 65)

        TripleBarrier = _safe_import("label_engineering", "TripleBarrierLabeler")
        VolLabeler = _safe_import("label_engineering", "VolatilityThresholdLabeler")

        if TripleBarrier and "high" in features.columns and "low" in features.columns:
            print("  Using Triple Barrier labels (Lopez de Prado)...")
            try:
                labeler = TripleBarrier()
                labels = labeler.label(features)
                n_up = (labels == 1).sum()
                n_down = (labels == -1).sum()
                n_flat = (labels == 0).sum()
                print(f"  Distribution: UP={n_up} DOWN={n_down} FLAT={n_flat}")
                return labels
            except Exception as e:
                print(f"  [WARN] Triple barrier failed: {e}")

        if VolLabeler and "log_return" in features.columns:
            print("  Falling back to volatility-adjusted labels...")
            try:
                labeler = VolLabeler()
                labels = labeler.label(features)
                return labels
            except Exception as e:
                print(f"  [WARN] Vol labels failed: {e}")

        # Final fallback: raw return direction
        print("  Using raw return direction labels (fallback)...")
        if "log_return" in features.columns:
            returns = features["log_return"].shift(-1).dropna()
            labels = pd.Series(0, index=returns.index)
            labels[returns > 0.001] = 1
            labels[returns < -0.001] = -1
            return labels

        return pd.Series(0, index=features.index)

    # ================================================================
    # STEP 4: MODEL TRAINING (Fusion + Ensemble)
    # ================================================================
    def train_all_models(self, features, feature_cols, labels):
        """Train LSTM fusion model + XGBoost + LightGBM ensemble."""
        print("\n" + "=" * 65)
        print("[Step 4] MODEL TRAINING")
        print("=" * 65)

        # Align features and labels
        common_idx = features.index.intersection(labels.index)
        features = features.loc[common_idx]
        labels = labels.loc[common_idx]

        available_cols = [c for c in feature_cols if c in features.columns]
        feature_matrix = features[available_cols].values
        label_array = labels.values

        results = {}

        # --- 4A: XGBoost (fast, good baseline) ---
        print("\n  [4A] XGBoost classifier...")
        XGBClassifier = _safe_import("ensemble_model", "XGBoostClassifier")
        compute_weights = _safe_import("ensemble_model", "compute_class_weights")
        if XGBClassifier:
            try:
                split = int(len(feature_matrix) * 0.8)
                X_train, X_test = feature_matrix[:split], feature_matrix[split:]
                y_train, y_test = label_array[:split], label_array[split:]

                # Map labels from {-1, 0, 1} to {0, 1, 2} for XGBoost
                y_train_mapped = y_train + 1
                y_test_mapped = y_test + 1

                # Compute class weights for imbalanced data
                cw = compute_weights(y_train_mapped) if compute_weights else None
                xgb = XGBClassifier(class_weights=cw)
                xgb.fit(X_train, y_train_mapped)
                xgb_preds = xgb.predict(X_test)
                xgb_acc = np.mean(xgb_preds == y_test_mapped)
                print(f"       Accuracy: {xgb_acc:.3f}")

                # Feature importance
                if hasattr(xgb, 'model') and hasattr(xgb.model, 'feature_importances_'):
                    importances = xgb.model.feature_importances_
                    top_idx = np.argsort(importances)[-10:][::-1]
                    print("       Top 10 features:")
                    for idx in top_idx:
                        if idx < len(available_cols):
                            print(f"         {available_cols[idx]:30s} "
                                  f"{importances[idx]:.4f}")

                results["xgboost"] = {
                    "accuracy": float(xgb_acc),
                    "model": xgb,
                    "predictions": xgb_preds
                }
            except Exception as e:
                print(f"       [WARN] XGBoost failed: {e}")

        # --- 4B: LightGBM ---
        print("\n  [4B] LightGBM classifier...")
        LGBClassifier = _safe_import("ensemble_model", "LightGBMClassifier")
        if LGBClassifier and 'X_train' in dir():
            try:
                lgb = LGBClassifier(class_weights=cw)
                lgb.fit(X_train, y_train_mapped)
                lgb_preds = lgb.predict(X_test)
                lgb_acc = np.mean(lgb_preds == y_test_mapped)
                print(f"       Accuracy: {lgb_acc:.3f}")
                results["lightgbm"] = {
                    "accuracy": float(lgb_acc),
                    "model": lgb,
                    "predictions": lgb_preds
                }
            except Exception as e:
                print(f"       [WARN] LightGBM failed: {e}")

        # --- 4C: LSTM Fusion Model ---
        print("\n  [4C] LSTM + Dense Fusion Model...")
        temporal_cols = [c for c in available_cols
                         if not c.startswith("sent_")
                         and not c.startswith("onchain_")
                         and not c.startswith("alpha_")
                         and not c.startswith("social_")
                         and not c.startswith("z_")
                         and not c.endswith("_macro")]
        static_cols = [c for c in available_cols if c not in temporal_cols]

        # Need enough data for sequences
        if len(features) > SEQUENCE_LENGTH + 50:
            try:
                temporal_data = features[temporal_cols].values if temporal_cols else feature_matrix[:, :10]
                static_data = features[static_cols].values if static_cols else feature_matrix[:, -5:]

                # Use log_return as regression target
                if "log_return" in features.columns:
                    reg_target = features["log_return"].shift(-1).fillna(0).values
                else:
                    reg_target = np.zeros(len(features))

                # Create sequences
                X_temp, y_reg = self.preprocessor.create_sequences(
                    temporal_data, reg_target, SEQUENCE_LENGTH
                )
                X_stat = static_data[SEQUENCE_LENGTH:]

                min_len = min(len(X_temp), len(X_stat), len(y_reg))
                X_temp, X_stat, y_reg = X_temp[:min_len], X_stat[:min_len], y_reg[:min_len]

                # Split
                split = int(min_len * 0.8)
                train_ds = CryptoDataset(X_temp[:split], X_stat[:split], y_reg[:split])
                val_ds = CryptoDataset(X_temp[split:], X_stat[split:], y_reg[split:])
                train_loader = DataLoader(train_ds, batch_size=BATCH_SIZE, shuffle=False)
                val_loader = DataLoader(val_ds, batch_size=BATCH_SIZE, shuffle=False)

                n_temporal = X_temp.shape[2]
                n_static = X_stat.shape[1]

                model = FusionModel(temporal_features=n_temporal, static_features=n_static)
                params = sum(p.numel() for p in model.parameters())
                print(f"       {params:,} parameters | {n_temporal} temporal + "
                      f"{n_static} static features")
                print(f"       Train: {len(train_ds)} | Val: {len(val_ds)}")

                trainer = ModelTrainer(model)
                # Use fewer epochs for first run
                epochs = min(EPOCHS, 25)
                history = trainer.fit(train_loader, val_loader, epochs=epochs, patience=8)

                # Evaluate
                val_loss, val_acc, preds, actuals = trainer.evaluate(val_loader)
                rmse = np.sqrt(np.mean((preds - actuals) ** 2))
                da = np.mean(np.sign(preds) == np.sign(actuals))
                print(f"       RMSE: {rmse:.6f} | Direction Acc: {da:.3f}")

                # Save model
                model_path = os.path.join(MODEL_DIR, f"{self.asset}_fusion_model.pt")
                trainer.save(model_path)

                results["lstm_fusion"] = {
                    "rmse": float(rmse),
                    "direction_accuracy": float(da),
                    "val_loss": float(val_loss),
                    "predictions": preds,
                    "actuals": actuals,
                }
            except Exception as e:
                print(f"       [WARN] LSTM failed: {e}")
                import traceback
                traceback.print_exc()
        else:
            print(f"       [SKIP] Not enough data ({len(features)} rows, "
                  f"need {SEQUENCE_LENGTH + 50})")

        # --- 4D: Stacking Meta-Learner ---
        if "xgboost" in results and "lightgbm" in results:
            print("\n  [4D] Stacking Meta-Learner...")
            MetaLearner = _safe_import("ensemble_model", "StackingMetaLearner")
            if MetaLearner:
                try:
                    base_models = [
                        results["xgboost"]["model"],
                        results["lightgbm"]["model"],
                    ]
                    meta = MetaLearner()
                    meta.fit(base_models, X_train, y_train_mapped)
                    meta_preds = meta.predict(X_test)
                    meta_acc = np.mean(meta_preds == y_test_mapped)
                    print(f"       Stacked accuracy: {meta_acc:.3f}")
                    results["stacking"] = {"accuracy": float(meta_acc)}
                except Exception as e:
                    print(f"       [WARN] Stacking failed: {e}")

        # Random baseline
        random_acc = np.mean(
            np.random.choice([0, 1, 2], size=len(y_test_mapped)) == y_test_mapped
        ) if 'y_test_mapped' in dir() else 0.33
        results["random_baseline"] = {"accuracy": float(random_acc)}

        return results

    # ================================================================
    # STEP 5: EVALUATION
    # ================================================================
    def evaluate_results(self, model_results: dict, features: pd.DataFrame):
        """Comprehensive evaluation of all models."""
        print("\n" + "=" * 65)
        print("[Step 5] EVALUATION")
        print("=" * 65)

        # Model comparison
        print("\n  Model Comparison:")
        print(f"  {'Model':<25} {'Accuracy':>10}")
        print("  " + "-" * 37)

        for name, result in sorted(model_results.items(),
                                   key=lambda x: x[1].get("accuracy",
                                                          x[1].get("direction_accuracy", 0)),
                                   reverse=True):
            acc = result.get("accuracy", result.get("direction_accuracy", 0))
            marker = " <-- best" if acc == max(
                r.get("accuracy", r.get("direction_accuracy", 0))
                for r in model_results.values()
            ) else ""
            print(f"  {name:<25} {acc:>9.3f}{marker}")

        # Portfolio simulation with best model
        lstm_results = model_results.get("lstm_fusion", {})
        if "predictions" in lstm_results and "actuals" in lstm_results:
            print("\n  Portfolio Simulation (LSTM predictions):")
            preds = lstm_results["predictions"]
            actuals = lstm_results["actuals"]
            vols = np.abs(np.diff(actuals, prepend=actuals[0])) + 0.3

            risk = RiskManager()
            portfolio = risk.simulate_portfolio(preds, actuals, vols)

            benchmark_equity = 100000 * np.cumprod(1 + actuals)
            benchmark_equity = np.insert(benchmark_equity, 0, 100000)

            strat_returns = np.diff(portfolio["equity_curve"]) / portfolio["equity_curve"][:-1]

            results = self.evaluator.evaluate_portfolio(
                strat_returns, portfolio["equity_curve"],
                actuals, benchmark_equity
            )
            self.evaluator.print_report(results)
            return results

        return model_results

    # ================================================================
    # MAIN PIPELINE MODES
    # ================================================================
    def run_full(self, days=365):
        """Full pipeline: ingest -> features -> labels -> train -> evaluate."""
        print("=" * 65)
        print(f"  CRYPTO RADAR - FULL PIPELINE ({'FAST' if self.fast_mode else 'COMPLETE'})")
        print(f"  Asset: {self.asset} | Days: {days}")
        print(f"  Timestamp: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}")
        print("=" * 65)

        # 1. Ingest
        data = self.ingest_all(days)

        # 2. Features
        features, feature_cols = self.build_features(data)

        # 3. Labels
        labels = self.build_labels(features)

        # 4. Train
        model_results = self.train_all_models(features, feature_cols, labels)

        # 5. Evaluate
        eval_results = self.evaluate_results(model_results, features)

        # Save summary
        summary = {
            "asset": self.asset,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "fast_mode": self.fast_mode,
            "data_rows": len(features),
            "feature_count": len(feature_cols),
            "models": {k: {kk: vv for kk, vv in v.items()
                          if kk not in ("model", "predictions", "actuals")}
                      for k, v in model_results.items()},
        }
        summary_path = os.path.join(DATA_DIR, "pipeline_summary.json")
        with open(summary_path, "w") as f:
            json.dump(summary, f, indent=2, default=str)
        print(f"\n[Pipeline] Summary saved to {summary_path}")

        return eval_results

    def run_signals_only(self):
        """Just fetch and display alpha signals."""
        print("=" * 65)
        print("CRYPTO RADAR - ALPHA SIGNALS SNAPSHOT")
        print("=" * 65)

        AlphaAgg = _safe_import("alpha_signals", "AlphaSignalAggregator")
        if AlphaAgg:
            alpha = AlphaAgg()
            snapshot = alpha.fetch_snapshot()
            composite = alpha.compute_composite(snapshot)

            print(f"\nComposite Alpha: {composite['composite_score']:+.4f} "
                  f"({composite['label']})")
            for k, v in composite.get("component_scores", {}).items():
                print(f"  {k:25s}: {v:+.3f}")

            alpha.save_snapshot(snapshot, composite)
            return snapshot, composite
        return None, None

    def run_sentiment_only(self):
        """Run FinBERT sentiment analysis only."""
        print("=" * 65)
        print("CRYPTO RADAR - SENTIMENT ANALYSIS")
        print("=" * 65)

        SentEngine = _safe_import("sentiment_engine", "SentimentEngine")
        if SentEngine:
            engine = SentEngine()
            df = engine.analyze_all_feeds(max_per_feed=5)
            agg = engine.aggregate_sentiment(df)
            print(f"\nSentiment: {agg['label'].upper()} "
                  f"(composite={agg['composite']:+.4f}, n={agg['count']})")
            engine.save_to_csv(df)
            return df, agg
        return None, None


# --- CLI Entry Point ---
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Crypto Radar ML Pipeline v2")
    parser.add_argument("--mode",
                        choices=["full", "fast", "sentiment", "signals"],
                        default="fast",
                        help="Pipeline mode")
    parser.add_argument("--asset", default="BTC",
                        help=f"Asset ({', '.join(TRACKED_ASSETS[:5])})")
    parser.add_argument("--days", type=int, default=365,
                        help="Historical data window in days")

    args = parser.parse_args()

    if args.mode == "full":
        pipeline = CryptoRadarPipeline(asset=args.asset, fast_mode=False)
        pipeline.run_full(days=args.days)
    elif args.mode == "fast":
        pipeline = CryptoRadarPipeline(asset=args.asset, fast_mode=True)
        pipeline.run_full(days=args.days)
    elif args.mode == "sentiment":
        pipeline = CryptoRadarPipeline(asset=args.asset)
        pipeline.run_sentiment_only()
    elif args.mode == "signals":
        pipeline = CryptoRadarPipeline(asset=args.asset)
        pipeline.run_signals_only()
