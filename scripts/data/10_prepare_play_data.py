"""
Шаг 10: Подготовка данных для play-страницы.

Читает figures_top_final.csv, собирает 4 пула:
  top_5000   — global_rank 1–5000
  ru_quota   — inclusion_source = 'ru_quota'
  kz_quota   — inclusion_source = 'kz_quota'
  hpi_quota  — inclusion_source = 'hpi_quota'

Записывает в public/data/play_pools.json.
"""

import io
import sys
import json
import math
from pathlib import Path

import pandas as pd

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

ROOT     = Path(__file__).resolve().parents[2]
IN_PATH  = ROOT / "data" / "processed" / "figures_top_final.csv"
OUT_DIR  = ROOT / "public" / "data"
OUT_PATH = OUT_DIR / "play_pools.json"

KEEP_COLS = [
    "wikidata_id", "name", "occupation", "bplace_country",
    "birthyear", "deathyear", "inclusion_source", "global_rank",
    "global_score", "ru_score", "kz_score", "hpi",
]


FLOAT_ROUND = {"global_score": 4, "ru_score": 4, "kz_score": 4, "hpi": 1}
INT_COLS = {"birthyear", "deathyear", "global_rank"}


def to_records(df: pd.DataFrame) -> list:
    """Конвертирует DataFrame в список dict, убирая NaN/NaT."""
    records = []
    for row in df[KEEP_COLS].itertuples(index=False):
        rec = {}
        for col, val in zip(KEEP_COLS, row):
            if isinstance(val, float) and math.isnan(val):
                rec[col] = None
            elif col in INT_COLS:
                rec[col] = int(val)
            elif col in FLOAT_ROUND:
                rec[col] = round(float(val), FLOAT_ROUND[col])
            else:
                rec[col] = val
        records.append(rec)
    return records


print(f"Читаю {IN_PATH} ...")
df = pd.read_csv(IN_PATH, usecols=KEEP_COLS + ["global_rank", "inclusion_source"])

# global_rank уже в KEEP_COLS, дубль не страшен — read_csv дедуплицирует автоматически
# но на всякий случай:
df = df.loc[:, ~df.columns.duplicated()]

print(f"Всего фигур: {len(df):,}")

# ── Пулы ──────────────────────────────────────────────────────────────────────

top_5000 = df[df["global_rank"] <= 5000].copy()
ru_quota = df[df["inclusion_source"] == "ru_quota"].copy()
kz_quota = df[df["inclusion_source"] == "kz_quota"].copy()
hpi_quota = df[df["inclusion_source"] == "hpi_quota"].copy()

print(f"\n── Размеры пулов ──")
print(f"  top_5000  : {len(top_5000):>5,}")
print(f"  ru_quota  : {len(ru_quota):>5,}")
print(f"  kz_quota  : {len(kz_quota):>5,}")
print(f"  hpi_quota : {len(hpi_quota):>5,}")

all_ids = set(top_5000["wikidata_id"]) | set(ru_quota["wikidata_id"]) \
        | set(kz_quota["wikidata_id"]) | set(hpi_quota["wikidata_id"])
print(f"\n  Уникальных wikidata_id: {len(all_ids):,}")

# ── Сборка и запись ───────────────────────────────────────────────────────────

OUT_DIR.mkdir(parents=True, exist_ok=True)

payload = {
    "top_5000":  to_records(top_5000.sort_values("global_rank")),
    "ru_quota":  to_records(ru_quota),
    "kz_quota":  to_records(kz_quota),
    "hpi_quota": to_records(hpi_quota),
}

json_str = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
OUT_PATH.write_text(json_str, encoding="utf-8")

size_kb = OUT_PATH.stat().st_size / 1024
size_mb = size_kb / 1024
print(f"\n── Файл записан ──")
print(f"  Путь  : {OUT_PATH}")
print(f"  Размер: {size_kb:.1f} KB ({size_mb:.2f} MB)")
print("\nГотово.")
