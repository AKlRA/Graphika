// ── Comick Source Aggregator API ──
// All requests route through /api/comick-proxy to bypass CORS.
// Proxy forwards to https://comick-source-api.notaspider.dev

// ── Preferred sources (operational, good coverage) ──
export const PREFERRED_SOURCES = [
  "mangakatana",
  "mangakakalot",
  "manganato",
  "comix",
  "asurascans",
  "flamecomics",
  "mangacloud",
  "weebcentral",
] as const;

// ── Types ──

export interface ComickManga {
  id?: string;
  title: string;
  url: string;
  coverImage?: string;
  cover?: string;
  latestChapter: string | number | null;
  lastUpdated?: string;
  source?: string;
}

export interface ComickChapter {
  id?: string;
  number: string | number;
  url: string;
  title: string;
  date?: string;
  source?: string;
}

export interface ComickTrendingItem {
  id?: string;
  title: string;
  url: string;
  coverImage?: string;
  cover?: string;
  latestChapter: string | number | null;
  rating?: number;
  followers?: string;
  source?: string;
}

// ── Raw API response types (wrapped) ──

interface SearchResponse {
  results?: ComickManga[];
  source?: string;
  // fallback: the API might also return a direct array
  [key: string]: unknown;
}

interface ChaptersResponse {
  chapters?: ComickChapter[];
  source?: string;
  totalChapters?: number;
  [key: string]: unknown;
}

interface FrontpageResponse {
  source?: string;
  sourceName?: string;
  section?: {
    id: string;
    title: string;
    type: string;
    items?: ComickTrendingItem[];
  };
  [key: string]: unknown;
}

// PagesResponse removed — the Comick proxy has no image endpoint

// ── Core fetch helper — routes through /api/comick-proxy to bypass CORS ──

async function comickFetch<T>(
  endpoint: string,
  method: "GET" | "POST" = "POST",
  body?: Record<string, unknown>
): Promise<T> {
  // Route through our Next.js API proxy
  const proxyUrl = "/api/comick-proxy";

  if (method === "POST") {
    const res = await fetch(proxyUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint, body: body || {} }),
    });
    if (!res.ok) throw new Error(`Comick proxy error: ${res.status}`);
    return res.json();
  } else {
    const res = await fetch(`${proxyUrl}?endpoint=${encodeURIComponent(endpoint)}`, {
      method: "GET",
    });
    if (!res.ok) throw new Error(`Comick proxy GET error: ${res.status}`);
    return res.json();
  }
}

/**
 * Extract array from a wrapped response.
 * The API may return { results: [...] } or just [...] directly.
 */
function extractArray<T>(data: unknown, ...keys: string[]): T[] {
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === "object") {
    // Try each key
    for (const key of keys) {
      const val = (data as Record<string, unknown>)[key];
      if (Array.isArray(val)) return val as T[];
    }
    // Last resort: check if any value is an array
    for (const val of Object.values(data as Record<string, unknown>)) {
      if (Array.isArray(val)) return val as T[];
    }
  }
  return [];
}

// ── Search ──

export async function comickSearch(
  query: string,
  source = "comix"
): Promise<ComickManga[]> {
  try {
    const data = await comickFetch<SearchResponse>("/api/search", "POST", {
      query,
      source,
    });
    return extractArray<ComickManga>(data, "results", "data", "manga");
  } catch (err) {
    console.error(`Comick search failed (source=${source}):`, err);
    return [];
  }
}

/**
 * Search across multiple sources for better coverage.
 * Returns combined, deduplicated results.
 */
export async function comickSearchMultiSource(
  query: string,
  sources: string[] = [
    "mangakatana",
    "mangakakalot",
    "manganato",
    "comix",
    "weebcentral",
  ]
): Promise<{ results: ComickManga[]; source: string }[]> {
  const promises = sources.map(async (source) => {
    try {
      const results = await comickSearch(query, source);
      return { results, source };
    } catch {
      return { results: [] as ComickManga[], source };
    }
  });
  return Promise.all(promises);
}

// ── Chapters ──

export async function comickChapters(
  url: string,
  source?: string
): Promise<ComickChapter[]> {
  try {
    const body: Record<string, unknown> = { url };
    if (source) body.source = source;

    const data = await comickFetch<ChaptersResponse>("/api/chapters", "POST", body);
    return extractArray<ComickChapter>(data, "chapters", "data", "results");
  } catch (err) {
    console.error(`Comick chapters failed (url=${url}):`, err);
    return [];
  }
}

// ── Trending / Frontpage ──

export async function comickTrending(
  source = "comix",
  section = "trending",
  limit = 30,
  days = 7
): Promise<ComickTrendingItem[]> {
  try {
    const data = await comickFetch<FrontpageResponse>("/api/frontpage", "POST", {
      source,
      section,
      limit,
      days,
    });

    // Check for items inside section object
    if (data.section?.items) return data.section.items;
    return extractArray<ComickTrendingItem>(data, "items", "results", "data");
  } catch (err) {
    console.error(`Comick trending failed:`, err);
    return [];
  }
}

// ── Pages (chapter images) ──

export interface ComickPagesResponse {
  pages?: string[];
  images?: string[];
  count?: number;
  [key: string]: unknown;
}

/**
 * Fetch the image URLs for a given chapter.
 * Uses our own /api/chapter-pages scraper (NOT the upstream Comick API,
 * which has no pages endpoint). The scraper fetches the source site HTML
 * and extracts image URLs server-side.
 */
export async function comickPages(
  url: string,
  source?: string
): Promise<string[]> {
  try {
    const body: Record<string, unknown> = { url };
    if (source) body.source = source;

    // Call our own scraper endpoint directly (not through comick-proxy)
    const res = await fetch("/api/chapter-pages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error(`Chapter pages scraper error: ${res.status}`);
    }

    const data: ComickPagesResponse = await res.json();
    return data.pages || data.images || [];
  } catch (err) {
    console.error(`Comick pages failed (url=${url}, source=${source}):`, err);
    return [];
  }
}

/**
 * Wrap a raw image URL through our image proxy to bypass CORS/403.
 * The source hint tells the proxy which Referer to spoof.
 */
export function buildProxiedImageUrl(rawUrl: string, source?: string): string {
  const params = new URLSearchParams({ url: rawUrl });
  if (source) params.set("source", source);
  return `/api/image-proxy?${params.toString()}`;
}


// ── Available Sources ──

export interface SourceInfo {
  id: string;
  name: string;
  baseUrl: string;
  description: string;
}

export async function comickSources(): Promise<SourceInfo[]> {
  try {
    const data = await comickFetch<{ sources?: SourceInfo[] }>(
      "/api/sources",
      "GET"
    );
    return extractArray<SourceInfo>(data, "sources");
  } catch {
    return [];
  }
}
