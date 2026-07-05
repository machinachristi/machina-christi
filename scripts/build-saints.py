#!/usr/bin/env python3
"""One-off maintenance script: builds ordo/saints.json, a curated table of
saint bio excerpts trimmed from Butler's Lives of the Saints (1894, public
domain), keyed by the exact celebration name string used in ordo/calendar-*.json.

Source: catholicsaints.info hosts Butler's full text, one saint per page.
Butler organized his book by the OLD (pre-Vatican II) calendar and titles, so
a page's slug/title often doesn't match the modern General Roman Calendar
name at all (e.g. modern "Saint Augustine, Bishop and Doctor of the Church"
is Butler's "Saint Augustine, Bishop and Confessor, Doctor of the Church";
modern "Saint Thomas Aquinas" is Butler's "Saint Thomas of Aquino"). So
candidates are found via the site's search API, then re-ranked by Jaccard
token overlap between the modern celebration name and each candidate's
title, which in practice disambiguates same-named saints reliably (e.g.
"Augustine, Bishop and Doctor of the Church" scores far higher against the
Hippo entry than against "Augustine, Archbishop of Canterbury").

Keying bios by the calendar JSON's own `name` string (rather than an
independently-normalized saint name) sidesteps runtime fuzzy matching
entirely: both files come from the same litcal snapshot, so an exact-match
lookup at page-render time is sufficient. Saints Butler doesn't cover
(post-1894 canonizations) are simply absent from the output; the page falls
back to a "bio not yet available" notice for those.

Usage: python3 scripts/build-saints.py
"""
import html
import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request

SEARCH_API = "https://catholicsaints.info/wp-json/wp/v2/search"
HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; machinachristi-ordo-build/1.0)"}
STOPWORDS = {"saint", "saints", "the", "of", "and", "a", "an"}

# Multi-person feasts, or cases where the natural search core needs a nudge.
# Each override is the "person name" to search for; the first hit found wins.
SEARCH_OVERRIDES = {
    "Saints Michael, Gabriel and Raphael, Archangels": ["Michael the Archangel"],
    "Saints Cornelius, Pope, and Cyprian, Bishop, Martyrs": ["Cornelius Pope Martyr", "Cyprian Bishop Martyr"],
    "Saints Cyril, Monk, and Methodius, Bishop": ["Cyril Methodius"],
    "Saints Pontian, Pope, and Hippolytus, Priest, Martyrs": ["Pontian Pope Martyr", "Hippolytus Priest Martyr"],
    "Saints John de Brébeuf and Isaac Jogues, Priests, and Companions, Martyrs": ["John de Brebeuf", "Isaac Jogues"],
    "Saints Joachim and Anne, Parents of the Blessed Virgin Mary": ["Joachim", "Anne"],
    "Saint Joseph Husband of the Blessed Virgin Mary": ["Joseph Spouse Blessed Virgin Mary"],
    "Saints Perpetua and Felicity, Martyrs": ["Perpetua"],
    "Saint Frances of Rome, Religious": ["Frances Widow Foundress Collatines"],
    "Saint Hedwig, Religious": ["Hedwig Poland"],
    "Saint John of Capestrano, Priest": ["Capistran"],
    # Post-1894 canonizations: Butler (d. 1773, published 1894 ed.) cannot cover these.
    "Saint Andrew Dũng-Lạc, Priest, and Companions, Martyrs": [],
    "Saint Andrew Kim Tae-gŏn, Priest, and Paul Chŏng Ha-sang, and Companions, Martyrs": [],
    "Saint Christopher Magallanes, Priest, and Companions, Martyrs": [],
    "Saint Augustine Zhao Rong, Priest, and Companions, Martyrs": [],
    "Saint Faustina Kowalska": [],
    "Saint John Paul II, Pope": [],
    "Saint John XXIII, Pope": [],
    "Saint Paul VI, Pope": [],
    "Saint Teresa of Calcutta, Virgin": [],
    "Saint Pius of Pietrelcina, Priest": [],
    "Saint Gregory of Narek, Abbot and Doctor of the Church": [],
    "Saint Juan Diego Cuauhtlatoatzin": [],
    "Saint Josaphat, Bishop and Martyr": ["Josaphat Bishop Martyr"],
}

# Butler (1894) uses 19th-century English spellings/forms that differ from
# the modern General Roman Calendar names for the same person — without this,
# token overlap scoring misses obvious matches (e.g. modern "Anthony" vs
# Butler's "Antony", "Catherine of Siena" vs "Catharine of Sienna").
SPELLING_GROUPS = [
    {"anthony", "antony"}, {"catherine", "catharine"}, {"siena", "sienna"},
    {"cecilia", "cecily"}, {"wenceslaus", "wenceslas"}, {"louis", "lewis"},
    {"felicity", "felicitas"}, {"hedwig", "hedwiges"},
    {"jerome", "jerom"}, {"emiliani", "aemiliani"}, {"capestrano", "capistran"},
]
SPELLING_MAP = {w: sorted(g)[0] for g in SPELLING_GROUPS for w in g}

def stem(word):
    return word[:-1] if len(word) > 4 and word.endswith("s") else word

def tokens(text):
    out = set()
    for t in re.findall(r"[a-z]+", text.lower()):
        if t in STOPWORDS:
            continue
        t = stem(SPELLING_MAP.get(t, t))
        out.add(t)
    return out

# Manually verified URLs for entries whose Butler-era descriptor diverges
# from the modern name too much for the Jaccard score to clear its threshold.
DIRECT_URLS = {
    "Saint Hedwig, Religious": "https://catholicsaints.info/butlers-lives-of-the-saints-saint-hedwiges-or-avoice-duchess-of-poland-widow/",
    "Saint Frances of Rome, Religious": "https://catholicsaints.info/butlers-lives-of-the-saints-saint-frances-widow-foundress-of-the-collatines/",
}

def person_queries(name):
    if name in SEARCH_OVERRIDES:
        return list(SEARCH_OVERRIDES[name])
    core = re.sub(r"^Saints?\s+", "", name)
    core = core.split(",")[0]
    core = re.sub(r"\s+and\s+Companions\s*$", "", core, flags=re.I)
    return [core]

def http_get(url):
    req = urllib.request.Request(url, headers=HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return resp.status, resp.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, None
    except Exception as e:
        print(f"    error fetching {url}: {e}")
        return None, None

def find_best_url(name, person_query):
    q = urllib.parse.quote(f"Butler {person_query}")
    status, body = http_get(f"{SEARCH_API}?search={q}&per_page=30")
    if status != 200 or not body:
        return None
    results = json.loads(body)
    modern_tokens = tokens(re.sub(r"^Saints?\s+", "", name))
    best_score, best_url = 0.0, None
    for item in results:
        title = html.unescape(item.get("title", ""))
        if not re.search(r"lives of the saints", title, re.I):
            continue
        tail = re.split(r"lives of the saints\s*[‐-―-]*\s*", title, flags=re.I)[-1]
        tail_tokens = tokens(tail)
        if not tail_tokens:
            continue
        union = modern_tokens | tail_tokens
        score = len(modern_tokens & tail_tokens) / len(union) if union else 0
        if score > best_score:
            best_score, best_url = score, item["url"]
    return best_url if best_score >= 0.2 else None

def extract_bio(html_text):
    m = re.search(r"<blockquote>(.*?)</blockquote>", html_text, re.S)
    if not m:
        return None
    paras = re.findall(r"<p>(.*?)</p>", m.group(1), re.S)
    text = " ".join(paras) if paras else re.sub(r"<[^>]+>", " ", m.group(1))
    text = re.sub(r"<[^>]+>", "", text)
    text = html.unescape(text)
    text = re.sub(r"^\s*A\.D\.\s*[\d–‐-]+\.?\s*", "", text)
    text = re.sub(r"^\s*\[[^\]]+\]\s*", "", text)  # drop leading "[Patriarch of ...]" tags
    text = re.sub(r"\s+", " ", text).strip()
    return text or None

def excerpt(text, max_chars=700):
    if len(text) <= max_chars:
        return text
    cut = text[:max_chars]
    last_period = cut.rfind(". ")
    if last_period > 200:
        return cut[:last_period + 1]
    return cut.rstrip() + "…"

def main():
    import sys
    retry_only = "--retry-misses" in sys.argv

    names = set()
    for year in (2026, 2027):
        with open(f"ordo/calendar-{year}.json") as f:
            for ev in json.load(f).values():
                n = ev["name"]
                if re.match(r"^(Saint|Saints)\b", n):
                    names.add(n)

    results = {}
    if retry_only:
        try:
            with open("ordo/saints.json") as f:
                results = json.load(f)
        except FileNotFoundError:
            pass
        names = names - set(results.keys())
        print(f"Retrying {len(names)} previously-missed names…")

    misses = []
    for i, name in enumerate(sorted(names), 1):
        excerpts, urls = [], []
        if name in DIRECT_URLS:
            status, page = http_get(DIRECT_URLS[name])
            if status == 200 and page:
                bio = extract_bio(page)
                if bio:
                    excerpts.append(excerpt(bio))
                    urls.append(DIRECT_URLS[name])
        queries = [] if excerpts else person_queries(name)
        for pq in queries:
            url = find_best_url(name, pq)
            if url:
                status, page = http_get(url)
                if status == 200 and page:
                    bio = extract_bio(page)
                    if bio:
                        excerpts.append(excerpt(bio))
                        urls.append(url)
            time.sleep(0.15)
        if excerpts:
            results[name] = {"excerpt": " / ".join(excerpts), "source_url": urls[0]}
            print(f"[{i}/{len(names)}] OK   {name}")
        else:
            misses.append(name)
            print(f"[{i}/{len(names)}] MISS {name}  (queries: {queries})")

    with open("ordo/saints.json", "w") as f:
        json.dump(results, f, ensure_ascii=False, indent=0)

    print(f"\n{len(results)}/{len(names)} matched, {len(misses)} missing:")
    for m in misses:
        print(" -", m)

if __name__ == "__main__":
    main()
