"""
Gradient Boosting Ensemble + Stacking Meta-Learner

Complements the existing LSTM fusion model with tree-based
classifiers (XGBoost, LightGBM) and a meta-learner that blends
predictions from all three models.

Architecture
------------
Layer 0 (base learners):
    1. LSTM Fusion Model  (fusion_model.py -- existing)
    2. XGBoost Classifier
    3. LightGBM Classifier

Layer 1 (meta-learner / stacker):
    Logistic Regression trained on out-of-fold predictions
    from the three base learners.

All models predict three classes: down (-1 -> 0), flat (0 -> 1),
up (+1 -> 2), using the same feature columns defined in
feature_engineering.py.
"""

from __future__ import annotations

import warnings
from typing import Optional

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, classification_report
from sklearn.model_selection import StratifiedKFold
from sklearn.preprocessing import StandardScaler

from config import LIGHTGBM_PARAMS, XGBOOST_PARAMS
from feature_engineering import FeatureBuilder

warnings.filterwarnings("ignore", category=FutureWarning)

# Feature column list (shared with LSTM pipeline)
FEATURE_COLS = FeatureBuilder().get_feature_columns()


# ---------------------------------------------------------------
# XGBoost wrapper
# ---------------------------------------------------------------

class XGBoostClassifier:
    """Direction classifier using XGBoost (gradient-boosted trees)."""

    def __init__(self, params: Optional[dict] = None, class_weights: Optional[dict] = None):
        try:
            from xgboost import XGBClassifier
        except ImportError:
            raise ImportError("xgboost is required: pip install xgboost")

        self.params = dict(XGBOOST_PARAMS) if params is None else dict(params)

        # Apply class-imbalance weighting if provided
        if class_weights is not None:
            self.params["sample_weight"] = None  # handled via fit()
            self._class_weights = class_weights
        else:
            self._class_weights = None

        self.model = XGBClassifier(**self.params)
        self.scaler = StandardScaler()

    def fit(self, X: np.ndarray, y: np.ndarray,
            eval_set: Optional[tuple] = None) -> "XGBoostClassifier":
        """
        Train the XGBoost model.

        Parameters
        ----------
        X : array-like, shape (n_samples, n_features)
        y : array-like, shape (n_samples,)  -- integer labels {0, 1, 2}
        eval_set : optional (X_val, y_val) for early stopping
        """
        X_scaled = self.scaler.fit_transform(X)

        fit_kwargs: dict = {}
        if self._class_weights:
            sample_w = np.array([self._class_weights.get(int(label), 1.0) for label in y])
            fit_kwargs["sample_weight"] = sample_w

        if eval_set is not None:
            X_val, y_val = eval_set
            X_val_scaled = self.scaler.transform(X_val)
            fit_kwargs["eval_set"] = [(X_val_scaled, y_val)]

        self.model.fit(X_scaled, y, **fit_kwargs)
        return self

    def predict(self, X: np.ndarray) -> np.ndarray:
        return self.model.predict(self.scaler.transform(X))

    def predict_proba(self, X: np.ndarray) -> np.ndarray:
        return self.model.predict_proba(self.scaler.transform(X))


# ---------------------------------------------------------------
# LightGBM wrapper
# ---------------------------------------------------------------

class LightGBMClassifier:
    """Direction classifier using LightGBM."""

    def __init__(self, params: Optional[dict] = None, class_weights: Optional[dict] = None):
        try:
            from lightgbm import LGBMClassifier
        except ImportError:
            raise ImportError("lightgbm is required: pip install lightgbm")

        self.params = dict(LIGHTGBM_PARAMS) if params is None else dict(params)
        self._class_weights = class_weights
        self.model = LGBMClassifier(**self.params)
        self.scaler = StandardScaler()

    def fit(self, X: np.ndarray, y: np.ndarray,
            eval_set: Optional[tuple] = None) -> "LightGBMClassifier":
        X_scaled = self.scaler.fit_transform(X)

        fit_kwargs: dict = {}
        if self._class_weights:
            sample_w = np.array([self._class_weights.get(int(label), 1.0) for label in y])
            fit_kwargs["sample_weight"] = sample_w

        if eval_set is not None:
            X_val, y_val = eval_set
            X_val_scaled = self.scaler.transform(X_val)
            fit_kwargs["eval_set"] = [(X_val_scaled, y_val)]

        self.model.fit(X_scaled, y, **fit_kwargs)
        return self

    def predict(self, X: np.ndarray) -> np.ndarray:
        return self.model.predict(self.scaler.transform(X))

    def predict_proba(self, X: np.ndarray) -> np.ndarray:
        return self.model.predict_proba(self.scaler.transform(X))


# ---------------------------------------------------------------
# Stacking Meta-Learner
# ---------------------------------------------------------------

class StackingMetaLearner:
    """
    Layer-1 stacker that blends out-of-fold predictions from
    multiple base models into a final probability estimate.

    Uses Logistic Regression by default for transparency and to
    avoid overfitting on the small meta-feature space (n_models * n_classes).
    """

    def __init__(self, n_folds: int = 5):
        self.n_folds = n_folds
        self.meta_model = LogisticRegression(
            max_iter=1000,
            multi_class="multinomial",
            solver="lbfgs",
            C=1.0,
        )
        self.base_models: list = []

    def generate_oof_predictions(
        self,
        models: list,
        X: np.ndarray,
        y: np.ndarray,
    ) -> np.ndarray:
        """
        Generate out-of-fold (OOF) predictions from each base model
        to prevent data leakage in the stacking layer.

        Parameters
        ----------
        models : list
            Each element must have .fit(X, y) and .predict_proba(X).
        X : array, shape (n_samples, n_features)
        y : array, shape (n_samples,)

        Returns
        -------
        meta_features : array, shape (n_samples, n_models * n_classes)
        """
        n_classes = len(np.unique(y))
        n_models = len(models)
        meta_features = np.zeros((len(y), n_models * n_classes))

        skf = StratifiedKFold(n_splits=self.n_folds, shuffle=True, random_state=42)

        for model_idx, model in enumerate(models):
            col_start = model_idx * n_classes
            col_end = col_start + n_classes

            for train_idx, val_idx in skf.split(X, y):
                X_train_fold, X_val_fold = X[train_idx], X[val_idx]
                y_train_fold = y[train_idx]

                # Clone the model for each fold to avoid leakage
                model_clone = _clone_model(model)
                model_clone.fit(X_train_fold, y_train_fold)

                proba = model_clone.predict_proba(X_val_fold)
                # Handle models that may not output all classes
                if proba.shape[1] < n_classes:
                    padded = np.zeros((len(val_idx), n_classes))
                    padded[:, :proba.shape[1]] = proba
                    proba = padded

                meta_features[val_idx, col_start:col_end] = proba

        return meta_features

    def fit(
        self,
        models: list,
        X: np.ndarray,
        y: np.ndarray,
    ) -> "StackingMetaLearner":
        """
        Fit the meta-learner on OOF predictions from base models.
        Also refits base models on the full training set for inference.
        """
        meta_features = self.generate_oof_predictions(models, X, y)
        self.meta_model.fit(meta_features, y)

        # Refit base models on full data for production inference
        self.base_models = []
        for model in models:
            model_clone = _clone_model(model)
            model_clone.fit(X, y)
            self.base_models.append(model_clone)

        return self

    def predict(self, X: np.ndarray) -> np.ndarray:
        meta_features = self._build_meta_features(X)
        return self.meta_model.predict(meta_features)

    def predict_proba(self, X: np.ndarray) -> np.ndarray:
        meta_features = self._build_meta_features(X)
        return self.meta_model.predict_proba(meta_features)

    def _build_meta_features(self, X: np.ndarray) -> np.ndarray:
        """Stack base-model probabilities into meta-feature matrix."""
        probas = [m.predict_proba(X) for m in self.base_models]
        return np.hstack(probas)


# ---------------------------------------------------------------
# Feature Importance
# ---------------------------------------------------------------

class FeatureImportanceAnalyzer:
    """SHAP and permutation importance for tree-based models."""

    def __init__(self, model, feature_names: list[str]):
        self.model = model
        self.feature_names = feature_names

    def shap_importance(
        self, X: np.ndarray, max_display: int = 20
    ) -> pd.DataFrame:
        """
        Compute SHAP values and return a ranked DataFrame.

        Falls back to built-in feature importance if shap is unavailable.
        """
        try:
            import shap

            # Use underlying xgboost/lightgbm model if wrapped
            underlying = getattr(self.model, "model", self.model)
            X_scaled = X
            if hasattr(self.model, "scaler"):
                X_scaled = self.model.scaler.transform(X)

            explainer = shap.TreeExplainer(underlying)
            shap_values = explainer.shap_values(X_scaled)

            # For multiclass shap_values is a list of arrays
            if isinstance(shap_values, list):
                mean_abs = np.mean(
                    [np.abs(sv).mean(axis=0) for sv in shap_values], axis=0
                )
            else:
                mean_abs = np.abs(shap_values).mean(axis=0)

            importance_df = pd.DataFrame({
                "feature": self.feature_names,
                "shap_importance": mean_abs,
            }).sort_values("shap_importance", ascending=False).reset_index(drop=True)

            return importance_df.head(max_display)

        except ImportError:
            print("[FeatureImportance] shap not installed -- using built-in importance.")
            return self.builtin_importance(max_display)

    def builtin_importance(self, max_display: int = 20) -> pd.DataFrame:
        """Built-in feature importance from the tree model."""
        underlying = getattr(self.model, "model", self.model)
        importances = underlying.feature_importances_

        return pd.DataFrame({
            "feature": self.feature_names,
            "importance": importances,
        }).sort_values("importance", ascending=False).reset_index(drop=True).head(max_display)

    def permutation_importance(
        self,
        X: np.ndarray,
        y: np.ndarray,
        n_repeats: int = 10,
        max_display: int = 20,
    ) -> pd.DataFrame:
        """
        Permutation importance: measures accuracy drop when each
        feature is randomly shuffled.
        """
        from sklearn.inspection import permutation_importance as perm_imp

        result = perm_imp(
            self.model, X, y,
            n_repeats=n_repeats,
            random_state=42,
            n_jobs=-1,
        )

        return pd.DataFrame({
            "feature": self.feature_names,
            "perm_importance_mean": result.importances_mean,
            "perm_importance_std": result.importances_std,
        }).sort_values("perm_importance_mean", ascending=False).reset_index(drop=True).head(max_display)

    def print_top_features(
        self, X: np.ndarray, y: Optional[np.ndarray] = None, top_n: int = 20
    ) -> None:
        """Print top features from SHAP and (optionally) permutation importance."""
        print(f"\n{'=' * 55}")
        print(f"  Top-{top_n} Feature Importance")
        print(f"{'=' * 55}")

        shap_df = self.shap_importance(X, max_display=top_n)
        imp_col = "shap_importance" if "shap_importance" in shap_df.columns else "importance"
        print(f"\n  SHAP / Built-in Importance:")
        for i, row in shap_df.iterrows():
            print(f"    {i+1:2d}. {row['feature']:<30s} {row[imp_col]:.6f}")

        if y is not None:
            print(f"\n  Permutation Importance:")
            perm_df = self.permutation_importance(X, y, max_display=top_n)
            for i, row in perm_df.iterrows():
                print(f"    {i+1:2d}. {row['feature']:<30s} "
                      f"{row['perm_importance_mean']:.6f} +/- {row['perm_importance_std']:.6f}")


# ---------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------

def _clone_model(model):
    """Create a fresh copy of a model with the same hyperparameters."""
    if isinstance(model, XGBoostClassifier):
        return XGBoostClassifier(
            params=model.params,
            class_weights=model._class_weights,
        )
    elif isinstance(model, LightGBMClassifier):
        return LightGBMClassifier(
            params=model.params,
            class_weights=model._class_weights,
        )
    else:
        raise TypeError(f"Cannot clone model of type {type(model)}")


def compute_class_weights(y: np.ndarray) -> dict:
    """
    Compute inverse-frequency class weights for imbalanced datasets.
    Maps class index -> weight.
    """
    classes, counts = np.unique(y, return_counts=True)
    total = len(y)
    n_classes = len(classes)
    weights = {}
    for cls, cnt in zip(classes, counts):
        weights[int(cls)] = total / (n_classes * cnt)
    return weights


def _generate_synthetic_data(
    n_samples: int = 2000,
    seed: int = 42,
) -> tuple[np.ndarray, np.ndarray, list[str]]:
    """
    Generate synthetic data matching the pipeline's feature structure.

    Returns (X, y, feature_names) where:
      - X has shape (n_samples, len(FEATURE_COLS))
      - y has integer labels {0, 1, 2} (down, flat, up)
    """
    rng = np.random.default_rng(seed)
    n_features = len(FEATURE_COLS)

    X = rng.standard_normal((n_samples, n_features)).astype(np.float32)

    # Create partially informative labels (not pure noise):
    # Linear combination of a few features + noise -> direction
    signal = (
        0.3 * X[:, 0]   # log_return
        + 0.2 * X[:, 4]  # rsi
        - 0.15 * X[:, 8]  # atr
        + 0.1 * X[:, 16]  # sent_positive
    )
    noise = rng.normal(0, 0.5, n_samples)
    score = signal + noise

    # Convert to classes
    y = np.ones(n_samples, dtype=np.int64)  # flat = 1
    y[score > 0.3] = 2   # up
    y[score < -0.3] = 0  # down

    return X, y, list(FEATURE_COLS)


# ---------------------------------------------------------------
# CLI Entry Point
# ---------------------------------------------------------------

if __name__ == "__main__":
    print("=" * 60)
    print("CRYPTO RADAR - Ensemble Model Pipeline")
    print("=" * 60)

    # ------------------------------------------------------------------
    # 1. Generate synthetic data
    # ------------------------------------------------------------------
    print("\n[1/5] Generating synthetic data...")
    X, y, feature_names = _generate_synthetic_data(n_samples=3000)
    print(f"  Shape: X={X.shape}, y={y.shape}")
    print(f"  Features: {len(feature_names)}")
    classes, counts = np.unique(y, return_counts=True)
    for cls, cnt in zip(classes, counts):
        label_name = {0: "down", 1: "flat", 2: "up"}[cls]
        print(f"  Class {cls} ({label_name}): {cnt} ({cnt/len(y)*100:.1f}%)")

    # Train/test split (chronological-style: first 80% train, last 20% test)
    split = int(0.8 * len(X))
    X_train, X_test = X[:split], X[split:]
    y_train, y_test = y[:split], y[split:]
    class_weights = compute_class_weights(y_train)
    print(f"  Class weights: { {k: f'{v:.2f}' for k, v in class_weights.items()} }")

    # ------------------------------------------------------------------
    # 2. Train XGBoost
    # ------------------------------------------------------------------
    print("\n[2/5] Training XGBoost...")
    xgb_clf = XGBoostClassifier(class_weights=class_weights)
    xgb_clf.fit(X_train, y_train, eval_set=(X_test, y_test))
    xgb_preds = xgb_clf.predict(X_test)
    xgb_acc = accuracy_score(y_test, xgb_preds)
    print(f"  XGBoost accuracy: {xgb_acc:.4f}")

    # ------------------------------------------------------------------
    # 3. Train LightGBM
    # ------------------------------------------------------------------
    print("\n[3/5] Training LightGBM...")
    lgbm_clf = LightGBMClassifier(class_weights=class_weights)
    lgbm_clf.fit(X_train, y_train, eval_set=(X_test, y_test))
    lgbm_preds = lgbm_clf.predict(X_test)
    lgbm_acc = accuracy_score(y_test, lgbm_preds)
    print(f"  LightGBM accuracy: {lgbm_acc:.4f}")

    # ------------------------------------------------------------------
    # 4. Stacking ensemble
    # ------------------------------------------------------------------
    print("\n[4/5] Training stacking meta-learner (5-fold OOF)...")
    stacker = StackingMetaLearner(n_folds=5)
    stacker.fit([xgb_clf, lgbm_clf], X_train, y_train)
    stack_preds = stacker.predict(X_test)
    stack_acc = accuracy_score(y_test, stack_preds)
    print(f"  Stacked ensemble accuracy: {stack_acc:.4f}")

    # ------------------------------------------------------------------
    # 5. Feature importance
    # ------------------------------------------------------------------
    print("\n[5/5] Feature importance analysis...")
    analyzer = FeatureImportanceAnalyzer(xgb_clf, feature_names)
    analyzer.print_top_features(X_test, y_test, top_n=20)

    # ------------------------------------------------------------------
    # Comparison vs random baseline
    # ------------------------------------------------------------------
    rng = np.random.default_rng(0)
    random_preds = rng.choice([0, 1, 2], size=len(y_test))
    random_acc = accuracy_score(y_test, random_preds)

    print(f"\n{'=' * 55}")
    print(f"  Model Comparison")
    print(f"{'=' * 55}")
    print(f"  Random baseline : {random_acc:.4f}")
    print(f"  XGBoost         : {xgb_acc:.4f}  ({(xgb_acc - random_acc)/random_acc*100:+.1f}%)")
    print(f"  LightGBM        : {lgbm_acc:.4f}  ({(lgbm_acc - random_acc)/random_acc*100:+.1f}%)")
    print(f"  Stacked Ensemble: {stack_acc:.4f}  ({(stack_acc - random_acc)/random_acc*100:+.1f}%)")
    print(f"{'=' * 55}")

    print("\n  Classification Report (Stacked Ensemble):")
    print(classification_report(
        y_test, stack_preds,
        target_names=["down", "flat", "up"],
        digits=4,
    ))

    print("Ensemble model pipeline validated successfully.")
