"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search as SearchIcon, X } from "lucide-react";
import Header from "@/components/Header";
import BottomNav from "@/components/BottomNav";
import MangaCard from "@/components/MangaCard";
import Footer from "@/components/Footer";
import {
  searchManga,
  getTrending,
  type AniListMedia,
} from "@/lib/api/anilist";

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AniListMedia[]>([]);
  const [trending, setTrending] = useState<AniListMedia[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-focus on mount
  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  // Load trending as default suggestions
  useEffect(() => {
    async function loadTrending() {
      try {
        const data = await getTrending(undefined, 1, 20);
        setTrending(data);
      } catch (err) {
        console.error("Failed to load trending:", err);
      }
    }
    loadTrending();
  }, []);

  // Debounced search
  const handleSearch = useCallback((value: string) => {
    setQuery(value);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!value.trim()) {
      setResults([]);
      setSearched(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      setSearched(true);
      try {
        const data = await searchManga(value.trim(), 1, 20);
        setResults(data);
      } catch (err) {
        console.error("Search failed:", err);
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 400);
  }, []);

  const clearSearch = () => {
    setQuery("");
    setResults([]);
    setSearched(false);
    inputRef.current?.focus();
  };

  const displayItems = searched ? results : trending;
  const showingSuggestions = !searched && trending.length > 0;

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
        {/* Search input */}
        <div className="px-4 pt-6 pb-2">
          <div
            className="glass flex items-center gap-3 px-4 py-3"
            style={{ borderRadius: "var(--radius-xl)" }}
          >
            <SearchIcon size={18} className="text-text-muted flex-shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Search manga, manhwa, manhua…"
              className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-muted outline-none"
              style={{ fontFamily: "var(--font-body)" }}
            />
            <AnimatePresence>
              {query && (
                <motion.button
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  onClick={clearSearch}
                  className="w-7 h-7 flex items-center justify-center rounded-full flex-shrink-0"
                  style={{ background: "rgba(255,255,255,0.08)" }}
                >
                  <X size={14} className="text-text-muted" />
                </motion.button>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Section title */}
        <div className="px-4 mt-4 mb-3">
          <h2
            className="text-base font-bold text-text-primary"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {showingSuggestions ? "Trending Now" : searched ? `Results` : ""}
          </h2>
          {searched && !loading && (
            <p className="text-xs text-text-muted mt-0.5">
              {results.length} result{results.length !== 1 ? "s" : ""} for &ldquo;{query}&rdquo;
            </p>
          )}
        </div>

        {/* Loading skeleton */}
        {loading && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 px-4">
            {Array.from({ length: 8 }).map((_, i) => (
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

        {/* Results / Trending grid */}
        {!loading && displayItems.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 px-4">
            {displayItems.map((media, i) => (
              <motion.div
                key={media.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03, duration: 0.2 }}
                className="flex justify-center"
              >
                <MangaCard media={media} index={i} />
              </motion.div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && searched && results.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 px-4">
            <div
              className="w-20 h-20 rounded-full flex items-center justify-center mb-4"
              style={{ background: "rgba(108,99,255,0.08)" }}
            >
              <SearchIcon size={32} style={{ color: "#44445A" }} />
            </div>
            <p
              className="text-sm font-semibold text-text-secondary mb-1"
              style={{ fontFamily: "var(--font-display)" }}
            >
              No results found
            </p>
            <p className="text-xs text-text-muted text-center">
              Try a different title or check the spelling
            </p>
          </div>
        )}

        <Footer />
      </main>

      <BottomNav />
    </motion.div>
  );
}
