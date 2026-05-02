// ── MangaDex REST API ──

const MANGADEX_BASE = "https://api.mangadex.org";

// Rate limiting: 5 req/s
let lastRequestTime = 0;
async function rateLimitedFetch(url: string, init?: RequestInit): Promise<Response> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < 200) {
    await new Promise((r) => setTimeout(r, 200 - elapsed));
  }
  lastRequestTime = Date.now();
  return fetch(url, init);
}

export interface MangaDexManga {
  id: string;
  attributes: {
    title: Record<string, string>;
    altTitles: Record<string, string>[];
    links: Record<string, string> | null;
  };
}

export interface MangaDexChapter {
  id: string;
  attributes: {
    chapter: string | null;
    title: string | null;
    translatedLanguage: string;
    publishAt: string;
    pages: number;
    externalUrl: string | null;
  };
  relationships: {
    id: string;
    type: string;
    attributes?: {
      name?: string;
    };
  }[];
}

export interface MangaDexAtHome {
  baseUrl: string;
  chapter: {
    hash: string;
    data: string[];
    dataSaver: string[];
  };
}

/**
 * Search MangaDex for a manga by title, return top results.
 * Also checks attributes.links.al for AniList ID confirmation.
 */
export async function searchMangaDex(
  title: string,
  limit = 20,
  options?: { requireEn?: boolean }
): Promise<MangaDexManga[]> {
  const params = new URLSearchParams({
    title,
    limit: String(limit),
    "contentRating[]": "safe",
  });
  params.append("contentRating[]", "suggestive");
  params.append("contentRating[]", "erotica");
  params.append("contentRating[]", "pornographic");

  if (options?.requireEn !== false) {
    params.append("availableTranslatedLanguage[]", "en");
  }

  const res = await rateLimitedFetch(`${MANGADEX_BASE}/manga?${params}`);
  if (!res.ok) throw new Error(`MangaDex search error: ${res.status}`);
  const json = await res.json();
  return json.data as MangaDexManga[];
}

/**
 * Confirm a MangaDex manga matches an AniList ID by checking attributes.links.al
 */
export function confirmAniListLink(
  manga: MangaDexManga,
  anilistId: number
): boolean {
  const al = manga.attributes.links?.al;
  if (!al) return false;
  return String(al) === String(anilistId);
}

/**
 * Fetch all EN chapters for a MangaDex manga UUID, with scanlation groups included.
 * Handles pagination (max 500 per request).
 */
async function fetchMangaDexFeedPaged(
  mangadexId: string,
  translatedLanguage: string
): Promise<MangaDexChapter[]> {
  const allChapters: MangaDexChapter[] = [];
  let offset = 0;
  const limit = 500;

  while (true) {
    const params = new URLSearchParams({
      "translatedLanguage[]": translatedLanguage,
      limit: String(limit),
      offset: String(offset),
      "includes[]": "scanlation_group",
      "order[chapter]": "asc",
      "contentRating[]": "safe",
    });
    params.append("contentRating[]", "suggestive");
    params.append("contentRating[]", "erotica");
    params.append("contentRating[]", "pornographic");

    const res = await rateLimitedFetch(
      `${MANGADEX_BASE}/manga/${mangadexId}/feed?${params}`
    );
    if (!res.ok) throw new Error(`MangaDex feed error: ${res.status}`);
    const json = await res.json();
    const chapters = json.data as MangaDexChapter[];
    allChapters.push(...chapters);

    if (chapters.length < limit) break;
    offset += limit;
  }

  return allChapters;
}

/**
 * Fetch chapters: English first, then Japanese if the series has no EN uploads.
 */
export async function fetchMangaDexChapters(
  mangadexId: string
): Promise<MangaDexChapter[]> {
  const en = await fetchMangaDexFeedPaged(mangadexId, "en");
  if (en.length > 0) return en;
  return fetchMangaDexFeedPaged(mangadexId, "ja");
}

/**
 * Get AT-Home server URLs for reading a chapter's images.
 */
export async function getChapterImages(
  chapterId: string,
  dataSaver = false
): Promise<string[]> {
  const res = await rateLimitedFetch(
    `${MANGADEX_BASE}/at-home/server/${chapterId}`
  );
  if (!res.ok) throw new Error(`MangaDex at-home error: ${res.status}`);
  const data: MangaDexAtHome = await res.json();

  const files = dataSaver ? data.chapter.dataSaver : data.chapter.data;
  const pathSegment = dataSaver ? "data-saver" : "data";

  return files.map(
    (filename) => `${data.baseUrl}/${pathSegment}/${data.chapter.hash}/${filename}`
  );
}
