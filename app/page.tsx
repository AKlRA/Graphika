"use client";

import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import Header from "@/components/Header";
import BottomNav from "@/components/BottomNav";
import HeroSection from "@/components/HeroSection";
import TrendingRow from "@/components/TrendingRow";
import MangaCard from "@/components/MangaCard";
import Footer from "@/components/Footer";
import { getTrending, type AniListMedia } from "@/lib/api/anilist";
import { getLibrary, getProgress } from "@/lib/storage";

interface ContinueItem {
  media: AniListMedia;
  progress: { chapter: number; totalChapters: number | null };
}

export default function HomePage() {
  const [featuredList, setFeaturedList] = useState<AniListMedia[]>([]);
  const [trendingManga, setTrendingManga] = useState<AniListMedia[]>([]);
  const [trendingManhwa, setTrendingManhwa] = useState<AniListMedia[]>([]);
  const [trendingManhua, setTrendingManhua] = useState<AniListMedia[]>([]);
  const [continueReading, setContinueReading] = useState<ContinueItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTrending = useCallback(async () => {
    try {
      setLoading(true);

      const [manga, manhwa, manhua] = await Promise.all([
        getTrending("JP", 1, 20),
        getTrending("KR", 1, 20),
        getTrending("CN", 1, 20),
      ]);

      setTrendingManga(manga);
      setTrendingManhwa(manhwa);
      setTrendingManhua(manhua);

      // Pick a featured title: prefer one with a banner image
      const allTrending = [...manga, ...manhwa];
      const withBanner = allTrending.filter((m) => m.bannerImage);
      const picks = withBanner.length > 0
        ? withBanner.slice(0, 5)
        : allTrending.slice(0, 5);
      setFeaturedList(picks);
    } catch (err) {
      console.error("Failed to fetch trending:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadContinueReading = useCallback(async () => {
    const library = getLibrary();
    if (library.length === 0) return;

    // Get progress for each library item
    const items: ContinueItem[] = [];
    for (const id of library.slice(0, 10)) {
      const prog = getProgress(id);
      if (prog) {
        // We'd need cached media data — for now, fetch from AniList
        try {
          const results = await getTrending(undefined, 1, 1); // placeholder
          if (results[0]) {
            items.push({
              media: { ...results[0], id },
              progress: { chapter: prog.chapter, totalChapters: null },
            });
          }
        } catch {
          // skip
        }
      }
    }
    setContinueReading(items);
  }, []);

  useEffect(() => {
    fetchTrending();
    loadContinueReading();
  }, [fetchTrending, loadContinueReading]);

  return (
    <motion.div
      className="min-h-dvh"
      style={{ background: "var(--bg-base)" }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      <Header />

      {/* Hero */}
      <div className="pt-14">
        <HeroSection mediaList={featuredList} loading={loading} />
      </div>

      {/* Content */}
      <main className="md:ml-20 pb-4">
        {/* Continue Reading */}
        {continueReading.length > 0 && (
          <section className="mt-8">
            <h2
              className="text-lg font-bold text-text-primary px-4 mb-3"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Continue Reading
            </h2>
            <div className="snap-row">
              {continueReading.map((item, i) => (
                <MangaCard
                  key={item.media.id}
                  media={item.media}
                  index={i}
                  variant="continue"
                  progress={item.progress}
                />
              ))}
            </div>
          </section>
        )}

        {/* Trending Manga */}
        <TrendingRow
          title="Trending Manga"
          items={trendingManga}
          loading={loading}
        />

        {/* Trending Manhwa */}
        <TrendingRow
          title="Trending Manhwa"
          items={trendingManhwa}
          loading={loading}
        />

        {/* Trending Manhua */}
        <TrendingRow
          title="Trending Manhua"
          items={trendingManhua}
          loading={loading}
        />

        <Footer />
      </main>

      <BottomNav />
    </motion.div>
  );
}
