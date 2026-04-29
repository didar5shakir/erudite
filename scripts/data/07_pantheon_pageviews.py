"""
Шаг 7: Помесячные pageviews для 30,000 Pantheon-кандидатов.
Версия с asyncio + aiohttp (10 параллельных запросов).

Фаза 1 — Wikidata sitelinks (sync, ~2 мин, обычно уже в кэше).
Фаза 2 — Wikimedia Pageviews API (async, ~3-4 ч вместо 35).

Кэш: data/processed/pantheon_pv_cache.json — перезапуск продолжает.
Финал: data/processed/pantheon_pv_monthly.csv
Колонки: wd_id, lang, month_idx (0-11 от старого к новому), views
"""

import asyncio
import io
import json
import sys
import time
from datetime import date, timedelta
from pathlib import Path
from urllib.parse import quote

import aiohttp
import pandas as pd
import requests

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

ROOT       = Path(__file__).resolve().parents[2]
IN_PATH    = ROOT / "data" / "processed" / "pantheon_candidates.csv"
CACHE_PATH = ROOT / "data" / "processed" / "pantheon_pv_cache.json"
OUT_PATH   = ROOT / "data" / "processed" / "pantheon_pv_monthly.csv"

LANGUAGES     = ["en", "ru", "es", "ar", "pt", "zh", "hi", "fr", "de", "ja", "kk"]
WIKIDATA_API  = "https://www.wikidata.org/w/api.php"
PAGEVIEWS_API = "https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article"
HEADERS       = {"User-Agent": "EruditeQuizBot/1.0 (didar5shakir@gmail.com)"}
BATCH_SIZE    = 50
CONCURRENCY   = 3    # параллельных запросов к Wikimedia (выше = 429 rate limit)
CHUNK_SIZE    = 300  # запросов между автосохранениями


# ── Даты ──────────────────────────────────────────────────────────────────────

def last_12_months() -> list[tuple[int, int]]:
    today = date.today()
    last = date(today.year, today.month, 1) - timedelta(days=1)
    months = []
    for _ in range(12):
        months.append((last.year, last.month))
        last = date(last.year, last.month, 1) - timedelta(days=1)
    return list(reversed(months))


MONTHS       = last_12_months()
MONTH_TO_IDX = {(y, m): i for i, (y, m) in enumerate(MONTHS)}
START_DT     = f"{MONTHS[0][0]}{MONTHS[0][1]:02d}01"
END_DT       = f"{MONTHS[-1][0]}{MONTHS[-1][1]:02d}01"


# ── Кэш ───────────────────────────────────────────────────────────────────────

def load_cache() -> dict:
    if CACHE_PATH.exists():
        with open(CACHE_PATH, encoding="utf-8") as f:
            return json.load(f)
    return {"sitelinks": {}, "pageviews": {}}


def save_cache(cache: dict) -> None:
    CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(CACHE_PATH, "w", encoding="utf-8") as f:
        json.dump(cache, f, ensure_ascii=False)


# ── Фаза 1: Wikidata sitelinks (sync) ─────────────────────────────────────────

def fetch_sitelinks_batch(wd_ids: list[str], session: requests.Session) -> dict:
    sitefilter = "|".join(f"{lang}wiki" for lang in LANGUAGES)
    params = {
        "action": "wbgetentities",
        "ids": "|".join(wd_ids),
        "props": "sitelinks",
        "sitefilter": sitefilter,
        "format": "json",
        "formatversion": "2",
    }
    for attempt in range(3):
        try:
            r = session.get(WIKIDATA_API, params=params, timeout=30)
            r.raise_for_status()
            data = r.json()
            break
        except Exception:
            if attempt == 2:
                return {wid: {} for wid in wd_ids}
            time.sleep(2 ** attempt)
    else:
        return {wid: {} for wid in wd_ids}

    result = {}
    for wid in wd_ids:
        entity = data.get("entities", {}).get(wid, {})
        sitelinks = entity.get("sitelinks", {})
        result[wid] = {
            lang: sitelinks[f"{lang}wiki"]["title"]
            for lang in LANGUAGES
            if f"{lang}wiki" in sitelinks
        }
    return result


def phase1(wd_ids: list[str], cache: dict) -> dict:
    sl = cache["sitelinks"]
    todo = [wid for wid in wd_ids if wid not in sl]
    if not todo:
        print("Sitelinks уже в кэше. Фаза 1 пропущена.")
        return cache

    total = len(todo)
    print(f"Нужно sitelinks: {total:,}  (~{(total + BATCH_SIZE - 1) // BATCH_SIZE} батчей)")
    t0 = time.time()
    session = requests.Session()
    session.headers.update(HEADERS)

    for i in range(0, total, BATCH_SIZE):
        batch = todo[i: i + BATCH_SIZE]
        sl.update(fetch_sitelinks_batch(batch, session))
        done = min(i + BATCH_SIZE, total)
        if done % 500 < BATCH_SIZE or done >= total:
            elapsed = time.time() - t0
            eta = (total - done) / (done / elapsed) if elapsed > 0 else 0
            print(f"\r  {done:,}/{total:,} ({done/total*100:.1f}%)  ETA: {eta:.0f}с", end="", flush=True)
        time.sleep(0.08)

    save_cache(cache)
    print(f"\nФаза 1 завершена за {time.time()-t0:.0f}с.")
    return cache


# ── Фаза 2: async pageviews ───────────────────────────────────────────────────

async def fetch_monthly_async(
    session: aiohttp.ClientSession,
    semaphore: asyncio.Semaphore,
    lang: str,
    title: str,
) -> list[int]:
    url = (
        f"{PAGEVIEWS_API}/{lang}.wikipedia/all-access/all-agents/"
        f"{quote(title, safe='')}/monthly/{START_DT}/{END_DT}"
    )
    views = [0] * 12
    async with semaphore:
        for attempt in range(4):
            try:
                async with session.get(url) as resp:
                    if resp.status == 404:
                        return views
                    if resp.status == 429:
                        wait = int(resp.headers.get("retry-after", "60"))
                        await asyncio.sleep(wait + 2)
                        continue
                    resp.raise_for_status()
                    data = await resp.json(content_type=None)
                    for item in data.get("items", []):
                        ts = item["timestamp"]
                        idx = MONTH_TO_IDX.get((int(ts[:4]), int(ts[4:6])))
                        if idx is not None:
                            views[idx] = item.get("views", 0)
                    return views
            except Exception:
                if attempt == 3:
                    return views
                await asyncio.sleep(2 ** attempt)
    return views


async def phase2_async(wd_ids: list[str], cache: dict) -> dict:
    sl = cache["sitelinks"]
    pv = cache["pageviews"]

    tasks = [
        (wid, lang, title)
        for wid in wd_ids
        for lang, title in sl.get(wid, {}).items()
        if f"{wid}:{lang}" not in pv
    ]

    if not tasks:
        print("Все pageviews уже в кэше. Фаза 2 пропущена.")
        return cache

    total = len(tasks)
    print(f"Запросов pageviews: {total:,}")
    print(f"Параллельность: {CONCURRENCY}  Период: {MONTHS[0][0]}/{MONTHS[0][1]:02d} — {MONTHS[-1][0]}/{MONTHS[-1][1]:02d}")

    semaphore = asyncio.Semaphore(CONCURRENCY)
    connector = aiohttp.TCPConnector(limit=CONCURRENCY + 5)
    timeout   = aiohttp.ClientTimeout(total=30)

    t0 = time.time()
    done = 0

    async with aiohttp.ClientSession(headers=HEADERS, connector=connector, timeout=timeout) as session:
        for chunk_start in range(0, total, CHUNK_SIZE):
            chunk = tasks[chunk_start: chunk_start + CHUNK_SIZE]
            coros = [fetch_monthly_async(session, semaphore, lang, title) for _, lang, title in chunk]
            results = await asyncio.gather(*coros)

            for (wid, lang, _), views in zip(chunk, results):
                pv[f"{wid}:{lang}"] = views

            done += len(chunk)
            save_cache(cache)

            elapsed = time.time() - t0
            rate = done / elapsed if elapsed > 0 else 1
            eta = (total - done) / rate
            print(
                f"\r  {done:,}/{total:,} ({done/total*100:.1f}%)  "
                f"{rate:.1f} req/с  ETA: {eta:.0f}с",
                end="", flush=True,
            )

    print(f"\nФаза 2 завершена за {time.time()-t0:.0f}с.")
    return cache


# ── Сохранение результата ─────────────────────────────────────────────────────

def save_output(wd_ids: list[str], cache: dict) -> None:
    pv = cache["pageviews"]
    rows = []
    for wid in wd_ids:
        for lang in LANGUAGES:
            key = f"{wid}:{lang}"
            if key in pv:
                for idx, views in enumerate(pv[key]):
                    if views > 0:
                        rows.append({"wd_id": wid, "lang": lang, "month_idx": idx, "views": views})
    df = pd.DataFrame(rows)
    df.to_csv(OUT_PATH, index=False, encoding="utf-8")
    unique_fig = df["wd_id"].nunique() if not df.empty else 0
    print(f"Строк: {len(df):,}  фигур с данными: {unique_fig:,}")
    print(f"Сохранено: {OUT_PATH}")


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    print(f"Загружаю {IN_PATH} ...")
    df = pd.read_csv(IN_PATH)
    wd_ids = df["wd_id"].astype(str).tolist()
    print(f"Кандидатов: {len(wd_ids):,}")

    cache = load_cache()
    print(f"Кэш: sitelinks={len(cache['sitelinks']):,}  pageviews={len(cache['pageviews']):,}")

    print("\n=== ФАЗА 1: Wikidata sitelinks ===")
    cache = phase1(wd_ids, cache)

    total_pairs = sum(len(v) for v in cache["sitelinks"].values())
    cached_pv = len(cache["pageviews"])
    print(f"Языковых пар: {total_pairs:,}  в кэше: {cached_pv:,}  осталось: {total_pairs - cached_pv:,}")

    print("\n=== ФАЗА 2: Wikipedia pageviews (async) ===")
    asyncio.run(phase2_async(wd_ids, cache))

    print("\n=== Сохранение результата ===")
    save_output(wd_ids, cache)
    print("\nГотово. Следующий шаг — 08_score.py")


if __name__ == "__main__":
    main()
