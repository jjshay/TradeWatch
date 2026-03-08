"""
Crypto Radar ML Pipeline - Configuration
"""
import os
from dotenv import load_dotenv

load_dotenv()

# --- RSS Feed Sources ---
RSS_FEEDS = [
    {"name": "CoinDesk", "url": "https://www.coindesk.com/arc/outboundfeeds/rss/"},
    {"name": "CoinTelegraph", "url": "https://cointelegraph.com/rss"},
    {"name": "Decrypt", "url": "https://decrypt.co/feed"},
    {"name": "TheBlock", "url": "https://www.theblock.co/rss.xml"},
    {"name": "Bitcoin Magazine", "url": "https://bitcoinmagazine.com/feed"},
    {"name": "Blockworks", "url": "https://blockworks.co/feed"},
    {"name": "DeFi Pulse", "url": "https://www.defipulse.com/blog/rss.xml"},
]

# --- Model Parameters ---
FINBERT_MODEL = "ProsusAI/finbert"
SEQUENCE_LENGTH = 60          # 60 time steps for LSTM input
PREDICTION_HORIZON = 4        # Predict 4 hours ahead
LSTM_UNITS = 128
LSTM_LAYERS = 2
DENSE_UNITS = 64
DROPOUT_RATE = 0.3
LEARNING_RATE = 0.001
BATCH_SIZE = 32
EPOCHS = 50
HUBER_DELTA = 1.0

# --- Walk-Forward Backtesting ---
TRAIN_WINDOW_DAYS = 180
TEST_WINDOW_DAYS = 30
STEP_FORWARD_DAYS = 30

# --- Risk Management ---
KELLY_FRACTION = 0.5          # Half-Kelly for safety
MAX_DRAWDOWN_THRESHOLD = 0.20 # Kill switch at 20% drawdown
ATR_MULTIPLIER = 2.5          # ATR trailing stop multiplier
ATR_PERIOD = 14
MAX_POSITION_SIZE = 0.10      # Max 10% of portfolio per trade

# --- Exchange (fees / slippage) ---
TAKER_FEE = 0.001             # 0.10% taker fee
SLIPPAGE_BASE = 0.0005        # 0.05% base slippage
SLIPPAGE_VOL_MULT = 0.002     # Additional slippage per unit volatility

# --- Data Paths ---
DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
MODEL_DIR = os.path.join(os.path.dirname(__file__), "models")

# --- Exchange API Keys (from .env) ---
BINANCE_API_KEY = os.getenv("BINANCE_API_KEY", "")
BINANCE_API_SECRET = os.getenv("BINANCE_API_SECRET", "")

# --- On-Chain Data API Keys (from .env) ---
GLASSNODE_API_KEY = os.getenv("GLASSNODE_API_KEY", "")
CRYPTOQUANT_API_KEY = os.getenv("CRYPTOQUANT_API_KEY", "")
COINGLASS_API_KEY = os.getenv("COINGLASS_API_KEY", "")

# --- On-Chain Cache ---
ON_CHAIN_CACHE_HOURS = 1  # Cache TTL for on-chain data (hours)

# --- Tracked Assets ---
TRACKED_ASSETS = [
    "BTC", "ETH", "SOL", "BNB", "XRP",
    "LINK", "AVAX", "ADA", "DOT", "MATIC",
    "RNDR", "FET", "TAO", "NEAR", "KAS",
    "AAVE", "UNI", "MKR", "DOGE", "LTC"
]

# --- FRED Macroeconomic Series ---
FRED_API_KEY = os.getenv("FRED_API_KEY", "")

FRED_SERIES = {
    "dollar_index":       "DTWEXBGS",           # Trade Weighted US Dollar Index
    "treasury_10y":       "DGS10",              # 10-Year Treasury Yield
    "fed_funds_rate":     "FEDFUNDS",           # Federal Funds Effective Rate
    "sp500":              "SP500",              # S&P 500 Index
    "nasdaq":             "NASDAQCOM",          # NASDAQ Composite
    "m2_money_supply":    "M2SL",               # M2 Money Stock
    "gold_price":         "GOLDPMGBD228NLBM",   # Gold Fixing Price PM (London, USD)
    "vix":                "VIXCLS",             # CBOE Volatility Index
    "breakeven_5y":       "T5YIE",              # 5-Year Breakeven Inflation Rate
}

MACRO_CACHE_HOURS = 6  # How long to cache FRED data before refetching

# --- Social Sentiment Sources ---
REDDIT_SUBREDDITS = [
    "Bitcoin",
    "CryptoCurrency",
    "ethereum",
    "solana",
    "defi",
]

GOOGLE_TRENDS_KEYWORDS = [
    "buy bitcoin",
    "bitcoin crash",
    "crypto",
    "bitcoin price",
    "ethereum",
]

SOCIAL_CACHE_HOURS = 6  # How long to cache social data before refetching

SOCIAL_WEIGHTS = {
    "lunarcrush": 0.30,
    "reddit": 0.30,
    "google_trends": 0.20,
    "coingecko_trending": 0.20,
}

# --- Triple Barrier Labeling (Lopez de Prado) ---
TRIPLE_BARRIER_ATR_MULT = 1.5   # ATR multiplier for upper/lower barriers
TRIPLE_BARRIER_MAX_HOLD = 24    # Vertical barrier: max holding period in bars

# --- Volatility-Adjusted Label Thresholds ---
VOL_LABEL_THRESHOLD = 0.5       # Return must exceed threshold * vol to be labeled directional

# --- XGBoost Classifier ---
XGBOOST_PARAMS = {
    "max_depth": 6,
    "n_estimators": 500,
    "learning_rate": 0.05,
    "subsample": 0.8,
    "colsample_bytree": 0.8,
    "min_child_weight": 5,
    "gamma": 0.1,
    "reg_alpha": 0.1,
    "reg_lambda": 1.0,
    "objective": "multi:softprob",
    "eval_metric": "mlogloss",
    "random_state": 42,
    "n_jobs": -1,
}

# --- LightGBM Classifier ---
LIGHTGBM_PARAMS = {
    "max_depth": 8,
    "n_estimators": 600,
    "learning_rate": 0.03,
    "subsample": 0.7,
    "colsample_bytree": 0.7,
    "min_child_samples": 20,
    "reg_alpha": 0.05,
    "reg_lambda": 0.5,
    "num_leaves": 63,
    "objective": "multiclass",
    "metric": "multi_logloss",
    "random_state": 42,
    "n_jobs": -1,
    "verbose": -1,
}
