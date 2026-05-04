// ── ID Linking: AniList ↔ MangaDex ↔ Comick ──

import {
  searchMangaDex,
  confirmAniListLink,
  type MangaDexManga,
} from "./api/mangadex";
import {
  comickSearch,
  comickChapters,
  type ComickManga,
} from "./api/comick";
import { getMangaIds, setMangaIds, type MangaIds } from "./storage";

// ── Normalization helpers ──

const COMMON_WORDS = new Set(["the", "a", "an", "of", "and", "in", "to", "no", "wa", "ga", "wo"]);
const SEASON_RE = /\b(season|part|arc|cour|volume|vol)\s*\.?\s*\d+/gi;
const PAREN_RE = /\([^)]*\)/g;

/**
 * Aggressively normalize a title for comparison.
 * Strips punctuation, common articles, season suffixes, parentheticals.
 */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(PAREN_RE, "")       // remove parentheticals
    .replace(SEASON_RE, "")      // remove "Season 2", "Part 3", etc.
    .replace(/[^a-z0-9\s]/g, "") // strip all punctuation
    .split(/\s+/)
    .filter((w) => w.length > 0 && !COMMON_WORDS.has(w))
    .join(" ")
    .trim();
}

/**
 * Score how well two titles match (higher = better).
 * Uses lenient normalization.
 */
function matchScore(query: string, candidate: string): number {
  const nq = normalize(query);
  const nc = normalize(candidate);

  if (!nq || !nc) return 0;
  if (nq === nc) return 100;

  // One contains the other entirely
  if (nc.includes(nq) || nq.includes(nc)) return 80;

  // Word-level overlap
  const qWords = nq.split(/\s+/);
  const cWords = new Set(nc.split(/\s+/));
  const overlap = qWords.filter((w) => cWords.has(w)).length;
  const total = Math.max(qWords.length, 1);
  const pct = Math.round((overlap / total) * 70);

  return pct;
}

export interface LinkResult {
  mangadexId?: string;
  mangadexTitle?: string;
  comixUrl?: string;
  comixTitle?: string;
  comixSource?: string;
  confirmed: boolean;
}

/**
 * Build a priority-ordered list of title variants to search.
 * Order: english → romaji → each synonym (deduped).
 */
function buildTitleVariants(
  titleEnglish: string | null,
  titleRomaji: string,
  titleNative: string | null = null,
  synonyms: string[] = []
): string[] {
  const raw = [titleEnglish, titleRomaji, titleNative, ...synonyms];
  const seen = new Set<string>();
  const result: string[] = [];

  for (const t of raw) {
    if (!t || t.length === 0) continue;
    const key = t.toLowerCase().trim();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(t);
  }

  return result;
}

/**
 * Search MangaDex by title and try to find the best match.
 * Tries both English and romaji titles.
 */
export async function linkMangaDexId(
  titleEnglish: string | null,
  titleRomaji: string,
  titleNative: string | null,
  synonyms: string[],
  anilistId: number
): Promise<{
  mangadexId?: string;
  mangadexTitle?: string;
  confirmed: boolean;
}> {
  const titlesToTry = buildTitleVariants(titleEnglish, titleRomaji, titleNative, synonyms);
  
  let bestMatch: MangaDexManga | null = null;
  let bestScore = 0;

  // Pass 1: English-only search (most common case)
  for (const title of titlesToTry.slice(0, 2)) { // Try only first 2 variants with EN filter
    try {
      const results = await searchMangaDex(title, 15, { requireEn: true });
      if (results.length === 0) continue;

      // Check for confirmed AniList link first
      for (const manga of results) {
        if (confirmAniListLink(manga, anilistId)) {
          return {
            mangadexId: manga.id,
            mangadexTitle: getMangaDexTitle(manga),
            confirmed: true,
          };
        }
      }

      // Track best fuzzy match
      for (const manga of results) {
        const mdTitle = getMangaDexTitle(manga);
        for (const t of titlesToTry) {
          const score = matchScore(t, mdTitle);
          if (score > bestScore) {
            bestScore = score;
            bestMatch = manga;
          }
        }
      }

      // If we have a strong match, no need to keep searching
      if (bestScore >= 80) break;
    } catch (err) {
      console.error(`MangaDex link failed for "${title}":`, err);
    }
  }

  // Pass 2: All-language search (only if Pass 1 didn't find a confirmed or strong match)
  if (!bestMatch || bestScore < 80) {
    for (const title of titlesToTry.slice(0, 2)) {
      try {
        const results = await searchMangaDex(title, 15, { requireEn: false });
        if (results.length === 0) continue;

        for (const manga of results) {
          if (confirmAniListLink(manga, anilistId)) {
            return {
              mangadexId: manga.id,
              mangadexTitle: getMangaDexTitle(manga),
              confirmed: true,
            };
          }
        }

        for (const manga of results) {
          const mdTitle = getMangaDexTitle(manga);
          for (const t of titlesToTry) {
            const score = matchScore(t, mdTitle);
            if (score > bestScore) {
              bestScore = score;
              bestMatch = manga;
            }
          }
        }

        if (bestScore >= 80) break;
      } catch (err) {
        console.error(`MangaDex link (all-lang) failed for "${title}":`, err);
      }
    }
  }

  if (bestMatch && bestScore >= 52) {
    return {
      mangadexId: bestMatch.id,
      mangadexTitle: getMangaDexTitle(bestMatch),
      confirmed: false,
    };
  }

  return { confirmed: false };
}

function getMangaDexTitle(manga: MangaDexManga): string {
  const titles = manga.attributes.title;
  return (
    titles.en ||
    titles["ja-ro"] ||
    titles.ja ||
    Object.values(titles)[0] ||
    "Unknown"
  );
}

/**
 * Search Comick aggregator across multiple sources for a title.
 * Strategy: search ALL sources in parallel for each title variant,
 * stop at the first variant that yields a working result.
 * Much faster than the old sequential approach.
 */
export async function linkComickUrl(
  titleEnglish: string | null,
  titleRomaji: string,
  titleNative: string | null,
  synonyms: string[] = []
): Promise<{
  comixUrl?: string;
  comixTitle?: string;
  comixSource?: string;
}> {
  const titleVariants = buildTitleVariants(titleEnglish, titleRomaji, titleNative, synonyms);
  const sourcesToTry = [
    "mangakatana",
    "mangakakalot",
    "manganato",
    "comix",
    "asurascans",
    "flamecomics",
    "mangacloud",
    "weebcentral",
  ];
  const testedUrls = new Set<string>();

  // For each title variant, search ALL sources in parallel
  for (const searchTitle of titleVariants) {
    // Fire all source searches at once
    const searchResults = await Promise.allSettled(
      sourcesToTry.map(async (source) => {
        try {
          const results = await comickSearch(searchTitle, source);
          return { source, results };
        } catch {
          return { source, results: [] as ComickManga[] };
        }
      })
    );

    // Collect all candidates from all sources, scored and sorted
    const allCandidates: { manga: ComickManga; score: number; source: string }[] = [];

    for (const result of searchResults) {
      if (result.status !== "fulfilled") continue;
      const { source, results } = result.value;
      if (results.length === 0) continue;

      for (const manga of results.slice(0, 3)) { // top 3 per source max
        let bestScore = 0;
        for (const variant of titleVariants) {
          const score = matchScore(variant, manga.title);
          if (score > bestScore) bestScore = score;
        }
        if (bestScore >= 40) {
          allCandidates.push({ manga, score: bestScore, source });
        }
      }
    }

    // Sort by score descending, then by source priority
    allCandidates.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return sourcesToTry.indexOf(a.source) - sourcesToTry.indexOf(b.source);
    });

    // Verify chapters for top candidates only (max 3 verifications)
    let verified = 0;
    for (const candidate of allCandidates) {
      if (verified >= 3) break;
      if (testedUrls.has(candidate.manga.url)) continue;
      testedUrls.add(candidate.manga.url);
      verified++;

      try {
        const chapters = await comickChapters(candidate.manga.url, candidate.source);
        if (chapters && chapters.length > 0) {
          console.log(
            `Found working Comick source: ${candidate.source} for "${candidate.manga.title}" via search "${searchTitle}" (${chapters.length} chapters)`
          );
          return {
            comixUrl: candidate.manga.url,
            comixTitle: candidate.manga.title,
            comixSource: candidate.source,
          };
        }
      } catch (err) {
        console.error(`Comick chapter verify failed for "${candidate.manga.title}" on ${candidate.source}:`, err);
      }
    }
  }

  return {};
}

/**
 * Full linking pipeline: link both MangaDex and Comick for an AniList title.
 * Results are cached in localStorage with a version flag.
 */
export async function linkAllSources(
  anilistId: number,
  titleEnglish: string | null,
  titleRomaji: string,
  titleNative: string | null,
  synonyms: string[] = []
): Promise<MangaIds> {
  const cached = getMangaIds(anilistId);

  // Bust cache if v < 6 or if comickFailed and 24 hours have elapsed
  let useCache = false;
  if (cached.v === 6) {
    useCache = true;
    if (cached.comickFailed && cached.cachedAt) {
      const hoursElapsed = (Date.now() - cached.cachedAt) / (1000 * 60 * 60);
      if (hoursElapsed > 24) {
        useCache = false;
      }
    }
  }

  if (useCache) {
    return cached;
  }

  const LINK_TIMEOUT_MS = 15_000; // 15 seconds max for linking

  try {
    const linkingPromise = Promise.all([
      linkMangaDexId(titleEnglish, titleRomaji, titleNative, synonyms, anilistId),
      linkComickUrl(titleEnglish, titleRomaji, titleNative, synonyms),
    ]);

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Linking timed out")), LINK_TIMEOUT_MS)
    );

    const [mdResult, ckResult] = await Promise.race([linkingPromise, timeoutPromise]) as [
      Awaited<ReturnType<typeof linkMangaDexId>>,
      Awaited<ReturnType<typeof linkComickUrl>>
    ];

    const ids: MangaIds = {
      mangadexId: mdResult.mangadexId,
      comixUrl: ckResult.comixUrl,
      comixSource: ckResult.comixSource,
      comickFailed: !ckResult.comixUrl,
      cachedAt: Date.now(),
      v: 6,
    };

    setMangaIds(anilistId, ids);
    return ids;
  } catch (err) {
    console.error("linkAllSources failed or timed out:", err);
    // Return whatever is currently stored rather than blocking forever
    return cached;
  }
}
