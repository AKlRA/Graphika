"use client";

import MangaCard from "./MangaCard";
import type { AniListMedia } from "@/lib/api/anilist";
import { motion } from "framer-motion";

interface TrendingRowProps {
  title: string;
  items: AniListMedia[];
  loading?: boolean;
}

function SkeletonCard({ index }: { index: number }) {
  return (
    <div className="w-[140px] flex-shrink-0" style={{ animationDelay: `${index * 100}ms` }}>
      <div className="skeleton rounded-xl" style={{ aspectRatio: "3/4", width: 140 }} />
      <div className="skeleton mt-2 h-3 w-24 rounded" />
      <div className="skeleton mt-1 h-2 w-16 rounded" />
    </div>
  );
}

export default function TrendingRow({ title, items, loading = false }: TrendingRowProps) {
  return (
    <section className="mt-8">
      <motion.h2
        className="text-lg font-bold text-text-primary px-4 mb-3"
        style={{ fontFamily: "var(--font-display)" }}
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.3 }}
      >
        {title}
      </motion.h2>

      <div className="snap-row">
        {loading
          ? Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} index={i} />)
          : items.map((media, i) => (
              <MangaCard key={media.id} media={media} index={i} />
            ))}
      </div>
    </section>
  );
}
