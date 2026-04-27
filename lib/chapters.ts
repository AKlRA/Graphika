// ── Chapter Aggregation Engine ──
// The core data pipeline: fetch → normalize → merge → resolve → cache

import {
  fetchMangaDexChapters,
  type MangaDexChapter,
} from "./api/mangadex";
import { comickChapters, type ComickChapter } from "./api/comick";
import { getItem, setItem } from "./storage";
import type { ScanlatorPrefs } from "./storage";

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

function normalizeComickChapters(
  chapters: ComickChapter[],
  source: string
): ChapterEntry[] {
  return chapters
    .filter((ch) => ch.number !== null && ch.number !== undefined)
    .map((ch) => ({
      chapterNumber: typeof ch.number === "string" ? parseFloat(ch.number) : ch.number,
      chapterString: String(ch.number),
      title: ch.title || null,
      source: source as ChapterSource,
      scanlationGroup: source.charAt(0).toUpperCase() + source.slice(1),
      chapterId: ch.url,
      sourceUrl: ch.url,
      uploadedAt: ch.date || "",
      pageCount: undefined,
      type: "external" as ChapterType, // Comick has no image API — always external
      externalUrl: ch.url,
    }))
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

      // If this is a Comick (external) entry, only add it if no readable
      // MangaDex version exists for this chapter number. This prevents
      // cluttering the list with external duplicates.
      if (entry.type === "external" && entry.source !== "mangadex") {
        const hasReadableMd = existing.some(
          (e) => e.source === "mangadex" && e.type === "readable"
        );
        if (hasReadableMd) continue; // Skip — MD already covers this chapter
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

  // Prefer MangaDex over Comick
  const mdVersion = versions.find((v) => v.source === "mangadex");
  if (mdVersion) return mdVersion;

  // Most recent upload
  const sorted = [...versions].sort(
    (a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
  );
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

const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

export function getCachedChapters(anilistId: number): CachedChapterData | null {
  const cached = getItem<CachedChapterData | null>(`manga:${anilistId}:chapters`, null);
  return cached;
}

export function setCachedChapters(
  anilistId: number,
  data: ChapterGroup[],
  allScanlators: string[]
): void {
  const cacheData: CachedChapterData = {
    data,
    allScanlators,
    cachedAt: Date.now(),
  };
  setItem(`manga:${anilistId}:chapters`, cacheData);
}
