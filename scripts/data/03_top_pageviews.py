"""
Шаг 3: Топ-1000 Wikipedia-страниц за каждый месяц последних 12 месяцев.

API: https://wikimedia.org/api/rest_v1/metrics/pageviews/top/{project}/all-access/{year}/{month}/all-days
Языки: en, ru, es, ar, pt, zh, hi, fr, de, ja, kk
Всего запросов: 11 языков × 12 месяцев = 132.

Результат: data/raw/wiki_top_pageviews.csv
Колонки: page_title, project, year, month, pageviews
"""

import io
import sys
import time
from datetime import date, timedelta
from pathlib import Path

import pandas as pd
import requests

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parents[2]
OUT_PATH = ROOT / "data" / "raw" / "wiki_top_pageviews.csv"
OUT_PATH.parent.mkdir(parents=True, exist_ok=True)

LANGUAGES = ["en", "ru", "es", "ar", "pt", "zh", "hi", "fr", "de", "ja", "kk"]
BASE_URL = "https://wikimedia.org/api/rest_v1/metrics/pageviews/top"
USER_AGENT = "EruditeQuizBot/1.0 (didar5shakir@gmail.com)"
HEADERS = {"User-Agent": USER_AGENT}


def last_12_months() -> list[tuple[int, int]]:
    """Возвращает список (year, month) — последние 12 завершённых месяцев."""
    today = date.today()
    # Последний завершённый месяц = первое число текущего месяца минус 1 день
    last = date(today.year, today.month, 1) - timedelta(days=1)
    months = []
    for _ in range(12):
        months.append((last.year, last.month))
        last = date(last.year, last.month, 1) - timedelta(days=1)
    return list(reversed(months))


def fetch_top(lang: str, year: int, month: int) -> list[dict]:
    """Возвращает список {"page_title", "project", "year", "month", "pageviews"}."""
    project = f"{lang}.wikipedia"
    url = f"{BASE_URL}/{project}/all-access/{year}/{month:02d}/all-days"
    try:
        resp = requests.get(url, headers=HEADERS, timeout=30)
        if resp.status_code == 404:
            return []
        resp.raise_for_status()
        articles = resp.json()["items"][0]["articles"]
        return [
            {
                "page_title": a["article"],
                "project": project,
                "year": year,
                "month": month,
                "pageviews": a["views"],
            }
            for a in articles
        ]
    except Exception as e:
        print(f"  [ОШИБКА] {project} {year}/{month:02d}: {e}")
        return []


def main():
    months = last_12_months()
    print(f"Период: {months[0][0]}/{months[0][1]:02d} — {months[-1][0]}/{months[-1][1]:02d}")
    print(f"Языки: {', '.join(LANGUAGES)}")
    print(f"Всего запросов: {len(LANGUAGES)} × {len(months)} = {len(LANGUAGES)*len(months)}\n")

    all_rows: list[dict] = []
    total_calls = len(LANGUAGES) * len(months)
    done = 0

    for lang in LANGUAGES:
        lang_rows = 0
        for year, month in months:
            rows = fetch_top(lang, year, month)
            all_rows.extend(rows)
            lang_rows += len(rows)
            done += 1
            print(f"\r  {done}/{total_calls}  {lang} {year}/{month:02d}  →  {len(rows)} записей",
                  end="", flush=True)
            time.sleep(0.1)
        print(f"\r  {lang:<3}  итого за 12 мес: {lang_rows:,} записей{' ' * 20}")

    df = pd.DataFrame(all_rows)
    df.to_csv(OUT_PATH, index=False, encoding="utf-8")

    print(f"\n{'=' * 60}")
    print(f"Всего строк сохранено : {len(df):,}")
    print(f"Уникальных page_title : {df['page_title'].nunique():,}")
    print(f"Уникальных проектов   : {df['project'].nunique()}")
    print(f"Файл: {OUT_PATH}")

    # Агрегированный топ по суммарным просмотрам (все языки)
    top_agg = (
        df.groupby("page_title")["pageviews"]
        .sum()
        .sort_values(ascending=False)
        .head(20)
    )
    print(f"\nТОП-20 страниц по суммарным просмотрам (все языки, 12 мес):")
    for title, views in top_agg.items():
        print(f"  {views:>13,}  {title}")

    print(f"\nГотово. Следующий шаг — 04_filter_humans.py")


if __name__ == "__main__":
    main()
