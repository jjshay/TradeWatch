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

# --- Tracked Assets ---
TRACKED_ASSETS = [
    "BTC", "ETH", "SOL", "BNB", "XRP",
    "LINK", "AVAX", "ADA", "DOT", "MATIC",
    "RNDR", "FET", "TAO", "NEAR", "KAS",
    "AAVE", "UNI", "MKR", "DOGE", "LTC"
]
