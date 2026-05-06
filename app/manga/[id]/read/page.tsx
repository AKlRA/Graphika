"use client";

import { useEffect, useLayoutEffect, useState, useCallback, useRef, use } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Play,
  Settings as SettingsIcon,
  Image as ImageIcon,
  BookOpen,
  ArrowUp,
  Smartphone,
  RotateCcw,
} from "lucide-react";

import { getChapterImages } from "@/lib/api/mangadex";
import { comickPages, buildProxiedImageUrl } from "@/lib/api/comick";
import {
  getProgress,
  setProgress,
  getSettings,
  setSettings as saveSettings,
  touchChapter,
  type Settings,
} from "@/lib/storage";
import {
  getCachedChapters,
  type ChapterGroup,
} from "@/lib/chapters";
import BottomSheet from "@/components/BottomSheet";

// ── Image Token Expiry ──
const TOKEN_TTL = 14 * 60 * 1000; // 14 minutes

interface ImageCache {
  urls: string[];
  fetchedAt: number;
  chapterId: string;
}

function resolveExternalChapterUrl(
  source: string,
  chId: string,
  extParam: string | null
): string | null {
  if (extParam && /^https?:\/\//i.test(extParam)) return extParam;
  if (chId.startsWith("http")) return chId;
  const isMdUuid = source === "mangadex" && chId && !chId.startsWith("http");
  if (isMdUuid) return `https://mangadex.org/chapter/${chId}`;
  return null;
}

// ── Reader Page ──
export default function ReaderPage({
  params: paramsPromise,
}: {
  params: Promise<{ id: string }>;
}) {
  const params = use(paramsPromise);
  const router = useRouter();
  const searchParams = useSearchParams();

  const anilistId = parseInt(params.id, 10);
  const chapterNumber = parseFloat(searchParams.get("ch") || "1");
  const source = searchParams.get("source") || "mangadex";
  const chapterId = decodeURIComponent(searchParams.get("chId") || "");
  const externalUrl = searchParams.get("extUrl") || null;

  const [images, setImages] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [externalRedirectFailed, setExternalRedirectFailed] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [showChrome, setShowChrome] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [nextChapterSheet, setNextChapterSheet] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [settings, setSettingsState] = useState<Settings>({
    readerMode: "webtoon",
    imageQuality: "original",
  });

  const readMode = settings.readerMode;
  const isRtl = readMode === "paged-rtl";
  const isPaged = readMode === "paged" || readMode === "paged-rtl";

  // Zoom state
  const [zoomScale, setZoomScale] = useState(1);
  const [zoomOrigin, setZoomOrigin] = useState({ x: 50, y: 50 });
  const lastTouchDist = useRef<number | null>(null);
  const zoomContainerRef = useRef<HTMLDivElement>(null);

  // Tap state for double-tap
  const lastTapRef = useRef<{ time: number; x: number; y: number } | null>(null);
  const tapTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const chromeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const imageCacheRef = useRef<ImageCache | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const imageRefsMap = useRef<Map<number, HTMLDivElement>>(new Map());

  // ── Get chapter list for nav ──
  const [chapterGroups, setChapterGroups] = useState<ChapterGroup[]>([]);

  useEffect(() => {
    const cached = getCachedChapters(anilistId);
    if (cached) {
      setChapterGroups(cached.data);
    }
  }, [anilistId]);

  // ── Load settings ──
  useEffect(() => {
    const s = getSettings();
    setSettingsState(s);

    // Restore page progress
    const prog = getProgress(anilistId);
    if (prog && Math.abs(prog.chapter - chapterNumber) < 0.01) {
      setCurrentPage(prog.page || 0);
    }
  }, [anilistId, chapterNumber]);

  // ── Fetch images ──
  const fetchImages = useCallback(async () => {
    // Check cache validity (MangaDex tokens expire, Comick URLs don't)
    const isMangaDex = source === "mangadex";
    const ttl = isMangaDex ? TOKEN_TTL : Infinity;
    if (
      imageCacheRef.current &&
      imageCacheRef.current.chapterId === chapterId &&
      Date.now() - imageCacheRef.current.fetchedAt < ttl
    ) {
      setImages(imageCacheRef.current.urls);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      let urls: string[];

      if (isMangaDex) {
        // MangaDex AT-Home — get image URLs then proxy them to avoid CDN Referer blocks
        const dataSaver = settings.imageQuality === "datasaver";
        const rawUrls = await getChapterImages(chapterId, dataSaver);
        urls = rawUrls.map((u) => buildProxiedImageUrl(u, "mangadex"));
      } else {
        // MangaPlus is not HTML-scrapable (encrypted canvas) — same UX as empty scrape
        const s = source.toLowerCase();
        if (s === "mangaplus" || s === "manga_plus") {
          setError("external");
          setLoading(false);
          return;
        }
        // Comick / other source — fetch page URLs and wrap through image proxy
        const rawUrls = await comickPages(chapterId, source);
        urls = rawUrls.map((u) => buildProxiedImageUrl(u, source));
      }

      if (urls.length === 0) {
        // Chapter with no images (externally hosted, e.g. MangaPlus)
        setError("external");
        setLoading(false);
        return;
      }

      imageCacheRef.current = {
        urls,
        fetchedAt: Date.now(),
        chapterId,
      };

      setImages(urls);
    } catch (err) {
      console.error("Failed to fetch images:", err);
      setError("Failed to load chapter images. Try refreshing.");
    } finally {
      setLoading(false);
    }
  }, [chapterId, source, settings.imageQuality]);

  useEffect(() => {
    fetchImages();
  }, [fetchImages]);

  useEffect(() => {
    setExternalRedirectFailed(false);
  }, [chapterId, source, chapterNumber]);

  useLayoutEffect(() => {
    if (loading || error !== "external") return;
    const url = resolveExternalChapterUrl(source, chapterId, externalUrl);
    if (url) {
      window.location.replace(url);
    } else {
      setExternalRedirectFailed(true);
    }
  }, [loading, error, source, chapterId, externalUrl]);

  useEffect(() => {
    if (images.length > 0) {
      touchChapter(anilistId, chapterNumber);
    }
  }, [images.length, anilistId, chapterNumber]);

  // ── Re-fetch on token expiry ──
  useEffect(() => {
    if (source !== "mangadex") return;
    const interval = setInterval(() => {
      if (
        imageCacheRef.current &&
        Date.now() - imageCacheRef.current.fetchedAt >= TOKEN_TTL
      ) {
        fetchImages();
      }
    }, 60000); // check every minute
    return () => clearInterval(interval);
  }, [source, fetchImages]);

  // ── Auto-hide chrome ──
  const resetChromeTimer = useCallback(() => {
    setShowChrome(true);
    if (chromeTimeoutRef.current) clearTimeout(chromeTimeoutRef.current);
    chromeTimeoutRef.current = setTimeout(() => {
      setShowChrome(false);
    }, 2000);
  }, []);

  useEffect(() => {
    resetChromeTimer();
    return () => {
      if (chromeTimeoutRef.current) clearTimeout(chromeTimeoutRef.current);
      if (tapTimeoutRef.current) clearTimeout(tapTimeoutRef.current);
    };
  }, [resetChromeTimer]);

  // ── Preload next image (Paged mode) ──
  useEffect(() => {
    if (isPaged && images.length > currentPage + 1) {
      const img = new Image();
      img.src = images[currentPage + 1];
    }
  }, [currentPage, images, isPaged]);

  // ── Reset zoom on page/chapter change ──
  useEffect(() => {
    setZoomScale(1);
    setZoomOrigin({ x: 50, y: 50 });
  }, [currentPage, chapterId]);

  // ── Pinch-to-zoom (touch) ──
  useEffect(() => {
    const el = zoomContainerRef.current;
    if (!el) return;

    function onTouchStart(e: TouchEvent) {
      if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        lastTouchDist.current = Math.hypot(dx, dy);
      }
    }

    function onTouchMove(e: TouchEvent) {
      if (e.touches.length === 2 && lastTouchDist.current !== null && el) {
        e.preventDefault();
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.hypot(dx, dy);
        const delta = dist / lastTouchDist.current;
        lastTouchDist.current = dist;

        // Set origin to midpoint of fingers
        const rect = el.getBoundingClientRect();
        const mx = ((e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left) / rect.width * 100;
        const my = ((e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top) / rect.height * 100;
        setZoomOrigin({ x: mx, y: my });

        setZoomScale((prev) => Math.min(5, Math.max(1, prev * delta)));
      }
    }

    function onTouchEnd() {
      lastTouchDist.current = null;
    }

    el.addEventListener("touchstart", onTouchStart, { passive: false });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);

    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
    };
  }, []);

  // ── Mouse wheel zoom (desktop) ──
  useEffect(() => {
    const el = zoomContainerRef.current;
    if (!el) return;

    function onWheel(e: WheelEvent) {
      if ((e.ctrlKey || e.metaKey) && el) {
        e.preventDefault();
        const rect = el.getBoundingClientRect();
        const mx = (e.clientX - rect.left) / rect.width * 100;
        const my = (e.clientY - rect.top) / rect.height * 100;
        setZoomOrigin({ x: mx, y: my });
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        setZoomScale((prev) => Math.min(5, Math.max(1, prev * delta)));
      }
    }

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // ── Scroll to top FAB (Webtoon mode) ──
  useEffect(() => {
    if (readMode !== "webtoon") return;
    const handleScroll = () => {
      setShowScrollTop(window.scrollY > window.innerHeight * 3);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [readMode]);

  // ── Save progress ──
  const saveReadProgress = useCallback(
    (page: number) => {
      setProgress(anilistId, {
        chapter: chapterNumber,
        page,
        updatedAt: new Date().toISOString(),
      });
    },
    [anilistId, chapterNumber]
  );

  // ── Chapter navigation ──
  const sortedChapters = [...chapterGroups].sort(
    (a, b) => a.chapterNumber - b.chapterNumber
  );
  const currentChapterIndex = sortedChapters.findIndex(
    (g) => Math.abs(g.chapterNumber - chapterNumber) < 0.01
  );
  const prevChapter =
    currentChapterIndex > 0 ? sortedChapters[currentChapterIndex - 1] : null;
  const nextChapter =
    currentChapterIndex < sortedChapters.length - 1
      ? sortedChapters[currentChapterIndex + 1]
      : null;

  const navigateChapter = useCallback(
    (group: ChapterGroup) => {
      const active = group.activeVersion;
      const src = active.source;
      const id = encodeURIComponent(active.chapterId);
      router.replace(
        `/manga/${anilistId}/read?ch=${group.chapterNumber}&source=${src}&chId=${id}`
      );
    },
    [anilistId, router]
  );

  // ── Paged mode navigation ──
  const goToPage = useCallback(
    (page: number) => {
      const clamped = Math.max(0, Math.min(page, images.length - 1));
      setCurrentPage(clamped);
      saveReadProgress(clamped);
      resetChromeTimer();

      // Check if last page reached
      if (clamped === images.length - 1 && nextChapter) {
        setNextChapterSheet(true);
      }
    },
    [images.length, nextChapter, saveReadProgress, resetChromeTimer]
  );

  // ── Double Tap to Zoom ──
  const handleDoubleTap = useCallback(
    (clientX: number, clientY: number, rect: DOMRect) => {
      if (zoomScale > 1) {
        setZoomScale(1);
        setZoomOrigin({ x: 50, y: 50 });
      } else {
        const mx = ((clientX - rect.left) / rect.width) * 100;
        const my = ((clientY - rect.top) / rect.height) * 100;
        setZoomOrigin({ x: mx, y: my });
        setZoomScale(2.5); // Zoom in
      }
    },
    [zoomScale]
  );

  // ── Tap zones (paged mode) — RTL reverses left/right ──
  const handlePagedTap = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const clientX = e.clientX;
      const clientY = e.clientY;
      const now = Date.now();

      if (lastTapRef.current && now - lastTapRef.current.time < 300) {
        const dist = Math.hypot(clientX - lastTapRef.current.x, clientY - lastTapRef.current.y);
        if (dist < 40) {
          if (tapTimeoutRef.current) clearTimeout(tapTimeoutRef.current);
          lastTapRef.current = null;
          handleDoubleTap(clientX, clientY, rect);
          return;
        }
      }

      lastTapRef.current = { time: now, x: clientX, y: clientY };

      if (tapTimeoutRef.current) clearTimeout(tapTimeoutRef.current);
      tapTimeoutRef.current = setTimeout(() => {
        // Don't navigate if zoomed in
        if (zoomScale > 1.1) return;

        const x = clientX - rect.left;
        const width = rect.width;
        const third = width / 3;

        if (x < third) {
          // Left third
          goToPage(isRtl ? currentPage + 1 : currentPage - 1);
        } else if (x > third * 2) {
          // Right third
          goToPage(isRtl ? currentPage - 1 : currentPage + 1);
        } else {
          // Center: toggle chrome
          setShowChrome((prev) => !prev);
          if (!showChrome) resetChromeTimer();
        }
      }, 300);
    },
    [currentPage, goToPage, showChrome, resetChromeTimer, isRtl, zoomScale, handleDoubleTap]
  );

  // ── Tap (webtoon mode) ──
  const handleWebtoonTap = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const clientX = e.clientX;
      const clientY = e.clientY;
      const now = Date.now();

      if (lastTapRef.current && now - lastTapRef.current.time < 300) {
        const dist = Math.hypot(clientX - lastTapRef.current.x, clientY - lastTapRef.current.y);
        if (dist < 40) {
          if (tapTimeoutRef.current) clearTimeout(tapTimeoutRef.current);
          lastTapRef.current = null;
          handleDoubleTap(clientX, clientY, rect);
          return;
        }
      }

      lastTapRef.current = { time: now, x: clientX, y: clientY };

      if (tapTimeoutRef.current) clearTimeout(tapTimeoutRef.current);
      tapTimeoutRef.current = setTimeout(() => {
        setShowChrome((prev) => !prev);
        if (!showChrome) resetChromeTimer();
      }, 300);
    },
    [showChrome, resetChromeTimer, handleDoubleTap]
  );

  // ── Webtoon mode: track visible page via IntersectionObserver ──
  useEffect(() => {
    if (settings.readerMode === "paged" || settings.readerMode === "paged-rtl" || images.length === 0) return;

    observerRef.current = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const idx = parseInt(
              (entry.target as HTMLElement).dataset.pageIndex || "0",
              10
            );
            setCurrentPage(idx);
            saveReadProgress(idx);

            // Last page → show next chapter
            if (idx === images.length - 1 && nextChapter) {
              setNextChapterSheet(true);
            }
          }
        }
      },
      { threshold: 0.5 }
    );

    // Observe all image containers
    imageRefsMap.current.forEach((el) => {
      observerRef.current?.observe(el);
    });

    return () => {
      observerRef.current?.disconnect();
    };
  }, [settings.readerMode, images.length, nextChapter, saveReadProgress]);

  // ── Register image ref ──
  const registerImageRef = useCallback(
    (index: number, el: HTMLDivElement | null) => {
      if (el) {
        imageRefsMap.current.set(index, el);
        observerRef.current?.observe(el);
      } else {
        imageRefsMap.current.delete(index);
      }
    },
    []
  );

  // ── Webtoon scroll handler ──
  const handleWebtoonScroll = useCallback(() => {
    resetChromeTimer();
  }, [resetChromeTimer]);

  // ── Settings save ──
  const updateSettings = useCallback(
    (partial: Partial<Settings>) => {
      const next = { ...settings, ...partial };
      setSettingsState(next);
      saveSettings(next);

      // Re-fetch if quality changed
      if (partial.imageQuality && partial.imageQuality !== settings.imageQuality) {
        imageCacheRef.current = null;
        fetchImages();
      }
    },
    [settings, fetchImages]
  );

  // ── Seekbar ──
  const handleSeek = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const page = parseInt(e.target.value, 10);
      if (settings.readerMode === "webtoon") {
        // Scroll to that image
        const el = imageRefsMap.current.get(page);
        el?.scrollIntoView({ behavior: "smooth" });
      }
      goToPage(page);
    },
    [settings.readerMode, goToPage]
  );

  // ── Loading state ──
  if (loading) {
    return (
      <div
        className="fixed inset-0 flex items-center justify-center"
        style={{ background: "#0A0A0F" }}
      >
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 rounded-full border-2 border-transparent animate-spin"
            style={{ borderTopColor: "var(--accent-violet)", borderRightColor: "var(--accent-violet)" }}
          />
          <p className="text-sm text-text-muted" style={{ fontFamily: "var(--font-mono)" }}>
            Loading Ch {chapterNumber}…
          </p>
        </div>
      </div>
    );
  }

  // ── External: send user straight to host (no intermediate screen) ──
  if (error === "external") {
    if (externalRedirectFailed) {
      const fallback = resolveExternalChapterUrl(source, chapterId, externalUrl);
      return (
        <div
          className="fixed inset-0 flex items-center justify-center px-6"
          style={{ background: "#0A0A0F" }}
        >
          <div className="glass p-6 text-center max-w-sm w-full">
            <p className="text-sm text-text-secondary mb-4">
              Couldn&apos;t open this chapter automatically. Try opening it on the source site.
            </p>
            {fallback && (
              <motion.a
                href={fallback}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full py-3 rounded-xl font-semibold text-sm text-white mb-3"
                style={{
                  background: "linear-gradient(135deg, #D4A017 0%, #B8860B 100%)",
                }}
              >
                Open in browser
              </motion.a>
            )}
            <button
              type="button"
              onClick={() => router.back()}
              className="text-xs font-medium"
              style={{ color: "var(--accent-violet)" }}
            >
              Go back
            </button>
          </div>
        </div>
      );
    }
    return (
      <div
        className="fixed inset-0 flex flex-col items-center justify-center gap-3"
        style={{ background: "#0A0A0F" }}
      >
        <div
          className="w-8 h-8 rounded-full border-2 border-transparent animate-spin"
          style={{ borderTopColor: "var(--accent-violet)", borderRightColor: "var(--accent-violet)" }}
        />
        <p className="text-xs text-text-muted">Opening chapter…</p>
      </div>
    );
  }

  // ── Error state ──
  if (error) {
    return (
      <div
        className="fixed inset-0 flex items-center justify-center px-6"
        style={{ background: "#0A0A0F" }}
      >
        <div className="glass p-6 text-center max-w-sm">
          <p className="text-sm text-text-secondary mb-4">{error}</p>
          <div className="flex gap-2 justify-center">
            <button
              onClick={() => router.back()}
              className="px-4 py-2 rounded-xl text-sm font-medium"
              style={{
                background: "rgba(255,255,255,0.06)",
                color: "var(--text-primary)",
              }}
            >
              Go Back
            </button>
            <button
              onClick={() => {
                imageCacheRef.current = null;
                fetchImages();
              }}
              className="px-4 py-2 rounded-xl text-sm font-medium text-white"
              style={{
                background: "var(--accent-violet)",
                color: "#050504",
              }}
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 overflow-hidden"
      style={{ background: "#000" }}
    >
      {/* ── TOP BAR ── */}
      <AnimatePresence>
        {showChrome && (
          <motion.div
            className="fixed top-0 left-0 right-0 z-50 safe-top"
            initial={{ y: -60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -60, opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{
              background: "rgba(10,10,15,0.85)",
              backdropFilter: "blur(16px)",
              WebkitBackdropFilter: "blur(16px)",
              borderBottom: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            {/* Progress Bar */}
            <div 
              className="absolute bottom-0 left-0 h-[2px] transition-all duration-300 pointer-events-none" 
              style={{ width: `${(currentPage / Math.max(1, images.length - 1)) * 100}%`, background: "var(--accent-violet)" }}
            />
            <div className="flex items-center h-14 px-3 gap-2">
              <button
                onClick={() => router.back()}
                className="w-10 h-10 flex items-center justify-center rounded-full flex-shrink-0"
                style={{ minWidth: 44, minHeight: 44 }}
              >
                <ArrowLeft size={20} className="text-text-primary" />
              </button>

              <div className="flex-1 min-w-0 text-center">
                <p
                  className="text-sm font-semibold text-text-primary truncate"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  Ch {chapterNumber}
                </p>
              </div>

              <button
                onClick={() => {
                  setSettingsOpen(true);
                  resetChromeTimer();
                }}
                className="w-10 h-10 flex items-center justify-center rounded-full flex-shrink-0"
                style={{ minWidth: 44, minHeight: 44 }}
              >
                <SettingsIcon size={18} className="text-text-primary" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── IMAGE AREA ── */}
      <div 
        ref={zoomContainerRef} 
        className="h-full"
        style={{ touchAction: zoomScale > 1 ? "none" : "pan-x pan-y" }}
      >
        {settings.readerMode === "webtoon" ? (
          /* Webtoon: vertical continuous scroll */
          <div
            ref={scrollContainerRef}
            className="h-full overflow-y-auto"
            onScroll={handleWebtoonScroll}
            onClick={handleWebtoonTap}
            style={{
              transform: `scale(${zoomScale})`,
              transformOrigin: `${zoomOrigin.x}% ${zoomOrigin.y}%`,
              transition: zoomScale === 1 ? "transform 0.2s ease" : "none",
            }}
          >
            <div className="pt-14 pb-20">
              {images.map((url, i) => (
                <div
                  key={i}
                  ref={(el) => registerImageRef(i, el)}
                  data-page-index={i}
                  className="relative w-full"
                  style={{ minHeight: 200 }}
                >
                  <img
                    src={url}
                    alt={`Page ${i + 1}`}
                    className="w-full h-auto block"
                    loading={i < 3 ? "eager" : "lazy"}
                    style={{ maxWidth: "100%", display: "block" }}
                  />
                </div>
              ))}
            </div>
          </div>
        ) : (
          /* Paged / Paged-RTL: single page view with zoom */
          <div
            className="h-full flex items-center justify-center cursor-pointer select-none overflow-hidden"
            onClick={handlePagedTap}
            style={{
              transform: `scale(${zoomScale})`,
              transformOrigin: `${zoomOrigin.x}% ${zoomOrigin.y}%`,
              transition: zoomScale === 1 ? "transform 0.2s ease" : "none",
            }}
          >
            {images[currentPage] && (
              <motion.img
                key={currentPage}
                src={images[currentPage]}
                alt={`Page ${currentPage + 1}`}
                className="max-h-full max-w-full object-contain"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.15 }}
              />
            )}
          </div>
        )}
      </div>

      {/* ── ZOOM RESET FAB ── */}
      <AnimatePresence>
        {zoomScale > 1.05 && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            onClick={() => { setZoomScale(1); setZoomOrigin({ x: 50, y: 50 }); }}
            className="fixed bottom-24 right-4 w-10 h-10 rounded-full flex items-center justify-center z-50"
            style={{
              background: "rgba(255,255,255,0.12)",
              backdropFilter: "blur(12px)",
              border: "1px solid rgba(255,255,255,0.15)",
            }}
            title="Reset zoom"
          >
            <RotateCcw size={16} className="text-white" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* ── BOTTOM BAR ── */}
      <AnimatePresence>
        {showChrome && (
          <motion.div
            className="fixed bottom-0 left-0 right-0 z-50 safe-bottom"
            initial={{ y: 60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 60, opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{
              background: "rgba(10,10,15,0.85)",
              backdropFilter: "blur(16px)",
              WebkitBackdropFilter: "blur(16px)",
              borderTop: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            <div className="px-4 py-3">
              {/* Seekbar */}
              <div className="flex items-center gap-3 mb-2">
                <span
                  className="text-[11px] text-text-muted w-8 text-right"
                  style={{ fontFamily: "var(--font-mono)" }}
                >
                  {currentPage + 1}
                </span>
                <input
                  type="range"
                  min={0}
                  max={images.length - 1}
                  value={currentPage}
                  onChange={handleSeek}
                  className="flex-1 h-1 rounded-full appearance-none cursor-pointer"
                  style={{
                    background: `linear-gradient(to right, var(--accent-violet) ${
                      (currentPage / Math.max(images.length - 1, 1)) * 100
                    }%, rgba(255,255,255,0.1) ${
                      (currentPage / Math.max(images.length - 1, 1)) * 100
                    }%)`,
                  }}
                />
                <span
                  className="text-[11px] text-text-muted w-8"
                  style={{ fontFamily: "var(--font-mono)" }}
                >
                  {images.length}
                </span>
              </div>

              {/* Nav buttons */}
              <div className="flex items-center justify-between">
                <button
                  onClick={() => {
                    if (prevChapter) navigateChapter(prevChapter);
                  }}
                  disabled={!prevChapter}
                  className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-medium transition-opacity"
                  style={{
                    background: "rgba(255,255,255,0.06)",
                    color: prevChapter ? "var(--text-primary)" : "var(--text-muted)",
                    opacity: prevChapter ? 1 : 0.4,
                    minWidth: 44,
                    minHeight: 44,
                  }}
                >
                  <ChevronLeft size={14} />
                  Prev
                </button>

                <span
                  className="text-xs text-text-muted"
                  style={{ fontFamily: "var(--font-mono)" }}
                >
                  Page {currentPage + 1} / {images.length}
                </span>

                <button
                  onClick={() => {
                    if (nextChapter) navigateChapter(nextChapter);
                  }}
                  disabled={!nextChapter}
                  className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-medium transition-opacity"
                  style={{
                    background: "rgba(255,255,255,0.06)",
                    color: nextChapter ? "var(--text-primary)" : "var(--text-muted)",
                    opacity: nextChapter ? 1 : 0.4,
                    minWidth: 44,
                    minHeight: 44,
                  }}
                >
                  Next
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── RETURN TO TOP FAB (WEBTOON) ── */}
      <AnimatePresence>
        {readMode === "webtoon" && showScrollTop && !showChrome && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 20 }}
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            className="fixed bottom-6 right-6 w-12 h-12 rounded-full flex items-center justify-center z-40"
            style={{
              background: "var(--accent-violet)",
              boxShadow: "0 10px 28px rgba(214,255,77,0.18)",
              color: "#050504",
            }}
          >
            <ArrowUp size={20} />
          </motion.button>
        )}
      </AnimatePresence>

      {/* ── NEXT CHAPTER SHEET ── */}
      <BottomSheet
        isOpen={nextChapterSheet}
        onClose={() => setNextChapterSheet(false)}
        title="Chapter Complete"
      >
        <div className="flex flex-col items-center gap-4 py-2">
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center"
            style={{ background: "rgba(159,231,215,0.1)" }}
          >
            <BookOpen size={24} style={{ color: "var(--accent-cyan)" }} />
          </div>

          <p className="text-sm text-text-secondary text-center">
            You&apos;ve finished Chapter {chapterNumber}
          </p>

          {nextChapter && (
            <>
              <p className="text-xs text-text-muted">
                Next: Chapter {nextChapter.chapterString}
                {nextChapter.activeVersion.title &&
                  ` — ${nextChapter.activeVersion.title}`}
              </p>

              <motion.button
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm text-white"
                style={{
                  fontFamily: "var(--font-display)",
                  background:
                    "var(--accent-violet)",
                  color: "#050504",
                  boxShadow: "0 10px 28px rgba(214,255,77,0.16)",
                }}
                whileTap={{ scale: 0.97 }}
                onClick={() => {
                  setNextChapterSheet(false);
                  navigateChapter(nextChapter);
                }}
              >
                <ChevronRight size={16} />
                Continue Reading
              </motion.button>
            </>
          )}

          <button
            onClick={() => {
              setNextChapterSheet(false);
              router.back();
            }}
            className="text-xs font-medium"
            style={{ color: "var(--accent-violet)" }}
          >
            Back to Details
          </button>
        </div>
      </BottomSheet>

      {/* ── SETTINGS SHEET ── */}
      <BottomSheet
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        title="Reader Settings"
      >
        <div className="flex flex-col gap-5">
          {/* Reader Mode */}
          <div>
            <label className="text-xs font-medium text-text-secondary mb-2 block">
              Reader Mode
            </label>
            <div className="flex gap-1.5">
              <button
                onClick={() => updateSettings({ readerMode: "webtoon" })}
                className="flex-1 flex flex-col items-center justify-center gap-1 py-2.5 rounded-xl text-[10px] font-medium transition-all"
                style={{
                  background:
                    settings.readerMode === "webtoon"
                      ? "rgba(214,255,77,0.12)"
                      : "rgba(255,255,255,0.04)",
                  border:
                    settings.readerMode === "webtoon"
                      ? "1px solid rgba(214,255,77,0.24)"
                      : "1px solid rgba(255,255,255,0.08)",
                  color:
                    settings.readerMode === "webtoon" ? "var(--accent-violet)" : "var(--text-muted)",
                }}
              >
                <Smartphone size={14} />
                Scroll
              </button>
              <button
                onClick={() => updateSettings({ readerMode: "paged" })}
                className="flex-1 flex flex-col items-center justify-center gap-1 py-2.5 rounded-xl text-[10px] font-medium transition-all"
                style={{
                  background:
                    settings.readerMode === "paged"
                      ? "rgba(214,255,77,0.12)"
                      : "rgba(255,255,255,0.04)",
                  border:
                    settings.readerMode === "paged"
                      ? "1px solid rgba(214,255,77,0.24)"
                      : "1px solid rgba(255,255,255,0.08)",
                  color:
                    settings.readerMode === "paged" ? "var(--accent-violet)" : "var(--text-muted)",
                }}
              >
                <BookOpen size={14} />
                L→R
              </button>
              <button
                onClick={() => updateSettings({ readerMode: "paged-rtl" })}
                className="flex-1 flex flex-col items-center justify-center gap-1 py-2.5 rounded-xl text-[10px] font-medium transition-all"
                style={{
                  background:
                    settings.readerMode === "paged-rtl"
                      ? "rgba(214,255,77,0.12)"
                      : "rgba(255,255,255,0.04)",
                  border:
                    settings.readerMode === "paged-rtl"
                      ? "1px solid rgba(214,255,77,0.24)"
                      : "1px solid rgba(255,255,255,0.08)",
                  color:
                    settings.readerMode === "paged-rtl" ? "var(--accent-violet)" : "var(--text-muted)",
                }}
              >
                <BookOpen size={14} style={{ transform: "scaleX(-1)" }} />
                R→L
              </button>
            </div>
          </div>


          {/* Image Quality */}
          <div>
            <label className="text-xs font-medium text-text-secondary mb-2 block">
              Image Quality
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => updateSettings({ imageQuality: "original" })}
                className="flex-1 py-3 rounded-xl text-sm font-medium transition-all"
                style={{
                  background:
                    settings.imageQuality === "original"
                      ? "rgba(159,231,215,0.1)"
                      : "rgba(255,255,255,0.04)",
                  border:
                    settings.imageQuality === "original"
                      ? "1px solid rgba(159,231,215,0.24)"
                      : "1px solid rgba(255,255,255,0.08)",
                  color:
                    settings.imageQuality === "original"
                      ? "var(--accent-cyan)"
                      : "var(--text-muted)",
                }}
              >
                Original
              </button>
              <button
                onClick={() => updateSettings({ imageQuality: "datasaver" })}
                className="flex-1 py-3 rounded-xl text-sm font-medium transition-all"
                style={{
                  background:
                    settings.imageQuality === "datasaver"
                      ? "rgba(159,231,215,0.1)"
                      : "rgba(255,255,255,0.04)",
                  border:
                    settings.imageQuality === "datasaver"
                      ? "1px solid rgba(159,231,215,0.24)"
                      : "1px solid rgba(255,255,255,0.08)",
                  color:
                    settings.imageQuality === "datasaver"
                      ? "var(--accent-cyan)"
                      : "var(--text-muted)",
                }}
              >
                Data Saver
              </button>
            </div>
          </div>
        </div>
      </BottomSheet>
    </div>
  );
}
