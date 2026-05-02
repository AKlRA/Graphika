"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Search as SearchIcon, X, Settings } from "lucide-react";
import Header from "@/components/Header";
import BottomNav from "@/components/BottomNav";
import BottomSheet from "@/components/BottomSheet";
import MangaCard from "@/components/MangaCard";
import Footer from "@/components/Footer";
import {
  searchMangaAdvanced,
  getTrending,
  type AniListMedia,
  type MediaStatus,
  type MediaSort,
  type MangaOriginFilter,
  type SearchPageInfo,
} from "@/lib/api/anilist";

/** Matches AniList genre strings for filter chips */
const AVAILABLE_GENRES = [
  "Action",
  "Adventure",
  "Comedy",
  "Drama",
  "Ecchi",
  "Fantasy",
  "Horror",
  "Mahou Shoujo",
  "Mecha",
  "Music",
  "Mystery",
  "Psychological",
  "Romance",
  "Sci-Fi",
  "Slice of Life",
  "Sports",
  "Supernatural",
  "Thriller",
  "Suspense",
  "Boys Love",
  "Girls Love",
  "Gourmet",
  "Harem",
  "Historical",
  "Martial Arts",
  "Military",
  "School",
  "Seinen",
  "Shoujo",
  "Shounen",
  "Super Power",
  "Vampire",
  "Samurai",
  "Detective",
  "Workplace",
  "Kids",
  "Parody",
  "Iyashikei",
];

const ORIGIN_OPTIONS: {
  label: string;
  value: MangaOriginFilter | null;
  hint: string;
}[] = [
  { label: "Any", value: null, hint: "All regions" },
  { label: "Japan", value: "JP", hint: "Manga" },
  { label: "Korea", value: "KR", hint: "Manhwa" },
  { label: "China", value: "CN", hint: "Manhua" },
  { label: "Taiwan", value: "TW", hint: "Manhua / Taiwanese" },
];

const RESULTS_PER_PAGE = 35;

const STATUS_OPTIONS: { label: string; value: MediaStatus }[] = [
  { label: "Releasing", value: "RELEASING" },
  { label: "Finished", value: "FINISHED" },
  { label: "Not Yet Released", value: "NOT_YET_RELEASED" },
  { label: "Cancelled", value: "CANCELLED" },
];

const SORT_OPTIONS: { label: string; value: MediaSort }[] = [
  { label: "Latest Updated", value: "UPDATED_AT_DESC" },
  { label: "Most Chapters", value: "CHAPTERS_DESC" },
  { label: "Highest Score", value: "SCORE_DESC" },
  { label: "Most Popular", value: "POPULARITY_DESC" },
];

export default function SearchPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AniListMedia[]>([]);
  const [trending, setTrending] = useState<AniListMedia[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [showFilterSheet, setShowFilterSheet] = useState(false);
  
  // Filter states
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [selectedStatus, setSelectedStatus] = useState<MediaStatus | null>(null);
  const [minChapters, setMinChapters] = useState<number | null>(null);
  const [maxChapters, setMaxChapters] = useState<number | null>(null);
  const [sortBy, setSortBy] = useState<MediaSort>("UPDATED_AT_DESC");
  const [selectedOrigin, setSelectedOrigin] = useState<MangaOriginFilter | null>(
    null
  );
  const [resultsPage, setResultsPage] = useState(1);
  const [pageInfo, setPageInfo] = useState<SearchPageInfo | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Sync UI from URL + browse/trending or filtered search
  useEffect(() => {
    const q = searchParams.get("q") || "";
    const genres = searchParams.get("genres")?.split(",").filter(Boolean) || [];
    const statusRaw = searchParams.get("status");
    const status =
      statusRaw &&
      ["FINISHED", "RELEASING", "NOT_YET_RELEASED", "CANCELLED"].includes(statusRaw)
        ? (statusRaw as MediaStatus)
        : null;
    const min = searchParams.get("minChapters");
    const max = searchParams.get("maxChapters");
    const sort = (searchParams.get("sort") as MediaSort) || "UPDATED_AT_DESC";
    const pageRaw = parseInt(searchParams.get("page") || "1", 10);
    const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
    const originRaw = searchParams.get("origin") || "";
    const origin =
      originRaw === "JP" || originRaw === "KR" || originRaw === "CN" || originRaw === "TW"
        ? (originRaw as MangaOriginFilter)
        : null;

    const minParsed =
      min !== null && min !== "" ? parseInt(min, 10) : Number.NaN;
    const maxParsed =
      max !== null && max !== "" ? parseInt(max, 10) : Number.NaN;
    const minCh = Number.isFinite(minParsed) ? minParsed : null;
    const maxCh = Number.isFinite(maxParsed) ? maxParsed : null;

    setQuery(q);
    setSelectedGenres(genres);
    setSelectedStatus(status);
    setMinChapters(minCh);
    setMaxChapters(maxCh);
    setSortBy(sort);
    setResultsPage(page);
    setSelectedOrigin(origin);

    const shouldSearch =
      q.trim().length > 0 ||
      genres.length > 0 ||
      !!status ||
      minCh !== null ||
      maxCh !== null ||
      !!origin;

    if (!shouldSearch) {
      setResults([]);
      setPageInfo(null);
      setSearched(false);
      let cancelled = false;
      getTrending(undefined, 1, RESULTS_PER_PAGE)
        .then((data) => {
          if (!cancelled) setTrending(data);
        })
        .catch((err) => console.error("Failed to load trending:", err));
      return () => {
        cancelled = true;
      };
    }

    setSearched(true);
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const { media, pageInfo: pi } = await searchMangaAdvanced({
          search: q.trim() || undefined,
          genres: genres.length > 0 ? genres : undefined,
          status: status || undefined,
          chaptersGreater:
            minCh !== null && Number.isFinite(minCh) ? minCh : undefined,
          chaptersLess:
            maxCh !== null && Number.isFinite(maxCh) ? maxCh : undefined,
          sort: [sort],
          page,
          perPage: RESULTS_PER_PAGE,
          countryOfOrigin: origin ?? undefined,
        });
        if (!cancelled) {
          setResults(media);
          setPageInfo(pi);
        }
      } catch (err) {
        console.error("Search failed:", err);
        if (!cancelled) {
          setResults([]);
          setPageInfo(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [searchParams]);

  // Auto-focus on mount
  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  const replaceSearchParams = useCallback(
    (mutate: (p: URLSearchParams) => void) => {
      const p = new URLSearchParams(searchParams.toString());
      mutate(p);
      router.replace(`?${p}`, { scroll: false });
    },
    [router, searchParams]
  );

  const handleSearch = useCallback(
    (value: string) => {
      setQuery(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        replaceSearchParams((p) => {
          if (value.trim()) p.set("q", value.trim());
          else p.delete("q");
          p.delete("page");
        });
      }, 300);
    },
    [replaceSearchParams]
  );

  const toggleGenre = useCallback(
    (genre: string) => {
      replaceSearchParams((p) => {
        const cur = p.get("genres")?.split(",").filter(Boolean) ?? [];
        const next = cur.includes(genre)
          ? cur.filter((g) => g !== genre)
          : [...cur, genre];
        if (next.length) p.set("genres", next.join(","));
        else p.delete("genres");
        p.delete("page");
      });
    },
    [replaceSearchParams]
  );

  const handleStatusChange = useCallback(
    (nextStatus: MediaStatus | null) => {
      replaceSearchParams((p) => {
        if (nextStatus) p.set("status", nextStatus);
        else p.delete("status");
        p.delete("page");
      });
    },
    [replaceSearchParams]
  );

  const handleSortChange = useCallback(
    (sort: MediaSort) => {
      replaceSearchParams((p) => {
        if (sort !== "UPDATED_AT_DESC") p.set("sort", sort);
        else p.delete("sort");
        p.delete("page");
      });
    },
    [replaceSearchParams]
  );

  const handleChaptersChange = useCallback(
    (min: number | null, max: number | null) => {
      replaceSearchParams((p) => {
        if (min !== null) p.set("minChapters", String(min));
        else p.delete("minChapters");
        if (max !== null) p.set("maxChapters", String(max));
        else p.delete("maxChapters");
        p.delete("page");
      });
    },
    [replaceSearchParams]
  );

  const handleOriginChange = useCallback(
    (next: MangaOriginFilter | null) => {
      replaceSearchParams((p) => {
        if (next) p.set("origin", next);
        else p.delete("origin");
        p.delete("page");
      });
    },
    [replaceSearchParams]
  );

  const clearFilters = useCallback(() => {
    router.replace("/search", { scroll: false });
    inputRef.current?.focus();
  }, [router]);

  const goToResultsPage = useCallback(
    (nextPage: number) => {
      replaceSearchParams((p) => {
        if (nextPage <= 1) p.delete("page");
        else p.set("page", String(nextPage));
      });
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [replaceSearchParams]
  );

  const hasActiveFilters =
    selectedGenres.length > 0 ||
    !!selectedStatus ||
    minChapters !== null ||
    maxChapters !== null ||
    !!selectedOrigin;
  const displayItems = (searched || hasActiveFilters) ? results : trending;
  const showingSuggestions = !searched && !hasActiveFilters && trending.length > 0;
  const activeFilterCount = [
    selectedGenres.length,
    selectedStatus ? 1 : 0,
    minChapters !== null ? 1 : 0,
    maxChapters !== null ? 1 : 0,
    selectedOrigin ? 1 : 0,
  ].reduce((a, b) => a + b, 0);

  const resultsRangeLabel =
    pageInfo && results.length > 0
      ? `${(pageInfo.currentPage - 1) * pageInfo.perPage + 1}–${Math.min(
          pageInfo.total,
          (pageInfo.currentPage - 1) * pageInfo.perPage + results.length
        )} of ${pageInfo.total}`
      : pageInfo && results.length === 0
        ? `0 of ${pageInfo.total}`
        : null;

  return (
    <motion.div
      className="min-h-dvh flex flex-col"
      style={{ background: "var(--bg-base)" }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25 }}
    >
      <Header />

      <main className="flex-1 pt-14 md:ml-20 pb-4 overflow-y-auto">
        {/* Search input + filters header */}
        <div className="px-4 pt-6 pb-2">
          <div className="flex gap-2 items-center">
            {/* Search input */}
            <div
              className="glass flex items-center gap-3 px-4 py-3 flex-1"
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
                    onClick={() => handleSearch("")}
                    className="w-7 h-7 flex items-center justify-center rounded-full flex-shrink-0"
                    style={{ background: "rgba(255,255,255,0.08)" }}
                  >
                    <X size={14} className="text-text-muted" />
                  </motion.button>
                )}
              </AnimatePresence>
            </div>

            {/* Filter button (mobile + desktop) */}
            <motion.button
              onClick={() => setShowFilterSheet(true)}
              className="hidden md:flex items-center justify-center w-10 h-10 rounded-lg flex-shrink-0 relative"
              style={{ background: "rgba(214,255,77,0.1)" }}
              whileHover={{ background: "rgba(214,255,77,0.15)" }}
              whileTap={{ scale: 0.95 }}
            >
              <Settings size={18} className="text-text-primary" />
              {activeFilterCount > 0 && (
                <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full text-xs flex items-center justify-center" style={{ background: "var(--accent-violet)", color: "#050504" }}>
                  {activeFilterCount}
                </div>
              )}
            </motion.button>

            {/* Filter button (mobile only) */}
            <motion.button
              onClick={() => setShowFilterSheet(true)}
              className="md:hidden flex items-center justify-center w-10 h-10 rounded-lg flex-shrink-0 relative"
              style={{ background: "rgba(214,255,77,0.1)" }}
              whileHover={{ background: "rgba(214,255,77,0.15)" }}
              whileTap={{ scale: 0.95 }}
            >
              <Settings size={18} className="text-text-primary" />
              {activeFilterCount > 0 && (
                <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full text-xs flex items-center justify-center" style={{ background: "var(--accent-violet)", color: "#050504" }}>
                  {activeFilterCount}
                </div>
              )}
            </motion.button>
          </div>

          {/* Active filters display (desktop) */}
          {activeFilterCount > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {selectedGenres.map((genre) => (
                <motion.button
                  key={genre}
                  onClick={() => toggleGenre(genre)}
                  className="text-xs px-2.5 py-1 rounded-full flex items-center gap-1"
                  style={{ background: "rgba(214,255,77,0.12)", color: "var(--text-primary)" }}
                  whileHover={{ background: "rgba(214,255,77,0.2)" }}
                >
                  {genre}
                  <X size={12} />
                </motion.button>
              ))}
              {selectedStatus && (
                <motion.button
                  onClick={() => handleStatusChange(null)}
                  className="text-xs px-2.5 py-1 rounded-full flex items-center gap-1"
                  style={{ background: "rgba(214,255,77,0.12)", color: "var(--text-primary)" }}
                  whileHover={{ background: "rgba(214,255,77,0.2)" }}
                >
                  {STATUS_OPTIONS.find((s) => s.value === selectedStatus)?.label}
                  <X size={12} />
                </motion.button>
              )}
              {(minChapters !== null || maxChapters !== null) && (
                <motion.button
                  onClick={() => handleChaptersChange(null, null)}
                  className="text-xs px-2.5 py-1 rounded-full flex items-center gap-1"
                  style={{ background: "rgba(214,255,77,0.12)", color: "var(--text-primary)" }}
                  whileHover={{ background: "rgba(214,255,77,0.2)" }}
                >
                  {minChapters !== null && `${minChapters}+`}
                  {minChapters !== null && maxChapters !== null && " to "}
                  {maxChapters !== null && `${maxChapters}`}
                  <X size={12} />
                </motion.button>
              )}
              {selectedOrigin && (
                <motion.button
                  onClick={() => handleOriginChange(null)}
                  className="text-xs px-2.5 py-1 rounded-full flex items-center gap-1"
                  style={{ background: "rgba(214,255,77,0.12)", color: "var(--text-primary)" }}
                  whileHover={{ background: "rgba(214,255,77,0.2)" }}
                >
                  {ORIGIN_OPTIONS.find((o) => o.value === selectedOrigin)?.label ?? selectedOrigin}
                  <X size={12} />
                </motion.button>
              )}
              {activeFilterCount > 0 && (
                <motion.button
                  onClick={clearFilters}
                  className="text-xs px-2.5 py-1 rounded-full"
                  style={{ background: "rgba(240,216,168,0.12)", color: "var(--accent-rose)" }}
                  whileHover={{ background: "rgba(240,216,168,0.18)" }}
                >
                  Clear all
                </motion.button>
              )}
            </div>
          )}
        </div>

        {/* Filter Bottom Sheet (Mobile) */}
        <BottomSheet isOpen={showFilterSheet} onClose={() => setShowFilterSheet(false)} title="Filters">
          <FilterPanel
            genres={selectedGenres}
            status={selectedStatus}
            minChapters={minChapters}
            maxChapters={maxChapters}
            sortBy={sortBy}
            origin={selectedOrigin}
            onGenreToggle={toggleGenre}
            onStatusChange={handleStatusChange}
            onChaptersChange={handleChaptersChange}
            onSortChange={handleSortChange}
            onOriginChange={handleOriginChange}
            onClearFilters={clearFilters}
          />
        </BottomSheet>

        {/* Section title */}
        <div className="px-4 mt-4 mb-3">
          <h2
            className="text-base font-bold text-text-primary"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {showingSuggestions ? "Trending Now" : (searched || hasActiveFilters) ? "Results" : ""}
          </h2>
          {(searched || hasActiveFilters) && !loading && (
            <p className="text-xs text-text-muted mt-0.5">
              {resultsRangeLabel ? `${resultsRangeLabel}` : `${results.length} result${results.length !== 1 ? "s" : ""}`}
              {query.trim() ? ` · “${query.trim()}”` : ""}
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

        {!loading &&
          (searched || hasActiveFilters) &&
          pageInfo &&
          pageInfo.total > 0 &&
          (pageInfo.lastPage > 1 || resultsPage > 1) && (
            <div className="flex items-center justify-center gap-4 px-4 mt-8 mb-6">
              <motion.button
                type="button"
                disabled={resultsPage <= 1}
                onClick={() => goToResultsPage(resultsPage - 1)}
                className="px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-25 disabled:pointer-events-none"
                style={{
                  background: "rgba(255,255,255,0.06)",
                  color: "var(--text-primary)",
                  border: "1px solid var(--border-default)",
                }}
                whileTap={{ scale: 0.97 }}
              >
                Previous {RESULTS_PER_PAGE}
              </motion.button>
              <span className="text-xs text-text-muted font-mono">
                {resultsPage} / {pageInfo.lastPage}
              </span>
              <motion.button
                type="button"
                disabled={!pageInfo.hasNextPage}
                onClick={() => goToResultsPage(resultsPage + 1)}
                className="px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-25 disabled:pointer-events-none"
                style={{
                  background: "rgba(214,255,77,0.12)",
                  color: "var(--text-primary)",
                  border: "1px solid rgba(214,255,77,0.24)",
                }}
                whileTap={{ scale: 0.97 }}
              >
                Next {RESULTS_PER_PAGE}
              </motion.button>
            </div>
          )}

        {/* Empty state */}
        {!loading && (searched || hasActiveFilters) && results.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 px-4">
            <div
              className="w-20 h-20 rounded-full flex items-center justify-center mb-4"
              style={{ background: "rgba(214,255,77,0.08)" }}
            >
              <SearchIcon size={32} style={{ color: "var(--text-muted)" }} />
            </div>
            <p
              className="text-sm font-semibold text-text-secondary mb-1"
              style={{ fontFamily: "var(--font-display)" }}
            >
              No results found
            </p>
            <p className="text-xs text-text-muted text-center">
              Try a different title, genre, or adjust the filters
            </p>
            {activeFilterCount > 0 && (
              <motion.button
                onClick={clearFilters}
                className="mt-3 px-4 py-2 rounded-lg text-sm"
                style={{ background: "rgba(214,255,77,0.1)", color: "var(--text-primary)" }}
                whileHover={{ background: "rgba(214,255,77,0.18)" }}
              >
                Clear filters
              </motion.button>
            )}
          </div>
        )}

        <Footer />
      </main>

      <BottomNav />
    </motion.div>
  );
}

// Filter Panel Component
function FilterPanel({
  genres,
  status,
  minChapters,
  maxChapters,
  sortBy,
  origin,
  onGenreToggle,
  onStatusChange,
  onChaptersChange,
  onSortChange,
  onOriginChange,
  onClearFilters,
}: {
  genres: string[];
  status: MediaStatus | null;
  minChapters: number | null;
  maxChapters: number | null;
  sortBy: MediaSort;
  origin: MangaOriginFilter | null;
  onGenreToggle: (genre: string) => void;
  onStatusChange: (status: MediaStatus | null) => void;
  onChaptersChange: (min: number | null, max: number | null) => void;
  onSortChange: (sort: MediaSort) => void;
  onOriginChange: (region: MangaOriginFilter | null) => void;
  onClearFilters: () => void;
}) {
  return (
    <div className="px-4 pb-6 space-y-6 max-h-[calc(70vh-96px)] overflow-y-auto">
      {/* Sort */}
      <div>
        <h3 className="text-sm font-bold text-text-primary mb-3" style={{ fontFamily: "var(--font-display)" }}>
          Sort By
        </h3>
        <div className="space-y-2">
          {SORT_OPTIONS.map((option) => (
            <label key={option.value} className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="sort"
                checked={sortBy === option.value}
                onChange={() => onSortChange(option.value)}
                className="w-4 h-4"
              />
              <span className="text-xs text-text-primary">{option.label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Status */}
      <div>
        <h3 className="text-sm font-bold text-text-primary mb-3" style={{ fontFamily: "var(--font-display)" }}>
          Status
        </h3>
        <div className="space-y-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="status"
              checked={status === null}
              onChange={() => onStatusChange(null)}
              className="w-4 h-4"
            />
            <span className="text-xs text-text-primary">Any Status</span>
          </label>
          {STATUS_OPTIONS.map((option) => (
            <label key={option.value} className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="status"
                checked={status === option.value}
                onChange={() => onStatusChange(option.value)}
                className="w-4 h-4"
              />
              <span className="text-xs text-text-primary">{option.label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Region / manga vs manhwa vs manhua */}
      <div>
        <h3 className="text-sm font-bold text-text-primary mb-3" style={{ fontFamily: "var(--font-display)" }}>
          Type / region
        </h3>
        <div className="space-y-2">
          {ORIGIN_OPTIONS.map((opt) => (
            <label key={opt.label} className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="origin"
                checked={(origin ?? null) === opt.value}
                onChange={() => onOriginChange(opt.value)}
                className="w-4 h-4"
              />
              <span className="text-xs text-text-primary">{opt.label}</span>
              <span className="text-[10px] text-text-muted">{opt.hint}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Genres */}
      <div>
        <h3 className="text-sm font-bold text-text-primary mb-3" style={{ fontFamily: "var(--font-display)" }}>
          Genres ({genres.length})
        </h3>
        <div className="grid grid-cols-2 gap-2 max-h-[42vh] overflow-y-auto pr-1">
          {AVAILABLE_GENRES.map((genre) => (
            <label key={genre} className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={genres.includes(genre)}
                onChange={() => onGenreToggle(genre)}
                className="w-4 h-4 rounded"
              />
              <span className="text-xs text-text-primary">{genre}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Chapter Count */}
      <div>
        <h3 className="text-sm font-bold text-text-primary mb-3" style={{ fontFamily: "var(--font-display)" }}>
          Chapters
        </h3>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-text-muted block mb-1">Minimum</label>
            <input
              type="number"
              min="0"
              value={minChapters ?? ""}
              onChange={(e) =>
                onChaptersChange(e.target.value ? parseInt(e.target.value) : null, maxChapters)
              }
              placeholder="No minimum"
              className="w-full px-3 py-2 rounded-lg text-text-primary text-xs outline-none"
              style={{ border: "1px solid rgba(255,255,255,0.1)" }}
            />
          </div>
          <div>
            <label className="text-xs text-text-muted block mb-1">Maximum</label>
            <input
              type="number"
              min="0"
              value={maxChapters ?? ""}
              onChange={(e) =>
                onChaptersChange(minChapters, e.target.value ? parseInt(e.target.value) : null)
              }
              placeholder="No maximum"
              className="w-full px-3 py-2 rounded-lg text-text-primary text-xs outline-none"
              style={{ border: "1px solid rgba(255,255,255,0.1)" }}
            />
          </div>
        </div>
      </div>

      {/* Clear button */}
      <motion.button
        onClick={onClearFilters}
        className="w-full px-4 py-2 rounded-lg text-sm font-medium"
        style={{ background: "rgba(240,216,168,0.12)", color: "var(--accent-rose)" }}
        whileHover={{ background: "rgba(240,216,168,0.18)" }}
      >
        Clear All Filters
      </motion.button>
    </div>
  );
}
