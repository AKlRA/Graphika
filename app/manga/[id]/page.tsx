"use client";

import { useEffect, useState, useCallback, use } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  BookmarkPlus,
  BookmarkCheck,
  ChevronDown,
  ChevronUp,
  Play,
  Settings,
} from "lucide-react";

import {
  getMangaDetail,
  getDisplayTitle,
  getMangaType,
  type AniListDetailMedia,
} from "@/lib/api/anilist";
import {
  aggregateChapters,
  getCachedChapters,
  setCachedChapters,
  type ChapterGroup,
} from "@/lib/chapters";
import { linkAllSources } from "@/lib/linking";
import {
  getProgress,
  isInLibrary,
  addToLibrary,
  removeFromLibrary,
  getItem,
  setItem,
  type ScanlatorPrefs,
  type ReadingProgress,
  type MangaIds,
} from "@/lib/storage";

import BottomNav from "@/components/BottomNav";
import ScoreArc from "@/components/ScoreArc";
import ChapterList from "@/components/ChapterList";
import BottomSheet from "@/components/BottomSheet";

// ── Characters + Staff Panel ──
function CharacterStaffPanel({ media }: { media: AniListDetailMedia }) {
  const characters = media.characters?.edges || [];
  const staff = media.staff?.edges || [];

  if (characters.length === 0 && staff.length === 0) return null;

  return (
    <div className="glass p-4 mt-4">
      {characters.length > 0 && (
        <>
          <h3
            className="text-sm font-bold text-text-primary mb-3"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Characters
          </h3>
          <div className="grid grid-cols-2 gap-2 mb-4">
            {characters.slice(0, 8).map((edge) => (
              <div
                key={edge.node.id}
                className="flex items-center gap-2 p-2 rounded-lg"
                style={{ background: "rgba(255,255,255,0.03)" }}
              >
                <Image
                  src={edge.node.image.medium}
                  alt={edge.node.name.full}
                  width={36}
                  height={36}
                  className="rounded-lg object-cover"
                  style={{ width: 36, height: 36 }}
                />
                <div className="min-w-0">
                  <p className="text-xs text-text-primary truncate font-medium">
                    {edge.node.name.full}
                  </p>
                  <p className="text-[10px] text-text-muted uppercase">
                    {edge.role}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {staff.length > 0 && (
        <>
          <h3
            className="text-sm font-bold text-text-primary mb-3"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Staff
          </h3>
          <div className="grid grid-cols-2 gap-2">
            {staff.slice(0, 6).map((edge) => (
              <div
                key={edge.node.id}
                className="flex items-center gap-2 p-2 rounded-lg"
                style={{ background: "rgba(255,255,255,0.03)" }}
              >
                <Image
                  src={edge.node.image.medium}
                  alt={edge.node.name.full}
                  width={36}
                  height={36}
                  className="rounded-lg object-cover"
                  style={{ width: 36, height: 36 }}
                />
                <div className="min-w-0">
                  <p className="text-xs text-text-primary truncate font-medium">
                    {edge.node.name.full}
                  </p>
                  <p className="text-[10px] text-text-muted truncate">
                    {edge.role}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Skeleton detail page ──
function DetailSkeleton() {
  return (
    <div className="min-h-dvh" style={{ background: "var(--bg-base)" }}>
      <div className="skeleton w-full" style={{ height: 200 }} />
      <div className="px-4 -mt-16 relative z-10">
        <div className="flex gap-4 items-end">
          <div className="skeleton w-28 h-40 rounded-xl flex-shrink-0" />
          <div className="flex-1 pb-2">
            <div className="skeleton h-5 w-48 rounded mb-2" />
            <div className="skeleton h-3 w-32 rounded mb-3" />
            <div className="flex gap-2">
              <div className="skeleton h-6 w-16 rounded-full" />
              <div className="skeleton h-6 w-20 rounded-full" />
              <div className="skeleton h-6 w-14 rounded-full" />
            </div>
          </div>
        </div>
        <div className="skeleton h-10 w-full rounded-xl mt-4" />
        <div className="skeleton h-10 w-full rounded-xl mt-2" />
        <div className="skeleton h-16 w-full rounded-xl mt-4" />
        <div className="mt-6 glass p-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="skeleton h-14 w-full rounded-lg mb-2" />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main Page ──
export default function MangaDetailPage({
  params: paramsPromise,
}: {
  params: Promise<{ id: string }>;
}) {
  const params = use(paramsPromise);
  const router = useRouter();
  const anilistId = parseInt(params.id, 10);

  const [media, setMedia] = useState<AniListDetailMedia | null>(null);
  const [chapters, setChapters] = useState<ChapterGroup[]>([]);
  const [allScanlators, setAllScanlators] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [chaptersLoading, setChaptersLoading] = useState(true);
  const [inLibrary, setInLibrary] = useState(false);
  const [synopsisExpanded, setSynopsisExpanded] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [readProgress, setReadProgress] = useState<ReadingProgress | null>(null);
  const [scanlatorPrefs, setScanlatorPrefs] = useState<ScanlatorPrefs>({});
  const [ids, setIds] = useState<MangaIds>({});

  // Load metadata
  useEffect(() => {
    async function loadMedia() {
      try {
        setLoading(true);
        const detail = await getMangaDetail(anilistId);
        setMedia(detail);
      } catch (err) {
        console.error("Failed to load manga detail:", err);
      } finally {
        setLoading(false);
      }
    }
    loadMedia();
    setInLibrary(isInLibrary(anilistId));
    setReadProgress(getProgress(anilistId));
    setScanlatorPrefs(
      getItem<ScanlatorPrefs>(`manga:${anilistId}:scanlators`, {})
    );
  }, [anilistId]);

  // Load chapters after media is loaded
  useEffect(() => {
    if (!media) return;

    async function loadChapters() {
      setChaptersLoading(true);

      // Check cache first
      const cached = getCachedChapters(anilistId);
      let isStale = false;
      if (cached) {
        setChapters(cached.data);
        setAllScanlators(cached.allScanlators);
        setChaptersLoading(false);
        const age = Date.now() - cached.cachedAt;
        if (age < 30 * 60 * 1000) {
          return;
        }
        isStale = true;
      }

      if (!isStale) setChaptersLoading(true);

      // Link sources
      const linkedIds = await linkAllSources(
        anilistId,
        media!.title.english,
        media!.title.romaji,
        media!.title.native,
        media!.synonyms || []
      );
      setIds(linkedIds);

      // Aggregate chapters — pass comixSource so correct backend is queried
      const result = await aggregateChapters(
        linkedIds.mangadexId,
        linkedIds.comixUrl,
        scanlatorPrefs,
        linkedIds.comixSource
      );

      setChapters(result.groups);
      setAllScanlators(result.allScanlators);

      // Cache
      setCachedChapters(anilistId, result.groups, result.allScanlators);

      if (!isStale) setChaptersLoading(false);
    }

    loadChapters();
  }, [media, anilistId, scanlatorPrefs]);

  const handleLibraryToggle = useCallback(() => {
    if (inLibrary) {
      removeFromLibrary(anilistId);
    } else {
      addToLibrary(anilistId);
    }
    setInLibrary(!inLibrary);
  }, [inLibrary, anilistId]);

  const handleChapterSelect = useCallback(
    (group: ChapterGroup) => {
      const active = group.activeVersion;
      // External chapters open in browser, not the reader
      if (active.type === "external" && active.externalUrl) {
        window.open(active.externalUrl, '_blank', 'noopener,noreferrer');
        return;
      }
      const source = active.source;
      const chId = encodeURIComponent(active.chapterId);
      router.push(
        `/manga/${anilistId}/read?ch=${group.chapterNumber}&source=${source}&chId=${chId}`
      );
    },
    [anilistId, router]
  );

  const handleScanlatorSave = useCallback(
    (prefs: ScanlatorPrefs) => {
      setScanlatorPrefs(prefs);
      setItem(`manga:${anilistId}:scanlators`, prefs);
      // Force re-aggregate with new prefs
      setChaptersLoading(true);
      // Clear cache to re-resolve
      setItem(`manga:${anilistId}:chapters`, null);
    },
    [anilistId]
  );

  if (loading) return <DetailSkeleton />;
  if (!media) {
    return (
      <div className="min-h-dvh flex items-center justify-center" style={{ background: "var(--bg-base)" }}>
        <p className="text-text-muted text-sm">Manga not found</p>
      </div>
    );
  }

  const title = getDisplayTitle(media);
  const type = getMangaType(media);
  const bannerUrl = media.bannerImage || media.coverImage.extraLarge;
  const coverUrl = media.coverImage.extraLarge || media.coverImage.large;
  const altTitle = media.title.english
    ? media.title.romaji
    : media.synonyms?.[0] || "";

  // Find first unread *readable* chapter (skip externals)
  const firstUnread = chapters.find(
    (g) => g.chapterNumber > (readProgress?.chapter ?? 0) && g.activeVersion.type === "readable"
  );
  const startChapter = firstUnread || chapters.find((g) => g.activeVersion.type === "readable") || chapters[0];

  return (
    <motion.div
      className="min-h-dvh"
      style={{ background: "var(--bg-base)" }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25 }}
    >
      {/* Banner */}
      <div className="relative w-full" style={{ height: 200 }}>
        <Image
          src={bannerUrl}
          alt={title}
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(to bottom, rgba(10,10,15,0.4) 0%, rgba(10,10,15,0.95) 100%)",
          }}
        />
        {/* Back button */}
        <button
          onClick={() => router.back()}
          className="absolute top-4 left-4 z-10 w-10 h-10 rounded-full flex items-center justify-center"
          style={{
            background: "rgba(10,10,15,0.6)",
            backdropFilter: "blur(8px)",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <ArrowLeft size={18} className="text-text-primary" />
        </button>
        {/* Settings gear */}
        <button
          onClick={() => setSettingsOpen(true)}
          className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full flex items-center justify-center"
          style={{
            background: "rgba(10,10,15,0.6)",
            backdropFilter: "blur(8px)",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <Settings size={18} className="text-text-primary" />
        </button>
      </div>

      {/* Content */}
      <div className="px-4 -mt-16 relative z-10 md:ml-20">
        <div className="max-w-5xl mx-auto md:flex md:gap-6">
          {/* Left column */}
          <div className="md:flex-1">
            {/* Cover + metadata */}
            <div className="flex gap-4 items-end">
              {/* Cover */}
              <div className="relative w-28 h-40 flex-shrink-0 rounded-xl overflow-hidden shadow-2xl">
                <Image
                  src={coverUrl}
                  alt={title}
                  fill
                  sizes="112px"
                  className="object-cover"
                />
              </div>

              {/* Title + meta */}
              <div className="flex-1 min-w-0 pb-1">
                {/* Type + status badges */}
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
                    style={{
                      background:
                        type === "MANHWA"
                          ? "rgba(0,212,255,0.15)"
                          : type === "MANHUA"
                            ? "rgba(255,107,157,0.15)"
                            : "rgba(108,99,255,0.15)",
                      color:
                        type === "MANHWA"
                          ? "#00D4FF"
                          : type === "MANHUA"
                            ? "#FF6B9D"
                            : "#6C63FF",
                    }}
                  >
                    {type}
                  </span>
                  <span
                    className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
                    style={{
                      background: "rgba(255,255,255,0.06)",
                      color: "#8B8BA7",
                    }}
                  >
                    {media.status}
                  </span>
                </div>

                {/* Title */}
                <h1
                  className="text-xl font-extrabold text-text-primary leading-tight"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  {title}
                </h1>

                {/* Alt title */}
                {altTitle && (
                  <p className="text-xs text-text-muted italic mt-0.5 truncate">
                    {altTitle}
                  </p>
                )}
              </div>
            </div>

            {/* Genre pills + score */}
            <div className="flex items-center gap-3 mt-4 overflow-x-auto">
              {media.averageScore && <ScoreArc score={media.averageScore} size={48} />}
              <div className="flex gap-1.5 overflow-x-auto">
                {media.genres.map((g) => (
                  <span key={g} className="genre-pill flex-shrink-0">
                    {g}
                  </span>
                ))}
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex gap-2 mt-4">
              {startChapter && (
                <motion.button
                  className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm text-white"
                  style={{
                    fontFamily: "var(--font-display)",
                    background: "linear-gradient(135deg, #6C63FF 0%, #5B54E8 100%)",
                    boxShadow: "0 4px 20px rgba(108,99,255,0.35)",
                  }}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => handleChapterSelect(startChapter)}
                >
                  <Play size={16} fill="currentColor" />
                  {readProgress
                    ? `Continue Ch ${readProgress.chapter}`
                    : "Start Reading"}
                </motion.button>
              )}

              <motion.button
                className="w-12 h-12 flex items-center justify-center rounded-xl"
                style={{
                  background: inLibrary
                    ? "rgba(108,99,255,0.15)"
                    : "rgba(255,255,255,0.04)",
                  border: inLibrary
                    ? "1px solid rgba(108,99,255,0.3)"
                    : "1px solid rgba(255,255,255,0.08)",
                }}
                whileTap={{ scale: 0.9 }}
                onClick={handleLibraryToggle}
              >
                {inLibrary ? (
                  <BookmarkCheck size={20} style={{ color: "#6C63FF" }} />
                ) : (
                  <BookmarkPlus size={20} className="text-text-muted" />
                )}
              </motion.button>
            </div>

            {/* Synopsis */}
            {media.description && (
              <div className="mt-4">
                <div
                  className={`text-sm text-text-secondary leading-relaxed ${
                    !synopsisExpanded ? "line-clamp-3" : ""
                  }`}
                  dangerouslySetInnerHTML={{
                    __html: media.description.replace(/<br\s*\/?>/g, " "),
                  }}
                />
                <button
                  onClick={() => setSynopsisExpanded(!synopsisExpanded)}
                  className="flex items-center gap-1 mt-1 text-xs font-medium"
                  style={{ color: "#6C63FF" }}
                >
                  {synopsisExpanded ? (
                    <>
                      Show less <ChevronUp size={12} />
                    </>
                  ) : (
                    <>
                      Read more <ChevronDown size={12} />
                    </>
                  )}
                </button>
              </div>
            )}

            {/* Chapter list */}
            <div className="mt-6">
              <h2
                className="text-base font-bold text-text-primary mb-3"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Chapters
              </h2>

              {chaptersLoading ? (
                <div className="glass p-4">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="skeleton h-14 w-full rounded-lg mb-2" />
                  ))}
                </div>
              ) : chapters.length > 0 ? (
                <ChapterList
                  groups={chapters}
                  allScanlators={allScanlators}
                  anilistId={anilistId}
                  onChapterSelect={handleChapterSelect}
                  readProgress={readProgress}
                />
              ) : (
                <div className="glass p-8 text-center">
                  <p className="text-sm font-semibold text-text-secondary" style={{ fontFamily: "var(--font-display)" }}>
                    Chapters not available
                  </p>
                  <p className="text-[10px] text-text-muted mt-2">
                    We couldn&apos;t find any supported sources for this title yet.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Right column (desktop) */}
          <div className="md:w-80 md:flex-shrink-0 mt-6 md:mt-0">
            <CharacterStaffPanel media={media} />
          </div>
        </div>
      </div>

      {/* Scanlator Settings Bottom Sheet */}
      <BottomSheet
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        title="Scanlator Priority"
      >
        <p className="text-xs text-text-muted mb-4">
          Select your preferred scanlation groups. Chapters from Priority 1 will
          be shown first, then Priority 2, then any available source.
        </p>

        <div className="flex flex-col gap-3">
          <div>
            <label className="text-xs font-medium text-text-secondary mb-1 block">
              Priority 1
            </label>
            <select
              value={scanlatorPrefs.p1 || ""}
              onChange={(e) =>
                handleScanlatorSave({
                  ...scanlatorPrefs,
                  p1: e.target.value || undefined,
                })
              }
              className="w-full p-3 rounded-xl text-sm text-text-primary"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <option value="">None</option>
              {allScanlators.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-text-secondary mb-1 block">
              Priority 2
            </label>
            <select
              value={scanlatorPrefs.p2 || ""}
              onChange={(e) =>
                handleScanlatorSave({
                  ...scanlatorPrefs,
                  p2: e.target.value || undefined,
                })
              }
              className="w-full p-3 rounded-xl text-sm text-text-primary"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <option value="">None</option>
              {allScanlators.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>
      </BottomSheet>

      <BottomNav />
    </motion.div>
  );
}
