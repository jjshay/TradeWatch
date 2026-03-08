"""
Section 3.2 Implementation: FinBERT NLP Sentiment Engine

Ingests RSS feeds, cleans text, runs FinBERT inference, and outputs
a normalized sentiment probability vector V = [P_positive, P_negative, P_neutral]
for each headline. Results are saved to CSV and returned as a DataFrame
for downstream fusion with time-series features.
"""

import feedparser
import pandas as pd
import re
import os
from datetime import datetime, timezone
from transformers import pipeline, AutoTokenizer, AutoModelForSequenceClassification
from config import RSS_FEEDS, FINBERT_MODEL, DATA_DIR


class SentimentEngine:
    """FinBERT-powered crypto news sentiment analyzer."""

    def __init__(self, model_name=FINBERT_MODEL):
        print(f"[SentimentEngine] Loading FinBERT model: {model_name}")
        self.tokenizer = AutoTokenizer.from_pretrained(model_name)
        self.model = AutoModelForSequenceClassification.from_pretrained(model_name)
        self.pipe = pipeline(
            "sentiment-analysis",
            model=self.model,
            tokenizer=self.tokenizer,
            return_all_scores=True,  # Get full probability vector
            truncation=True,
            max_length=512
        )
        print("[SentimentEngine] Model loaded successfully.")

    @staticmethod
    def clean_text(raw_html: str) -> str:
        """Strip HTML tags, extra whitespace, and non-ASCII."""
        text = re.sub(r"<[^>]+>", " ", raw_html)
        text = re.sub(r"\s+", " ", text).strip()
        text = text.encode("ascii", "ignore").decode("ascii")
        return text[:512]

    def analyze_headline(self, text: str) -> dict:
        """
        Run FinBERT on a single text input.
        Returns dict with keys: positive, negative, neutral, label, confidence.
        """
        scores = self.pipe(text)[0]
        result = {s["label"]: round(s["score"], 4) for s in scores}
        label = max(scores, key=lambda x: x["score"])
        result["label"] = label["label"]
        result["confidence"] = round(label["score"], 4)
        return result

    def fetch_feed(self, feed_url: str, feed_name: str, max_entries: int = 10) -> list:
        """Parse RSS feed and return list of entry dicts."""
        feed = feedparser.parse(feed_url)
        entries = []
        for entry in feed.entries[:max_entries]:
            summary = self.clean_text(entry.get("summary", ""))
            title = self.clean_text(entry.get("title", ""))
            published = entry.get("published", "")

            entries.append({
                "source": feed_name,
                "title": title,
                "summary": summary,
                "published": published,
                "text": f"{title}. {summary}"
            })
        return entries

    def analyze_all_feeds(self, feeds=None, max_per_feed: int = 10) -> pd.DataFrame:
        """
        Fetch and analyze all configured RSS feeds.
        Returns DataFrame with columns:
            timestamp, source, title, text,
            positive, negative, neutral, label, confidence
        """
        feeds = feeds or RSS_FEEDS
        all_results = []
        timestamp = datetime.now(timezone.utc).isoformat()

        for feed_cfg in feeds:
            name = feed_cfg["name"]
            url = feed_cfg["url"]
            print(f"[SentimentEngine] Fetching {name}...")

            try:
                entries = self.fetch_feed(url, name, max_per_feed)
            except Exception as e:
                print(f"  [WARN] Failed to fetch {name}: {e}")
                continue

            for entry in entries:
                try:
                    sentiment = self.analyze_headline(entry["text"])
                    all_results.append({
                        "timestamp": timestamp,
                        "source": entry["source"],
                        "title": entry["title"],
                        "text": entry["text"][:200],
                        "positive": sentiment.get("positive", 0),
                        "negative": sentiment.get("negative", 0),
                        "neutral": sentiment.get("neutral", 0),
                        "label": sentiment["label"],
                        "confidence": sentiment["confidence"],
                    })
                except Exception as e:
                    print(f"  [WARN] Failed to analyze: {entry['title'][:50]}... ({e})")

        df = pd.DataFrame(all_results)
        print(f"[SentimentEngine] Analyzed {len(df)} headlines across {len(feeds)} feeds.")
        return df

    def aggregate_sentiment(self, df: pd.DataFrame) -> dict:
        """
        Aggregate headline-level sentiment into a single market-level signal.
        Returns dict with mean scores, dominant label, and composite score.
        """
        if df.empty:
            return {"composite": 0.0, "label": "neutral", "count": 0}

        mean_pos = df["positive"].mean()
        mean_neg = df["negative"].mean()
        mean_neu = df["neutral"].mean()

        # Composite: ranges from -1 (bearish) to +1 (bullish)
        composite = mean_pos - mean_neg

        if composite > 0.1:
            label = "bullish"
        elif composite < -0.1:
            label = "bearish"
        else:
            label = "neutral"

        return {
            "composite": round(composite, 4),
            "mean_positive": round(mean_pos, 4),
            "mean_negative": round(mean_neg, 4),
            "mean_neutral": round(mean_neu, 4),
            "label": label,
            "count": len(df),
            "timestamp": datetime.now(timezone.utc).isoformat()
        }

    def save_to_csv(self, df: pd.DataFrame, filename: str = "sentiment_history.csv"):
        """Append results to CSV for historical tracking."""
        os.makedirs(DATA_DIR, exist_ok=True)
        filepath = os.path.join(DATA_DIR, filename)
        write_header = not os.path.exists(filepath)
        df.to_csv(filepath, mode="a", header=write_header, index=False)
        print(f"[SentimentEngine] Saved {len(df)} rows to {filepath}")


# --- CLI Entry Point ---
if __name__ == "__main__":
    engine = SentimentEngine()

    # Analyze all feeds
    df = engine.analyze_all_feeds(max_per_feed=5)

    # Print results
    print("\n" + "=" * 70)
    print("CRYPTO RADAR - FinBERT Sentiment Analysis")
    print("=" * 70)

    for _, row in df.iterrows():
        emoji = {"positive": "+", "negative": "-", "neutral": "~"}.get(row["label"], "?")
        print(f"  [{emoji}] [{row['source']:15s}] {row['title'][:60]}")
        print(f"       Pos={row['positive']:.3f}  Neg={row['negative']:.3f}  "
              f"Neu={row['neutral']:.3f}  => {row['label'].upper()} ({row['confidence']:.3f})")

    # Aggregate
    agg = engine.aggregate_sentiment(df)
    print(f"\n{'=' * 70}")
    print(f"MARKET SENTIMENT: {agg['label'].upper()} "
          f"(composite={agg['composite']:+.4f}, n={agg['count']})")
    print(f"  Avg Positive: {agg['mean_positive']:.4f}")
    print(f"  Avg Negative: {agg['mean_negative']:.4f}")
    print(f"  Avg Neutral:  {agg['mean_neutral']:.4f}")
    print("=" * 70)

    # Save
    engine.save_to_csv(df)
