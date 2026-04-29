"""
Шаг 6: Добор кандидатов из Pantheon.

Берёт топ-30,000 Pantheon по HPI, исключает тех, кто уже есть
в Wiki-списке (по wikidata_id), сохраняет в pantheon_candidates.csv.
"""

import io
import sys
from pathlib import Path

import pandas as pd

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parents[2]
WIKI_PATH  = ROOT / "data" / "processed" / "wiki_top_humans_aggregated.csv"
PAN_PATH   = ROOT / "data" / "raw"       / "pantheon.csv"
OUT_PATH   = ROOT / "data" / "processed" / "pantheon_candidates.csv"

TOP_N = 30_000

DOMAIN_MAP: dict[str, str] = {
    # SPORTS
    "SOCCER PLAYER": "SPORTS", "ATHLETE": "SPORTS", "BASKETBALL PLAYER": "SPORTS",
    "CYCLIST": "SPORTS", "TENNIS PLAYER": "SPORTS", "SWIMMER": "SPORTS",
    "WRESTLER": "SPORTS", "RACING DRIVER": "SPORTS", "SKIER": "SPORTS",
    "HOCKEY PLAYER": "SPORTS", "BOXER": "SPORTS", "GYMNAST": "SPORTS",
    "HANDBALL PLAYER": "SPORTS", "SKATER": "SPORTS", "FENCER": "SPORTS",
    "VOLLEYBALL PLAYER": "SPORTS", "BADMINTON PLAYER": "SPORTS",
    "MARTIAL ARTS": "SPORTS", "COACH": "SPORTS", "CHESS PLAYER": "SPORTS",
    "GOLFER": "SPORTS", "RUGBY PLAYER": "SPORTS",
    "AMERICAN FOOTBALL PLAYER": "SPORTS", "BASEBALL PLAYER": "SPORTS",
    "ROWER": "SPORTS", "WEIGHTLIFTER": "SPORTS", "EQUESTRIAN": "SPORTS",
    "ARCHER": "SPORTS", "TRIATHLETE": "SPORTS", "SPRINTER": "SPORTS",
    "CANOEIST": "SPORTS", "JOCKEY": "SPORTS", "CRICKET PLAYER": "SPORTS",
    "POLO PLAYER": "SPORTS", "CURLER": "SPORTS", "BOBSLEDDER": "SPORTS",
    "WATER POLO PLAYER": "SPORTS", "PENTATHLETE": "SPORTS",
    "DISCUS THROWER": "SPORTS", "SHOT PUTTER": "SPORTS",
    # ARTS & ENTERTAINMENT
    "ACTOR": "ARTS & ENTERTAINMENT", "SINGER": "ARTS & ENTERTAINMENT",
    "MUSICIAN": "ARTS & ENTERTAINMENT", "FILM DIRECTOR": "ARTS & ENTERTAINMENT",
    "PAINTER": "ARTS & ENTERTAINMENT", "COMPOSER": "ARTS & ENTERTAINMENT",
    "SCULPTOR": "ARTS & ENTERTAINMENT", "ARCHITECT": "ARTS & ENTERTAINMENT",
    "MODEL": "ARTS & ENTERTAINMENT", "CELEBRITY": "ARTS & ENTERTAINMENT",
    "COMIC ARTIST": "ARTS & ENTERTAINMENT", "PORNOGRAPHIC ACTOR": "ARTS & ENTERTAINMENT",
    "PRESENTER": "ARTS & ENTERTAINMENT", "DANCER": "ARTS & ENTERTAINMENT",
    "PHOTOGRAPHER": "ARTS & ENTERTAINMENT", "COMEDIAN": "ARTS & ENTERTAINMENT",
    "SCREENWRITER": "ARTS & ENTERTAINMENT", "PLAYWRIGHT": "ARTS & ENTERTAINMENT",
    "FASHION DESIGNER": "ARTS & ENTERTAINMENT", "PRODUCER": "ARTS & ENTERTAINMENT",
    "ANIMATOR": "ARTS & ENTERTAINMENT", "VIDEO JOCKEY": "ARTS & ENTERTAINMENT",
    "ENGRAVER": "ARTS & ENTERTAINMENT", "ILLUSTRATOR": "ARTS & ENTERTAINMENT",
    "CARICATURIST": "ARTS & ENTERTAINMENT",
    # SCIENCE & TECHNOLOGY
    "PHYSICIST": "SCIENCE & TECHNOLOGY", "MATHEMATICIAN": "SCIENCE & TECHNOLOGY",
    "BIOLOGIST": "SCIENCE & TECHNOLOGY", "CHEMIST": "SCIENCE & TECHNOLOGY",
    "ASTRONOMER": "SCIENCE & TECHNOLOGY", "ENGINEER": "SCIENCE & TECHNOLOGY",
    "INVENTOR": "SCIENCE & TECHNOLOGY", "COMPUTER SCIENTIST": "SCIENCE & TECHNOLOGY",
    "PHYSICIAN": "SCIENCE & TECHNOLOGY", "ARCHAEOLOGIST": "SCIENCE & TECHNOLOGY",
    "GEOLOGIST": "SCIENCE & TECHNOLOGY", "NATURALIST": "SCIENCE & TECHNOLOGY",
    "ASTRONAUT": "SCIENCE & TECHNOLOGY", "BOTANIST": "SCIENCE & TECHNOLOGY",
    "ZOOLOGIST": "SCIENCE & TECHNOLOGY", "PALEONTOLOGIST": "SCIENCE & TECHNOLOGY",
    "METEOROLOGIST": "SCIENCE & TECHNOLOGY", "OCEANOGRAPHER": "SCIENCE & TECHNOLOGY",
    "GENETICIST": "SCIENCE & TECHNOLOGY", "NEUROSCIENTIST": "SCIENCE & TECHNOLOGY",
    "PHARMACOLOGIST": "SCIENCE & TECHNOLOGY",
    # HUMANITIES
    "WRITER": "HUMANITIES", "PHILOSOPHER": "HUMANITIES", "HISTORIAN": "HUMANITIES",
    "ECONOMIST": "HUMANITIES", "JOURNALIST": "HUMANITIES",
    "SOCIAL ACTIVIST": "HUMANITIES", "PSYCHOLOGIST": "HUMANITIES",
    "LINGUIST": "HUMANITIES", "POET": "HUMANITIES", "THEOLOGIAN": "HUMANITIES",
    "ANTHROPOLOGIST": "HUMANITIES", "SOCIOLOGIST": "HUMANITIES",
    "POLITICAL SCIENTIST": "HUMANITIES", "JURIST": "HUMANITIES",
    "GEOGRAPHER": "HUMANITIES",
    # POLITICS & LEADERSHIP
    "POLITICIAN": "POLITICS & LEADERSHIP", "MILITARY PERSONNEL": "POLITICS & LEADERSHIP",
    "NOBLEMAN": "POLITICS & LEADERSHIP", "EXPLORER": "POLITICS & LEADERSHIP",
    "BUSINESSPERSON": "POLITICS & LEADERSHIP", "EXTREMIST": "POLITICS & LEADERSHIP",
    "SPY": "POLITICS & LEADERSHIP", "NAVIGATOR": "POLITICS & LEADERSHIP",
    "COLONIST": "POLITICS & LEADERSHIP", "DIPLOMAT": "POLITICS & LEADERSHIP",
    # RELIGION
    "RELIGIOUS FIGURE": "RELIGION", "COMPANION": "RELIGION",
    "SAINT": "RELIGION", "POPE": "RELIGION", "IMAM": "RELIGION",
    "PROPHET": "RELIGION", "MISSIONARY": "RELIGION",
}


def get_domain(occ) -> str:
    if pd.isna(occ):
        return "OTHER"
    return DOMAIN_MAP.get(str(occ).upper(), "OTHER")


def main():
    # Load Wiki list
    wiki = pd.read_csv(WIKI_PATH)
    wiki_ids = set(wiki["wikidata_id"].dropna().astype(str))
    print(f"Wiki-список: {len(wiki_ids):,} уникальных wikidata_id")

    # Load Pantheon
    pan = pd.read_csv(PAN_PATH)
    print(f"Pantheon загружен: {len(pan):,} строк")

    # Remove groups (organisations, etc.)
    pan = pan[pan["is_group"] == False].copy()
    print(f"После удаления групп: {len(pan):,} строк")

    # Sort by HPI descending
    pan.sort_values("hpi", ascending=False, inplace=True)
    pan.reset_index(drop=True, inplace=True)

    # Find overlap
    pan["in_wiki"] = pan["wd_id"].astype(str).isin(wiki_ids)
    overlap = pan["in_wiki"].sum()
    print(f"Пересечение с Wiki-списком: {overlap:,} фигур")

    # Candidates: not in Wiki, take top N by HPI
    candidates = pan[~pan["in_wiki"]].head(TOP_N).copy()
    print(f"Кандидатов (топ-{TOP_N:,} Pantheon, не в Wiki): {len(candidates):,}")

    # Add domain
    candidates["domain"] = candidates["occupation"].apply(get_domain)

    # Select and rename columns
    result = candidates[[
        "wd_id", "name", "occupation", "domain", "hpi",
        "gender", "bplace_country", "birthyear",
    ]].copy()
    result.rename(columns={"bplace_country": "country", "birthyear": "birth_year"}, inplace=True)

    result.to_csv(OUT_PATH, index=False, encoding="utf-8")
    print(f"\nСохранено: {OUT_PATH}")

    # Stats
    print(f"\n{'='*65}")
    print("СТАТИСТИКА КАНДИДАТОВ")
    print("="*65)
    print(f"Всего кандидатов: {len(result):,}")
    print(f"\nПо доменам:")
    for domain, cnt in result["domain"].value_counts().items():
        print(f"  {domain:<30} {cnt:>6,}")

    print(f"\nТОП-30 кандидатов по HPI:")
    cols = ["wd_id", "name", "occupation", "hpi", "country", "birth_year"]
    top30 = result.head(30)[cols]
    for i, row in top30.iterrows():
        print(
            f"  {i+1:>3}. {row['name']:<35} HPI={row['hpi']:>6.1f}  "
            f"{row['occupation']:<25}  {row['country']}  ({row['birth_year']})"
        )

    print(f"\nГотово. Следующий шаг — 07_pantheon_pageviews.py")


if __name__ == "__main__":
    main()
