"""
Шаг 8: Расчёт скоринга для ~47k исторических фигур.

Входные данные:
  data/processed/wiki_pv_monthly.csv       (wd_id, lang, month_idx, views)
  data/processed/pantheon_pv_monthly.csv   (wd_id, lang, month_idx, views)
  data/processed/wiki_top_humans_aggregated.csv
  data/raw/pantheon.csv

Выход:
  data/processed/all_figures_scored.csv
"""

import io
import sys
import numpy as np
import pandas as pd
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

ROOT      = Path(__file__).resolve().parents[2]
WIKI_PV   = ROOT / "data" / "processed" / "wiki_pv_monthly.csv"
PANTH_PV  = ROOT / "data" / "processed" / "pantheon_pv_monthly.csv"
WIKI_META = ROOT / "data" / "processed" / "wiki_top_humans_aggregated.csv"
PANTH_RAW = ROOT / "data" / "raw" / "pantheon.csv"
OUT_PATH  = ROOT / "data" / "processed" / "all_figures_scored.csv"

LANGS       = ["en", "ru", "es", "ar", "pt", "zh", "hi", "fr", "de", "ja", "kk"]
OTHER_LANGS = ["ar", "de", "es", "fr", "hi", "ja", "pt", "zh"]  # 8 языков, без en/ru/kk


# ── Загрузка и объединение pageviews ─────────────────────────────────────────

print("Загружаю pageviews...")
wiki_pv  = pd.read_csv(WIKI_PV)
panth_pv = pd.read_csv(PANTH_PV)

all_pv = pd.concat([wiki_pv, panth_pv], ignore_index=True)
all_pv["wd_id"] = all_pv["wd_id"].astype(str)

# Дедупликация: max views для одинаковых (wd_id, lang, month_idx)
all_pv = all_pv.groupby(["wd_id", "lang", "month_idx"], as_index=False)["views"].max()

n_people = all_pv["wd_id"].nunique()
print(f"Уникальных людей с pageviews: {n_people:,}")


# ── Глобальные помесячные суммы ───────────────────────────────────────────────

print("Считаю global monthly суммы...")
global_monthly = (
    all_pv.groupby(["wd_id", "month_idx"])["views"]
    .sum()
    .unstack(fill_value=0)
)
for m in range(12):
    if m not in global_monthly.columns:
        global_monthly[m] = 0.0
global_monthly = global_monthly[list(range(12))].astype(float)
all_ids = global_monthly.index


# ── Per-language monthly DataFrames ──────────────────────────────────────────

print("Пивотирую per-lang данные...")
lang_monthly = {}
for lang in LANGS:
    sub = all_pv[all_pv["lang"] == lang]
    if sub.empty:
        lang_monthly[lang] = pd.DataFrame(0.0, index=all_ids, columns=range(12))
        continue
    lm = sub.pivot_table(
        index="wd_id", columns="month_idx", values="views",
        aggfunc="max", fill_value=0,
    )
    for m in range(12):
        if m not in lm.columns:
            lm[m] = 0.0
    lang_monthly[lang] = lm[list(range(12))].astype(float).reindex(all_ids, fill_value=0)


# ── CAP и PV-метрики ──────────────────────────────────────────────────────────

def cap_metrics(monthly_df):
    """CAP = 5 × median. Возвращает (pv_total, pv_stable, pv_peak)."""
    med   = monthly_df.median(axis=1)          # медиана оригинальных данных
    capped = monthly_df.clip(upper=5 * med, axis=0)
    return capped.sum(axis=1), 12 * med, capped.max(axis=1)


pv_total, pv_stable, pv_peak = cap_metrics(global_monthly)


# ── Региональные взвешенные monthly ──────────────────────────────────────────

def weighted_monthly(main_weights, other_w_total):
    """
    main_weights: {lang: weight}
    other_w_total: суммарный вес для OTHER_LANGS (делится поровну на 8)
    """
    out = pd.DataFrame(0.0, index=all_ids, columns=range(12))
    for lang, w in main_weights.items():
        out = out + w * lang_monthly[lang]
    per_other = other_w_total / len(OTHER_LANGS)
    for lang in OTHER_LANGS:
        out = out + per_other * lang_monthly[lang]
    return out

# CIS: ru×0.55 + kk×0.15 + en×0.10 + tr×0.07 (tr нет в данных, =0) + other×0.13/8
cis_m = weighted_monthly({"ru": 0.55, "kk": 0.15, "en": 0.10}, 0.13)
# KZ: kk×0.50 + ru×0.30 + en×0.15 + other×0.05
kz_m  = weighted_monthly({"kk": 0.50, "ru": 0.30, "en": 0.15}, 0.05)
# RU: ru×0.55 + en×0.25 + kk×0.05 + other×0.15
ru_m  = weighted_monthly({"ru": 0.55, "en": 0.25, "kk": 0.05}, 0.15)

cis_pv_total, cis_pv_stable, cis_pv_peak = cap_metrics(cis_m)
kz_pv_total,  kz_pv_stable,  kz_pv_peak  = cap_metrics(kz_m)
ru_pv_total,  ru_pv_stable,  ru_pv_peak   = cap_metrics(ru_m)


# ── PV_raw и percentile rank ──────────────────────────────────────────────────

def pv_raw(total, stable, peak):
    return 0.45 * np.log1p(total) + 0.45 * np.log1p(stable) + 0.10 * np.log1p(peak)

def pct(s):
    return s.rank(pct=True)

pv_score     = pct(pv_raw(pv_total,  pv_stable,  pv_peak))
cis_pv_score = pct(pv_raw(cis_pv_total, cis_pv_stable, cis_pv_peak))
kz_pv_score  = pct(pv_raw(kz_pv_total,  kz_pv_stable,  kz_pv_peak))
ru_pv_score  = pct(pv_raw(ru_pv_total,  ru_pv_stable,  ru_pv_peak))


# ── Метаданные ────────────────────────────────────────────────────────────────

print("Загружаю метаданные...")
wiki_meta = (
    pd.read_csv(WIKI_META, usecols=["wikidata_id", "main_name"])
    .assign(wd_id=lambda x: x["wikidata_id"].astype(str))
    .set_index("wd_id")["main_name"]
    .rename("wiki_name")
)
panth_meta = (
    pd.read_csv(
        PANTH_RAW,
        usecols=["wd_id", "name", "hpi", "occupation", "gender",
                 "bplace_country", "birthyear", "deathyear"],
    )
    .drop_duplicates("wd_id")
    .assign(wd_id=lambda x: x["wd_id"].astype(str))
    .set_index("wd_id")
)


# ── Сборка итогового DataFrame ────────────────────────────────────────────────

print("Собираю итоговый DataFrame...")
df = pd.DataFrame(index=all_ids)
df.index.name = "wikidata_id"

df = df.join(wiki_meta,  how="left")   # → wiki_name
df = df.join(panth_meta, how="left")   # → name, hpi, occupation, gender, ...

# Приоритет имени: Wiki > Pantheon
df["name"] = df["wiki_name"].fillna(df["name"]).fillna("")
df = df.drop(columns=["wiki_name"])

# Источник
in_wiki  = all_ids.isin(wiki_meta.index)
in_panth = all_ids.isin(panth_meta.index)
df["source"] = np.select(
    [in_wiki & in_panth, in_wiki & ~in_panth, ~in_wiki & in_panth],
    ["both", "wiki", "pantheon"],
    default="wiki",
)

df["hpi"] = df["hpi"].fillna(0.0)
for c in ["occupation", "gender", "bplace_country"]:
    df[c] = df[c].fillna("")


# ── Базовые PV-скоры ──────────────────────────────────────────────────────────

df["pv_total"]  = pv_total
df["pv_stable"] = pv_stable
df["pv_peak"]   = pv_peak
df["pv_score"]  = pv_score
df["hpi_score"] = pct(df["hpi"])

hpi_sc = df["hpi_score"]
pv_sc  = df["pv_score"]

df["global_score"] = pv_sc + 0.18 * (hpi_sc - pv_sc).clip(lower=0) * (1 - pv_sc)

df["kz_pv_score"]  = kz_pv_score
df["ru_pv_score"]  = ru_pv_score
df["cis_pv_score"] = cis_pv_score


# ── Бонусы концентрации ────────────────────────────────────────────────────────

total_all = pd.Series(0.0, index=all_ids)
for l in LANGS:
    total_all += lang_monthly[l].sum(axis=1)
total_all = total_all.replace(0, np.nan)

kk_conc = (lang_monthly["kk"].sum(axis=1) / total_all).fillna(0)
ru_conc = (lang_monthly["ru"].sum(axis=1) / total_all).fillna(0)

def conc_bonus(c):
    return np.where(c > 0.20, 0.25 * (c - 0.20) / 0.80, 0.05 * c)

kk_bonus = pd.Series(conc_bonus(kk_conc.values), index=all_ids)
ru_bonus = pd.Series(conc_bonus(ru_conc.values), index=all_ids)

df["kk_concentration"] = kk_conc
df["ru_concentration"] = ru_conc


# ── Бонусы страны рождения ────────────────────────────────────────────────────

KZ_CB = {
    "Kazakhstan": 1.0, "Mongolia": 0.6,
    "Uzbekistan": 0.5, "Kyrgyzstan": 0.5, "Soviet Union": 0.5,
    "Turkmenistan": 0.4, "Tajikistan": 0.4,
    "Russia": 0.3, "Turkey": 0.3, "China": 0.2,
}
RU_CB = {
    "Russia": 1.0, "Soviet Union": 1.0,
    "Belarus": 0.7, "Ukraine": 0.6, "Kazakhstan": 0.5,
    "Latvia": 0.4, "Lithuania": 0.4, "Estonia": 0.4,
    "Uzbekistan": 0.4, "Georgia": 0.4, "Armenia": 0.4,
    "Azerbaijan": 0.4, "Moldova": 0.4, "Kyrgyzstan": 0.4,
    "Tajikistan": 0.4, "Turkmenistan": 0.4,
}

df["kz_country_bonus"] = df["bplace_country"].map(KZ_CB).fillna(0)
df["ru_country_bonus"] = df["bplace_country"].map(RU_CB).fillna(0)


# ── Финальные региональные скоры ─────────────────────────────────────────────

kz_pv_sc = df["kz_pv_score"]
ru_pv_sc  = df["ru_pv_score"]
cis_pv_sc = df["cis_pv_score"]

df["kz_score"] = (
    0.55 * kz_pv_sc
    + 0.20 * pv_sc
    + kk_bonus
    + 0.15 * df["kz_country_bonus"]
    + 0.30 * (hpi_sc - kz_pv_sc).clip(lower=0) * (1 - kz_pv_sc)
)
df["ru_score"] = (
    0.55 * ru_pv_sc
    + 0.20 * pv_sc
    + ru_bonus
    + 0.15 * df["ru_country_bonus"]
    + 0.30 * (hpi_sc - ru_pv_sc).clip(lower=0) * (1 - ru_pv_sc)
)
df["cis_score"] = (
    0.55 * cis_pv_sc
    + 0.20 * pv_sc
    + 0.18 * (hpi_sc - cis_pv_sc).clip(lower=0) * (1 - cis_pv_sc)
)


# ── Сохранение ────────────────────────────────────────────────────────────────

OUT_COLS = [
    "name", "source",
    "occupation", "gender", "bplace_country", "birthyear", "deathyear", "hpi",
    "pv_total", "pv_stable", "pv_peak",
    "pv_score", "hpi_score", "global_score",
    "kz_pv_score", "kz_score",
    "ru_pv_score", "ru_score",
    "cis_pv_score", "cis_score",
    "kk_concentration", "ru_concentration",
]
df[OUT_COLS].reset_index().to_csv(OUT_PATH, index=False, encoding="utf-8")
print(f"\nСохранено {len(df):,} фигур → {OUT_PATH}")


# ── Проверочные выводы ────────────────────────────────────────────────────────

src_counts = df["source"].value_counts()
print(f"\nИсточники: {src_counts.to_dict()}")
n_overlap = (df["source"] == "both").sum()
print(f"Перекрытий Wiki ∩ Pantheon: {n_overlap:,}")

def show_top(label, col, n=30):
    cols_show = ["name", "source", "bplace_country", col]
    top = df.nlargest(n, col)[cols_show]
    print(f"\n{'─'*60}")
    print(f"Топ-{n} по {label}")
    print('─'*60)
    with pd.option_context("display.max_colwidth", 28, "display.width", 120,
                           "display.float_format", "{:.4f}".format):
        print(top.to_string())

show_top("global_score", "global_score")
show_top("cis_score",    "cis_score")
show_top("kz_score",     "kz_score")
show_top("ru_score",     "ru_score")

print("\nГотово. Следующий шаг — 09_select_top.py")
