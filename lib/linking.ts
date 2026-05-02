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
  const searchPasses: { title: string; requireEn: boolean }[] = [];
  for (const title of titlesToTry) {
    searchPasses.push({ title, requireEn: true });
  }
  for (const title of titlesToTry) {
    searchPasses.push({ title, requireEn: false });
  }

  let bestMatch: MangaDexManga | null = null;
  let bestScore = 0;

  for (const { title: searchTitle, requireEn } of searchPasses) {
    try {
      const results = await searchMangaDex(searchTitle, 25, {
        requireEn,
      });
      if (results.length === 0) continue;

      for (const manga of results) {
        if (confirmAniListLink(manga, anilistId)) {
          const mdTitle = getMangaDexTitle(manga);
          return {
            mangadexId: manga.id,
            mangadexTitle: mdTitle,
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
    } catch (err) {
      console.error(`MangaDex link failed for "${searchTitle}":`, err);
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
 * Uses ALL title variants (english, romaji, synonyms) searched SEQUENTIALLY.
 * Stops early on the first source that returns chapters > 0.
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
  // After MangaDex: katana → MangaKakalot / Manganato (HTML readers) before generic mirrors (e.g. weebcentral).
  // No mangapill / mangaplus here — low priority for in-app reading; user can still use other Comick sources below.
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

  // Search each title variant sequentially — stop early on success
  for (const searchTitle of titleVariants) {
    for (const source of sourcesToTry) {
      try {
        const results = await comickSearch(searchTitle, source);
        if (results.length === 0) continue;

        // Score and sort candidates for this source
        const candidates: { manga: ComickManga; score: number }[] = [];
        for (const manga of results) {
          // Score against ALL title variants for best match
          let bestScore = 0;
          for (const variant of titleVariants) {
            const score = matchScore(variant, manga.title);
            if (score > bestScore) bestScore = score;
          }
          candidates.push({ manga, score: bestScore });
        }

        candidates.sort((a, b) => b.score - a.score);

        for (const candidate of candidates) {
          if (candidate.score < 40) continue;
          if (testedUrls.has(candidate.manga.url)) continue;
          testedUrls.add(candidate.manga.url);

          // Verify chapters exist
          const chapters = await comickChapters(candidate.manga.url, source);

          if (chapters && chapters.length > 0) {
            console.log(
              `Found working Comick source: ${source} for "${candidate.manga.title}" via search "${searchTitle}" (${chapters.length} chapters)`
            );
            return {
              comixUrl: candidate.manga.url,
              comixTitle: candidate.manga.title,
              comixSource: source,
            };
          }
        }
      } catch (err) {
        console.error(
          `Comick link failed for "${searchTitle}" on ${source}:`,
          err
        );
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

  const [mdResult, ckResult] = await Promise.all([
    linkMangaDexId(titleEnglish, titleRomaji, titleNative, synonyms, anilistId),
    linkComickUrl(titleEnglish, titleRomaji, titleNative, synonyms),
  ]);

  const ids: MangaIds = {
    mangadexId: mdResult.mangadexId,
    comixUrl: ckResult.comixUrl,
    comixSource: ckResult.comixSource,
    comickFailed: !ckResult.comixUrl, // mark failed if no URL found
    cachedAt: Date.now(),
    v: 6,
  };

  setMangaIds(anilistId, ids);

  return ids;
}
