"""
Шаг 4: Фильтрация — только люди (Wikidata P31 = Q5 «human»).

Фаза 1 — Wikidata lookup (батчи по 50, ~2-5 мин):
  Для каждой уникальной (page_title, project) пары получаем wikidata_id
  и проверяем, является ли статья статьёй о человеке.

Фаза 2 — агрегация по wikidata_id:
  Суммируем pageviews, собираем языки, считаем месяцы в топе.

Кэш: data/processed/wikidata_cache.json — перезапуск продолжает с места остановки.
"""

import io
import json
import sys
import time
from collections import defaultdict
from pathlib import Path

import pandas as pd
import requests

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parents[2]
PV_PATH    = ROOT / "data" / "raw"       / "wiki_top_pageviews.csv"
CACHE_PATH = ROOT / "data" / "processed" / "wikidata_cache.json"
OUT_PATH   = ROOT / "data" / "processed" / "wiki_top_humans_aggregated.csv"
TOP500_PATH = ROOT / "data" / "processed" / "wiki_top_humans_top_500.csv"

WIKIDATA_API = "https://www.wikidata.org/w/api.php"
HEADERS = {"User-Agent": "EruditeQuizBot/1.0 (didar5shakir@gmail.com)"}
BATCH_SIZE = 50
SAVE_EVERY_BATCHES = 20  # flush cache every N batches


# ── Helpers ───────────────────────────────────────────────────────────────────

def project_to_site(project: str) -> str:
    """'en.wikipedia' → 'enwiki'"""
    return project.replace(".wikipedia", "wiki")


def lang_from_project(project: str) -> str:
    """'en.wikipedia' → 'en'"""
    return project.split(".")[0]


def load_cache() -> dict:
    if CACHE_PATH.exists():
        with open(CACHE_PATH, encoding="utf-8") as f:
            return json.load(f)
    return {}


def save_cache(cache: dict) -> None:
    CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(CACHE_PATH, "w", encoding="utf-8") as f:
        json.dump(cache, f, ensure_ascii=False, indent=None)


def is_human_entity(entity: dict) -> bool:
    for claim in entity.get("claims", {}).get("P31", []):
        val = claim.get("mainsnak", {}).get("datavalue", {}).get("value", {})
        if isinstance(val, dict) and val.get("id") == "Q5":
            return True
    return False


# ── Phase 1: Wikidata lookup ──────────────────────────────────────────────────

def fetch_batch(site: str, titles: list[str], session: requests.Session) -> dict:
    """
    Queries Wikidata for up to 50 titles from one wiki site.
    Returns {original_title: {"wd_id": str|None, "is_human": bool, "en_title": str|None}}
    """
    params = {
        "action": "wbgetentities",
        "sites": site,
        "titles": "|".join(titles),
        "props": "claims|sitelinks",
        "sitefilter": "enwiki" if site == "enwiki" else f"{site}|enwiki",
        "format": "json",
        "formatversion": "2",
    }
    for attempt in range(3):
        try:
            resp = session.get(WIKIDATA_API, params=params, timeout=30)
            resp.raise_for_status()
            data = resp.json()
            break
        except Exception as e:
            if attempt == 2:
                return {t: {"wd_id": None, "is_human": False, "en_title": None} for t in titles}
            time.sleep(2 ** attempt)
    else:
        return {t: {"wd_id": None, "is_human": False, "en_title": None} for t in titles}

    # Build lookup: canonical_title_in_site → entity info
    lookup: dict[str, dict] = {}
    for wd_id, entity in data.get("entities", {}).items():
        if "missing" in entity:
            continue
        human = is_human_entity(entity)
        en_title = entity.get("sitelinks", {}).get("enwiki", {}).get("title")
        site_title = entity.get("sitelinks", {}).get(site, {}).get("title")
        if site_title:
            lookup[site_title] = {"wd_id": wd_id, "is_human": human, "en_title": en_title}

    # Match original titles (normalize underscores → spaces for comparison)
    result: dict[str, dict] = {}
    for title in titles:
        normalized = title.replace("_", " ")
        if normalized in lookup:
            result[title] = lookup[normalized]
        elif title in lookup:
            result[title] = lookup[title]
        else:
            result[title] = {"wd_id": None, "is_human": False, "en_title": None}
    return result


def phase1_lookup(unique_pages: pd.DataFrame, cache: dict, session: requests.Session) -> dict:
    # Find uncached entries
    tasks: list[tuple[str, str]] = []
    for _, row in unique_pages.iterrows():
        key = f"{project_to_site(row['project'])}:{row['page_title']}"
        if key not in cache:
            tasks.append((row["page_title"], row["project"]))

    if not tasks:
        print("Все данные уже в кэше. Фаза 1 пропущена.")
        return cache

    total = len(tasks)
    batches_total = (total + BATCH_SIZE - 1) // BATCH_SIZE
    print(f"Нужно запросить : {total:,} страниц")
    print(f"Батчей          : ~{batches_total:,}  (по {BATCH_SIZE})")

    # Group by project for batching
    by_project: dict[str, list[str]] = defaultdict(list)
    for page_title, project in tasks:
        by_project[project].append(page_title)

    processed = 0
    batch_count = 0
    t0 = time.time()

    for project, titles in sorted(by_project.items()):
        site = project_to_site(project)
        for i in range(0, len(titles), BATCH_SIZE):
            batch = titles[i: i + BATCH_SIZE]
            results = fetch_batch(site, batch, session)

            for title, info in results.items():
                cache[f"{site}:{title}"] = info

            processed += len(batch)
            batch_count += 1

            if batch_count % SAVE_EVERY_BATCHES == 0:
                save_cache(cache)

            if processed % 500 < BATCH_SIZE or processed >= total:
                elapsed = time.time() - t0
                rate = processed / elapsed if elapsed > 0 else 1
                eta = (total - processed) / rate
                humans = sum(1 for v in cache.values() if v.get("is_human"))
                print(
                    f"\r  {processed:,}/{total:,} ({processed/total*100:.1f}%)  "
                    f"люди: {humans:,}  ETA: {eta:.0f}с",
                    end="", flush=True,
                )

            time.sleep(0.08)

    save_cache(cache)
    elapsed = time.time() - t0
    print(f"\nФаза 1 завершена за {elapsed:.0f}с.")
    return cache


# ── Phase 2: aggregate ────────────────────────────────────────────────────────

def phase2_aggregate(df: pd.DataFrame, cache: dict) -> pd.DataFrame:
    # Attach cache info
    df = df.copy()
    df["site"] = df["project"].apply(project_to_site)
    df["cache_key"] = df["site"] + ":" + df["page_title"]
    df["wd_id"] = df["cache_key"].map(lambda k: cache.get(k, {}).get("wd_id"))
    df["is_human"] = df["cache_key"].map(lambda k: cache.get(k, {}).get("is_human", False))
    df["en_title"] = df["cache_key"].map(lambda k: cache.get(k, {}).get("en_title"))
    df["lang"] = df["project"].apply(lang_from_project)

    humans_df = df[df["is_human"] & df["wd_id"].notna()].copy()
    print(f"Строк с людьми (до агрегации): {len(humans_df):,}")

    rows = []
    for wd_id, group in humans_df.groupby("wd_id"):
        total_pv = int(group["pageviews"].sum())
        langs = sorted(group["lang"].unique().tolist())
        months = group[["year", "month"]].drop_duplicates().shape[0]

        # main_name: prefer English Wikipedia title
        en_title = group["en_title"].dropna()
        if not en_title.empty:
            main_name = en_title.iloc[0]
            main_url = "https://en.wikipedia.org/wiki/" + main_name.replace(" ", "_")
        else:
            lang_pv = group.groupby("lang")["pageviews"].sum()
            best_lang = lang_pv.idxmax()
            best_title = group[group["lang"] == best_lang]["page_title"].iloc[0]
            main_name = best_title.replace("_", " ")
            main_url = f"https://{best_lang}.wikipedia.org/wiki/{best_title}"

        rows.append({
            "wikidata_id": wd_id,
            "main_name": main_name,
            "main_wikipedia_url": main_url,
            "total_pageviews_12mo": total_pv,
            "languages_in_top": ",".join(langs),
            "months_in_top": months,
        })

    result = pd.DataFrame(rows)
    result.sort_values("total_pageviews_12mo", ascending=False, inplace=True)
    result.reset_index(drop=True, inplace=True)
    return result


# ── Stats ─────────────────────────────────────────────────────────────────────

def print_stats(total_unique: int, result: pd.DataFrame) -> None:
    human_n = len(result)
    print(f"\n{'=' * 65}")
    print("ИТОГОВАЯ СТАТИСТИКА")
    print("=" * 65)
    print(f"Уникальных страниц до фильтрации : {total_unique:,}")
    print(f"Из них людей                      : {human_n:,}")
    print(f"Отфильтровано                     : {total_unique - human_n:,}")

    print(f"\nТОП-100 по суммарным pageviews (12 мес, все языки):")
    cols = ["main_name", "total_pageviews_12mo", "languages_in_top", "months_in_top"]
    top100 = result.head(100)[cols].copy()
    top100["total_pageviews_12mo"] = top100["total_pageviews_12mo"].apply(lambda x: f"{x:,}")
    print(top100.to_string(index=True))

    lc = result["languages_in_top"].apply(lambda x: len(x.split(",")))
    print(f"\nРаспределение по числу языков в топе:")
    print(f"  1 язык         : {(lc == 1).sum():,}")
    print(f"  2–3 языка      : {((lc >= 2) & (lc <= 3)).sum():,}")
    print(f"  4–6 языков     : {((lc >= 4) & (lc <= 6)).sum():,}")
    print(f"  7–10 языков    : {((lc >= 7) & (lc < 11)).sum():,}")
    print(f"  Все 11 языков  : {(lc == 11).sum():,}")

    mc = result["months_in_top"]
    print(f"\nРаспределение по числу месяцев в топе:")
    print(f"  Все 12 мес  (стабильно)   : {(mc == 12).sum():,}")
    print(f"  10–11 мес               : {((mc >= 10) & (mc < 12)).sum():,}")
    print(f"  7–9 мес                 : {((mc >= 7) & (mc < 10)).sum():,}")
    print(f"  4–6 мес                 : {((mc >= 4) & (mc < 7)).sum():,}")
    print(f"  1–3 мес  (краткосрочно) : {(mc <= 3).sum():,}")


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    print(f"Загружаю {PV_PATH} ...")
    df = pd.read_csv(PV_PATH)
    print(f"Строк: {len(df):,}")

    unique_pages = df[["page_title", "project"]].drop_duplicates().reset_index(drop=True)
    total_unique = len(unique_pages)
    print(f"Уникальных (page_title, project): {total_unique:,}")

    cache = load_cache()
    print(f"В кэше уже: {len(cache):,} записей\n")

    session = requests.Session()
    session.headers.update(HEADERS)

    print("=== ФАЗА 1: Wikidata lookup ===")
    cache = phase1_lookup(unique_pages, cache, session)

    humans_cached = sum(1 for v in cache.values() if v.get("is_human"))
    print(f"Людей в кэше: {humans_cached:,} / {len(cache):,} ({humans_cached/len(cache)*100:.1f}%)")

    print("\n=== ФАЗА 2: Агрегация ===")
    result = phase2_aggregate(df, cache)

    result.to_csv(OUT_PATH, index=False, encoding="utf-8")
    result.head(500).to_csv(TOP500_PATH, index=False, encoding="utf-8-sig")  # BOM для Excel

    print(f"\nСохранено:")
    print(f"  {OUT_PATH}")
    print(f"  {TOP500_PATH}")

    print_stats(total_unique, result)

    print(f"\nГотово. Следующий шаг — 05_merge_with_pantheon.py")


if __name__ == "__main__":
    main()
