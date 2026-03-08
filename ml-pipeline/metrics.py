"""
Section 6 Implementation: Results & Evaluation Metrics

Statistical predictive metrics (RMSE, Directional Accuracy)
and risk-adjusted portfolio metrics (Sharpe, Sortino, Max Drawdown).
"""

import numpy as np
import pandas as pd


class PredictiveMetrics:
    """Section 6.1: Statistical Predictive Metrics"""

    @staticmethod
    def rmse(actuals: np.ndarray, predictions: np.ndarray) -> float:
        """
        Root Mean Square Error
        RMSE = sqrt(1/n * sum((y_i - y_hat_i)^2))
        """
        return float(np.sqrt(np.mean((actuals - predictions) ** 2)))

    @staticmethod
    def mae(actuals: np.ndarray, predictions: np.ndarray) -> float:
        """Mean Absolute Error"""
        return float(np.mean(np.abs(actuals - predictions)))

    @staticmethod
    def directional_accuracy(actuals: np.ndarray,
                             predictions: np.ndarray) -> float:
        """
        Percentage of correct directional predictions.
        DA = correct_direction / total_predictions
        """
        correct = np.sum(np.sign(actuals) == np.sign(predictions))
        return float(correct / len(actuals)) if len(actuals) > 0 else 0

    @staticmethod
    def hit_rate_by_confidence(actuals: np.ndarray, predictions: np.ndarray,
                               confidence: np.ndarray,
                               thresholds: list = None) -> dict:
        """
        Directional accuracy bucketed by prediction confidence.
        Higher confidence should correlate with higher accuracy.
        """
        thresholds = thresholds or [0.25, 0.50, 0.75, 0.90]
        results = {}
        for t in thresholds:
            mask = confidence >= t
            if np.sum(mask) > 0:
                correct = np.sum(np.sign(actuals[mask]) == np.sign(predictions[mask]))
                results[f">={t:.0%}"] = {
                    "accuracy": round(correct / np.sum(mask), 4),
                    "n_trades": int(np.sum(mask))
                }
        return results


class PortfolioMetrics:
    """Section 6.2: Risk-Adjusted Return Metrics"""

    @staticmethod
    def sharpe_ratio(returns: np.ndarray, risk_free_rate: float = 0.045,
                     periods_per_year: float = 365) -> float:
        """
        Sharpe Ratio: S = (R_p - R_f) / sigma_p

        Measures excess return per unit of total volatility.
        In crypto, S > 1.5 post-fees indicates robust model.
        """
        if len(returns) == 0 or np.std(returns) == 0:
            return 0.0

        annualized_return = np.mean(returns) * periods_per_year
        annualized_vol = np.std(returns) * np.sqrt(periods_per_year)

        return float((annualized_return - risk_free_rate) / annualized_vol)

    @staticmethod
    def sortino_ratio(returns: np.ndarray, risk_free_rate: float = 0.045,
                      periods_per_year: float = 365) -> float:
        """
        Sortino Ratio: Sortino = (R_p - R_f) / sigma_d

        Only penalizes downside volatility (not upside).
        Better metric for crypto where upside vol is desirable.
        """
        if len(returns) == 0:
            return 0.0

        annualized_return = np.mean(returns) * periods_per_year
        downside = returns[returns < 0]

        if len(downside) == 0 or np.std(downside) == 0:
            return float("inf") if annualized_return > risk_free_rate else 0.0

        downside_vol = np.std(downside) * np.sqrt(periods_per_year)
        return float((annualized_return - risk_free_rate) / downside_vol)

    @staticmethod
    def max_drawdown(equity_curve: np.ndarray) -> float:
        """
        Maximum Drawdown: MDD = (V_trough - V_peak) / V_peak

        Largest peak-to-trough decline. BTC historically draws down 70-80%.
        A good model should hold MDD under 20% during bear markets.
        """
        peak = np.maximum.accumulate(equity_curve)
        drawdown = (equity_curve - peak) / peak
        return float(np.min(drawdown))

    @staticmethod
    def calmar_ratio(returns: np.ndarray, equity_curve: np.ndarray,
                     periods_per_year: float = 365) -> float:
        """Annualized return / Max Drawdown. Higher is better."""
        ann_return = np.mean(returns) * periods_per_year
        mdd = abs(PortfolioMetrics.max_drawdown(equity_curve))
        return float(ann_return / mdd) if mdd > 0 else 0.0

    @staticmethod
    def profit_factor(returns: np.ndarray) -> float:
        """Sum of winning trades / Sum of losing trades."""
        wins = returns[returns > 0]
        losses = returns[returns < 0]
        if len(losses) == 0 or np.sum(np.abs(losses)) == 0:
            return float("inf") if len(wins) > 0 else 0.0
        return float(np.sum(wins) / np.sum(np.abs(losses)))

    @staticmethod
    def win_loss_ratio(returns: np.ndarray) -> dict:
        """Win rate, average win, average loss, and expectancy."""
        wins = returns[returns > 0]
        losses = returns[returns < 0]

        win_rate = len(wins) / len(returns) if len(returns) > 0 else 0
        avg_win = float(np.mean(wins)) if len(wins) > 0 else 0
        avg_loss = float(np.mean(np.abs(losses))) if len(losses) > 0 else 0

        # Expectancy = (win_rate * avg_win) - (loss_rate * avg_loss)
        expectancy = (win_rate * avg_win) - ((1 - win_rate) * avg_loss)

        return {
            "win_rate": round(win_rate, 4),
            "avg_win": round(avg_win, 6),
            "avg_loss": round(avg_loss, 6),
            "expectancy": round(expectancy, 6),
            "total_trades": len(returns),
            "wins": len(wins),
            "losses": len(losses)
        }


class ModelEvaluator:
    """
    Section 6.3: Benchmarking

    Compares model strategy against Buy & Hold (HODL) benchmark.
    Model is successful only if Sortino improves and MDD decreases.
    """

    def __init__(self, risk_free_rate=0.045):
        self.rf = risk_free_rate
        self.pred_metrics = PredictiveMetrics()
        self.port_metrics = PortfolioMetrics()

    def evaluate_predictions(self, actuals: np.ndarray,
                             predictions: np.ndarray) -> dict:
        """Full predictive evaluation."""
        return {
            "rmse": self.pred_metrics.rmse(actuals, predictions),
            "mae": self.pred_metrics.mae(actuals, predictions),
            "directional_accuracy": self.pred_metrics.directional_accuracy(
                actuals, predictions)
        }

    def evaluate_portfolio(self, strategy_returns: np.ndarray,
                           strategy_equity: np.ndarray,
                           benchmark_returns: np.ndarray,
                           benchmark_equity: np.ndarray) -> dict:
        """Full strategy vs benchmark evaluation."""
        strategy = {
            "sharpe": self.port_metrics.sharpe_ratio(strategy_returns, self.rf),
            "sortino": self.port_metrics.sortino_ratio(strategy_returns, self.rf),
            "max_drawdown": self.port_metrics.max_drawdown(strategy_equity),
            "calmar": self.port_metrics.calmar_ratio(strategy_returns, strategy_equity),
            "profit_factor": self.port_metrics.profit_factor(strategy_returns),
            **self.port_metrics.win_loss_ratio(strategy_returns),
            "total_return": float(
                (strategy_equity[-1] - strategy_equity[0]) / strategy_equity[0]),
        }

        benchmark = {
            "sharpe": self.port_metrics.sharpe_ratio(benchmark_returns, self.rf),
            "sortino": self.port_metrics.sortino_ratio(benchmark_returns, self.rf),
            "max_drawdown": self.port_metrics.max_drawdown(benchmark_equity),
            "total_return": float(
                (benchmark_equity[-1] - benchmark_equity[0]) / benchmark_equity[0]),
        }

        # Success criteria
        outperforms = (
            strategy["sortino"] > benchmark["sortino"] and
            abs(strategy["max_drawdown"]) < abs(benchmark["max_drawdown"])
        )

        return {
            "strategy": strategy,
            "benchmark": benchmark,
            "outperforms_benchmark": outperforms,
            "alpha": strategy["total_return"] - benchmark["total_return"],
            "drawdown_reduction": abs(benchmark["max_drawdown"]) - abs(
                strategy["max_drawdown"])
        }

    def print_report(self, results: dict):
        """Print formatted evaluation report."""
        s = results["strategy"]
        b = results["benchmark"]

        print("\n" + "=" * 65)
        print("CRYPTO RADAR - MODEL EVALUATION REPORT")
        print("=" * 65)
        print(f"{'Metric':<25} {'Strategy':>15} {'Benchmark':>15}")
        print("-" * 65)
        print(f"{'Total Return':<25} {s['total_return']:>14.2%} {b['total_return']:>14.2%}")
        print(f"{'Sharpe Ratio':<25} {s['sharpe']:>15.3f} {b['sharpe']:>15.3f}")
        print(f"{'Sortino Ratio':<25} {s['sortino']:>15.3f} {b['sortino']:>15.3f}")
        print(f"{'Max Drawdown':<25} {s['max_drawdown']:>14.2%} {b['max_drawdown']:>14.2%}")
        print(f"{'Calmar Ratio':<25} {s['calmar']:>15.3f} {'--':>15}")
        print(f"{'Profit Factor':<25} {s['profit_factor']:>15.3f} {'--':>15}")
        print(f"{'Win Rate':<25} {s['win_rate']:>14.2%} {'--':>15}")
        print(f"{'Avg Win':<25} {s['avg_win']:>14.6f} {'--':>15}")
        print(f"{'Avg Loss':<25} {s['avg_loss']:>14.6f} {'--':>15}")
        print(f"{'Expectancy':<25} {s['expectancy']:>14.6f} {'--':>15}")
        print("-" * 65)
        print(f"{'Alpha':<25} {results['alpha']:>14.2%}")
        print(f"{'DD Reduction':<25} {results['drawdown_reduction']:>14.2%}")
        print(f"{'Outperforms HODL':<25} "
              f"{'YES' if results['outperforms_benchmark'] else 'NO':>15}")
        print("=" * 65)


# --- CLI Entry Point ---
if __name__ == "__main__":
    print("=" * 60)
    print("CRYPTO RADAR - Evaluation Metrics Demo")
    print("=" * 60)

    np.random.seed(42)

    # Simulate strategy returns (slightly positive edge)
    strategy_returns = np.random.randn(365) * 0.015 + 0.0008
    strategy_equity = 100000 * np.cumprod(1 + strategy_returns)
    strategy_equity = np.insert(strategy_equity, 0, 100000)

    # Simulate benchmark (buy & hold BTC, higher vol, higher drawdown)
    benchmark_returns = np.random.randn(365) * 0.025 + 0.0005
    benchmark_equity = 100000 * np.cumprod(1 + benchmark_returns)
    benchmark_equity = np.insert(benchmark_equity, 0, 100000)

    evaluator = ModelEvaluator()
    results = evaluator.evaluate_portfolio(
        strategy_returns, strategy_equity,
        benchmark_returns, benchmark_equity
    )
    evaluator.print_report(results)
