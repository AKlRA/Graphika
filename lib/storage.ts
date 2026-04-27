// ── localStorage Wrapper ──

"use client";

export function getItem<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function setItem<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage full — silently fail
  }
}

export function removeItem(key: string): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(key);
}

// ── Typed helpers ──

export interface MangaIds {
  mangadexId?: string;
  comixUrl?: string;
  comixSource?: string;
  flameUrl?: string;
  comickFailed?: boolean;
  cachedAt?: number;
  v?: number;
}

export interface ReadingProgress {
  chapter: number;
  page: number;
  updatedAt: string;
}

export interface ScanlatorPrefs {
  p1?: string;
  p2?: string;
}

export interface Settings {
  readerMode: "webtoon" | "paged";
  imageQuality: "original" | "datasaver";
}

export function getMangaIds(anilistId: number): MangaIds {
  return getItem<MangaIds>(`manga:${anilistId}:ids`, {});
}

export function setMangaIds(anilistId: number, ids: MangaIds): void {
  setItem(`manga:${anilistId}:ids`, ids);
}

export function getProgress(anilistId: number): ReadingProgress | null {
  return getItem<ReadingProgress | null>(`manga:${anilistId}:progress`, null);
}

export function setProgress(anilistId: number, progress: ReadingProgress): void {
  setItem(`manga:${anilistId}:progress`, progress);
}

export function getLibrary(): number[] {
  return getItem<number[]>("library", []);
}

export function addToLibrary(anilistId: number): void {
  const lib = getLibrary();
  if (!lib.includes(anilistId)) {
    lib.unshift(anilistId);
    setItem("library", lib);
  }
}

export function removeFromLibrary(anilistId: number): void {
  const lib = getLibrary().filter((id) => id !== anilistId);
  setItem("library", lib);
}

export function isInLibrary(anilistId: number): boolean {
  return getLibrary().includes(anilistId);
}

export function getSettings(): Settings {
  return getItem<Settings>("settings", {
    readerMode: "webtoon",
    imageQuality: "original",
  });
}

export function setSettings(settings: Settings): void {
  setItem("settings", settings);
}
