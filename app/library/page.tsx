"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { BookOpen, Search, Trash2, X } from "lucide-react";
import Link from "next/link";
import Header from "@/components/Header";
import BottomNav from "@/components/BottomNav";
import BottomSheet from "@/components/BottomSheet";
import MangaCard from "@/components/MangaCard";
import Footer from "@/components/Footer";
import {
  getMediaByIds,
  getDisplayTitle,
  type AniListMedia,
} from "@/lib/api/anilist";
import {
  getLibrary,
  getProgress,
  getItem,
  removeFromLibrary,
  type ReadingProgress,
} from "@/lib/storage";
import type { CachedChapterData } from "@/lib/chapters";

type SortMode = "recent" | "alpha" | "progress";

interface LibraryItem {
  media: AniListMedia;
  progress: ReadingProgress | null;
  totalChapters: number | null;
  lastReadAt: number; // timestamp for sort
}

export default function LibraryPage() {
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortMode, setSortMode] = useState<SortMode>("recent");

  const [itemToRemove, setItemToRemove] = useState<LibraryItem | null>(null);
  const pressTimer = useRef<NodeJS.Timeout | null>(null);

  const handlePressStart = (item: LibraryItem) => {
    pressTimer.current = setTimeout(() => {
      if (navigator.vibrate) navigator.vibrate(50);
      setItemToRemove(item);
    }, 600);
  };

  const handlePressEnd = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
  };

  useEffect(() => {
    async function loadLibrary() {
      const libraryIds = getLibrary();

      if (libraryIds.length === 0) {
        setLoading(false);
        return;
      }

      try {
        const mediaList = await getMediaByIds(libraryIds);

        // Build library items with progress data
        const libraryItems: LibraryItem[] = [];

        for (const id of libraryIds) {
          const media = mediaList.find((m) => m.id === id);
          if (!media) continue;

          const prog = getProgress(id);
          const cachedChapters = getItem<CachedChapterData | null>(
            `manga:${id}:chapters`,
            null
          );

          let totalChapters: number | null = media.chapters;

          // If we have cached chapter data, use the actual count
          if (cachedChapters && cachedChapters.data) {
            totalChapters = cachedChapters.data.length;
          }

          libraryItems.push({
            media,
            progress: prog,
            totalChapters,
            lastReadAt: prog
              ? new Date(prog.updatedAt).getTime()
              : 0,
          });
        }

        setItems(libraryItems);
      } catch (err) {
        console.error("Failed to load library:", err);
      } finally {
        setLoading(false);
      }
    }

    loadLibrary();
  }, []);

  const sortedItems = useMemo(() => {
    const sorted = [...items];
    switch (sortMode) {
      case "recent":
        sorted.sort((a, b) => b.lastReadAt - a.lastReadAt);
        break;
      case "alpha":
        sorted.sort((a, b) =>
          getDisplayTitle(a.media).localeCompare(getDisplayTitle(b.media))
        );
        break;
      case "progress":
        sorted.sort((a, b) => {
          const pctA =
            a.progress && a.totalChapters
              ? a.progress.chapter / a.totalChapters
              : 0;
          const pctB =
            b.progress && b.totalChapters
              ? b.progress.chapter / b.totalChapters
              : 0;
          return pctB - pctA;
        });
        break;
    }
    return sorted;
  }, [items, sortMode]);

  const sortPillStyle = useCallback(
    (active: boolean) => ({
      background: active ? "rgba(214, 255, 77, 0.12)" : "transparent",
      color: active ? "var(--accent-violet)" : "var(--text-muted)",
      border: active
        ? "1px solid rgba(214, 255, 77, 0.24)"
        : "1px solid transparent",
    }),
    []
  );

  // Empty state — no loading needed
  if (!loading && items.length === 0) {
    return (
      <motion.div
        className="min-h-dvh"
        style={{ background: "var(--bg-base)" }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.25 }}
      >
        <Header />
        <main className="pt-14 md:ml-20 flex flex-col items-center justify-center min-h-[70vh] px-6">
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center mb-5"
            style={{ background: "rgba(214, 255, 77, 0.08)" }}
          >
            <BookOpen size={32} style={{ color: "var(--text-muted)" }} />
          </div>
          <p
            className="text-base font-bold text-text-secondary mb-1"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Your library is empty
          </p>
          <p className="text-xs text-text-muted text-center mb-6">
            Add manga to your library from the detail page
          </p>
          <Link href="/search">
            <motion.button
              className="flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm"
              style={{
                fontFamily: "var(--font-display)",
                background: "var(--accent-violet)",
                color: "#050504",
                boxShadow: "0 10px 28px rgba(214, 255, 77, 0.16)",
              }}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
            >
              <Search size={16} />
              Browse Manga
            </motion.button>
          </Link>
          <Footer />
        </main>
        <BottomNav />
      </motion.div>
    );
  }

  return (
    <motion.div
      className="min-h-dvh"
      style={{ background: "var(--bg-base)" }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25 }}
    >
      <Header />

      <main className="pt-14 md:ml-20 pb-4">
        {/* Title + sort */}
        <div className="px-4 pt-6 pb-2">
          <h1
            className="text-xl font-extrabold text-text-primary mb-4"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Library
          </h1>

          {/* Sort pills */}
          <div className="flex gap-2 overflow-x-auto pb-1">
            {(
              [
                { key: "recent" as SortMode, label: "Recently Read" },
                { key: "alpha" as SortMode, label: "Title A–Z" },
                { key: "progress" as SortMode, label: "% Complete" },
              ] as const
            ).map((item) => (
              <button
                key={item.key}
                onClick={() => setSortMode(item.key)}
                className="px-3 py-1.5 rounded-full text-xs font-semibold transition-all duration-200 whitespace-nowrap flex-shrink-0"
                style={sortPillStyle(sortMode === item.key)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {/* Loading skeleton */}
        {loading && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 px-4 mt-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex flex-col items-center">
                <div
                  className="skeleton w-full rounded-xl"
                  style={{ aspectRatio: "3/4" }}
                />
                <div className="skeleton h-3 w-4/5 rounded mt-2" />
                <div className="skeleton h-2 w-3/5 rounded mt-1" />
              </div>
            ))}
          </div>
        )}

        {/* Library grid */}
        {!loading && sortedItems.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 px-4 mt-4">
            {sortedItems.map((item, i) => (
              <motion.div
                key={item.media.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03, duration: 0.2 }}
                className="flex justify-center select-none cursor-pointer"
                onTouchStart={() => handlePressStart(item)}
                onTouchEnd={handlePressEnd}
                onTouchMove={handlePressEnd}
                onMouseDown={() => handlePressStart(item)}
                onMouseUp={handlePressEnd}
                onMouseLeave={handlePressEnd}
              >
                <MangaCard
                  media={item.media}
                  index={i}
                  variant="continue"
                  progress={{
                    chapter: item.progress?.chapter ?? 0,
                    totalChapters: item.totalChapters,
                  }}
                />
              </motion.div>
            ))}
          </div>
        )}
        <Footer />
      </main>

      {/* Remove Confirmation Sheet */}
      <BottomSheet
        isOpen={!!itemToRemove}
        onClose={() => setItemToRemove(null)}
        title="Remove from Library?"
      >
        <div className="flex flex-col items-center gap-4 py-2 text-center">
          <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: "rgba(240, 216, 168, 0.1)" }}>
            <Trash2 size={28} color="var(--accent-rose)" />
          </div>
          <p className="text-sm text-text-secondary">
            Are you sure you want to remove <strong className="text-text-primary">{itemToRemove && getDisplayTitle(itemToRemove.media)}</strong> from your library?
          </p>
          <div className="w-full flex gap-3 mt-2">
            <button
              onClick={() => setItemToRemove(null)}
              className="flex-1 py-3 rounded-xl font-bold text-sm bg-white/5 text-text-primary"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                if (itemToRemove) {
                  removeFromLibrary(itemToRemove.media.id);
                  setItems(prev => prev.filter(i => i.media.id !== itemToRemove.media.id));
                  setItemToRemove(null);
                }
              }}
              className="flex-1 py-3 rounded-xl font-bold text-sm text-white"
              style={{ background: "var(--accent-rose)", color: "#050504", boxShadow: "0 8px 20px rgba(240, 216, 168, 0.22)" }}
            >
              Remove
            </button>
          </div>
        </div>
      </BottomSheet>

      <BottomNav />
    </motion.div>
  );
}
