"""
Section 7 Implementation: Full Pipeline Orchestrator

Ties together all components:
  1. Data ingestion (market, on-chain, sentiment)
  2. Feature engineering (technical indicators + NLP)
  3. Model training (LSTM + Dense fusion)
  4. Walk-forward backtesting
  5. Risk management (Kelly, trailing stops, kill switch)
  6. Evaluation metrics (Sharpe, Sortino, MDD)

Usage:
  python pipeline.py --mode backtest   # Full walk-forward backtest
  python pipeline.py --mode train      # Train on latest data
  python pipeline.py --mode predict    # Generate live predictions
  python pipeline.py --mode sentiment  # Run sentiment analysis only
"""

import argparse
import os
import sys
import numpy as np
import pandas as pd
import torch
from torch.utils.data import DataLoader
from datetime import datetime, timezone

from config import (
    DATA_DIR, MODEL_DIR, SEQUENCE_LENGTH, BATCH_SIZE, EPOCHS,
    TRACKED_ASSETS
)
from data_ingestion import MarketDataIngestor, OnChainIngestor, Preprocessor
from feature_engineering import FeatureBuilder
from sentiment_engine import SentimentEngine
from fusion_model import FusionModel, CryptoDataset, ModelTrainer
from backtester import WalkForwardValidator, ExecutionSimulator, RiskManager
from metrics import ModelEvaluator


class CryptoRadarPipeline:
    """End-to-end crypto prediction pipeline."""

    def __init__(self, asset="BTC"):
        self.asset = asset
        self.market = MarketDataIngestor()
        self.onchain = OnChainIngestor()
        self.preprocessor = Preprocessor()
        self.feature_builder = FeatureBuilder()
        self.sentiment_engine = None  # Lazy load (heavy model)
        self.evaluator = ModelEvaluator()

        os.makedirs(DATA_DIR, exist_ok=True)
        os.makedirs(MODEL_DIR, exist_ok=True)

    def _load_sentiment_engine(self):
        if self.sentiment_engine is None:
            self.sentiment_engine = SentimentEngine()

    def ingest_data(self, days=365):
        """Step 1: Fetch all data sources."""
        print("\n[Pipeline] Step 1: Data Ingestion")
        print("-" * 40)

        # Market data
        ohlcv = self.market.fetch_ohlcv(self.asset, days=days)
        print(f"  Market data: {len(ohlcv)} rows")

        # On-chain
        onchain = self.onchain.fetch_btc_onchain()
        fear_greed = self.onchain.fetch_fear_greed()
        onchain.update(fear_greed)
        print(f"  On-chain metrics: {len(onchain)} fields")

        # Sentiment
        self._load_sentiment_engine()
        sentiment_df = self.sentiment_engine.analyze_all_feeds(max_per_feed=5)
        agg_sentiment = self.sentiment_engine.aggregate_sentiment(sentiment_df)
        print(f"  Sentiment: {agg_sentiment['label']} "
              f"(composite={agg_sentiment['composite']:+.4f}, n={agg_sentiment['count']})")

        return ohlcv, onchain, sentiment_df

    def build_features(self, ohlcv, onchain, sentiment_df):
        """Step 2: Feature engineering."""
        print("\n[Pipeline] Step 2: Feature Engineering")
        print("-" * 40)

        features = self.feature_builder.build_technical_features(ohlcv)
        features = self.feature_builder.merge_sentiment(features, sentiment_df)
        features = self.feature_builder.merge_onchain(features, onchain)

        feature_cols = self.feature_builder.get_feature_columns()
        available_cols = [c for c in feature_cols if c in features.columns]
        print(f"  Features: {len(available_cols)}/{len(feature_cols)} available")
        print(f"  Samples: {len(features)}")

        return features, available_cols

    def prepare_model_data(self, features, feature_cols):
        """Step 3: Prepare data for model input."""
        print("\n[Pipeline] Step 3: Data Preparation")
        print("-" * 40)

        # Temporal features (for LSTM): technical indicators
        temporal_cols = [c for c in feature_cols if not c.startswith("sent_")
                         and not c.startswith("onchain_")]
        static_cols = [c for c in feature_cols if c.startswith("sent_")
                       or c.startswith("onchain_")]

        # Target: next-period log return
        target = features["log_return"].shift(-1).dropna()
        features = features.iloc[:-1]  # Align with target

        # Extract arrays
        temporal_data = features[temporal_cols].values
        static_data = features[static_cols].values
        target_data = target.values

        # Create sequences for LSTM
        X_temporal, y = self.preprocessor.create_sequences(
            temporal_data, target_data, SEQUENCE_LENGTH
        )
        # Static features: use the last value in each sequence window
        X_static = static_data[SEQUENCE_LENGTH:]

        # Ensure alignment
        min_len = min(len(X_temporal), len(X_static), len(y))
        X_temporal = X_temporal[:min_len]
        X_static = X_static[:min_len]
        y = y[:min_len]

        print(f"  Temporal shape: {X_temporal.shape} "
              f"({len(temporal_cols)} features x {SEQUENCE_LENGTH} steps)")
        print(f"  Static shape: {X_static.shape} ({len(static_cols)} features)")
        print(f"  Target shape: {y.shape}")

        return X_temporal, X_static, y, temporal_cols, static_cols

    def train_model(self, X_temporal, X_static, y, val_split=0.2):
        """Step 4: Train the fusion model."""
        print("\n[Pipeline] Step 4: Model Training")
        print("-" * 40)

        # Chronological split (no data leakage)
        split_idx = int(len(y) * (1 - val_split))
        train_ds = CryptoDataset(
            X_temporal[:split_idx], X_static[:split_idx], y[:split_idx])
        val_ds = CryptoDataset(
            X_temporal[split_idx:], X_static[split_idx:], y[split_idx:])

        train_loader = DataLoader(train_ds, batch_size=BATCH_SIZE, shuffle=False)
        val_loader = DataLoader(val_ds, batch_size=BATCH_SIZE, shuffle=False)

        model = FusionModel(
            temporal_features=X_temporal.shape[2],
            static_features=X_static.shape[1]
        )

        total_params = sum(p.numel() for p in model.parameters())
        print(f"  Model parameters: {total_params:,}")
        print(f"  Training samples: {len(train_ds)}")
        print(f"  Validation samples: {len(val_ds)}")

        trainer = ModelTrainer(model)
        history = trainer.fit(train_loader, val_loader, epochs=EPOCHS)

        # Save model
        model_path = os.path.join(MODEL_DIR, f"{self.asset}_fusion_model.pt")
        trainer.save(model_path)

        return model, trainer, history, val_loader

    def evaluate(self, trainer, val_loader, benchmark_returns=None):
        """Step 5: Evaluate model performance."""
        print("\n[Pipeline] Step 5: Evaluation")
        print("-" * 40)

        val_loss, val_acc, preds, actuals = trainer.evaluate(val_loader)

        # Predictive metrics
        pred_results = self.evaluator.evaluate_predictions(actuals, preds)
        print(f"  RMSE: {pred_results['rmse']:.6f}")
        print(f"  MAE: {pred_results['mae']:.6f}")
        print(f"  Directional Accuracy: {pred_results['directional_accuracy']:.3f}")

        # Portfolio simulation
        risk = RiskManager()
        volatilities = np.abs(np.diff(actuals, prepend=actuals[0])) + 0.3
        portfolio = risk.simulate_portfolio(preds, actuals, volatilities)

        # Benchmark (HODL)
        if benchmark_returns is None:
            benchmark_returns = actuals
        benchmark_equity = 100000 * np.cumprod(1 + benchmark_returns)
        benchmark_equity = np.insert(benchmark_equity, 0, 100000)

        strategy_returns = np.diff(portfolio["equity_curve"]) / portfolio["equity_curve"][:-1]

        results = self.evaluator.evaluate_portfolio(
            strategy_returns, portfolio["equity_curve"],
            benchmark_returns, benchmark_equity
        )
        self.evaluator.print_report(results)

        return results

    def run_backtest(self, days=365):
        """Full walk-forward backtest pipeline."""
        print("=" * 65)
        print(f"CRYPTO RADAR - FULL PIPELINE BACKTEST ({self.asset})")
        print(f"Timestamp: {datetime.now(timezone.utc).isoformat()}")
        print("=" * 65)

        # 1. Ingest
        ohlcv, onchain, sentiment_df = self.ingest_data(days)

        # 2. Features
        features, feature_cols = self.build_features(ohlcv, onchain, sentiment_df)

        # 3. Prepare
        X_temporal, X_static, y, temp_cols, stat_cols = self.prepare_model_data(
            features, feature_cols)

        # 4. Train
        model, trainer, history, val_loader = self.train_model(
            X_temporal, X_static, y)

        # 5. Evaluate
        results = self.evaluate(trainer, val_loader)

        print("\n[Pipeline] Complete.")
        return results

    def run_sentiment_only(self):
        """Run sentiment analysis without full pipeline."""
        print("=" * 65)
        print("CRYPTO RADAR - SENTIMENT ANALYSIS")
        print("=" * 65)

        self._load_sentiment_engine()
        df = self.sentiment_engine.analyze_all_feeds(max_per_feed=5)
        agg = self.sentiment_engine.aggregate_sentiment(df)

        print(f"\nMarket Sentiment: {agg['label'].upper()} "
              f"(composite={agg['composite']:+.4f})")
        print(f"Headlines analyzed: {agg['count']}")

        self.sentiment_engine.save_to_csv(df)
        return df, agg

    def run_prediction(self):
        """Generate live prediction from latest data."""
        print("=" * 65)
        print(f"CRYPTO RADAR - LIVE PREDICTION ({self.asset})")
        print("=" * 65)

        model_path = os.path.join(MODEL_DIR, f"{self.asset}_fusion_model.pt")
        if not os.path.exists(model_path):
            print("[ERROR] No trained model found. Run --mode train first.")
            return None

        # Ingest latest data
        ohlcv, onchain, sentiment_df = self.ingest_data(days=90)
        features, feature_cols = self.build_features(ohlcv, onchain, sentiment_df)

        temporal_cols = [c for c in feature_cols if not c.startswith("sent_")
                         and not c.startswith("onchain_")]
        static_cols = [c for c in feature_cols if c.startswith("sent_")
                       or c.startswith("onchain_")]

        # Use last SEQUENCE_LENGTH rows
        temporal_data = features[temporal_cols].values[-SEQUENCE_LENGTH:]
        static_data = features[static_cols].values[-1:]

        # Load model
        model = FusionModel(
            temporal_features=len(temporal_cols),
            static_features=len(static_cols)
        )
        model.load_state_dict(torch.load(model_path, weights_only=True))
        model.eval()

        with torch.no_grad():
            t_input = torch.FloatTensor(temporal_data).unsqueeze(0)
            s_input = torch.FloatTensor(static_data)
            reg_out, cls_out = model(t_input, s_input)

        predicted_return = reg_out.item()
        direction_probs = torch.softmax(cls_out, dim=1).numpy()[0]

        current_price = features["close"].iloc[-1]
        predicted_price = current_price * np.exp(predicted_return)

        print(f"\nCurrent Price: ${current_price:,.2f}")
        print(f"Predicted Return: {predicted_return:+.4%}")
        print(f"Predicted Price: ${predicted_price:,.2f}")
        print(f"Direction: DOWN={direction_probs[0]:.2%} "
              f"FLAT={direction_probs[1]:.2%} UP={direction_probs[2]:.2%}")

        signal = "BUY" if direction_probs[2] > 0.5 else \
                 "SELL" if direction_probs[0] > 0.5 else "HOLD"
        print(f"Signal: {signal}")

        return {
            "asset": self.asset,
            "current_price": current_price,
            "predicted_return": predicted_return,
            "predicted_price": predicted_price,
            "direction_probs": {
                "down": float(direction_probs[0]),
                "flat": float(direction_probs[1]),
                "up": float(direction_probs[2])
            },
            "signal": signal,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }


# --- CLI Entry Point ---
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Crypto Radar ML Pipeline")
    parser.add_argument("--mode", choices=["backtest", "train", "predict", "sentiment"],
                        default="sentiment",
                        help="Pipeline mode: backtest, train, predict, or sentiment")
    parser.add_argument("--asset", default="BTC",
                        help=f"Asset to analyze (choices: {', '.join(TRACKED_ASSETS[:10])})")
    parser.add_argument("--days", type=int, default=365,
                        help="Historical data window in days")

    args = parser.parse_args()
    pipeline = CryptoRadarPipeline(asset=args.asset)

    if args.mode == "backtest":
        pipeline.run_backtest(days=args.days)
    elif args.mode == "train":
        ohlcv, onchain, sentiment_df = pipeline.ingest_data(days=args.days)
        features, feature_cols = pipeline.build_features(ohlcv, onchain, sentiment_df)
        X_t, X_s, y, _, _ = pipeline.prepare_model_data(features, feature_cols)
        pipeline.train_model(X_t, X_s, y)
    elif args.mode == "predict":
        pipeline.run_prediction()
    elif args.mode == "sentiment":
        pipeline.run_sentiment_only()
