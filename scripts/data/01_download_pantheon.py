"""
Шаг 1: Скачивание датасета Pantheon 2025.
Сохраняет сырой файл в data/raw/pantheon.csv и выводит сводку по данным.
"""

import bz2
import sys
import io
from pathlib import Path

# Windows CP1251 консоль не поддерживает все Unicode-символы
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

import requests
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
RAW_DIR = ROOT / "data" / "raw"
RAW_DIR.mkdir(parents=True, exist_ok=True)

URL = "https://storage.googleapis.com/pantheon-public-data/person_2025_update.csv.bz2"
BZ2_PATH = RAW_DIR / "pantheon.csv.bz2"
CSV_PATH = RAW_DIR / "pantheon.csv"


def download():
    if CSV_PATH.exists():
        print(f"Файл уже скачан: {CSV_PATH}")
        return
    print(f"Скачиваю {URL} ...")
    response = requests.get(URL, stream=True, timeout=120)
    response.raise_for_status()
    total = int(response.headers.get("content-length", 0))
    downloaded = 0
    with open(BZ2_PATH, "wb") as f:
        for chunk in response.iter_content(chunk_size=65536):
            f.write(chunk)
            downloaded += len(chunk)
            if total:
                pct = downloaded / total * 100
                print(f"\r  {pct:.1f}%", end="", flush=True)
    print()
    print("Распаковываю...")
    with bz2.open(BZ2_PATH, "rb") as src, open(CSV_PATH, "wb") as dst:
        dst.write(src.read())
    BZ2_PATH.unlink()
    print(f"Сохранено: {CSV_PATH}")


def analyze(df: pd.DataFrame):
    print("\n" + "=" * 60)
    print(f"ЗАПИСЕЙ ВСЕГО: {len(df):,}")
    print("=" * 60)

    print("\nКОЛОНКИ:")
    for col in df.columns:
        non_null = df[col].notna().sum()
        print(f"  {col:<35} {non_null:>7,} непустых")

    print("\nТОП-5 ЗНАЧЕНИЙ В КЛЮЧЕВЫХ КОЛОНКАХ:")
    for col in ["occupation", "gender", "bplace_country"]:
        if col in df.columns:
            top = df[col].value_counts().head(5)
            print(f"\n  {col}:")
            for val, cnt in top.items():
                print(f"    {str(val):<30} {cnt:>7,}")

    hpi_col = next((c for c in df.columns if "hpi" in c.lower()), None)
    if hpi_col:
        h = df[hpi_col].dropna()
        print(f"\nHPI ({hpi_col}):")
        print(f"  min    = {h.min():.2f}")
        print(f"  медиана= {h.median():.2f}")
        print(f"  max    = {h.max():.2f}")

        name_col = next((c for c in ["name", "slug", "en_name"] if c in df.columns), df.columns[0])

        print(f"\nТОП-5 по HPI:")
        extra_cols = [c for c in ["birthyear", "occupation", "bplace_country"] if c in df.columns]
        top5 = df.nlargest(5, hpi_col)[[name_col, hpi_col] + extra_cols]
        print(top5.to_string(index=False))

        print(f"\nАНТИ-ТОП-5 по HPI:")
        bot5 = df.nsmallest(5, hpi_col)[[name_col, hpi_col] + extra_cols]
        print(bot5.to_string(index=False))

    print("\n" + "=" * 60)
    print("ИТОГ: датасет скачан и загружен успешно.")
    print("Следующий шаг — фильтрация до ~15 000 фигур (скрипт 02).")
    print("=" * 60)


def main():
    try:
        download()
    except Exception as e:
        print(f"\nОШИБКА при скачивании: {e}", file=sys.stderr)
        sys.exit(1)

    print("\nЗагружаю CSV...")
    df = pd.read_csv(CSV_PATH, low_memory=False)
    analyze(df)


if __name__ == "__main__":
    main()
