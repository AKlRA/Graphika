// ── AniList GraphQL API ──
// All requests route through /api/anilist-proxy to bypass ISP blocks.

export interface AniListMedia {
  id: number;
  title: {
    romaji: string;
    english: string | null;
    native: string | null;
  };
  description: string | null;
  genres: string[];
  averageScore: number | null;
  status: string;
  format: string;
  chapters: number | null;
  countryOfOrigin: string;
  coverImage: {
    extraLarge: string;
    large: string;
    color: string | null;
  };
  bannerImage: string | null;
  type: string;
}

const TRENDING_QUERY = `
query ($page: Int, $perPage: Int, $sort: [MediaSort], $countryOfOrigin: CountryCode) {
  Page(page: $page, perPage: $perPage) {
    media(type: MANGA, sort: $sort, isAdult: false, countryOfOrigin: $countryOfOrigin) {
      id
      title { romaji english native }
      description
      genres
      averageScore
      status
      format
      chapters
      countryOfOrigin
      coverImage { extraLarge large color }
      bannerImage
      type
    }
  }
}`;

const SEARCH_QUERY = `
query ($search: String, $page: Int, $perPage: Int) {
  Page(page: $page, perPage: $perPage) {
    media(search: $search, type: MANGA, isAdult: false) {
      id
      title { romaji english native }
      description
      genres
      averageScore
      status
      format
      chapters
      countryOfOrigin
      coverImage { extraLarge large color }
      bannerImage
      type
    }
  }
}`;

const ADVANCED_SEARCH_QUERY = `
query (
  $search: String,
  $genres: [String],
  $status: MediaStatus,
  $chaptersGreater: Int,
  $chaptersLess: Int,
  $sort: [MediaSort],
  $page: Int,
  $perPage: Int,
  $countryOfOrigin: CountryCode
) {
  Page(page: $page, perPage: $perPage) {
    pageInfo {
      total
      currentPage
      lastPage
      perPage
      hasNextPage
    }
    media(
      search: $search,
      type: MANGA,
      isAdult: false,
      genre_in: $genres,
      status: $status,
      chapters_greater: $chaptersGreater,
      chapters_lesser: $chaptersLess,
      sort: $sort,
      countryOfOrigin: $countryOfOrigin
    ) {
      id
      title { romaji english native }
      description
      genres
      averageScore
      status
      format
      chapters
      countryOfOrigin
      coverImage { extraLarge large color }
      bannerImage
      type
    }
  }
}`;

// Filter types
export type MediaStatus = "FINISHED" | "RELEASING" | "NOT_YET_RELEASED" | "CANCELLED";
export type MediaSort = "TRENDING_DESC" | "UPDATED_AT_DESC" | "CHAPTERS_DESC" | "SCORE_DESC" | "POPULARITY_DESC";
/** AniList country: Japan = typical manga, Korea = manhwa, China/Taiwan = manhua. */
export type MangaOriginFilter = "JP" | "KR" | "CN" | "TW";

export interface SearchPageInfo {
  total: number;
  currentPage: number;
  lastPage: number;
  perPage: number;
  hasNextPage: boolean;
}

export interface AdvancedSearchFilters {
  search?: string;
  genres?: string[];
  status?: MediaStatus;
  chaptersGreater?: number;
  chaptersLess?: number;
  sort?: MediaSort[];
  page?: number;
  perPage?: number;
  countryOfOrigin?: MangaOriginFilter;
}

export interface AdvancedSearchPageResult {
  media: AniListMedia[];
  pageInfo: SearchPageInfo;
}

async function anilistFetch(query: string, variables: Record<string, unknown>): Promise<unknown> {
  const res = await fetch("/api/anilist-proxy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`AniList error: ${res.status}`);
  const json = await res.json();
  if (json.errors) {
    console.error("GraphQL errors:", json.errors);
    throw new Error(`AniList GraphQL error: ${json.errors[0]?.message}`);
  }
  return json.data;
}

export async function getTrending(
  countryOfOrigin?: string,
  page = 1,
  perPage = 20
): Promise<AniListMedia[]> {
  const cacheKey = `anilist:trending:${countryOfOrigin || 'all'}:${page}:${perPage}`;
  const now = Date.now();

  try {
    const cachedStr = typeof window !== 'undefined' ? localStorage.getItem(cacheKey) : null;
    if (cachedStr) {
      const cached = JSON.parse(cachedStr);
      if (now - cached.timestamp < 15 * 60 * 1000) {
        return cached.data;
      }
    }
  } catch (err) {
    // ignore parse error
  }

  const variables: Record<string, unknown> = {
    page,
    perPage,
    sort: ["TRENDING_DESC"],
  };
  if (countryOfOrigin) variables.countryOfOrigin = countryOfOrigin;

  const data = (await anilistFetch(TRENDING_QUERY, variables)) as {
    Page: { media: AniListMedia[] };
  };

  try {
    if (typeof window !== 'undefined') {
      localStorage.setItem(cacheKey, JSON.stringify({ timestamp: now, data: data.Page.media }));
    }
  } catch (err) {}

  return data.Page.media;
}

export async function searchManga(
  search: string,
  page = 1,
  perPage = 20
): Promise<AniListMedia[]> {
  const data = (await anilistFetch(SEARCH_QUERY, { search, page, perPage })) as {
    Page: { media: AniListMedia[] };
  };
  return data.Page.media;
}

export async function searchMangaAdvanced(
  filters: AdvancedSearchFilters
): Promise<AdvancedSearchPageResult> {
  const {
    search,
    genres,
    status,
    chaptersGreater,
    chaptersLess,
    sort = ["UPDATED_AT_DESC"],
    page = 1,
    perPage = 35,
    countryOfOrigin,
  } = filters;

  const variables: Record<string, unknown> = {
    page,
    perPage,
    sort,
  };

  if (search) variables.search = search;
  if (genres && genres.length > 0) variables.genres = genres;
  if (status) variables.status = status;
  if (chaptersGreater !== undefined) variables.chaptersGreater = chaptersGreater;
  if (chaptersLess !== undefined) variables.chaptersLess = chaptersLess;
  if (countryOfOrigin) variables.countryOfOrigin = countryOfOrigin;

  const data = (await anilistFetch(ADVANCED_SEARCH_QUERY, variables)) as {
    Page: {
      media: AniListMedia[];
      pageInfo: SearchPageInfo;
    };
  };
  const pg = data.Page;
  return {
    media: pg.media,
    pageInfo: pg.pageInfo ?? {
      total: pg.media.length,
      currentPage: page,
      lastPage: page,
      perPage,
      hasNextPage: false,
    },
  };
}

const IDS_QUERY = `
query ($ids: [Int]) {
  Page(perPage: 50) {
    media(id_in: $ids, type: MANGA) {
      id
      title { romaji english native }
      description
      genres
      averageScore
      status
      format
      chapters
      countryOfOrigin
      coverImage { extraLarge large color }
      bannerImage
      type
    }
  }
}`;

/**
 * Fetch AniList media by a batch of IDs (for the library page).
 */
export async function getMediaByIds(ids: number[]): Promise<AniListMedia[]> {
  if (ids.length === 0) return [];
  const data = (await anilistFetch(IDS_QUERY, { ids })) as {
    Page: { media: AniListMedia[] };
  };
  return data.Page.media;
}

export function getDisplayTitle(media: AniListMedia): string {
  return media.title.english || media.title.romaji;
}

export function getMangaType(media: AniListMedia): "MANGA" | "MANHWA" | "MANHUA" {
  switch (media.countryOfOrigin) {
    case "KR":
      return "MANHWA";
    case "CN":
    case "TW":
      return "MANHUA";
    default:
      return "MANGA";
  }
}

// ── Detailed Media (for title detail page) ──

export interface AniListCharacter {
  id: number;
  name: { full: string };
  image: { medium: string };
  role: string;
}

export interface AniListStaff {
  id: number;
  name: { full: string };
  image: { medium: string };
  role: string;
}

export interface AniListDetailMedia extends AniListMedia {
  synonyms: string[];
  characters: { edges: { node: AniListCharacter; role: string }[] };
  staff: { edges: { node: AniListStaff; role: string }[] };
  recommendations: {
    edges: {
      node: {
        mediaRecommendation: AniListMedia | null;
      };
    }[];
  };
}

const DETAIL_QUERY = `
query ($id: Int) {
  Media(id: $id, type: MANGA) {
    id
    title { romaji english native }
    description
    genres
    averageScore
    status
    format
    chapters
    countryOfOrigin
    coverImage { extraLarge large color }
    bannerImage
    type
    synonyms
    characters(sort: [ROLE, RELEVANCE], perPage: 12) {
      edges {
        node {
          id
          name { full }
          image { medium }
        }
        role
      }
    }
    staff(sort: [RELEVANCE], perPage: 8) {
      edges {
        node {
          id
          name { full }
          image { medium }
        }
        role
      }
    }
    recommendations(sort: [RATING_DESC], perPage: 6) {
      edges {
        node {
          mediaRecommendation {
            id
            title { romaji english native }
            description
            genres
            averageScore
            status
            format
            chapters
            countryOfOrigin
            coverImage { extraLarge large color }
            bannerImage
            type
          }
        }
      }
    }
  }
}`;

export async function getMangaDetail(id: number): Promise<AniListDetailMedia> {
  const data = (await anilistFetch(DETAIL_QUERY, { id })) as {
    Media: AniListDetailMedia;
  };
  return data.Media;
}
