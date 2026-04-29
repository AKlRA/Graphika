# Graphika — In-Site Manga Reader: Architecture & Testing Guide

## Overview

Graphika is a manga reader site built with **Next.js 16** (Turbopack), deployed on **Vercel** (free/Hobby tier). It aggregates manga metadata from two sources:

| Source | Role | API |
|--------|------|-----|
| **AniList** | Manga metadata (titles, covers, genres, scores) | GraphQL at `graphql.anilist.co` |
| **MangaDex** | Chapter listing + image delivery (AT-Home CDN) | REST at `api.mangadex.org` |
| **Comick Source API** | Chapter listing from 60+ scanlator/aggregator sites | REST at `comick-source-api.notaspider.dev` |

### The Problem

MangaDex chapters work in-site because MangaDex's AT-Home CDN serves images with proper CORS headers. But **Comick-sourced chapters** (mangakatana, weebcentral, flamecomics, etc.) could only be opened as **external links** because:

1. The upstream Comick Source API is **metadata-only** — it provides search, chapter listings, and health checks, but has **NO endpoint to fetch chapter page images**.
2. The source sites' image CDNs **block cross-origin requests** via Referer checks, returning 403 Forbidden.

### The Solution: Two New Serverless Functions

We built our own pipeline to fetch and serve chapter images entirely server-side:

```
┌──────────────┐     POST /api/chapter-pages     ┌──────────────────┐
│  Reader Page  │ ──────────────────────────────> │  Chapter Scraper  │
│  (browser)    │ <── { pages: [url1, url2, ...]} │  (Node.js SSR)    │
└──────┬───────┘                                  └────────┬─────────┘
       │                                                   │
       │  <img src="/api/image-proxy?url=...&source=...">  │ fetch(chapterUrl)
       │                                                   │ + parse HTML
       ▼                                                   │ + extract <img> URLs
┌──────────────┐     fetch(imageUrl)              ┌────────▼─────────┐
│  Image Proxy  │ ──────────────────────────────> │  Source CDN       │
│  (Edge RT)    │ <── raw image bytes             │  (mangakatana,    │
│  Referer:     │     Content-Type: image/jpeg    │   weebcentral,    │
│  source.com   │                                 │   flamecomics...) │
└──────────────┘                                  └──────────────────┘
```

---

## Files Changed

### New Files

#### `app/api/chapter-pages/route.ts`
**Server-side HTML scraper** — the core of the approach.

- **Runtime**: Node.js (default, not Edge) — allows full text processing
- **Endpoint**: `POST /api/chapter-pages`
- **Request**: `{ url: "https://mangakatana.com/manga/one-piece.49/c1167", source: "mangakatana" }`
- **Response**: `{ pages: ["https://cdn.../0.jpg", "https://cdn.../1.jpg", ...], source: "mangakatana", count: 17 }`

**How it works:**
1. Receives a chapter URL (from the Comick Source API's `/api/chapters` response)
2. Fetches the chapter page HTML from the source site with spoofed `User-Agent` and `Referer`
3. Extracts image URLs using 4 layered strategies:
   - **Strategy 1**: JavaScript array variables (e.g., `var ytaw = ['url1','url2']` — mangakatana uses this)
   - **Strategy 2**: `<img>` tags inside known reader container classes (`reading-content`, `chapter-content`, etc.)
   - **Strategy 3**: Broad `<img>` scan with domain-grouping heuristic (picks the CDN domain with the most images)
   - **Strategy 4**: Last resort — regex all `https://...jpg/png/webp` URLs in the HTML and domain-group them

#### `app/api/image-proxy/route.ts`
**Image byte-stream proxy** — bypasses CORS and Referer blocks.

- **Runtime**: Edge Runtime (no 10s timeout, streaming support)
- **Endpoint**: `GET /api/image-proxy?url=<encoded-image-url>&source=<source-id>`
- **Response**: Raw image bytes with `Content-Type` passthrough

**What it does:**
1. Validates the URL (HTTPS only, no private IPs, max 15MB)
2. Fetches the image from the source CDN with spoofed headers:
   - `Referer: https://mangakatana.com/` (varies by source)
   - `User-Agent: Mozilla/5.0 ...`
   - `Sec-Fetch-*` headers matching a real browser
3. Streams the raw bytes back with `Cache-Control: public, max-age=86400` (Vercel Edge CDN will cache)

**Source → Referer mapping:**
| Source | Referer |
|--------|---------|
| `mangakatana` | `https://mangakatana.com/` |
| `weebcentral` | `https://weebcentral.com/` |
| `comix` | `https://comix.to/` |
| `asurascans` | `https://asurascans.com/` |
| `flamecomics` | `https://flamecomics.xyz/` |
| `mangacloud` | `https://mangacloud.org/` |
| `mangadex` | `https://mangadex.org/` |
| (unknown) | `https://comick.io/` (fallback) |

### Modified Files

#### `lib/api/comick.ts`
- **`comickPages(url, source)`** — Now calls our own `/api/chapter-pages` scraper endpoint instead of the non-existent upstream `/api/pages`
- **`buildProxiedImageUrl(rawUrl, source)`** — Wraps a raw image URL through `/api/image-proxy?url=...&source=...`

#### `lib/chapters.ts`
- **`normalizeComickChapters()`** — Changed chapter `type` from `"external"` to `"readable"`. This is the key change that makes Comick chapters open in the in-site reader instead of `window.open()`.
- **`mergeChapterLists()`** — Updated the dedup guard: only genuinely external chapters (like MangaPlus on MangaDex) are now skipped if a readable version exists. Comick "readable" chapters are kept as version alternatives alongside MangaDex.

#### `app/manga/[id]/read/page.tsx` (Reader Page)
- **`fetchImages()`** — Added an `else` branch for non-MangaDex sources:
  1. Calls `comickPages(chapterId, source)` to get raw image URLs via our scraper
  2. Maps each URL through `buildProxiedImageUrl()` to create `<img src="/api/image-proxy?url=...">` URLs
- **External URL fallback** — Fixed: for non-MangaDex sources, uses the `chapterId` directly (which IS the source URL like `https://mangakatana.com/...`) instead of the broken `https://mangadex.org/chapter/<url>` fallback.
- **Cache TTL** — MangaDex tokens expire (14min), Comick URLs don't (Infinity), so the re-fetch interval only runs for MangaDex sources.

#### `app/api/comick-proxy/route.ts`
- Added `/api/pages` to the whitelist (this was from the initial attempt; harmless but unused now since we use `/api/chapter-pages` directly)

### Files That Needed NO Changes
- **`app/manga/[id]/page.tsx`** (Manga Detail) — The existing `handleChapterSelect` already checks `active.type === "external"` and routes `"readable"` chapters to the reader. Since Comick chapters are now `"readable"`, they flow through automatically.
- **`components/ChapterList.tsx`** — The existing `isExternal = active.type === "external"` flag drives all the UI differences (badge, icon, click handler, opacity). Since Comick chapters are now `"readable"`, they automatically get the normal treatment.

---

## What Needs to Be Tested

### Test 1: Mangakatana Chapter (Confirmed Working in Dev)
1. Go to a manga page that has mangakatana as its Comick source (e.g., One Piece)
2. In the chapter list, Comick (CK) chapters should **NOT** show the amber "EXTERNAL" badge
3. Click a CK chapter → should open the in-site reader (not a new tab)
4. Verify images load — you should see manga pages scrolling vertically (webtoon mode) or one at a time (paged mode)
5. The loading spinner should appear briefly while the scraper fetches + parses the chapter HTML

**Expected**: 15-20 manga page images load in the reader, served through `/api/image-proxy`.

### Test 2: Other Sources (Needs Verification)
The scraper uses generic HTML parsing strategies. Different sources may have different HTML structures:

| Source | Likelihood of Working | Notes |
|--------|-----------------------|-------|
| **mangakatana** | ✅ High (confirmed) | Uses JS array `var ytaw = [...]` — Strategy 1 catches it |
| **comix** | 🟡 Medium | Need to test if their HTML has recognizable image patterns |
| **flamecomics** | 🟡 Medium | Scanlator site, likely has standard reader HTML |
| **weebcentral** | 🔴 Low | May use JavaScript-rendered content (no images in raw HTML) |
| **asurascans** | 🔴 Low | Often uses Cloudflare protection + JS rendering |

**To test**: Find manga that link to these sources and try opening a chapter.

### Test 3: MangaDex Regression
1. Open a manga that has MangaDex (MD) chapters
2. Click an MD chapter → should still work exactly as before (AT-Home CDN)
3. MangaDex chapters flagged as externally hosted (e.g., MangaPlus) should still show "Hosted Externally" with a working "Open in Browser" link

### Test 4: External Link Fallback
1. If the scraper returns 0 images (source site blocked, JS-rendered, etc.), the reader should show the "Hosted Externally" screen
2. The "Open in Browser" button should link to the **actual source URL** (e.g., `https://mangakatana.com/...`), NOT `https://mangadex.org/chapter/...`

### Test 5: Chapter Navigation
1. Open a Comick chapter in the reader
2. Reach the last page → "Chapter Complete" sheet should appear
3. Click "Continue Reading" → should load the next chapter (may be MangaDex or Comick)
4. Test Prev/Next buttons in the bottom bar

### Test 6: Mixed Source Navigation
1. Find a manga where chapter N is from MangaDex and chapter N+1 is from Comick (or vice versa)
2. Read chapter N → navigate to chapter N+1
3. Verify the transition works (different fetch pipeline for each source)

---

## Known Limitations & Caveats

### Vercel Free Tier Limits
| Resource | Limit | Impact |
|----------|-------|--------|
| Bandwidth | 100 GB/month | Each chapter read = ~3-10MB through the proxy |
| Serverless execution | 10s (Node.js), 30s (Edge) | Scraper might timeout on slow source sites |
| Edge function size | 1MB | Image proxy is lightweight, should be fine |

### Sources That Won't Work
- **JavaScript-rendered sites** (e.g., weebcentral, some asura sites) — our scraper fetches raw HTML, no JS execution. These will return 0 pages and fall back to the "Hosted Externally" screen.
- **Cloudflare-protected sites** — may return a challenge page instead of the chapter HTML.
- **Sites that change their HTML structure** — the scraper strategies are heuristic-based and may break.

### Image Token Expiry
- **MangaDex**: AT-Home tokens expire after ~15 minutes. The reader auto-refreshes them.
- **Comick sources**: Image URLs from most manga sites don't expire, but some (mangakatana) use tokenized URLs that may expire after hours. If images stop loading, refreshing the page will re-scrape and get fresh URLs.

### Cache Behavior
- Scraped page results: cached 1 hour (`s-maxage=3600`) at Vercel Edge
- Proxied images: cached 24 hours (`s-maxage=86400`) at Vercel Edge
- First load of a chapter will be slower (scraper fetch + image proxy cold start)

---

## Quick Reference: URL Patterns

```
# Scrape chapter images from source site
POST /api/chapter-pages
Body: { "url": "https://mangakatana.com/manga/one-piece.49/c1167", "source": "mangakatana" }

# Proxy an image through our domain (bypasses CORS/403)
GET /api/image-proxy?url=https%3A%2F%2Fi1.mangakatana.com%2F...&source=mangakatana

# Existing: Proxy Comick Source API metadata calls
POST /api/comick-proxy
Body: { "endpoint": "/api/chapters", "body": { "url": "...", "source": "mangakatana" } }
```

## Build Status
- ✅ `npm run build` — Compiled successfully, 0 TypeScript errors
- ✅ All 3 API routes registered: `/api/chapter-pages` (ƒ), `/api/comick-proxy` (ƒ), `/api/image-proxy` (ƒ)
- ✅ Mangakatana scraper tested in dev: 17 pages extracted for One Piece Ch. 1167
