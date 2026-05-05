"""
Шаг 11: Получение локализованных имён через Wikidata API.

Вход   : data/processed/figures_top_final.csv
Кэш    : data/processed/wikidata_labels_cache.json  (инкрементальный)
Выход  : data/processed/figures_localized_labels.csv
Preview: data/processed/play_names_preview.csv

Правила кэша:
  - записать только успешный результат (даже если labels пустые, но запрос прошёл)
  - {} в кэше = невалидная/провальная запись, перезапрашивается
  - 429 → не писать в кэш, retry с экспоненциальной паузой
"""

import io
import sys
import json
import time
import random

import requests
import pandas as pd
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

ROOT       = Path(__file__).resolve().parents[2]
IN_CSV     = ROOT / "data" / "processed" / "figures_top_final.csv"
CACHE_PATH = ROOT / "data" / "processed" / "wikidata_labels_cache.json"
OUT_CSV    = ROOT / "data" / "processed" / "figures_localized_labels.csv"
PREVIEW    = ROOT / "data" / "processed" / "play_names_preview.csv"
POOLS_PATH = ROOT / "public" / "data" / "play_pools.json"

WIKIDATA_URL   = "https://www.wikidata.org/w/api.php"
BATCH_SIZE     = 50
LANGS          = ["en", "ru", "kk"]
PAUSE_NORMAL   = 1.0          # секунд между батчами
PAUSE_429_MIN  = 10.0         # секунд при 429
PAUSE_429_MAX  = 20.0
MAX_RETRIES    = 5
SAVE_EVERY     = 20           # сохранять кэш каждые N батчей
LOG_EVERY      = 500          # логировать каждые N фигур

SENTINEL = "__ok__"           # маркер успешного пустого ответа


# ── Загрузка ──────────────────────────────────────────────────────────────────

print(f"Читаю {IN_CSV} ...")
df = pd.read_csv(IN_CSV, usecols=["wikidata_id", "name", "bplace_country"])
df["wikidata_id"] = df["wikidata_id"].astype(str).str.strip()
all_ids = df["wikidata_id"].tolist()
print(f"Всего wikidata_id: {len(all_ids):,}")

# ── Кэш ───────────────────────────────────────────────────────────────────────

if CACHE_PATH.exists():
    cache: dict = json.loads(CACHE_PATH.read_text(encoding="utf-8"))
else:
    cache = {}


def is_valid(entry) -> bool:
    """Валидная запись = None (нет в Wikidata) или dict с хотя бы одним label,
    или имеет sentinel-маркер успешного пустого ответа."""
    if entry is None:
        return True  # явно отсутствует в Wikidata — OK
    if isinstance(entry, dict):
        return bool(entry) or entry.get("__ok__") is True
    return False


valid_count = sum(1 for v in cache.values() if is_valid(v))
empty_count = sum(1 for v in cache.values() if v == {})
total_cache = len(cache)

print(f"\n── Статистика кэша ──")
print(f"  Всего записей       : {total_cache:>7,}")
print(f"  Валидных с labels   : {valid_count:>7,}  ({valid_count/max(total_cache,1)*100:.1f}%)")
print(f"  Пустых {{}}          : {empty_count:>7,}  ({empty_count/max(total_cache,1)*100:.1f}%)")
print(f"  Нет в кэше          : {len(all_ids)-total_cache:>7,}")
print(f"  Нужно обработать    : {len(all_ids)-valid_count:>7,}")


def save_cache():
    CACHE_PATH.write_text(
        json.dumps(cache, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )


# ── Fetching с retry ──────────────────────────────────────────────────────────

def fetch_batch(ids: list[str]) -> dict | None:
    """
    Возвращает {qid: {lang: label}} при успехе.
    Возвращает None если исчерпаны все retry.
    """
    params = {
        "action": "wbgetentities",
        "ids": "|".join(ids),
        "props": "labels",
        "languages": "|".join(LANGS),
        "format": "json",
        "formatversion": "2",
    }
    headers = {"User-Agent": "Erudite/1.0 (data pipeline; labels fetch)"}

    for attempt in range(1, MAX_RETRIES + 1):
        try:
            resp = requests.get(WIKIDATA_URL, params=params,
                                timeout=30, headers=headers)

            if resp.status_code == 429:
                wait = random.uniform(PAUSE_429_MIN, PAUSE_429_MAX) * attempt
                print(f"  429 Too Many Requests — ожидаю {wait:.0f}s "
                      f"(попытка {attempt}/{MAX_RETRIES})")
                time.sleep(wait)
                continue

            resp.raise_for_status()
            data = resp.json()

            result = {}
            for qid, entity in data.get("entities", {}).items():
                labels_raw = entity.get("labels", {})
                labels = {lang: labels_raw[lang]["value"]
                          for lang in LANGS if lang in labels_raw}
                # Если labels пустые — маркируем sentinel чтобы отличить от {}=провал
                result[qid] = labels if labels else {"__ok__": True}
            return result

        except requests.exceptions.HTTPError as e:
            if "429" in str(e):
                wait = random.uniform(PAUSE_429_MIN, PAUSE_429_MAX) * attempt
                print(f"  429 (HTTPError) — ожидаю {wait:.0f}s "
                      f"(попытка {attempt}/{MAX_RETRIES})")
                time.sleep(wait)
                continue
            print(f"  HTTP ошибка: {e} (попытка {attempt}/{MAX_RETRIES})")
            time.sleep(3)

        except Exception as e:
            print(f"  Ошибка: {e} (попытка {attempt}/{MAX_RETRIES})")
            time.sleep(3)

    print(f"  Батч не получен после {MAX_RETRIES} попыток — пропускаем без записи в кэш")
    return None


# ── Основной цикл ─────────────────────────────────────────────────────────────

todo = [qid for qid in all_ids if not is_valid(cache.get(qid))]
print(f"\nОбрабатываю {len(todo):,} записей (пропускаю {len(all_ids)-len(todo):,} из кэша)")

if not todo:
    print("Всё уже в кэше — пересоздаю выходные файлы.")
else:
    batches = [todo[i:i + BATCH_SIZE] for i in range(0, len(todo), BATCH_SIZE)]
    total_done = 0
    consecutive_failures = 0

    for batch_idx, batch in enumerate(batches):
        result = fetch_batch(batch)

        if result is None:
            consecutive_failures += 1
            if consecutive_failures >= 3:
                print(f"\n  СТОП: {consecutive_failures} провальных батча подряд.")
                print("  Сохраняю кэш и завершаю работу.")
                save_cache()
                print(f"  Обработано до остановки: {total_done:,} / {len(todo):,}")
                sys.exit(1)
            continue

        consecutive_failures = 0

        # Записываем только успешные ответы
        for qid in batch:
            if qid in result:
                cache[qid] = result[qid]
            # qid не в result (Wikidata вернул missing/redirected) — маркируем None
            else:
                cache[qid] = None

        total_done += len(batch)

        if (batch_idx + 1) % SAVE_EVERY == 0:
            save_cache()

        if total_done % LOG_EVERY < BATCH_SIZE or batch_idx == len(batches) - 1:
            pct = total_done / len(todo) * 100
            print(f"  [{total_done:>6,} / {len(todo):,}]  {pct:.1f}%")

        time.sleep(PAUSE_NORMAL)

    save_cache()
    print(f"\nКэш сохранён: {len(cache):,} записей → {CACHE_PATH}")


# ── Сборка выходного CSV ──────────────────────────────────────────────────────

print("\nСобираю figures_localized_labels.csv ...")

rows = []
for qid in all_ids:
    entry = cache.get(qid)
    if isinstance(entry, dict) and not entry.get("__ok__"):
        name_en  = entry.get("en", "")
        name_ru  = entry.get("ru", "")
        name_kk  = entry.get("kk", "")
    else:
        name_en = name_ru = name_kk = ""

    rows.append({
        "wikidata_id":  qid,
        "name_en":      name_en,
        "name_ru":      name_ru,
        "name_kk":      name_kk,
        "has_ru_label": bool(name_ru),
        "has_kk_label": bool(name_kk),
    })

out_df = pd.DataFrame(rows)
out_df.to_csv(OUT_CSV, index=False, encoding="utf-8")
print(f"Сохранено → {OUT_CSV}")


# ── Preview для play_pools.json ───────────────────────────────────────────────

print("\nСобираю play_names_preview.csv ...")

pools = json.loads(POOLS_PATH.read_text(encoding="utf-8"))
pool_figures = (
    pools["top_5000"] + pools["ru_quota"] + pools["kz_quota"] + pools["hpi_quota"]
)

seen: set[str] = set()
unique_pool = []
for p in pool_figures:
    if p["wikidata_id"] not in seen:
        seen.add(p["wikidata_id"])
        unique_pool.append(p)

current_name_map = dict(zip(df["wikidata_id"], df["name"]))

preview_rows = []
for p in unique_pool:
    qid     = p["wikidata_id"]
    entry   = cache.get(qid)
    current = current_name_map.get(qid, p.get("name", ""))

    if isinstance(entry, dict) and not entry.get("__ok__"):
        name_en = entry.get("en", "")
        name_ru = entry.get("ru", "")
        name_kk = entry.get("kk", "")
    else:
        name_en = name_ru = name_kk = ""

    preview_rows.append({
        "wikidata_id":  qid,
        "current_name": current,
        "name_en":      name_en,
        "name_ru":      name_ru,
        "name_kk":      name_kk,
        "fallback_ru":  name_ru or name_en or current,
        "fallback_kk":  name_kk or name_ru or name_en or current,
    })

preview_df = pd.DataFrame(preview_rows)
preview_df.to_csv(PREVIEW, index=False, encoding="utf-8")
print(f"Сохранено → {PREVIEW}")


# ── Финальная статистика ──────────────────────────────────────────────────────

total   = len(out_df)
has_en  = (out_df["name_en"] != "").sum()
has_ru  = out_df["has_ru_label"].sum()
has_kk  = out_df["has_kk_label"].sum()
still_empty = sum(1 for v in cache.values() if v == {} or v is None and False)
# пустые = {} или не в кэше
still_empty = sum(
    1 for qid in all_ids
    if not is_valid(cache.get(qid))
)

print(f"\n── Финальная статистика ──")
print(f"  Всего wikidata_id     : {total:>7,}")
print(f"  name_en coverage      : {has_en:>7,}  ({has_en/total*100:.1f}%)")
print(f"  name_ru coverage      : {has_ru:>7,}  ({has_ru/total*100:.1f}%)")
print(f"  name_kk coverage      : {has_kk:>7,}  ({has_kk/total*100:.1f}%)")
print(f"  Осталось пустых       : {still_empty:>7,}")

# 30 global фигур
top_ids = {p["wikidata_id"] for p in pools["top_5000"][:100]}
global_preview = preview_df[preview_df["wikidata_id"].isin(top_ids)].head(30)

print(f"\n── 30 global фигур (current_name / name_ru / name_kk) ──")
print(f"  {'current_name':<35} {'name_ru':<35} {'name_kk'}")
print("  " + "─" * 105)
for _, row in global_preview.iterrows():
    print(f"  {row['current_name']:<35} {row['name_ru'] or '—':<35} {row['name_kk'] or '—'}")

# 30 Kazakhstan-born фигур
kz_born_ids = set(df[df["bplace_country"] == "Kazakhstan"]["wikidata_id"])
kz_preview = preview_df[preview_df["wikidata_id"].isin(kz_born_ids)].head(30)

print(f"\n── 30 Kazakhstan-born фигур (current_name / name_ru / name_kk) ──")
print(f"  {'current_name':<35} {'name_ru':<35} {'name_kk'}")
print("  " + "─" * 105)
for _, row in kz_preview.iterrows():
    print(f"  {row['current_name']:<35} {row['name_ru'] or '—':<35} {row['name_kk'] or '—'}")

print("\nГотово.")
