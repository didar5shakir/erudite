"""
Diagnostic seed check: KZ + Central Asia figures.
Read-only. Outputs data/processed/kz_ca_seed_check.csv.
"""
import io, sys, json, math
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

import pandas as pd
from pathlib import Path

ROOT       = Path(__file__).resolve().parents[2]
BASE_CSV   = ROOT / "data/processed/figures_top_final.csv"
POOLS_JSON = ROOT / "public/data/play_pools.json"
LABELS_CSV = ROOT / "data/processed/figures_localized_labels.csv"
OUT_CSV    = ROOT / "data/processed/kz_ca_seed_check.csv"

SEEDS = [
    ("Абай / Abai Qunanbaiuly",       "KZ_hist",  ["Abai","Abay","Kunanbai","Qunanbai"]),
    ("Ыбырай Алтынсарин",             "KZ_hist",  ["Altynsarin","Altinsarin","Ibrahim Altynsarin"]),
    ("Шоқан Уәлиханов",               "KZ_hist",  ["Walikhanov","Valikhanov","Shokan","Shoqan","Chokan","Valikhan"]),
    ("Мұхтар Әуезов",                 "KZ_hist",  ["Auezov","Auyezov"]),
    ("Жамбыл Жабаев",                 "KZ_hist",  ["Zhambyl","Jambyl","Zhabayuly","Jabayev"]),
    ("Құрманғазы Сағырбайұлы",        "KZ_hist",  ["Kurmangazy","Sagyrbaev","Qurmanghazy"]),
    ("Бауыржан Момышұлы",             "KZ_hist",  ["Momyshuly","Momishuly","Baurzhan","Bauyrzhan"]),
    ("Мәншүк Мәметова",               "KZ_hist",  ["Manshuk","Mametova"]),
    ("Әлия Молдағұлова",              "KZ_hist",  ["Moldagulova","Moldaghulova","Aliya Moldagulova"]),
    ("Нурсултан Назарбаев",           "KZ_pol",   ["Nazarbayev","Nursultan"]),
    ("Касым-Жомарт Токаев",           "KZ_pol",   ["Tokayev","Toqaev","Kassym-Jomart","Qasym-Jomart"]),
    ("Динмухамед Кунаев",             "KZ_pol",   ["Kunaev","Kunayev","Dinmukhamed"]),
    ("Абылай хан",                    "KZ_pol",   ["Abylai Khan","Ablai Khan","Abulai Khan"]),
    ("Кенесары хан",                  "KZ_pol",   ["Kenesary","Kenessary Kasymov"]),
    ("Әбілқайыр хан",                 "KZ_pol",   ["Abulkhair","Abul Khair","Abulkhayir"]),
    ("Толе би",                       "KZ_pol",   ["Tole bi","Tole Bi","Toli bi"]),
    ("Қазыбек би",                    "KZ_pol",   ["Kazybek","Qazybek","Kazibek Bi"]),
    ("Айтеке би",                     "KZ_pol",   ["Aiteke","Ayteke","Aytike bi"]),
    ("Димаш Кудайберген",             "KZ_mod",   ["Dimash","Qudaibergen","Kudaibergen"]),
    ("Геннадий Головкин",             "KZ_mod",   ["Golovkin","Gennady Golovkin"]),
    ("Қайрат Нұртас",                 "KZ_mod",   ["Kairat Nurtas","Nurtas","Qairat Nurtas"]),
    ("Скриптонит",                    "KZ_mod",   ["Scriptonite","Skriptonit","Adil Zhalelov","Zhalelov"]),
    ("Иманбек",                       "KZ_mod",   ["Imanbek","Imanbekoff"]),
    ("Роза Рымбаева",                 "KZ_mod",   ["Rymbaeva","Rimbayeva"]),
    ("Батырхан Шукенов",              "KZ_mod",   ["Shukenov","Shukenoff","Batyrkhan"]),
    ("Серик Сапиев",                  "KZ_sport", ["Sapiyev","Sapiev","Serik Sapiyev"]),
    ("Бекзат Саттарханов",            "KZ_sport", ["Sattarkhanov","Sattarkhan","Bekzat"]),
    ("Илья Ильин",                    "KZ_sport", ["Ilya Ilyin","Ilyin"]),
    ("Александр Винокуров",           "KZ_sport", ["Vinokurov","Alexander Vinokurov"]),
    ("Елена Рыбакина",                "KZ_sport", ["Rybakina","Elena Rybakina"]),
    ("Жаксылык Ушкемпиров",          "KZ_sport", ["Ushkempirov","Zhaksylyk"]),
    ("Алишер Навои",                  "CA",       ["Navoi","Nawai","Alisher Navoi"]),
    ("Амир Темур / Тамерлан",         "CA",       ["Timur","Tamerlane","Tamerlan","Amir Timur"]),
    ("Шавкат Мирзиёев",              "CA",       ["Mirziyoyev","Mirziyev","Shavkat"]),
    ("Юлдуз Усманова",               "CA",       ["Usmanova","Usmonova","Yulduz"]),
    ("Чингиз Айтматов",              "CA",       ["Aitmatov","Aytmatov","Chinghiz","Chingiz"]),
]

df = pd.read_csv(BASE_CSV, usecols=[
    "wikidata_id", "name", "bplace_country",
    "global_rank", "ru_rank", "kz_rank", "hpi_rank",
    "final_priority_score", "inclusion_source",
])

pools_raw = json.loads(POOLS_JSON.read_text("utf-8"))
pool_by_qid = {}
for pool_name, people in pools_raw.items():
    for p in people:
        pool_by_qid[p["wikidata_id"]] = pool_name

labels_df = pd.read_csv(LABELS_CSV, usecols=["wikidata_id","name_en","name_ru","name_kk"])
labels_df = labels_df.set_index("wikidata_id")


def safe(v):
    if v is None:
        return ""
    if isinstance(v, float) and math.isnan(v):
        return ""
    return v


def find_candidates(aliases):
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


rows = []
ambiguous = []

for seed_name, seed_cat, aliases in SEEDS:
    best, top3 = find_candidates(aliases)

    if best is None:
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
        })
        continue

    if len(top3) > 1:
        ambiguous.append({"seed": seed_name, "candidates": top3})

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
    })

result_df = pd.DataFrame(rows)
result_df.to_csv(OUT_CSV, index=False, encoding="utf-8")

cats = result_df["category_letter"].value_counts()
A = cats.get("A", 0)
B = cats.get("B", 0)
C = cats.get("C", 0)

print(f"Saved: {OUT_CSV}")
print()
print("=" * 60)
print(f"SUMMARY  |  A={A}  B={B}  C={C}  Total={A+B+C}")
print("=" * 60)

print()
print(f"== C ({C}): NOT in base — manual injection candidates ==")
c_rows = result_df[result_df["category_letter"] == "C"]
for _, r in c_rows.iterrows():
    print(f"  {r['seed_name']}")

print()
print(f"== B ({B}): in base, NOT in play_pools — candidates for kz_ca_top ==")
b_rows = result_df[result_df["category_letter"] == "B"].copy()
b_rows["kz_rank_sort"] = pd.to_numeric(b_rows["kz_rank"], errors="coerce")
b_rows = b_rows.sort_values("kz_rank_sort")
for _, r in b_rows.iterrows():
    print(f"  kz={str(r['kz_rank']):>6}  g={str(r['global_rank']):>6}  {r['name_in_base']:<35}  [{r['seed_name']}]")

print()
print(f"== A ({A}): already in play_pools ==")
a_rows = result_df[result_df["category_letter"] == "A"].copy()
a_rows["kz_rank_sort"] = pd.to_numeric(a_rows["kz_rank"], errors="coerce")
a_rows = a_rows.sort_values(["pool_name", "kz_rank_sort"])
for _, r in a_rows.iterrows():
    print(f"  pool={r['pool_name']:<12}  kz={str(r['kz_rank']):>6}  g={str(r['global_rank']):>6}  {r['name_in_base']:<35}  [{r['seed_name']}]")

print()
print(f"== Ambiguous matches (multiple candidates) ==")
if ambiguous:
    shown = 0
    for item in ambiguous:
        if shown >= 5:
            break
        print(f"  Seed: {item['seed']}")
        for c in item["candidates"]:
            print(f"    QID={c['wikidata_id']:<12}  g={str(c['global_rank']):>6}  kz={str(c['kz_rank']):>6}  {c['name']}")
        shown += 1
else:
    print("  None")

print()
print("Done.")
