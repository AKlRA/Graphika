# Graphika — Project Guide (Architecture & Status)

Last oriented for **Next.js 16**, **React 19**, client-side AniList/MangaDex/Comick usage, and optional **Vercel** deployment (free/Hobby tier).

---

## What Graphika Is

A **manga reader web app**: browse titles from **AniList**, open a detail page with aggregated chapters (**MangaDex** + **Comick Source API**), read in-app where possible (MangaDex CDN + HTML scraper + image proxy), or jump to the publisher/site when a chapter cannot be inlined.

**Main surfaces**

| Area | Purpose |
|------|---------|
| Home | AniList trending (JP / KR / CN slices), continue reading |
| Search | Query + filters (genres, status, chapters, sort, region/type), **35 results per page**, URL-synced pagination |
| Library | Saved titles |
| Manga detail | Banner, synopsis, aggregated chapter list with source badges |
| Reader | Webtoon / paged modes, MangaDex AT-Home or Comick scrape + proxied images |

---

## Data Sources

| Source | Role | API / transport |
|--------|------|------------------|
| **AniList** | Metadata, search, trending, filters | GraphQL `graphql.anilist.co` |
| **MangaDex** | Chapter feed + AT-Home image URLs | REST `api.mangadex.org` |
| **Comick Source API** | Search + chapter lists for many third-party sites | REST via proxy to upstream (see `comick-proxy`) |

---

## Core Problem & Solution (Third-Party Chapter Images)

Comick returns **chapter URLs**, not image blobs. Third-party CDNs often **403** the browser unless requests carry the correct **Referer** / aren’t cross-origin.

**Solution**

1. **`POST /api/chapter-pages`** (Node) — Fetch chapter **HTML**, extract page image URLs (layered heuristics: JS arrays, reader containers, broad `<img>` scan, regex fallback).
2. **`GET /api/image-proxy`** (Edge) — Stream image bytes with spoofed **Referer** / **User-Agent**; map `source` (and sometimes **image hostname**) to the right Referer (important for **MangaKakalot / Manganato** CDNs).

```
Reader → POST /api/chapter-pages → raw image URLs
      → <img src="/api/image-proxy?url=...&source=..."> → CDN
```

---

## What Is Implemented & Working

### Reading pipeline

- **MangaDex**: Direct AT-Home URLs in the reader; token refresh on an interval.
- **Comick-backed hosts** (when HTML cooperates): Scraper + proxied images in-app.
- **Known hosts** with explicit scraper/proxy hints include **mangakatana**, **mangapill**, **mangakakalot** / **manganato** (incl. `.gg`), plus generic patterns for other inferable domains.
- **MangaPlus / encrypted canvas**: Not scrape-friendly — chapters normalized as **`external`** where detected; opens in the **browser**.
- **Scrape returns 0 pages**: Reader triggers **`window.location.replace`** to the real chapter URL when possible (minimal spinner only); tiny fallback UI only if no URL can be built.

### MangaDex ↔ title linking (`lib/linking.ts`, `lib/api/mangadex.ts`)

- Search uses **larger result windows**, **`links.al`** (AniList id) confirmation when present, and **no blind “pick first search hit”** when fuzzy score is low.
- Secondary search pass **without** `availableTranslatedLanguage=en` when needed so titles aren’t invisible to search.
- Chapter feed tries **English first**, then **Japanese** if the EN feed is empty.
- Content ratings include **pornographic** in API queries where relevant so listings aren’t silently excluded.
- **Linked-ID cache** version bumps when discovery logic changes (see code `v` on stored manga ids).

### Chapter aggregation (`lib/chapters.ts`)

- Merge **MangaDex** + **one** linked Comick source.
- Default **active version** prefers **readable** over **external**, then source order: **mangadex → mangakatana → mangakakalot / manganato → comix → asurascans → flamecomics → mangacloud → weebcentral → mangapill → mangaplus** (unknown sources sort after).
- Users can switch **versions** per chapter when multiple exist (bottom sheet).

### Comick discovery order (auto-pick URL for a title)

Preferred try order (see `linkComickUrl`): **mangakatana → mangakakalot → manganato → comix → asurascans → flamecomics → mangacloud → weebcentral**. **Mangapill** / **mangaplus** are **not** in this auto list (manhwa/manga mix and official reader); other code paths still understand those source ids if present.

### Usability (client)

- **External chapter** from the list: opens **directly** in a new tab (no intermediate “education” sheet on the detail list).
- **Touched chapters**: Local list of opened chapter numbers + reading progress dims rows so “already opened / read up to here” is visible; refocus sync on the detail page refreshes progress.
- **Search**: **35** titles per page, **page** query param, **region filter** (JP / KR / CN / TW → manga / manhwa / manhua-style filters), expanded **genre** chip list, chapter min/max, status, sort — all reflected in the URL for share/bookmark.

### Caching

- Chapter list cache on the manga page is fingerprinted by **linked ids + scanlator prefs** so stale “Comick-only” lists are not pinned for 30 minutes after IDs improve.
- AniList trending is short-TTL cached in `localStorage` (see `getTrending`).

---

## Key Files (Reference)

| File | Role |
|------|------|
| `app/api/chapter-pages/route.ts` | HTML scraper for chapter page images |
| `app/api/image-proxy/route.ts` | Edge image proxy + Referer resolution (incl. Kakalot/Nato CDN heuristics) |
| `app/api/comick-proxy/route.ts` | CORS-safe Comick API proxy |
| `lib/api/anilist.ts` | Queries, advanced search + `pageInfo`, origin filter |
| `lib/api/mangadex.ts` | Search, feed, AT-Home |
| `lib/api/comick.ts` | Comick proxy client, `comickPages`, `buildProxiedImageUrl` |
| `lib/linking.ts` | AniList ↔ MangaDex ↔ Comick URL resolution |
| `lib/chapters.ts` | Normalize, merge, resolve default version, cache types |
| `lib/storage.ts` | Library, progress, linked ids, touched chapters, settings |
| `app/manga/[id]/page.tsx` | Detail + chapter load + touches on select |
| `app/manga/[id]/read/page.tsx` | Reader + external redirect |
| `components/ChapterList.tsx` | Filters, version picker, external/readable styling |
| `app/search/search-content.tsx` | Search UI, URL-driven fetch, pagination |
| `app/page.tsx` | Home / trending |

---

## Testing Checklist (Manual)

1. **MangaDex chapter** — Loads images; progress saves.
2. **Comick + mangakatana (or similar)** — In-app pages via proxy; no EXTERNAL badge when `readable`.
3. **External-only** — Row opens host in new tab; reader failure redirects to chapter URL when known.
4. **Mixed MD + Comick** — Same title shows both; default version follows priority; picker switches source.
5. **Search** — Filters + **Next 35** / **Previous 35**; URL updates; region filter restricts results.
6. **Regression** — `npm run build` clean.

---

## Known Limitations

| Topic | Detail |
|-------|--------|
| **Vercel free tier** | Bandwidth / serverless timeouts; heavy proxy use scales with reads. |
| **JS-only sites** | No headless browser — empty scrape → external redirect or open in tab. |
| **Cloudflare / bot walls** | Server `fetch` may get a challenge page — same outcome. |
| **MangaDex** | Some series are EN-only or JP-only in the API; linking can still fail for odd titles despite heuristics. |
| **Comick** | One linked Comick **source** per title in the current model (not every mirror at once). |

---

## Quick Reference: API Shapes

```http
POST /api/chapter-pages
Content-Type: application/json
{"url":"https://…","source":"mangakatana"}

GET /api/image-proxy?url=<encoded>&source=mangakatana

POST /api/comick-proxy
{"endpoint":"/api/chapters","body":{"url":"…","source":"mangakatana"}}
```

---

## Build Status

- **`npm run build`** — Expected to compile with **0 TypeScript errors**.
- Routes include **`/api/chapter-pages`**, **`/api/comick-proxy`**, **`/api/image-proxy`**, plus **`/`**, **`/search`**, **`/library`**, **`/manga/[id]`**, **`/manga/[id]/read`**.

---

## README vs README2

- **`README.md`** — Default Next.js scaffold text.
- **`README2.md`** (this file) — **Product/architecture/status** for Graphika.
