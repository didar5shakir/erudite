"""
Diagnostic: KZ/CA seed check с исправленными aliases.
Read-only. Создаёт два CSV, печатает отчёт.
"""
import io, sys, json, math
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

import pandas as pd
from pathlib import Path

ROOT         = Path(__file__).resolve().parents[2]
BASE_CSV     = ROOT / "data/processed/figures_top_final.csv"
POOLS_JSON   = ROOT / "public/data/play_pools.json"
LABELS_CSV   = ROOT / "data/processed/figures_localized_labels.csv"
OUT_PREVIEW  = ROOT / "data/processed/kz_ca_seed_pool_preview.csv"
OUT_MANUAL   = ROOT / "data/processed/kz_ca_manual_injection_candidates.csv"

# ── Исправленные aliases (после mismatch fix) ─────────────────────────────────

SEEDS = [
    ("Абай / Abai Qunanbaiuly",       "KZ_hist",  ["Abai Qunanbaiuly", "Abay Qunanbaiuly"]),
    ("Ыбырай Алтынсарин",             "KZ_hist",  ["Altynsarin"]),
    ("Шоқан Уәлиханов",               "KZ_hist",  ["Walikhanov", "Valikhanov", "Shoqan", "Chokan Valikhanov"]),
    ("Мұхтар Әуезов",                 "KZ_hist",  ["Mukhtar Auezov", "Mukhtar Auyezov"]),
    ("Жамбыл Жабаев",                 "KZ_hist",  ["Zhambyl Zhabayuly", "Jambyl Jabayev"]),
    ("Құрманғазы Сағырбайұлы",        "KZ_hist",  ["Kurmangazy", "Sagyrbaev", "Qurmanghazy"]),
    ("Бауыржан Момышұлы",             "KZ_hist",  ["Momyshuly", "Momishuly", "Bauyrzhan Momyshuly"]),
    ("Мәншүк Мәметова",               "KZ_hist",  ["Manshuk", "Mametova"]),
    ("Әлия Молдағұлова",              "KZ_hist",  ["Moldagulova", "Aliya Moldagulova"]),
    ("Нурсултан Назарбаев",           "KZ_pol",   ["Nursultan Nazarbayev"]),
    ("Касым-Жомарт Токаев",           "KZ_pol",   ["Tokayev", "Toqaev", "Kassym-Jomart"]),
    ("Динмухамед Кунаев",             "KZ_pol",   ["Kunaev", "Kunayev", "Dinmukhamed"]),
    ("Абылай хан",                    "KZ_pol",   ["Ablai Khan", "Abylai Khan"]),
    ("Кенесары хан",                  "KZ_pol",   ["Kenesary", "Kenessary"]),
    ("Әбілқайыр хан",                 "KZ_pol",   ["Abulkhair", "Abul Khair Khan"]),
    ("Толе би",                       "KZ_pol",   ["Tole bi", "Tole Bi", "Toli bi"]),
    ("Қазыбек би",                    "KZ_pol",   ["Kazybek Bi", "Qazybek Bi"]),
    ("Айтеке би",                     "KZ_pol",   ["Aiteke bi", "Ayteke bi"]),
    ("Димаш Кудайберген",             "KZ_mod",   ["Dimash Qudaibergen", "Dimash Kudaibergen"]),
    ("Геннадий Головкин",             "KZ_mod",   ["Gennady Golovkin"]),
    ("Қайрат Нұртас",                 "KZ_mod",   ["Kairat Nurtas", "Qairat Nurtas"]),
    ("Скриптонит",                    "KZ_mod",   ["Scriptonite", "Skriptonit", "Adil Zhalelov"]),
    ("Иманбек",                       "KZ_mod",   ["Imanbek", "Imanbekoff"]),
    ("Роза Рымбаева",                 "KZ_mod",   ["Roza Rymbaeva", "Rymbaeva"]),
    ("Батырхан Шукенов",              "KZ_mod",   ["Batyrkhan Shukenov", "Shukenov"]),
    ("Серик Сапиев",                  "KZ_sport", ["Serik Sapiyev", "Sapiyev", "Sapiev"]),
    ("Бекзат Саттарханов",            "KZ_sport", ["Bekzat Sattarkhanov", "Sattarkhanov"]),
    # Fixed: narrow alias to exact full name
    ("Илья Ильин",                    "KZ_sport", ["Ilya Ilyin"]),
    # Fixed: Vinokurov spelling variants
    ("Александр Винокуров",           "KZ_sport", ["Alexander Vinokourov", "Alexandre Vinokourov", "Aleksandr Vinokurov"]),
    ("Елена Рыбакина",                "KZ_sport", ["Elena Rybakina", "Rybakina"]),
    ("Жаксылык Ушкемпиров",          "KZ_sport", ["Ushkempirov", "Zhaksylyk"]),
    # Fixed: Tamerlane — narrow aliases, avoid "Timur" alone
    ("Амир Темур / Тамерлан",         "CA",       ["Tamerlane", "Amir Timur", "Timur the Great"]),
    ("Шавкат Мирзиёев",              "CA",       ["Mirziyoyev", "Mirziyev", "Shavkat"]),
    ("Чингиз Айтматов",              "CA",       ["Aitmatov", "Aytmatov", "Chinghiz", "Chingiz"]),
    ("Алишер Навои",                  "CA",       ["Alisher Navoi", "Navoi", "Nawai"]),
    ("Юлдуз Усманова",               "CA",       ["Yulduz Usmanova", "Usmanova", "Usmonova"]),
]

# Manual injection info for C-candidates (known QIDs from Wikidata)
KNOWN_QIDS = {
    "Толе би":              ("Q615159",  "not_in_current_base"),
    "Қазыбек би":           ("Q1400419", "not_in_current_base"),
    "Айтеке би":            ("Q774936",  "not_in_current_base"),
    "Скриптонит":           ("",         "not_in_current_base"),
    "Иманбек":              ("",         "not_in_current_base"),
    "Роза Рымбаева":        ("",         "not_in_current_base"),
    "Батырхан Шукенов":     ("",         "not_in_current_base"),
    "Александр Винокуров":  ("",         "uncertain"),
    "Алишер Навои":         ("Q9196",    "not_in_current_base"),
    "Юлдуз Усманова":       ("",         "not_in_current_base"),
}

# ── Load data ─────────────────────────────────────────────────────────────────

df = pd.read_csv(BASE_CSV, usecols=[
    "wikidata_id", "name", "bplace_country",
    "global_rank", "ru_rank", "kz_rank", "hpi_rank",
    "final_priority_score", "inclusion_source", "kz_score",
])

pools_raw = json.loads(POOLS_JSON.read_text("utf-8"))
pool_by_qid = {}
for pname, people in pools_raw.items():
    for p in people:
        pool_by_qid[p["wikidata_id"]] = pname

labels_df = pd.read_csv(LABELS_CSV, usecols=["wikidata_id","name_en","name_ru","name_kk"])
labels_df = labels_df.set_index("wikidata_id")


def safe(v):
    if v is None:
        return ""
    if isinstance(v, float) and math.isnan(v):
        return ""
    return v


def find_best(aliases):
    masks = [df["name"].str.contains(a, case=False, na=False) for a in aliases]
    combined = masks[0]
    for m in masks[1:]:
        combined = combined | m
    hits = df[combined].copy()
    if len(hits) == 0:
        return None, []
    hits_sorted = hits.sort_values(
        ["kz_rank", "final_priority_score"],
        ascending=[True, False],
        na_position="last",
    )
    best = hits_sorted.iloc[0]
    top3 = hits_sorted.head(3)[
        ["wikidata_id", "name", "global_rank", "kz_rank", "final_priority_score"]
    ].to_dict("records")
    return best, top3


# ── Process seeds ─────────────────────────────────────────────────────────────

rows = []
for seed_name, seed_cat, aliases in SEEDS:
    best, top3 = find_best(aliases)

    if best is None:
        qid_hint, reason = KNOWN_QIDS.get(seed_name, ("", "not_in_current_base"))
        rows.append({
            "seed_name": seed_name, "seed_category": seed_cat,
            "aliases": " | ".join(aliases),
            "found_in_base": False,
            "wikidata_id": "", "name_in_base": "", "bplace_country": "",
            "global_rank": "", "ru_rank": "", "kz_rank": "", "hpi_rank": "",
            "final_priority_score": "",
            "in_play_pools": False, "pool_name": "",
            "has_wikidata_labels": False,
            "name_en": "", "name_ru": "", "name_kk": "",
            "category_letter": "C",
            "suggested_wikidata_id": qid_hint,
            "reason_not_found": reason,
        })
        continue

    qid = best["wikidata_id"]
    in_pools = qid in pool_by_qid
    pool_name = pool_by_qid.get(qid, "")

    lb = labels_df.loc[qid] if qid in labels_df.index else None
    name_en = safe(lb["name_en"]) if lb is not None else ""
    name_ru = safe(lb["name_ru"]) if lb is not None else ""
    name_kk = safe(lb["name_kk"]) if lb is not None else ""
    has_labels = bool(name_en or name_ru or name_kk)

    cat = "A" if in_pools else "B"

    rows.append({
        "seed_name": seed_name, "seed_category": seed_cat,
        "aliases": " | ".join(aliases),
        "found_in_base": True,
        "wikidata_id": qid,
        "name_in_base": best["name"],
        "bplace_country": safe(best["bplace_country"]),
        "global_rank": safe(best["global_rank"]),
        "ru_rank": safe(best["ru_rank"]),
        "kz_rank": safe(best["kz_rank"]),
        "hpi_rank": safe(best["hpi_rank"]),
        "final_priority_score": (
            round(float(best["final_priority_score"]), 6)
            if not math.isnan(float(best["final_priority_score"]))
            else ""
        ),
        "in_play_pools": in_pools,
        "pool_name": pool_name,
        "has_wikidata_labels": has_labels,
        "name_en": name_en,
        "name_ru": name_ru,
        "name_kk": name_kk,
        "category_letter": cat,
        "suggested_wikidata_id": "",
        "reason_not_found": "",
    })

result_df = pd.DataFrame(rows)

# ── ЗАДАЧА 2: preview CSV (A + B), sorted by kz_rank ─────────────────────────

preview_cols = [
    "seed_name", "wikidata_id", "name_in_base", "name_en", "name_ru", "name_kk",
    "bplace_country", "global_rank", "ru_rank", "kz_rank", "hpi_rank",
    "in_play_pools", "pool_name", "category_letter", "final_priority_score",
]
ab_df = result_df[result_df["category_letter"].isin(["A","B"])].copy()
ab_df["kz_rank_sort"] = pd.to_numeric(ab_df["kz_rank"], errors="coerce")
ab_df = ab_df.sort_values("kz_rank_sort")[preview_cols]
ab_df.to_csv(OUT_PREVIEW, index=False, encoding="utf-8")

# ── ЗАДАЧА 3: manual injection CSV (C only) ───────────────────────────────────

c_df = result_df[result_df["category_letter"] == "C"][[
    "seed_name", "aliases", "seed_category",
    "suggested_wikidata_id", "reason_not_found",
]].copy()
c_df.to_csv(OUT_MANUAL, index=False, encoding="utf-8")

# ═════════════════════════════════════════════════════════════════════════════
# ЗАДАЧА 4 — ОТЧЁТ
# ═════════════════════════════════════════════════════════════════════════════

SEP = "=" * 70

# ── 4.1: kz_quota sort order ──────────────────────────────────────────────────

print(SEP)
print("ЗАДАЧА 0: Текущий kz_quota — порядок сортировки")
print(SEP)

kz_pool = pools_raw["kz_quota"]

has_kz_rank_field = "kz_rank" in kz_pool[0] if kz_pool else False
print(f"  kz_rank field present in JSON: {has_kz_rank_field}")
print()

# Verify sort by comparing base kz_rank for first 20
rank_vals = []
for p in kz_pool[:20]:
    row = df[df["wikidata_id"] == p["wikidata_id"]]
    if len(row):
        kr = row.iloc[0]["kz_rank"]
        ks = row.iloc[0]["kz_score"]
    else:
        kr, ks = float("nan"), float("nan")
    rank_vals.append((p["name"], p["global_rank"], kr, ks))

print(f"  {'name':<38} {'g_rank':>7} {'kz_rank':>8} {'kz_score':>9}")
print("  " + "-" * 66)
for name, g, kr, ks in rank_vals:
    kr_s = str(int(kr)) if not (isinstance(kr, float) and math.isnan(kr)) else "N/A"
    ks_s = str(round(ks, 4)) if not (isinstance(ks, float) and math.isnan(ks)) else "N/A"
    print(f"  {name:<38} {str(g):>7} {kr_s:>8} {ks_s:>9}")

kz_ranks = [r[2] for r in rank_vals if not (isinstance(r[2], float) and math.isnan(r[2]))]
is_kz_rank_sorted = all(kz_ranks[i] <= kz_ranks[i+1] for i in range(len(kz_ranks)-1))
is_kz_score_sorted = all(
    r[3] >= rank_vals[i+1][3]
    for i, r in enumerate(rank_vals[:-1])
    if not (math.isnan(r[3]) or math.isnan(rank_vals[i+1][3]))
)
print()
print(f"  Sorted by kz_rank ASC  : {is_kz_rank_sorted}")
print(f"  Sorted by kz_score DESC: {is_kz_score_sorted}")

# ── 4.2: Fixed rows ────────────────────────────────────────────────────────────

print()
print(SEP)
print("ЗАДАЧА 1: Исправленные строки")
print(SEP)

fixed_seeds = [
    "Амир Темур / Тамерлан",
    "Илья Ильин",
    "Александр Винокуров",
]
fixed_cols = [
    "seed_name","wikidata_id","name_in_base","bplace_country",
    "global_rank","ru_rank","kz_rank","hpi_rank",
    "in_play_pools","pool_name","category_letter",
]
for sname in fixed_seeds:
    row = result_df[result_df["seed_name"] == sname]
    if len(row):
        r = row.iloc[0]
        print(f"\n  {sname}")
        for col in fixed_cols:
            print(f"    {col:<22}: {r[col]}")
    else:
        print(f"\n  {sname} — not found in results")

# ── 4.3: Preview CSV size ──────────────────────────────────────────────────────

print()
print(SEP)
print("ЗАДАЧА 2: kz_ca_seed_pool_preview.csv")
print(SEP)
print(f"  Строк (A+B): {len(ab_df)}")
print(f"  Путь: {OUT_PREVIEW}")

# ── 4.4: Top-10 preview ────────────────────────────────────────────────────────

print()
print(f"  Top-10 по kz_rank:")
print(f"  {'seed_name':<33} {'name_in_base':<35} {'kz_rank':>8} {'pool':<14} {'cat'}")
print("  " + "-" * 100)
for _, r in ab_df.head(10).iterrows():
    print(f"  {str(r['seed_name']):<33} {str(r['name_in_base']):<35} {str(r['kz_rank']):>8} {str(r['pool_name']):<14} {r['category_letter']}")

# ── 4.5: Manual injection candidates ─────────────────────────────────────────

print()
print(SEP)
print("ЗАДАЧА 3: Manual injection candidates (C)")
print(SEP)
print(f"  Строк: {len(c_df)}")
print(f"  Путь: {OUT_MANUAL}")
print()
print(f"  {'seed_name':<33} {'suggested_qid':<14} {'reason':<25} {'aliases'}")
print("  " + "-" * 110)
for _, r in c_df.iterrows():
    al = r["aliases"][:40] + "..." if len(r["aliases"]) > 40 else r["aliases"]
    print(f"  {str(r['seed_name']):<33} {str(r['suggested_wikidata_id']):<14} {str(r['reason_not_found']):<25} {al}")

# ── Summary ────────────────────────────────────────────────────────────────────

cats = result_df["category_letter"].value_counts()
print()
print(SEP)
print(f"ИТОГ: A={cats.get('A',0)}  B={cats.get('B',0)}  C={cats.get('C',0)}  Total={len(result_df)}")
print(SEP)
print("Done.")
