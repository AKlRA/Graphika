// ── AniList GraphQL API ──

const ANILIST_URL = "https://graphql.anilist.co";

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

async function anilistFetch(query: string, variables: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(ANILIST_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`AniList error: ${res.status}`);
  const json = await res.json();
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
