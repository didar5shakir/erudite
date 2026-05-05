"""
Шаг 10: Подготовка данных для play-страницы.

Читает figures_top_final.csv, собирает 5 пулов:
  top_5000   — top 5000 по global_rank
  ru_quota   — top 500 по ru_rank, исключая уже вошедших в top_5000
  kz_quota   — top 500 по kz_rank, исключая уже вошедших в top_5000
  hpi_quota  — top 500 по hpi_rank, исключая уже вошедших в top_5000
  kz_ca_top  — KZ/CA curated seed list из kz_ca_seed_pool_preview.csv (A+B)

Пересечения между quota-пулами допустимы.
inclusion_source берётся как есть из figures_top_final.csv (не переписывается).

Записывает в public/data/play_pools.json.
"""

import io
import sys
import json
import math
import gzip
from pathlib import Path

import pandas as pd

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

ROOT         = Path(__file__).resolve().parents[2]
IN_PATH      = ROOT / "data" / "processed" / "figures_top_final.csv"
SEED_PATH    = ROOT / "data" / "processed" / "kz_ca_seed_pool_preview.csv"
DISPLAY_PATH = ROOT / "data" / "processed" / "figures_display_names.csv"
MANUAL_PATH  = ROOT / "data" / "manual_display_names.json"
OUT_DIR      = ROOT / "public" / "data"
OUT_PATH     = OUT_DIR / "play_pools.json"

KEEP_COLS = [
    "wikidata_id", "name", "occupation", "bplace_country",
    "birthyear", "deathyear", "inclusion_source", "global_rank",
    "global_score", "ru_score", "kz_score", "hpi",
]

FLOAT_ROUND = {"global_score": 4, "ru_score": 4, "kz_score": 4, "hpi": 1}
INT_COLS = {"birthyear", "deathyear", "global_rank"}

QUOTA_SIZE = 500

CONTROL_FIGURES = [
    ("Abai Qunanbaiuly",      "Q195591"),
    ("Nursultan Nazarbayev",  "Q19766"),
    ("Ybyrai Altynsarin",     "Q1352359"),
    ("Mukhtar Auezov",        "Q1435009"),
    ("Kassym-Jomart Tokayev", "Q61513"),
    ("Dimash Qudaibergen",    "Q24049490"),
    ("Gennady Golovkin",      "Q311562"),
    ("Alexander Pushkin",     "Q7200"),
    ("Vladimir Vysotsky",     "Q39303"),
    ("Alla Pugacheva",        "Q155900"),
    ("Jesus",                 "Q302"),
    ("Muhammad",              "Q9458"),
    ("Albert Einstein",       "Q937"),
]


def to_records(df: pd.DataFrame, display_map: dict) -> list:
    """Конвертирует DataFrame в список dict, убирая NaN/NaT, добавляя display_name_*."""
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
        dn = display_map.get(rec["wikidata_id"])
        rec["display_name_en"] = dn["display_name_en"] if dn else None
        rec["display_name_ru"] = dn["display_name_ru"] if dn else None
        rec["display_name_kk"] = dn["display_name_kk"] if dn else None
        records.append(rec)
    return records


READ_COLS = KEEP_COLS + ["ru_rank", "kz_rank", "hpi_rank"]

# ── display_names map ─────────────────────────────────────────────────────────

print(f"Читаю {DISPLAY_PATH} ...")
dn_df = pd.read_csv(DISPLAY_PATH, dtype=str).fillna("")
display_map: dict = {}
for _, row in dn_df.iterrows():
    qid = row["wikidata_id"]
    display_map[qid] = {
        "display_name_en": row["display_name_en"] or None,
        "display_name_ru": row["display_name_ru"] or None,
        "display_name_kk": row["display_name_kk"] or None,
    }
print(f"display_names загружено: {len(display_map):,}")

# Manual overrides имеют приоритет над автоматическими
print(f"Читаю {MANUAL_PATH} ...")
manual_list = json.loads(MANUAL_PATH.read_text(encoding="utf-8"))
manual_map: dict = {}
for entry in manual_list:
    qid = entry["wikidata_id"]
    manual_map[qid] = {
        "display_name_en": entry.get("display_name_en") or None,
        "display_name_ru": entry.get("display_name_ru") or None,
        "display_name_kk": entry.get("display_name_kk") or None,
    }
# Применяем: manual_map перезаписывает display_map
display_map.update(manual_map)
print(f"Manual overrides: {len(manual_map)} записей применено")

print(f"Читаю {IN_PATH} ...")
df_full = pd.read_csv(IN_PATH, usecols=READ_COLS)
df_full = df_full.loc[:, ~df_full.columns.duplicated()]
print(f"Всего фигур: {len(df_full):,}")

# ── Пулы ──────────────────────────────────────────────────────────────────────

top_5000 = df_full[df_full["global_rank"] <= 5000].copy()
top_5000["inclusion_source"] = "global"
top_5000_ids = set(top_5000["wikidata_id"])

not_in_top = df_full[~df_full["wikidata_id"].isin(top_5000_ids)].copy()

ru_quota = (
    not_in_top.dropna(subset=["ru_rank"])
    .sort_values("ru_rank")
    .head(QUOTA_SIZE)
    .copy()
)
ru_quota["inclusion_source"] = "ru_quota"

kz_quota = (
    not_in_top.dropna(subset=["kz_rank"])
    .sort_values("kz_rank")
    .head(QUOTA_SIZE)
    .copy()
)
kz_quota["inclusion_source"] = "kz_quota"

hpi_quota = (
    not_in_top.dropna(subset=["hpi_rank"])
    .sort_values("hpi_rank")
    .head(QUOTA_SIZE)
    .copy()
)
hpi_quota["inclusion_source"] = "hpi_quota"

print(f"\n── Размеры пулов ──")
print(f"  top_5000  : {len(top_5000):>5,}")
print(f"  ru_quota  : {len(ru_quota):>5,}")
print(f"  kz_quota  : {len(kz_quota):>5,}")
print(f"  hpi_quota : {len(hpi_quota):>5,}")

total_records = len(top_5000) + len(ru_quota) + len(kz_quota) + len(hpi_quota)
all_ids = (
    set(top_5000["wikidata_id"])
    | set(ru_quota["wikidata_id"])
    | set(kz_quota["wikidata_id"])
    | set(hpi_quota["wikidata_id"])
)
print(f"\n  Всего записей (сумма)  : {total_records:,}")
print(f"  Уникальных wikidata_id : {len(all_ids):,}")

# ── kz_ca_top: curated KZ/CA seed list ────────────────────────────────────────

seed_df = pd.read_csv(SEED_PATH, usecols=["wikidata_id", "kz_rank"])
seed_ids = seed_df["wikidata_id"].astype(str).str.strip().tolist()

kz_ca_df = df_full[df_full["wikidata_id"].isin(seed_ids)].copy()
# Sort by kz_rank ASC for readability; kz_rank is NOT written to JSON
kz_ca_df = kz_ca_df.sort_values("kz_rank", na_position="last")

print(f"  kz_ca_top : {len(kz_ca_df):>5,}  (seed={len(seed_ids)}, matched={len(kz_ca_df)})")

# ── Сборка и запись ───────────────────────────────────────────────────────────

OUT_DIR.mkdir(parents=True, exist_ok=True)

payload = {
    "top_5000":  to_records(top_5000.sort_values("global_rank"), display_map),
    "ru_quota":  to_records(ru_quota,  display_map),
    "kz_quota":  to_records(kz_quota,  display_map),
    "hpi_quota": to_records(hpi_quota, display_map),
    "kz_ca_top": to_records(kz_ca_df,  display_map),
}

json_str = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
OUT_PATH.write_text(json_str, encoding="utf-8")

raw_bytes = OUT_PATH.stat().st_size
gz_bytes  = len(gzip.compress(json_str.encode("utf-8")))
print(f"\n── Файл записан ──")
print(f"  Путь    : {OUT_PATH}")
print(f"  Raw     : {raw_bytes/1024:.1f} KB ({raw_bytes/1024/1024:.2f} MB)")
print(f"  Gzip    : {gz_bytes/1024:.1f} KB ({gz_bytes/1024/1024:.2f} MB)")

# ── Контрольные фигуры ────────────────────────────────────────────────────────

print(f"\n── Контрольные фигуры ──")
pool_map = {
    "top_5000": set(top_5000["wikidata_id"]),
    "ru_quota": set(ru_quota["wikidata_id"]),
    "kz_quota": set(kz_quota["wikidata_id"]),
    "hpi_quota": set(hpi_quota["wikidata_id"]),
}
rank_df = df_full.set_index("wikidata_id")[["global_rank", "ru_rank", "kz_rank", "hpi_rank"]]

header = f"  {'name':<30} {'found':<6} {'pools':<40} {'g_rank':>7} {'ru_rank':>7} {'kz_rank':>7} {'hpi_rank':>8}"
print(header)
print("  " + "─" * 110)
for label, qid in CONTROL_FIGURES:
    found = qid in all_ids
    pools_in = [p for p, ids in pool_map.items() if qid in ids]
    if qid in rank_df.index:
        row = rank_df.loc[qid]
        g  = int(row["global_rank"]) if not math.isnan(float(row["global_rank"])) else "—"
        ru = int(row["ru_rank"])     if not math.isnan(float(row["ru_rank"]))     else "—"
        kz = int(row["kz_rank"])     if not math.isnan(float(row["kz_rank"]))     else "—"
        hp = int(row["hpi_rank"])    if not math.isnan(float(row["hpi_rank"]))    else "—"
    else:
        g = ru = kz = hp = "N/A"
    pools_str = ", ".join(pools_in) if pools_in else "—"
    print(f"  {label:<30} {'YES' if found else 'NO':<6} {pools_str:<40} {str(g):>7} {str(ru):>7} {str(kz):>7} {str(hp):>8}")

print("\nГотово.")
