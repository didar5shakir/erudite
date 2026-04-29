"""
Шаг 3: Wikipedia pageviews для каждой фигуры.

Фаза 1 — sitelinks из Wikidata (батчи по 50, ~20-30 мин):
  Для каждой фигуры получаем заголовки статей в 7 языках Wikipedia.

Фаза 2 — pageviews из Wikimedia API (параллельно, ~1-3 часа):
  Для каждого (фигура, язык) с реальной статьёй получаем сумму просмотров за 12 месяцев.

Кэш: data/processed/pageviews_cache.db (SQLite).
Перезапуск продолжает с места остановки.
"""

import io
import sqlite3
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, timedelta
from pathlib import Path
from urllib.parse import quote

import pandas as pd
import requests

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parents[2]
IN_PATH = ROOT / "data" / "processed" / "pantheon_clean.csv"
CACHE_DB = ROOT / "data" / "processed" / "pageviews_cache.db"
OUT_PATH = ROOT / "data" / "processed" / "pantheon_with_pageviews.csv"

LANGUAGES = ["en", "ru", "kk", "es", "ar", "zh", "hi"]
WIKIDATA_API = "https://www.wikidata.org/w/api.php"
PAGEVIEWS_API = "https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article"

USER_AGENT = "EruditeQuizBot/1.0 (didar5shakir@gmail.com)"
HEADERS = {"User-Agent": USER_AGENT}

BATCH_SIZE = 50       # Wikidata batch size
MAX_WORKERS = 20      # parallel pageviews threads
SAVE_EVERY = 500      # flush pageviews to DB every N results
MAX_RETRIES = 3

db_lock = threading.Lock()


# ── DB helpers ────────────────────────────────────────────────────────────────

def init_db(db_path: Path) -> None:
    conn = sqlite3.connect(db_path)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS sitelinks (
            wd_id TEXT,
            lang  TEXT,
            title TEXT,
            PRIMARY KEY (wd_id, lang)
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS pageviews (
            wd_id TEXT,
            lang  TEXT,
            views INTEGER,
            PRIMARY KEY (wd_id, lang)
        )
    """)
    conn.commit()
    conn.close()


def db_sitelinks_fetched(db_path: Path) -> set[str]:
    conn = sqlite3.connect(db_path)
    rows = conn.execute("SELECT DISTINCT wd_id FROM sitelinks").fetchall()
    conn.close()
    return {r[0] for r in rows}


def db_save_sitelinks(db_path: Path, entries: list[tuple]) -> None:
    with db_lock:
        conn = sqlite3.connect(db_path)
        conn.executemany("INSERT OR REPLACE INTO sitelinks VALUES (?,?,?)", entries)
        conn.commit()
        conn.close()


def db_load_sitelinks(db_path: Path) -> dict[str, dict[str, str]]:
    conn = sqlite3.connect(db_path)
    rows = conn.execute(
        "SELECT wd_id, lang, title FROM sitelinks WHERE lang != '_none' AND title != ''"
    ).fetchall()
    conn.close()
    result: dict[str, dict[str, str]] = {}
    for wd_id, lang, title in rows:
        result.setdefault(wd_id, {})[lang] = title
    return result


def db_pageviews_done(db_path: Path) -> set[tuple[str, str]]:
    conn = sqlite3.connect(db_path)
    rows = conn.execute("SELECT wd_id, lang FROM pageviews").fetchall()
    conn.close()
    return set(rows)


def db_save_pageviews(db_path: Path, entries: list[tuple]) -> None:
    with db_lock:
        conn = sqlite3.connect(db_path)
        conn.executemany("INSERT OR REPLACE INTO pageviews VALUES (?,?,?)", entries)
        conn.commit()
        conn.close()


def db_load_pageviews(db_path: Path) -> dict[tuple[str, str], int]:
    conn = sqlite3.connect(db_path)
    rows = conn.execute("SELECT wd_id, lang, views FROM pageviews").fetchall()
    conn.close()
    return {(wd_id, lang): views for wd_id, lang, views in rows}


# ── Wikidata sitelinks ─────────────────────────────────────────────────────────

def normalize_wd_id(raw) -> str:
    s = str(raw).strip()
    if s.startswith("Q"):
        return s
    try:
        return f"Q{int(float(s))}"
    except (ValueError, TypeError):
        return s


def fetch_sitelinks_batch(wd_ids: list[str]) -> list[tuple]:
    sitefilter = "|".join(f"{lang}wiki" for lang in LANGUAGES)
    params = {
        "action": "wbgetentities",
        "ids": "|".join(wd_ids),
        "props": "sitelinks",
        "sitefilter": sitefilter,
        "format": "json",
        "formatversion": "2",
    }
    for attempt in range(MAX_RETRIES):
        try:
            resp = requests.get(WIKIDATA_API, params=params, headers=HEADERS, timeout=30)
            resp.raise_for_status()
            entries = []
            for wd_id, entity in resp.json().get("entities", {}).items():
                for site, link in entity.get("sitelinks", {}).items():
                    lang = site[:-4]  # strip "wiki" suffix
                    if lang in LANGUAGES and link.get("title"):
                        entries.append((wd_id, lang, link["title"]))
            return entries
        except Exception:
            if attempt < MAX_RETRIES - 1:
                time.sleep(RETRY_DELAY := 2 * (attempt + 1))
    return []


def phase1_sitelinks(df: pd.DataFrame, db_path: Path) -> None:
    print("\n=== ФАЗА 1: Заголовки статей (Wikidata) ===")
    all_ids = df["wd_id_norm"].dropna().tolist()
    already_fetched = db_sitelinks_fetched(db_path)
    to_fetch = [wid for wid in all_ids if wid not in already_fetched]

    if not to_fetch:
        print("Все sitelinks уже в кэше. Пропускаем.")
        return

    total = len(to_fetch)
    batches = (total + BATCH_SIZE - 1) // BATCH_SIZE
    print(f"Нужно загрузить: {total:,} фигур | Батчей: {batches:,}")
    t0 = time.time()

    for i in range(0, total, BATCH_SIZE):
        batch = to_fetch[i : i + BATCH_SIZE]
        entries = fetch_sitelinks_batch(batch)

        # Mark checked IDs that had no sitelinks (so we don't re-fetch)
        found_ids = {e[0] for e in entries}
        for wid in batch:
            if wid not in found_ids:
                entries.append((wid, "_none", ""))

        db_save_sitelinks(db_path, entries)

        done = min(i + BATCH_SIZE, total)
        if done % (BATCH_SIZE * 10) == 0 or done == total:
            elapsed = time.time() - t0
            rate = done / elapsed if elapsed > 0 else 1
            eta = (total - done) / rate
            print(
                f"\r  {done:,}/{total:,} ({done/total*100:.1f}%)  "
                f"ETA: {eta/60:.0f} мин",
                end="", flush=True,
            )

        time.sleep(0.12)  # ~8 req/s polite rate

    print(f"\nФаза 1 завершена за {(time.time()-t0)/60:.1f} мин.")


# ── Wikimedia pageviews ────────────────────────────────────────────────────────

def get_date_range() -> tuple[str, str]:
    today = date.today()
    end = date(today.year, today.month, 1) - timedelta(days=1)
    sm = end.month + 1
    sy = end.year - 1
    if sm > 12:
        sm, sy = 1, sy + 1
    start = date(sy, sm, 1)
    return start.strftime("%Y%m%d"), end.strftime("%Y%m%d")


def fetch_pageviews_one(wd_id: str, lang: str, title: str, start: str, end: str) -> tuple[str, str, int]:
    project = f"{lang}.wikipedia"
    article = quote(title.replace(" ", "_"), safe="")
    url = f"{PAGEVIEWS_API}/{project}/all-access/all-agents/{article}/monthly/{start}/{end}"
    for attempt in range(MAX_RETRIES):
        try:
            resp = requests.get(url, headers=HEADERS, timeout=20)
            if resp.status_code == 404:
                return (wd_id, lang, 0)
            resp.raise_for_status()
            total = sum(item.get("views", 0) for item in resp.json().get("items", []))
            return (wd_id, lang, total)
        except requests.HTTPError:
            return (wd_id, lang, 0)
        except Exception:
            if attempt < MAX_RETRIES - 1:
                time.sleep(2)
    return (wd_id, lang, 0)


def phase2_pageviews(df: pd.DataFrame, db_path: Path) -> None:
    print("\n=== ФАЗА 2: Wikipedia pageviews ===")

    sitelinks = db_load_sitelinks(db_path)   # {wd_id: {lang: title}}
    done_set = db_pageviews_done(db_path)     # set of (wd_id, lang) already fetched

    # Build task list and save immediate zeros for missing articles
    tasks: list[tuple[str, str, str]] = []
    zeros: list[tuple[str, str, int]] = []

    for wid in df["wd_id_norm"]:
        langs_with_article = sitelinks.get(wid, {})
        for lang in LANGUAGES:
            if (wid, lang) in done_set:
                continue
            title = langs_with_article.get(lang)
            if title:
                tasks.append((wid, lang, title))
            else:
                zeros.append((wid, lang, 0))

    if zeros:
        db_save_pageviews(db_path, zeros)
        print(f"Сохранено {len(zeros):,} нулей (нет статьи в языке).")

    if not tasks:
        print("Все pageviews уже в кэше.")
        return

    start, end = get_date_range()
    total = len(tasks)
    print(f"Период: {start[:6]} – {end[:6]}")
    print(f"Задач с реальными статьями: {total:,}")
    print(f"Потоков: {MAX_WORKERS}  |  Ожидаемое время: ~{total // (MAX_WORKERS * 8) // 60 + 1} ч")

    t0 = time.time()
    completed = 0
    buffer: list[tuple] = []

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures = {
            executor.submit(fetch_pageviews_one, wid, lang, title, start, end): None
            for wid, lang, title in tasks
        }
        for future in as_completed(futures):
            buffer.append(future.result())
            completed += 1

            if len(buffer) >= SAVE_EVERY:
                db_save_pageviews(db_path, buffer)
                buffer.clear()

            if completed % 2000 == 0 or completed == total:
                elapsed = time.time() - t0
                rate = completed / elapsed if elapsed > 0 else 1
                eta = (total - completed) / rate
                print(
                    f"\r  {completed:,}/{total:,} ({completed/total*100:.1f}%)  "
                    f"{rate:.0f} req/s  ETA: {eta/60:.0f} мин",
                    end="", flush=True,
                )

    if buffer:
        db_save_pageviews(db_path, buffer)

    print(f"\nФаза 2 завершена за {(time.time()-t0)/60:.1f} мин.")


# ── Build output ───────────────────────────────────────────────────────────────

def build_output(df: pd.DataFrame, db_path: Path, out_path: Path) -> None:
    print("\nСобираю итоговый файл...")
    pv = db_load_pageviews(db_path)

    for lang in LANGUAGES:
        df[f"views_{lang}"] = df["wd_id_norm"].map(lambda wid: pv.get((wid, lang), 0))

    df["views_global"] = df[[f"views_{lang}" for lang in LANGUAGES]].sum(axis=1)
    df.drop(columns=["wd_id_norm"], inplace=True)

    df.to_csv(out_path, index=False)
    mb = out_path.stat().st_size / 1024 / 1024
    print(f"Сохранено: {out_path}  ({mb:.1f} МБ)")

    total = len(df)
    with_views = (df["views_global"] > 0).sum()
    print(f"\nФигур с views_global > 0 : {with_views:,} / {total:,}")
    print(f"Медиана views_en         : {df['views_en'].median():.0f}")
    print(f"Медиана views_ru         : {df['views_ru'].median():.0f}")
    print(f"Медиана views_global     : {df['views_global'].median():.0f}")
    print("\nГотово к Шагу 4 (скоринг).")


def main():
    print(f"Загружаю {IN_PATH} ...")
    df = pd.read_csv(IN_PATH, low_memory=False)
    print(f"Загружено: {len(df):,} фигур")

    df["wd_id_norm"] = df["wd_id"].apply(normalize_wd_id)

    init_db(CACHE_DB)
    phase1_sitelinks(df, CACHE_DB)
    phase2_pageviews(df, CACHE_DB)
    build_output(df, CACHE_DB, OUT_PATH)


if __name__ == "__main__":
    main()
