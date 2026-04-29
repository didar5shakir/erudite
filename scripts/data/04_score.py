"""
Шаг 4: Комбинированный рейтинг real_popularity.

Формула:
  real_popularity = 0.3 × norm(HPI) + 0.7 × norm(log1p(views_global))
  где norm() — min-max нормализация к [0, 1].

Сортирует всех фигур по рейтингу. Показывает топ-100 и распределения в топ-15 000.
"""

import io
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parents[2]
IN_PATH = ROOT / "data" / "processed" / "pantheon_with_pageviews.csv"
OUT_PATH = ROOT / "data" / "processed" / "pantheon_scored.csv"

TOP_N = 15_000
W_HPI = 0.3
W_PV = 0.7


def minmax(series: pd.Series) -> pd.Series:
    lo, hi = series.min(), series.max()
    if hi == lo:
        return pd.Series(0.0, index=series.index)
    return (series - lo) / (hi - lo)


def main():
    print(f"Загружаю {IN_PATH} ...")
    df = pd.read_csv(IN_PATH, low_memory=False)
    print(f"Загружено: {len(df):,} фигур\n")

    # Normalize HPI (already 0–100, but re-normalize for consistency)
    norm_hpi = minmax(df["hpi"].fillna(0))

    # Log-transform global pageviews, then normalize
    log_pv = np.log1p(df["views_global"].fillna(0))
    norm_pv = minmax(log_pv)

    df["real_popularity"] = W_HPI * norm_hpi + W_PV * norm_pv

    df.sort_values("real_popularity", ascending=False, inplace=True)
    df.reset_index(drop=True, inplace=True)
    df["rank"] = df.index + 1

    df.to_csv(OUT_PATH, index=False)
    mb = OUT_PATH.stat().st_size / 1024 / 1024
    print(f"Сохранено: {OUT_PATH}  ({mb:.1f} МБ)")

    # ── Топ-100 ──────────────────────────────────────────────────────────────
    print("\n" + "=" * 70)
    print("ТОП-100 по real_popularity")
    print("=" * 70)
    cols = ["rank", "name", "real_popularity", "hpi", "views_global", "occupation", "bplace_country", "birthyear"]
    top100 = df.head(100)[[c for c in cols if c in df.columns]]
    print(top100.to_string(index=False))

    # ── Распределения в топ-15 000 ───────────────────────────────────────────
    top = df.head(TOP_N)
    print(f"\n{'=' * 70}")
    print(f"РАСПРЕДЕЛЕНИЯ В ТОП-{TOP_N:,}")
    print("=" * 70)

    print(f"\nreal_popularity:")
    print(f"  #1    = {top['real_popularity'].iloc[0]:.4f}  ({top['name'].iloc[0]})")
    print(f"  #1000 = {top['real_popularity'].iloc[999]:.4f}")
    print(f"  #5000 = {top['real_popularity'].iloc[4999]:.4f}")
    print(f"  #15000= {top['real_popularity'].iloc[-1]:.4f}")

    print(f"\nТОП-15 occupation:")
    for val, cnt in top["occupation"].value_counts().head(15).items():
        bar = "█" * int(cnt / TOP_N * 50)
        print(f"  {str(val):<35} {cnt:>5,}  {cnt/TOP_N*100:>4.1f}%  {bar}")

    print(f"\nТОП-15 стран рождения:")
    for val, cnt in top["bplace_country"].value_counts().head(15).items():
        bar = "█" * int(cnt / TOP_N * 50)
        print(f"  {str(val):<35} {cnt:>5,}  {cnt/TOP_N*100:>4.1f}%  {bar}")

    if "birthyear" in top.columns:
        by = top["birthyear"].dropna()
        eras = [
            ("До н.э.",    by < 0),
            ("1–1500",     (by >= 0) & (by < 1500)),
            ("1500–1800",  (by >= 1500) & (by < 1800)),
            ("1800–1900",  (by >= 1800) & (by < 1900)),
            ("1900–1950",  (by >= 1900) & (by < 1950)),
            ("1950–1980",  (by >= 1950) & (by < 1980)),
            ("1980+",      by >= 1980),
        ]
        print(f"\nРаспределение по эпохам:")
        for label, mask in eras:
            cnt = mask.sum()
            bar = "█" * int(cnt / TOP_N * 50)
            print(f"  {label:<12} {cnt:>5,}  {cnt/TOP_N*100:>4.1f}%  {bar}")

    alive_n = top["alive"].eq(True).sum() if "alive" in top.columns else 0
    print(f"\nЖивых в топ-{TOP_N:,}: {alive_n:,} ({alive_n/TOP_N*100:.1f}%)")

    print(f"\nГотово. Следующий шаг — ревизия топ-100 и настройка весов по необходимости.")


if __name__ == "__main__":
    main()
