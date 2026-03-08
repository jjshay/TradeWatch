"""
Section 5 Implementation: Backtesting & Risk Management Framework

Walk-Forward Optimization, slippage/fee modeling, Kelly Criterion
position sizing, ATR trailing stops, and kill-switch protocol.
"""

import numpy as np
import pandas as pd
from config import (
    TRAIN_WINDOW_DAYS, TEST_WINDOW_DAYS, STEP_FORWARD_DAYS,
    TAKER_FEE, SLIPPAGE_BASE, SLIPPAGE_VOL_MULT,
    KELLY_FRACTION, MAX_DRAWDOWN_THRESHOLD, ATR_MULTIPLIER,
    ATR_PERIOD, MAX_POSITION_SIZE
)


class WalkForwardValidator:
    """
    Section 5.1: Walk-Forward Optimization

    Segments data into rolling train/test windows that advance chronologically.
    Prevents look-ahead bias inherent in standard K-fold cross-validation.

    Example with 180-day train, 30-day test, 30-day step:
      Window 1: Train T0-T180,  Test T181-T210
      Window 2: Train T30-T210, Test T211-T240
      Window 3: Train T60-T240, Test T241-T270
    """

    def __init__(self, train_days=TRAIN_WINDOW_DAYS,
                 test_days=TEST_WINDOW_DAYS, step_days=STEP_FORWARD_DAYS):
        self.train_days = train_days
        self.test_days = test_days
        self.step_days = step_days

    def generate_splits(self, data_length: int) -> list:
        """
        Generate (train_start, train_end, test_start, test_end) index tuples.
        """
        splits = []
        start = 0
        while start + self.train_days + self.test_days <= data_length:
            train_start = start
            train_end = start + self.train_days
            test_start = train_end
            test_end = min(test_start + self.test_days, data_length)
            splits.append((train_start, train_end, test_start, test_end))
            start += self.step_days
        return splits

    def run(self, features: np.ndarray, targets: np.ndarray,
            train_fn, predict_fn) -> dict:
        """
        Execute walk-forward validation.

        Args:
            features: Full feature matrix (n_samples, n_features)
            targets: Target returns (n_samples,)
            train_fn: function(X_train, y_train) -> model
            predict_fn: function(model, X_test) -> predictions

        Returns:
            dict with predictions, actuals, and per-window metrics
        """
        splits = self.generate_splits(len(features))
        all_preds = []
        all_actuals = []
        window_metrics = []

        print(f"[WalkForward] {len(splits)} windows, "
              f"train={self.train_days}d, test={self.test_days}d, step={self.step_days}d")

        for i, (tr_s, tr_e, te_s, te_e) in enumerate(splits):
            X_train, y_train = features[tr_s:tr_e], targets[tr_s:tr_e]
            X_test, y_test = features[te_s:te_e], targets[te_s:te_e]

            model = train_fn(X_train, y_train)
            preds = predict_fn(model, X_test)

            all_preds.extend(preds)
            all_actuals.extend(y_test)

            # Per-window directional accuracy
            direction_correct = np.sum(np.sign(preds) == np.sign(y_test))
            da = direction_correct / len(y_test) if len(y_test) > 0 else 0

            window_metrics.append({
                "window": i + 1,
                "train_range": f"{tr_s}-{tr_e}",
                "test_range": f"{te_s}-{te_e}",
                "directional_accuracy": round(da, 4),
                "rmse": round(np.sqrt(np.mean((preds - y_test) ** 2)), 6)
            })

            if (i + 1) % 3 == 0:
                print(f"  Window {i+1}/{len(splits)}: DA={da:.3f}, "
                      f"RMSE={window_metrics[-1]['rmse']:.6f}")

        return {
            "predictions": np.array(all_preds),
            "actuals": np.array(all_actuals),
            "windows": window_metrics
        }


class ExecutionSimulator:
    """
    Section 5.2: Simulating Market Frictions

    R_adj = R_raw - (F_exec + S)
    Where F_exec = exchange fees, S = slippage (dynamic, vol-dependent)
    """

    def __init__(self, fee_rate=TAKER_FEE, slippage_base=SLIPPAGE_BASE,
                 slippage_vol_mult=SLIPPAGE_VOL_MULT):
        self.fee_rate = fee_rate
        self.slippage_base = slippage_base
        self.slippage_vol_mult = slippage_vol_mult

    def compute_slippage(self, volatility: float) -> float:
        """
        Dynamic slippage as function of recent realized volatility.
        Higher vol = thinner books = worse fills.
        """
        return self.slippage_base + self.slippage_vol_mult * volatility

    def adjust_returns(self, raw_returns: np.ndarray,
                       volatilities: np.ndarray) -> np.ndarray:
        """
        Apply execution costs to raw signal returns.
        Each trade incurs fees on entry and exit (2x fee).
        """
        adjusted = np.zeros_like(raw_returns)
        for i in range(len(raw_returns)):
            vol = volatilities[i] if i < len(volatilities) else 0.5
            slippage = self.compute_slippage(vol)
            total_cost = 2 * self.fee_rate + slippage  # Round trip
            adjusted[i] = raw_returns[i] - total_cost
        return adjusted

    def summary(self, raw_returns: np.ndarray,
                adj_returns: np.ndarray) -> dict:
        """Compare raw vs adjusted performance."""
        return {
            "raw_total": float(np.sum(raw_returns)),
            "adj_total": float(np.sum(adj_returns)),
            "friction_cost": float(np.sum(raw_returns) - np.sum(adj_returns)),
            "avg_cost_per_trade": float(np.mean(raw_returns - adj_returns)),
            "trades": len(raw_returns)
        }


class RiskManager:
    """
    Section 5.3: Algorithmic Risk Management

    Position sizing (Kelly Criterion), ATR trailing stops,
    max drawdown kill switch.
    """

    def __init__(self, kelly_fraction=KELLY_FRACTION,
                 max_dd=MAX_DRAWDOWN_THRESHOLD,
                 atr_mult=ATR_MULTIPLIER,
                 max_position=MAX_POSITION_SIZE):
        self.kelly_fraction = kelly_fraction
        self.max_dd = max_dd
        self.atr_mult = atr_mult
        self.max_position = max_position
        self.killed = False

    def kelly_size(self, win_rate: float, avg_win: float,
                   avg_loss: float) -> float:
        """
        f* = (bp - q) / b
        Where b = avg_win/avg_loss, p = win_rate, q = 1 - p
        Returns fraction of portfolio to allocate (half-Kelly by default).
        """
        if avg_loss == 0 or win_rate <= 0:
            return 0

        b = abs(avg_win / avg_loss)
        p = win_rate
        q = 1 - p

        kelly = (b * p - q) / b
        kelly = max(0, kelly)  # Never go negative

        # Apply fractional Kelly and position size cap
        position = kelly * self.kelly_fraction
        return min(position, self.max_position)

    def atr_trailing_stop(self, entry_price: float, atr: float,
                          is_long: bool = True) -> float:
        """
        Dynamic trailing stop using ATR.
        Widens during high vol, tightens during consolidation.
        """
        stop_distance = atr * self.atr_mult
        if is_long:
            return entry_price - stop_distance
        else:
            return entry_price + stop_distance

    def check_drawdown(self, equity_curve: np.ndarray) -> dict:
        """
        Calculate current drawdown and trigger kill switch if exceeded.
        MDD = (V_trough - V_peak) / V_peak
        """
        peak = np.maximum.accumulate(equity_curve)
        drawdown = (equity_curve - peak) / peak
        current_dd = drawdown[-1]
        max_dd = np.min(drawdown)

        if current_dd < -self.max_dd:
            self.killed = True

        return {
            "current_drawdown": float(current_dd),
            "max_drawdown": float(max_dd),
            "kill_switch": self.killed,
            "threshold": self.max_dd
        }

    def simulate_portfolio(self, predictions: np.ndarray,
                           actuals: np.ndarray,
                           volatilities: np.ndarray,
                           initial_capital: float = 100000) -> dict:
        """
        Full portfolio simulation with position sizing and risk controls.
        """
        capital = initial_capital
        equity = [capital]
        trades = []
        self.killed = False

        # Calculate historical win rate from predictions
        direction_correct = np.sign(predictions) == np.sign(actuals)
        wins = actuals[direction_correct]
        losses = actuals[~direction_correct]
        win_rate = np.mean(direction_correct)
        avg_win = np.mean(np.abs(wins)) if len(wins) > 0 else 0
        avg_loss = np.mean(np.abs(losses)) if len(losses) > 0 else 0.01

        for i in range(len(predictions)):
            if self.killed:
                equity.append(capital)
                continue

            # Position size via Kelly
            size = self.kelly_size(win_rate, avg_win, avg_loss)

            # Trade direction based on prediction
            if abs(predictions[i]) < 0.0005:  # Skip weak signals
                equity.append(capital)
                continue

            position_value = capital * size
            trade_return = actuals[i] * np.sign(predictions[i])

            # Apply execution costs
            vol = volatilities[i] if i < len(volatilities) else 0.5
            slippage = SLIPPAGE_BASE + SLIPPAGE_VOL_MULT * vol
            cost = 2 * TAKER_FEE + slippage

            net_return = trade_return - cost
            pnl = position_value * net_return
            capital += pnl
            equity.append(capital)

            trades.append({
                "step": i,
                "direction": "LONG" if predictions[i] > 0 else "SHORT",
                "size_pct": round(size * 100, 2),
                "raw_return": round(float(trade_return), 6),
                "net_return": round(float(net_return), 6),
                "pnl": round(float(pnl), 2),
                "capital": round(float(capital), 2)
            })

            # Check kill switch
            dd_check = self.check_drawdown(np.array(equity))
            if dd_check["kill_switch"]:
                print(f"  [KILL SWITCH] Drawdown {dd_check['current_drawdown']:.2%} "
                      f"exceeded threshold {self.max_dd:.2%} at step {i}")

        return {
            "equity_curve": np.array(equity),
            "trades": trades,
            "final_capital": capital,
            "total_return": (capital - initial_capital) / initial_capital,
            "n_trades": len(trades)
        }


# --- CLI Entry Point ---
if __name__ == "__main__":
    print("=" * 60)
    print("CRYPTO RADAR - Backtesting & Risk Management Demo")
    print("=" * 60)

    # Synthetic data
    np.random.seed(42)
    n = 500
    predictions = np.random.randn(n) * 0.02
    actuals = predictions + np.random.randn(n) * 0.01  # Correlated but noisy
    volatilities = np.abs(np.random.randn(n)) * 0.5 + 0.3

    # Walk-Forward validation
    wfv = WalkForwardValidator(train_days=180, test_days=30, step_days=30)
    splits = wfv.generate_splits(n)
    print(f"\nWalk-Forward: {len(splits)} windows generated")
    for s in splits[:3]:
        print(f"  Train [{s[0]}-{s[1]}] -> Test [{s[2]}-{s[3]}]")

    # Execution simulation
    exec_sim = ExecutionSimulator()
    raw_returns = predictions * np.sign(actuals)
    adj_returns = exec_sim.adjust_returns(raw_returns, volatilities)
    friction = exec_sim.summary(raw_returns, adj_returns)
    print(f"\nExecution Friction:")
    print(f"  Raw total return:   {friction['raw_total']:+.4f}")
    print(f"  Adj total return:   {friction['adj_total']:+.4f}")
    print(f"  Total friction:     {friction['friction_cost']:.4f}")
    print(f"  Avg cost per trade: {friction['avg_cost_per_trade']:.6f}")

    # Risk management
    risk = RiskManager()
    result = risk.simulate_portfolio(predictions, actuals, volatilities)
    print(f"\nPortfolio Simulation:")
    print(f"  Final capital:  ${result['final_capital']:,.2f}")
    print(f"  Total return:   {result['total_return']:+.2%}")
    print(f"  Trades taken:   {result['n_trades']}")

    dd = risk.check_drawdown(result["equity_curve"])
    print(f"  Max drawdown:   {dd['max_drawdown']:.2%}")
    print(f"  Kill switch:    {'TRIGGERED' if dd['kill_switch'] else 'OK'}")

    # Kelly sizing example
    kelly = risk.kelly_size(win_rate=0.55, avg_win=0.03, avg_loss=0.02)
    print(f"\nKelly Position Size (55% WR, 1.5:1 R/R): {kelly:.2%} of portfolio")
