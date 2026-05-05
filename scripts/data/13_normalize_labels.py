"""
Шаг 13: Нормализация локализованных имён.

Вход  : data/processed/figures_localized_labels.csv
Выход 1: data/processed/figures_display_names.csv
Выход 2: data/processed/label_anomalies.csv
"""

import io
import re
import sys
import random

import pandas as pd
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

ROOT      = Path(__file__).resolve().parents[2]
IN_CSV    = ROOT / "data" / "processed" / "figures_localized_labels.csv"
OUT_NAMES = ROOT / "data" / "processed" / "figures_display_names.csv"
OUT_ANOM  = ROOT / "data" / "processed" / "label_anomalies.csv"

# ── Паттерны ──────────────────────────────────────────────────────────────────

RE_CATALOG = re.compile(r"^([^,]+), (.+)$")

RE_REGNAL = re.compile(
    r"^(I{1,3}|IV|VI{0,3}|IX|X{0,3}(?:IX|IV|V?I{0,3})|XL|L) (.+)$"
)

# БАГ 4: порядковые номера титулов: "1-й граф Уилтшир", "3-я графиня..."
RE_ORDINAL = re.compile(r"^\d+-(й|я|е|го|му|ой|ей|х)$")

# БАГ 1: слова-титулы, которые могут стоять после запятой в "Имя, Титул"
ROYAL_TITLES = {
    "принц", "принцесса",
    "король", "королева",
    "герцог", "герцогиня",
    "граф", "графиня",
    "барон", "баронесса",
    "император", "императрица",
    "царь", "царица",
    "шах", "шахиня",
    "хан", "ханша",
    "султан",
    # v2
    "маркиз", "маркиза",
    "эрцгерцог", "эрцгерцогиня",
    "леди", "лорд",
    "сэр", "дама",
}

# БАГ 3: диапазоны кириллицы (базовая + казахские дополнения)
RE_CYRILLIC_START = re.compile(r"^[Ѐ-ӿҰұ]")


def is_catalog_candidate(name: str) -> bool:
    """True если строка выглядит как каталожный формат и не попадает под исключения."""
    # БАГ 3: должна начинаться с кириллицы
    if not RE_CYRILLIC_START.match(name):
        return False

    # ПРАВИЛО 2: >= 2 запятых → слишком сложный случай
    if name.count(",") >= 2:
        return False

    m = RE_CATALOG.match(name)
    if not m:
        return False

    before_comma = m.group(1)
    after_comma  = m.group(2).strip()

    # БАГ 2: скобка до первой запятой → disambig
    if "(" in before_comma:
        return False

    # БАГ 5: первое слово after_comma начинается с маленькой буквы → дескриптор
    if after_comma and after_comma[0].isalpha() and after_comma[0].islower():
        return False

    # БАГ 1 + ПРАВИЛО 1: первое слово после запятой является титулом
    first_word_after = after_comma.split()[0].lower().rstrip(",")
    if first_word_after in ROYAL_TITLES:
        return False

    # БАГ 4: порядковый номер титула ("1-й граф ...", "3-я графиня ...")
    if RE_ORDINAL.match(first_word_after):
        return False

    return True


def normalize_catalog(name: str) -> tuple[str, bool]:
    """'Фамилия, Имя Отч' → 'Имя Отч Фамилия'. Возвращает (результат, изменено)."""
    if not is_catalog_candidate(name):
        return name, False
    m = RE_CATALOG.match(name)
    surname, given = m.group(1).strip(), m.group(2).strip()
    return f"{given} {surname}", True


def normalize_regnal(name: str) -> tuple[str, bool]:
    """'XIV Лев' → 'Лев XIV'. Возвращает (результат, изменено)."""
    m = RE_REGNAL.match(name)
    if not m:
        return name, False
    numeral, rest = m.group(1), m.group(2).strip()
    return f"{rest} {numeral}", True


# ── Загрузка ──────────────────────────────────────────────────────────────────

print(f"Читаю {IN_CSV} ...")
df = pd.read_csv(IN_CSV, dtype=str).fillna("")
print(f"Всего фигур: {len(df):,}")

# ── Нормализация ──────────────────────────────────────────────────────────────

display_ru  = []
display_kk  = []
ru_norm     = []
kk_norm     = []
anom_rows   = []

# Счётчики "спасённых"
saved_royal       = 0
saved_royal_v2    = 0  # только новые слова v2
saved_disambig    = 0
saved_latin       = 0
saved_multi_comma = 0
saved_ordinal     = 0
saved_descriptor  = 0
descriptor_rows   = []  # примеры отсеянных дескрипторов

ROYAL_TITLES_V1 = {
    "принц", "принцесса", "король", "королева", "герцог", "герцогиня",
    "граф", "графиня", "барон", "баронесса", "император", "императрица",
    "царь", "царица", "шах", "шахиня", "хан", "ханша", "султан",
}

for _, row in df.iterrows():
    qid     = row["wikidata_id"]
    orig_ru = row["name_ru"]
    orig_kk = row["name_kk"]

    # Диагностика: считаем сколько кандидатов отсеяно каждым фильтром
    if orig_ru and RE_CATALOG.match(orig_ru):
        m = RE_CATALOG.match(orig_ru)
        before_comma = m.group(1)
        after_comma  = m.group(2).strip()
        first_word   = after_comma.split()[0].lower().rstrip(",") if after_comma else ""

        if not RE_CYRILLIC_START.match(orig_ru):
            saved_latin += 1
        elif orig_ru.count(",") >= 2:
            saved_multi_comma += 1
        elif "(" in before_comma:
            saved_disambig += 1
        elif after_comma and after_comma[0].isalpha() and after_comma[0].islower():
            saved_descriptor += 1
            descriptor_rows.append({"name_ru": orig_ru, "qid": qid})
        elif first_word in ROYAL_TITLES_V1:
            saved_royal += 1
        elif first_word in ROYAL_TITLES:
            saved_royal_v2 += 1
        elif RE_ORDINAL.match(first_word):
            saved_ordinal += 1

    # 1+3. catalog_ru (с тремя фильтрами)
    new_ru, ru_catalog = normalize_catalog(orig_ru)
    ru_regnal_applied  = False

    # 3. regnal_ru (только если catalog не сработал)
    if not ru_catalog and orig_ru:
        new_ru, ru_regnal_applied = normalize_regnal(orig_ru)

    # 2. regnal_kk
    new_kk, kk_regnal = normalize_regnal(orig_kk) if orig_kk else (orig_kk, False)

    display_ru.append(new_ru)
    display_kk.append(new_kk)
    ru_norm.append(1 if (ru_catalog or ru_regnal_applied) else 0)
    kk_norm.append(1 if kk_regnal else 0)

    if ru_catalog or ru_regnal_applied or kk_regnal:
        types = []
        if ru_catalog:        types.append("catalog_ru")
        if ru_regnal_applied: types.append("regnal_ru")
        if kk_regnal:         types.append("regnal_kk")
        anom_rows.append({
            "wikidata_id":    qid,
            "name_ru_before": orig_ru,
            "name_ru_after":  new_ru,
            "name_kk_before": orig_kk,
            "name_kk_after":  new_kk,
            "type":           "/".join(types) if len(types) > 1 else types[0],
        })

# ── Сборка выходов ────────────────────────────────────────────────────────────

out_df = pd.DataFrame({
    "wikidata_id":       df["wikidata_id"],
    "display_name_en":   df["name_en"],
    "display_name_ru":   display_ru,
    "display_name_kk":   display_kk,
    "ru_was_normalized": ru_norm,
    "kk_was_normalized": kk_norm,
})
out_df.to_csv(OUT_NAMES, index=False, encoding="utf-8")

anom_df = pd.DataFrame(anom_rows)
anom_df.to_csv(OUT_ANOM, index=False, encoding="utf-8")

# ── Отчёт ─────────────────────────────────────────────────────────────────────

n_catalog_ru = sum(1 for r in anom_rows if "catalog_ru" in r["type"])
n_regnal_kk  = sum(1 for r in anom_rows if "regnal_kk"  in r["type"])
n_regnal_ru  = sum(1 for r in anom_rows if "regnal_ru"  in r["type"])
n_multiple   = sum(1 for r in anom_rows if "/" in r["type"])

SEP = "=" * 68

print(f"\n{SEP}")
print("ОТЧЁТ: нормализация имён (v5 финальный)")
print(SEP)
print(f"  Всего обработано               : {len(df):>7,}")
print(f"  name_ru catalog_ru (v1, было)  : {'564':>7}")
print(f"  name_ru catalog_ru (v5, стало) : {n_catalog_ru:>7,}")
print(f"    спасено royal v1             : {saved_royal:>7,}")
print(f"    спасено royal v2 (новые)     : {saved_royal_v2:>7,}")
print(f"    спасено multi-comma          : {saved_multi_comma:>7,}")
print(f"    спасено ordinal peerage      : {saved_ordinal:>7,}")
print(f"    спасено descriptor (v5, new) : {saved_descriptor:>7,}")
print(f"    спасено disambig brackets    : {saved_disambig:>7,}")
print(f"    спасено латиница             : {saved_latin:>7,}")
print(f"  name_kk regnal_kk              : {n_regnal_kk:>7,}")
print(f"  name_ru regnal_ru              : {n_regnal_ru:>7,}")
print(f"  Несколько типов сразу          : {n_multiple:>7,}")
print(f"  Итого аномалий                 : {len(anom_rows):>7,}")
print(f"\n  Сохранено → {OUT_NAMES.name}")
print(f"  Сохранено → {OUT_ANOM.name}")

# 30 случайных примеров catalog_ru
catalog_examples = [r for r in anom_rows if "catalog_ru" in r["type"]]
sample_n = min(30, len(catalog_examples))
random.seed(42)
sample = random.sample(catalog_examples, sample_n)

print(f"\n{SEP}")
print(f"{sample_n} случайных примеров catalog_ru AFTER v5 (before → after)")
print(SEP)
print(f"  {'BEFORE':<42} AFTER")
print("  " + "-" * 84)
for r in sample:
    b = r["name_ru_before"][:40]
    a = r["name_ru_after"][:40]
    print(f"  {b:<42} {a}")

# 20 примеров дескрипторов (что теперь НЕ переворачивается)
desc_sample = descriptor_rows[:20]
print(f"\n{SEP}")
print(f"20 примеров descriptor — НЕ переворачиваются (v5 guard)")
print(SEP)
if desc_sample:
    print(f"  {'name_ru (оригинал)':<50} первый символ после запятой")
    print("  " + "-" * 84)
    for d in desc_sample:
        name = d["name_ru"]
        after = name.split(",", 1)[1].strip() if "," in name else ""
        first_ch = after[0] if after else "?"
        print(f"  {name[:48]:<50} '{first_ch}'")
else:
    print("  (нет примеров)")

# Контрольные фигуры — должны переворачиваться
CONTROL = [
    ("Маметова, Маншук Жиенгалиевна",       "Маншук Жиенгалиевна Маметова"),
    ("Тен, Денис Юрьевич",                  "Денис Юрьевич Тен"),
    ("Айманов, Шакен Кенжетаевич",          "Шакен Кенжетаевич Айманов"),
    ("Сапиев, Серик Жумангалиевич",         "Серик Жумангалиевич Сапиев"),
    ("Тынышпаев, Мухамеджан Тынышпаевич",   "Мухамеджан Тынышпаевич Тынышпаев"),
]

print(f"\n{SEP}")
print("Контрольные фигуры (должны переворачиваться)")
print(SEP)
name_ru_series = df["name_ru"].reset_index(drop=True)
for orig, expected in CONTROL:
    mask = name_ru_series == orig
    if not mask.any():
        print(f"  NOT IN BASE : {orig}")
        continue
    idx = mask.idxmax()
    actual = out_df.loc[idx, "display_name_ru"]
    ok = actual == expected
    status = "OK  " if ok else "FAIL"
    print(f"  {status}: {orig[:38]:<40} → {actual}")
    if not ok:
        print(f"        ожидалось: {expected}")

print(f"\nГотово.")
