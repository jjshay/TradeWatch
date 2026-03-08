"""
Crypto Radar ML Pipeline

Multi-modal predictive modeling for Bitcoin & blockchain assets.
Implements the architecture described in the technical paper:

  Section 2: data_ingestion.py     - Market, on-chain, macro data
  Section 3: feature_engineering.py - Technical indicators + FinBERT NLP
             sentiment_engine.py   - RSS sentiment analysis
  Section 4: fusion_model.py      - LSTM + Dense fusion architecture
  Section 5: backtester.py        - Walk-forward, risk management
  Section 6: metrics.py           - Sharpe, Sortino, MDD evaluation
  Section 7: pipeline.py          - Full orchestration

Usage:
  python pipeline.py --mode sentiment   # Sentiment analysis only
  python pipeline.py --mode train       # Train model
  python pipeline.py --mode backtest    # Full walk-forward backtest
  python pipeline.py --mode predict     # Live prediction
"""
