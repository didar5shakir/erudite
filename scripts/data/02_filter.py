"""
Шаг 2: Чистка датасета Pantheon.
Убирает мусор (HPI=0, пустые ключевые поля), оставляет всё остальное.
"""

import sys
import io
from pathlib import Path

import pandas as pd

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parents[2]
IN_PATH = ROOT / "data" / "raw" / "pantheon.csv"
OUT_PATH = ROOT / "data" / "processed" / "pantheon_clean.csv"
OUT_PATH.parent.mkdir(parents=True, exist_ok=True)


def main():
    print(f"Загружаю {IN_PATH} ...")
    df = pd.read_csv(IN_PATH, low_memory=False)
    total = len(df)
    print(f"Загружено: {total:,} записей\n")

    steps = []

    # 1. Убираем записи с HPI = 0 (нет реальной известности)
    mask = df["hpi"] > 0
    dropped = (~mask).sum()
    df = df[mask]
    steps.append(("HPI = 0", dropped))

    # 2. Убираем записи без имени
    mask = df["name"].notna() & (df["name"].str.strip() != "")
    dropped = (~mask).sum()
    df = df[mask]
    steps.append(("Нет имени", dropped))

    # 3. Убираем без страны рождения
    mask = df["bplace_country"].notna() & (df["bplace_country"].str.strip() != "")
    dropped = (~mask).sum()
    df = df[mask]
    steps.append(("Нет страны рождения", dropped))

    # 4. Убираем без профессии/категории
    mask = df["occupation"].notna() & (df["occupation"].str.strip() != "")
    dropped = (~mask).sum()
    df = df[mask]
    steps.append(("Нет occupation", dropped))

    # 5. Убираем группы (is_group=True) — нам нужны личности, не коллективы
    if "is_group" in df.columns:
        mask = df["is_group"] != True  # noqa: E712
        dropped = (~mask).sum()
        df = df[mask]
        steps.append(("Группы (is_group)", dropped))

    # Итог по фильтрам
    print("ФИЛЬТРЫ:")
    for reason, cnt in steps:
        print(f"  - {reason:<30} удалено: {cnt:,}")
    print(f"\nОсталось: {len(df):,} из {total:,} ({len(df)/total*100:.1f}%)")

    # Сводка по оставшимся данным
    print("\n" + "=" * 60)
    print("СВОДКА ПО ЧИСТОМУ ДАТАСЕТУ")
    print("=" * 60)

    print(f"\nHPI:")
    print(f"  min    = {df['hpi'].min():.2f}")
    print(f"  медиана= {df['hpi'].median():.2f}")
    print(f"  max    = {df['hpi'].max():.2f}")
    print(f"  > 30   = {(df['hpi'] > 30).sum():,}")
    print(f"  > 25   = {(df['hpi'] > 25).sum():,}")
    print(f"  > 20   = {(df['hpi'] > 20).sum():,}")
    print(f"  > 15   = {(df['hpi'] > 15).sum():,}")

    print(f"\nТОП-10 occupation:")
    for val, cnt in df["occupation"].value_counts().head(10).items():
        pct = cnt / len(df) * 100
        print(f"  {str(val):<35} {cnt:>7,}  ({pct:.1f}%)")

    print(f"\nТОП-10 стран рождения:")
    for val, cnt in df["bplace_country"].value_counts().head(10).items():
        pct = cnt / len(df) * 100
        print(f"  {str(val):<35} {cnt:>7,}  ({pct:.1f}%)")

    if "birthyear" in df.columns:
        by = df["birthyear"].dropna()
        print(f"\nГод рождения: min={int(by.min())}, медиана={int(by.median())}, max={int(by.max())}")
        print(f"  до 1 н.э.         = {(by < 0).sum():,}")
        print(f"  1–1500            = {((by >= 0) & (by < 1500)).sum():,}")
        print(f"  1500–1800         = {((by >= 1500) & (by < 1800)).sum():,}")
        print(f"  1800–1950         = {((by >= 1800) & (by < 1950)).sum():,}")
        print(f"  1950+             = {(by >= 1950).sum():,}")

    print(f"\nЖивых (alive=True): {df['alive'].eq(True).sum():,}")

    df.to_csv(OUT_PATH, index=False)
    print(f"\nСохранено: {OUT_PATH}")
    print(f"Размер файла: {OUT_PATH.stat().st_size / 1024 / 1024:.1f} МБ")
    print("\nГотово к Шагу 3 (pageviews).")


if __name__ == "__main__":
    main()
