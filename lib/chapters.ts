// ── Chapter Aggregation Engine ──
// The core data pipeline: fetch → normalize → merge → resolve → cache

import {
  fetchMangaDexChapters,
  type MangaDexChapter,
} from "./api/mangadex";
import { comickChapters, type ComickChapter } from "./api/comick";
import { getItem, setItem } from "./storage";
import type { ScanlatorPrefs } from "./storage";

type IdLinkFields = {
  v?: number;
  mangadexId?: string;
  comixUrl?: string;
  comixSource?: string;
};

// ── Types ──

export type ChapterSource = string;

export type ChapterType = "readable" | "external";

export interface ChapterEntry {
  chapterNumber: number;
  chapterString: string; // original string, e.g. "11.5"
  title: string | null;
  source: ChapterSource;
  scanlationGroup: string;
  chapterId: string; // MangaDex chapter UUID or Comick URL
  sourceUrl: string; // for Comick, the chapter URL
  uploadedAt: string;
  pageCount?: number;
  type: ChapterType;
  externalUrl?: string; // URL to open in browser for external chapters
}

export interface ChapterGroup {
  chapterNumber: number;
  chapterString: string;
  versions: ChapterEntry[];
  activeVersion: ChapterEntry;
}

export interface CachedChapterData {
  data: ChapterGroup[];
  allScanlators: string[];
  cachedAt: number;
  /** When this matches current linked IDs, a fresh chapter list cache can be trusted. */
  idsFingerprint?: string;
}

/** Fingerprint of linkage + scanlator prefs when the chapter list was built. */
export function chapterIdsFingerprint(
  ids: IdLinkFields,
  scanlatorPrefs?: ScanlatorPrefs
): string {
  const p1 = scanlatorPrefs?.p1 ?? "";
  const p2 = scanlatorPrefs?.p2 ?? "";
  return `${ids.v ?? 0}|${ids.mangadexId ?? ""}|${ids.comixUrl ?? ""}|${ids.comixSource ?? ""}|${p1}|${p2}`;
}

// ── Normalization ──

function normalizeMangaDexChapters(
  chapters: MangaDexChapter[]
): ChapterEntry[] {
  return chapters
    .filter((ch) => ch.attributes.chapter !== null)
    .map((ch) => {
      const group = ch.relationships.find((r) => r.type === "scanlation_group");
      const groupName = group?.attributes?.name || "Unknown Group";

      // Detect externally-hosted chapters (e.g. MangaPlus exclusives)
      const isExternal = !!ch.attributes.externalUrl || ch.attributes.pages === 0;

      return {
        chapterNumber: parseFloat(ch.attributes.chapter!),
        chapterString: ch.attributes.chapter!,
        title: ch.attributes.title,
        source: "mangadex" as ChapterSource,
        scanlationGroup: groupName,
        chapterId: ch.id,
        sourceUrl: `https://mangadex.org/chapter/${ch.id}`,
        uploadedAt: ch.attributes.publishAt,
        pageCount: ch.attributes.pages,
        type: isExternal ? "external" as ChapterType : "readable" as ChapterType,
        externalUrl: ch.attributes.externalUrl || (isExternal ? `https://mangadex.org/chapter/${ch.id}` : undefined),
      };
    })
    .filter((ch) => !isNaN(ch.chapterNumber));
}

/** MangaPlus is canvas/encrypted — not HTML-scrapable; open in browser. */
function isMangaPlusChapter(source: string, chapterUrl: string): boolean {
  const s = source.toLowerCase();
  if (s === "mangaplus" || s === "manga_plus") return true;
  try {
    const h = new URL(chapterUrl).hostname.toLowerCase();
    return h.includes("mangaplus");
  } catch {
    return false;
  }
}

function normalizeComickChapters(
  chapters: ComickChapter[],
  source: string
): ChapterEntry[] {
  return chapters
    .filter((ch) => ch.number !== null && ch.number !== undefined)
    .map((ch) => {
      const plus = isMangaPlusChapter(source, ch.url);
      return {
        chapterNumber:
          typeof ch.number === "string" ? parseFloat(ch.number) : ch.number,
        chapterString: String(ch.number),
        title: ch.title || null,
        source: source as ChapterSource,
        scanlationGroup: source.charAt(0).toUpperCase() + source.slice(1),
        chapterId: ch.url,
        sourceUrl: ch.url,
        uploadedAt: ch.date || "",
        pageCount: undefined,
        type: (plus ? "external" : "readable") as ChapterType,
        externalUrl: plus ? ch.url : undefined,
      };
    })
    .filter((ch) => !isNaN(ch.chapterNumber));
}

// ── Merge + Dedup ──

function mergeChapterLists(
  ...lists: ChapterEntry[][]
): Map<number, ChapterEntry[]> {
  const grouped = new Map<number, ChapterEntry[]>();

  for (const list of lists) {
    for (const entry of list) {
      const num = entry.chapterNumber;
      if (!grouped.has(num)) {
        grouped.set(num, []);
      }

      const existing = grouped.get(num)!;

      // If this is an external entry (e.g. MangaPlus on MangaDex), skip it
      // if a readable version already exists for this chapter number.
      if (entry.type === "external") {
        const hasReadable = existing.some((e) => e.type === "readable");
        if (hasReadable) continue;
      }

      // Deduplicate: don't add if same source + same scanlator already exists
      const isDupe = existing.some(
        (e) =>
          e.source === entry.source &&
          e.scanlationGroup === entry.scanlationGroup
      );
      if (!isDupe) {
        existing.push(entry);
      }
    }
  }

  return grouped;
}

// ── Version Resolution ──

/** Lower rank = preferred default when multiple hosts have the same chapter. */
function comickSourcePriorityRank(source: string): number {
  const order = [
    "mangadex",
    "mangakatana",
    "mangakakalot",
    "manganato",
    "comix",
    "asurascans",
    "flamecomics",
    "mangacloud",
    "weebcentral",
    "mangapill",
    "mangaplus",
  ];
  const idx = order.indexOf(source.toLowerCase());
  return idx === -1 ? 50 : idx;
}

function resolveActiveVersion(
  versions: ChapterEntry[],
  prefs: ScanlatorPrefs
): ChapterEntry {
  // Priority 1 scanlator match
  if (prefs.p1) {
    const p1Match = versions.find(
      (v) => v.scanlationGroup.toLowerCase() === prefs.p1!.toLowerCase()
    );
    if (p1Match) return p1Match;
  }

  // Priority 2 scanlator match
  if (prefs.p2) {
    const p2Match = versions.find(
      (v) => v.scanlationGroup.toLowerCase() === prefs.p2!.toLowerCase()
    );
    if (p2Match) return p2Match;
  }

  // Prefer any in-site readable host over external-only, then source priority, then recency
  const readables = versions.filter((v) => v.type === "readable");
  const pool = readables.length > 0 ? readables : versions;

  const sorted = [...pool].sort((a, b) => {
    const rankDiff =
      comickSourcePriorityRank(a.source) - comickSourcePriorityRank(b.source);
    if (rankDiff !== 0) return rankDiff;
    return (
      new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
    );
  });
  return sorted[0];
}

// ── Main Pipeline ──

export async function aggregateChapters(
  mangadexId: string | undefined,
  comixUrl: string | undefined,
  scanlatorPrefs: ScanlatorPrefs = {},
  comixSource?: string
): Promise<{ groups: ChapterGroup[]; allScanlators: string[] }> {
  const fetchPromises: Promise<ChapterEntry[]>[] = [];

  // MangaDex fetch
  if (mangadexId) {
    fetchPromises.push(
      fetchMangaDexChapters(mangadexId)
        .then(normalizeMangaDexChapters)
        .catch((err) => {
          console.error("MangaDex fetch failed:", err);
          return [] as ChapterEntry[];
        })
    );
  }

  // Comick fetch — pass the actual source that was linked
  if (comixUrl) {
    const src = comixSource || "comix";
    fetchPromises.push(
      comickChapters(comixUrl, src)
        .then((chs) => normalizeComickChapters(chs, src))
        .catch((err) => {
          console.error("Comick fetch failed:", err);
          return [] as ChapterEntry[];
        })
    );
  }

  const results = await Promise.all(fetchPromises);
  const merged = mergeChapterLists(...results);

  // Collect all unique scanlator names
  const allScanlators = new Set<string>();
  for (const versions of merged.values()) {
    for (const v of versions) {
      allScanlators.add(v.scanlationGroup);
    }
  }

  // Build sorted chapter groups
  const groups: ChapterGroup[] = [];
  const sortedNumbers = Array.from(merged.keys()).sort((a, b) => a - b);

  for (const num of sortedNumbers) {
    const versions = merged.get(num)!;
    const activeVersion = resolveActiveVersion(versions, scanlatorPrefs);
    groups.push({
      chapterNumber: num,
      chapterString: activeVersion.chapterString,
      versions,
      activeVersion,
    });
  }

  return {
    groups,
    allScanlators: Array.from(allScanlators).sort(),
  };
}

// ── Caching ──

export const CHAPTER_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

export function getCachedChapters(anilistId: number): CachedChapterData | null {
  const cached = getItem<CachedChapterData | null>(`manga:${anilistId}:chapters`, null);
  return cached;
}

export function setCachedChapters(
  anilistId: number,
  data: ChapterGroup[],
  allScanlators: string[],
  idsFingerprint?: string
): void {
  const cacheData: CachedChapterData = {
    data,
    allScanlators,
    cachedAt: Date.now(),
    ...(idsFingerprint !== undefined ? { idsFingerprint } : {}),
  };
  setItem(`manga:${anilistId}:chapters`, cacheData);
}
