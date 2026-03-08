"""
Section 4 Implementation: Multi-Modal Fusion Architecture

Multi-branch deep learning model:
  Branch A: LSTM for temporal sequence processing (OHLCV + technicals)
  Branch B: Dense network for static/sentiment features
  Fusion: Concatenation + MLP with Huber Loss optimization
"""

import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import Dataset, DataLoader
from config import (
    LSTM_UNITS, LSTM_LAYERS, DENSE_UNITS, DROPOUT_RATE,
    LEARNING_RATE, BATCH_SIZE, EPOCHS, HUBER_DELTA, SEQUENCE_LENGTH
)


class CryptoDataset(Dataset):
    """PyTorch dataset for multi-branch model input."""

    def __init__(self, temporal_X, static_X, targets):
        self.temporal = torch.FloatTensor(temporal_X)
        self.static = torch.FloatTensor(static_X)
        self.targets = torch.FloatTensor(targets)

    def __len__(self):
        return len(self.targets)

    def __getitem__(self, idx):
        return self.temporal[idx], self.static[idx], self.targets[idx]


class BranchA_LSTM(nn.Module):
    """
    Branch A: Temporal Sequence Processing

    Stacked LSTM layers process time-series sequences (OHLCV, technicals).
    The forget gate f_t = sigma(W_f * [h_{t-1}, x_t] + b_f) controls
    long-term memory retention of support/resistance levels.
    """

    def __init__(self, input_size, hidden_size=LSTM_UNITS,
                 num_layers=LSTM_LAYERS, dropout=DROPOUT_RATE):
        super().__init__()
        self.lstm = nn.LSTM(
            input_size=input_size,
            hidden_size=hidden_size,
            num_layers=num_layers,
            batch_first=True,
            dropout=dropout if num_layers > 1 else 0
        )
        self.layer_norm = nn.LayerNorm(hidden_size)

    def forward(self, x):
        # x shape: (batch, seq_length, n_temporal_features)
        lstm_out, (h_n, c_n) = self.lstm(x)
        # Use final hidden state from last layer
        h_final = h_n[-1]  # shape: (batch, hidden_size)
        return self.layer_norm(h_final)


class BranchB_Dense(nn.Module):
    """
    Branch B: Static & Sentiment Vectorization

    Processes macro indicators and FinBERT sentiment vectors
    V = [P_positive, P_negative, P_neutral] through Dense layers
    with ReLU activation and dropout for regularization.
    """

    def __init__(self, input_size, hidden_size=DENSE_UNITS, dropout=DROPOUT_RATE):
        super().__init__()
        self.network = nn.Sequential(
            nn.Linear(input_size, hidden_size),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(hidden_size, hidden_size // 2),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.LayerNorm(hidden_size // 2)
        )

    def forward(self, x):
        # x shape: (batch, n_static_features)
        return self.network(x)


class FusionModel(nn.Module):
    """
    Section 4.3: The Fusion Layer

    Concatenates latent representations from both branches:
    C = [h_LSTM ⊕ h_Dense]

    Then passes through MLP with dual output heads:
    1. Regression head: predicted return (continuous)
    2. Classification head: direction probability (up/down/flat)
    """

    def __init__(self, temporal_features, static_features,
                 lstm_hidden=LSTM_UNITS, dense_hidden=DENSE_UNITS):
        super().__init__()

        self.branch_a = BranchA_LSTM(temporal_features, lstm_hidden)
        self.branch_b = BranchB_Dense(static_features, dense_hidden)

        fusion_size = lstm_hidden + dense_hidden // 2

        # Shared fusion layers
        self.fusion = nn.Sequential(
            nn.Linear(fusion_size, 128),
            nn.ReLU(),
            nn.Dropout(DROPOUT_RATE),
            nn.Linear(128, 64),
            nn.ReLU(),
            nn.Dropout(DROPOUT_RATE)
        )

        # Regression head: predict return magnitude
        self.regression_head = nn.Linear(64, 1)

        # Classification head: predict direction (up, down, flat)
        self.classification_head = nn.Linear(64, 3)

    def forward(self, temporal_x, static_x):
        h_lstm = self.branch_a(temporal_x)
        h_dense = self.branch_b(static_x)

        # Concatenation: C = [h_LSTM ⊕ h_Dense]
        fused = torch.cat([h_lstm, h_dense], dim=1)
        shared = self.fusion(fused)

        regression_out = self.regression_head(shared).squeeze(-1)
        classification_out = self.classification_head(shared)

        return regression_out, classification_out


class ModelTrainer:
    """Training loop with Huber Loss and classification cross-entropy."""

    def __init__(self, model, device="cpu"):
        self.model = model.to(device)
        self.device = device
        self.optimizer = torch.optim.Adam(model.parameters(), lr=LEARNING_RATE)
        self.huber_loss = nn.HuberLoss(delta=HUBER_DELTA)
        self.ce_loss = nn.CrossEntropyLoss()

    def _direction_labels(self, targets, threshold=0.001):
        """Convert returns to direction classes: 0=down, 1=flat, 2=up."""
        labels = torch.ones_like(targets, dtype=torch.long)  # flat
        labels[targets > threshold] = 2   # up
        labels[targets < -threshold] = 0  # down
        return labels

    def train_epoch(self, dataloader):
        self.model.train()
        total_loss = 0
        correct = 0
        total = 0

        for temporal, static, targets in dataloader:
            temporal = temporal.to(self.device)
            static = static.to(self.device)
            targets = targets.to(self.device)

            self.optimizer.zero_grad()

            reg_out, cls_out = self.model(temporal, static)

            # Huber loss for regression
            loss_reg = self.huber_loss(reg_out, targets)

            # Cross-entropy for direction classification
            direction_labels = self._direction_labels(targets)
            loss_cls = self.ce_loss(cls_out, direction_labels)

            # Combined loss (weighted)
            loss = 0.7 * loss_reg + 0.3 * loss_cls
            loss.backward()

            # Gradient clipping to prevent exploding gradients
            torch.nn.utils.clip_grad_norm_(self.model.parameters(), max_norm=1.0)

            self.optimizer.step()

            total_loss += loss.item()
            preds = cls_out.argmax(dim=1)
            correct += (preds == direction_labels).sum().item()
            total += len(targets)

        avg_loss = total_loss / len(dataloader)
        accuracy = correct / total if total > 0 else 0
        return avg_loss, accuracy

    def evaluate(self, dataloader):
        self.model.eval()
        total_loss = 0
        correct = 0
        total = 0
        all_preds = []
        all_targets = []

        with torch.no_grad():
            for temporal, static, targets in dataloader:
                temporal = temporal.to(self.device)
                static = static.to(self.device)
                targets = targets.to(self.device)

                reg_out, cls_out = self.model(temporal, static)

                loss_reg = self.huber_loss(reg_out, targets)
                direction_labels = self._direction_labels(targets)
                loss_cls = self.ce_loss(cls_out, direction_labels)
                loss = 0.7 * loss_reg + 0.3 * loss_cls

                total_loss += loss.item()
                preds = cls_out.argmax(dim=1)
                correct += (preds == direction_labels).sum().item()
                total += len(targets)

                all_preds.extend(reg_out.cpu().numpy())
                all_targets.extend(targets.cpu().numpy())

        avg_loss = total_loss / len(dataloader)
        accuracy = correct / total if total > 0 else 0
        return avg_loss, accuracy, np.array(all_preds), np.array(all_targets)

    def fit(self, train_loader, val_loader, epochs=EPOCHS, patience=10):
        """Full training loop with early stopping."""
        best_val_loss = float("inf")
        patience_counter = 0
        history = {"train_loss": [], "val_loss": [], "train_acc": [], "val_acc": []}

        for epoch in range(epochs):
            train_loss, train_acc = self.train_epoch(train_loader)
            val_loss, val_acc, _, _ = self.evaluate(val_loader)

            history["train_loss"].append(train_loss)
            history["val_loss"].append(val_loss)
            history["train_acc"].append(train_acc)
            history["val_acc"].append(val_acc)

            if (epoch + 1) % 5 == 0 or epoch == 0:
                print(f"  Epoch {epoch+1:3d}/{epochs} | "
                      f"Train Loss: {train_loss:.6f} Acc: {train_acc:.3f} | "
                      f"Val Loss: {val_loss:.6f} Acc: {val_acc:.3f}")

            # Early stopping
            if val_loss < best_val_loss:
                best_val_loss = val_loss
                patience_counter = 0
                self.best_state = {k: v.clone() for k, v in self.model.state_dict().items()}
            else:
                patience_counter += 1
                if patience_counter >= patience:
                    print(f"  Early stopping at epoch {epoch+1}")
                    self.model.load_state_dict(self.best_state)
                    break

        return history

    def save(self, path):
        torch.save(self.model.state_dict(), path)
        print(f"[Model] Saved to {path}")

    def load(self, path):
        self.model.load_state_dict(torch.load(path, weights_only=True))
        print(f"[Model] Loaded from {path}")


# --- CLI Entry Point: Demo with synthetic data ---
if __name__ == "__main__":
    print("=" * 60)
    print("CRYPTO RADAR - Fusion Model Architecture Demo")
    print("=" * 60)

    # Synthetic data for architecture validation
    n_samples = 1000
    n_temporal_features = 16  # OHLCV + technicals
    n_static_features = 8    # sentiment + macro + on-chain

    temporal_X = np.random.randn(n_samples, SEQUENCE_LENGTH, n_temporal_features).astype(np.float32)
    static_X = np.random.randn(n_samples, n_static_features).astype(np.float32)
    targets = np.random.randn(n_samples).astype(np.float32) * 0.02  # Small returns

    # Split
    split = int(0.8 * n_samples)
    train_ds = CryptoDataset(temporal_X[:split], static_X[:split], targets[:split])
    val_ds = CryptoDataset(temporal_X[split:], static_X[split:], targets[split:])
    train_loader = DataLoader(train_ds, batch_size=BATCH_SIZE, shuffle=True)
    val_loader = DataLoader(val_ds, batch_size=BATCH_SIZE, shuffle=False)

    # Build model
    model = FusionModel(
        temporal_features=n_temporal_features,
        static_features=n_static_features
    )

    print(f"\nModel Architecture:")
    print(f"  Branch A (LSTM): {n_temporal_features} features x {SEQUENCE_LENGTH} steps "
          f"-> {LSTM_UNITS} hidden")
    print(f"  Branch B (Dense): {n_static_features} features -> {DENSE_UNITS//2} hidden")
    print(f"  Fusion: {LSTM_UNITS + DENSE_UNITS//2} -> 128 -> 64 -> regression + classification")
    total_params = sum(p.numel() for p in model.parameters())
    print(f"  Total parameters: {total_params:,}")

    # Train
    trainer = ModelTrainer(model)
    print(f"\nTraining on synthetic data ({n_samples} samples)...")
    history = trainer.fit(train_loader, val_loader, epochs=20)

    # Evaluate
    val_loss, val_acc, preds, actuals = trainer.evaluate(val_loader)
    rmse = np.sqrt(np.mean((preds - actuals) ** 2))
    print(f"\nValidation Results:")
    print(f"  Loss: {val_loss:.6f}")
    print(f"  Direction Accuracy: {val_acc:.3f}")
    print(f"  RMSE: {rmse:.6f}")
    print(f"\nModel architecture validated successfully.")
