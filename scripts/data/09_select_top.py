"""
Шаг 9: Квотный отбор финальной базы из ~47k фигур → ~30k.

Квоты:
  set_global = top-25,000 по global_score
  set_ru     = top-2,000  по ru_score     (не в set_global)
  set_kz     = top-2,000  по kz_score     (не в set_global ∪ set_ru)
  set_hpi    = top-1,000  по hpi          (не в остальных)
  global_fill = добор до 30,000 по global_score если итого < 30,000

Если итого > 33,000 — обрезать до 33,000 по final_priority_score.
"""

import io
import sys
import numpy as np
import pandas as pd
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

ROOT      = Path(__file__).resolve().parents[2]
IN_PATH   = ROOT / "data" / "processed" / "all_figures_scored.csv"
OUT_FINAL = ROOT / "data" / "processed" / "figures_top_final.csv"
OUT_GLO   = ROOT / "data" / "processed" / "figures_by_global.csv"
OUT_RU    = ROOT / "data" / "processed" / "figures_by_ru.csv"
OUT_KZ    = ROOT / "data" / "processed" / "figures_by_kz.csv"
OUT_HPI   = ROOT / "data" / "processed" / "figures_by_hpi.csv"

QUOTA_GLOBAL = 25_000
QUOTA_RU     =  2_000
QUOTA_KZ     =  2_000
QUOTA_HPI    =  1_000
TARGET       = 30_000
MAX_SIZE     = 33_000


# ── Загрузка ──────────────────────────────────────────────────────────────────

print(f"Загружаю {IN_PATH} ...")
df = pd.read_csv(IN_PATH)
print(f"Всего фигур: {len(df):,}")

df["wikidata_id"] = df["wikidata_id"].astype(str)
df = df.set_index("wikidata_id")


# ── hpi_percentile ────────────────────────────────────────────────────────────

df["hpi_percentile"] = df["hpi"].rank(pct=True)


# ── final_priority_score ──────────────────────────────────────────────────────

df["final_priority_score"] = np.maximum.reduce([
    df["global_score"].values,
    0.92 * df["ru_score"].values,
    0.92 * df["kz_score"].values,
    0.88 * df["hpi_percentile"].values,
])


# ── In-top флаги (независимо от квот — просто факт попадания в топ) ──────────

df["in_global_top"] = df["global_score"].rank(ascending=False, method="first") <= QUOTA_GLOBAL
df["in_ru_top"]     = df["ru_score"].rank(ascending=False, method="first")     <= QUOTA_RU
df["in_kz_top"]     = df["kz_score"].rank(ascending=False, method="first")     <= QUOTA_KZ
df["in_hpi_top"]    = df["hpi"].rank(ascending=False, method="first")          <= QUOTA_HPI


# ── Квотный отбор ─────────────────────────────────────────────────────────────

set_global = set(df.nlargest(QUOTA_GLOBAL, "global_score").index)

ru_pool    = df[~df.index.isin(set_global)]
set_ru     = set(ru_pool.nlargest(QUOTA_RU, "ru_score").index)

kz_pool    = df[~df.index.isin(set_global | set_ru)]
set_kz     = set(kz_pool.nlargest(QUOTA_KZ, "kz_score").index)

hpi_pool   = df[~df.index.isin(set_global | set_ru | set_kz)]
set_hpi    = set(hpi_pool.nlargest(QUOTA_HPI, "hpi").index)

final_set  = set_global | set_ru | set_kz | set_hpi
print(f"После квот: {len(final_set):,}  "
      f"(global={len(set_global)}, ru={len(set_ru)}, kz={len(set_kz)}, hpi={len(set_hpi)})")

# Добор если < TARGET
set_fill = set()
if len(final_set) < TARGET:
    fill_pool = df[~df.index.isin(final_set)]
    need      = TARGET - len(final_set)
    set_fill  = set(fill_pool.nlargest(need, "global_score").index)
    final_set = final_set | set_fill
    print(f"Добор global_fill: +{len(set_fill):,}  итого: {len(final_set):,}")


# ── inclusion_source ──────────────────────────────────────────────────────────

def assign_source(idx):
    if idx in set_global: return "global"
    if idx in set_ru:     return "ru_quota"
    if idx in set_kz:     return "kz_quota"
    if idx in set_hpi:    return "hpi_quota"
    if idx in set_fill:   return "global_fill"
    return "unknown"

df_final = df[df.index.isin(final_set)].copy()
df_final["inclusion_source"] = [assign_source(i) for i in df_final.index]


# ── Обрезка если > MAX_SIZE ───────────────────────────────────────────────────

if len(df_final) > MAX_SIZE:
    df_final = df_final.nlargest(MAX_SIZE, "final_priority_score")
    print(f"Обрезано до {MAX_SIZE:,} по final_priority_score")


# ── Сортировка ────────────────────────────────────────────────────────────────

df_final = df_final.sort_values("final_priority_score", ascending=False)


# ── Ранги внутри финальной базы ───────────────────────────────────────────────

df_final["global_rank"] = df_final["global_score"].rank(ascending=False, method="min").astype(int)
df_final["ru_rank"]     = df_final["ru_score"].rank(ascending=False, method="min").astype(int)
df_final["kz_rank"]     = df_final["kz_score"].rank(ascending=False, method="min").astype(int)
df_final["hpi_rank"]    = df_final["hpi"].rank(ascending=False, method="min").astype(int)


# ── Сохранение ────────────────────────────────────────────────────────────────

df_final.reset_index().to_csv(OUT_FINAL, index=False, encoding="utf-8")
df_final.sort_values("global_score", ascending=False).reset_index().to_csv(OUT_GLO, index=False, encoding="utf-8")
df_final.sort_values("ru_score",     ascending=False).reset_index().to_csv(OUT_RU,  index=False, encoding="utf-8")
df_final.sort_values("kz_score",     ascending=False).reset_index().to_csv(OUT_KZ,  index=False, encoding="utf-8")
df_final.sort_values("hpi",          ascending=False).reset_index().to_csv(OUT_HPI, index=False, encoding="utf-8")

print(f"\nСохранено {len(df_final):,} фигур → {OUT_FINAL}")


# ── Статистика ────────────────────────────────────────────────────────────────

print(f"\n── 1. Итоговый размер базы: {len(df_final):,}")

print("\n── 2. inclusion_source:")
for src, cnt in df_final["inclusion_source"].value_counts().items():
    print(f"   {src:<15} {cnt:>6,}")

print("\n── 3. in_*_top флаги:")
for col in ["in_global_top", "in_ru_top", "in_kz_top", "in_hpi_top"]:
    print(f"   {col:<18} True={df_final[col].sum():>6,}  False={( ~df_final[col]).sum():>6,}")


def show_top(label, sort_col, n=30):
    top = df_final.sort_values(sort_col, ascending=False).head(n)
    print(f"\n── {label} (топ-{n}) ──")
    for _, row in top.iterrows():
        occ = str(row["occupation"]) if str(row["occupation"]) not in ("nan", "") else "-"
        print(f"  {row[sort_col]:>8.4f}  {row['name']:<35} {occ:<28} HPI={row['hpi']:5.1f}")


print("\n── 4. Топ-30 по global_score ──")
show_top("global_score", "global_score")

print("\n── 5. Топ-30 по ru_score ──")
show_top("ru_score", "ru_score")

print("\n── 6. Топ-30 по kz_score ──")
show_top("kz_score", "kz_score")

print("\n── 7. Топ-30 по hpi ──")
top_hpi = df_final.sort_values("hpi", ascending=False).head(30)
print(f"\n── hpi (топ-30) ──")
for _, row in top_hpi.iterrows():
    occ = str(row["occupation"]) if str(row["occupation"]) not in ("nan", "") else "-"
    print(f"  HPI={row['hpi']:5.1f}  {row['name']:<35} {occ}")


print("\n── 8. Распределение по occupation (топ-20) ──")
occ_counts = df_final["occupation"].replace("", "UNKNOWN").value_counts().head(20)
for occ, cnt in occ_counts.items():
    print(f"   {occ:<35} {cnt:>5,}")


def epoch(y):
    if pd.isna(y): return "неизвестно"
    y = int(y)
    if y < 1500:   return "до 1500"
    if y < 1800:   return "1500–1800"
    if y < 1900:   return "1800–1900"
    if y < 1950:   return "1900–1950"
    if y < 2000:   return "1950–2000"
    return "после 2000"

print("\n── 9. Распределение по эпохам ──")
df_final["epoch"] = df_final["birthyear"].apply(epoch)
epoch_order = ["до 1500", "1500–1800", "1800–1900", "1900–1950", "1950–2000", "после 2000", "неизвестно"]
for ep in epoch_order:
    cnt = (df_final["epoch"] == ep).sum()
    print(f"   {ep:<15} {cnt:>5,}")


print("\n── 10. Распределение по полу ──")
for g, cnt in df_final["gender"].replace("", "UNKNOWN").value_counts().items():
    print(f"   {g:<15} {cnt:>6,}")


print("\n── 11. Топ-20 стран ──")
for c, cnt in df_final["bplace_country"].replace("", "UNKNOWN").value_counts().head(20).items():
    print(f"   {c:<35} {cnt:>5,}")


# ── 12. Контрольные фигуры ────────────────────────────────────────────────────

CHECKS = [
    "Jesus", "Muhammad", "Cleopatra", "Napoleon", "Albert Einstein",
    "Leonardo da Vinci", "Hammurabi", "Tigranes", "Avicenna",
    "Pushkin", "Tolstoy", "Dostoevsky", "Chekhov", "Gagarin",
    "Pugacheva", "Vysotsky", "Lermontov",
    "Abai", "Al-Farabi", "Ablai Khan", "Nazarbayev",
    "Tokayev", "Dimash", "Golovkin",
]

df_final_reset = df_final.reset_index()

print("\n── 12. Контрольные фигуры ──")
print(f"  {'Запрос':<22} {'Имя найдено':<35} {'incl':<12} {'GR':>5} {'RR':>5} {'KZ':>5} {'HPI_R':>6}  fps")
print("  " + "-"*115)

for q in CHECKS:
    mask = df_final_reset["name"].str.contains(q, case=False, na=False, regex=False)
    found = df_final_reset[mask]
    if found.empty:
        # Проверим в полной базе
        mask2 = df["name"].str.contains(q, case=False, na=False, regex=False)
        found2 = df[mask2]
        if found2.empty:
            print(f"  {q:<22} НЕ НАЙДЕН В БАЗЕ")
        else:
            row2 = found2.iloc[0]
            print(f"  {q:<22} НЕ В ФИНАЛЕ: {row2['name']:<33} global_score={row2['global_score']:.4f}")
    else:
        row = found.iloc[0]
        print(f"  {q:<22} {row['name']:<35} {row['inclusion_source']:<12} "
              f"{int(row['global_rank']):>5} {int(row['ru_rank']):>5} {int(row['kz_rank']):>5} "
              f"{int(row['hpi_rank']):>6}  {row['final_priority_score']:.4f}")

print("\nГотово.")
