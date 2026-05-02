"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion, AnimatePresence, useScroll, useTransform } from "framer-motion";
import { Play } from "lucide-react";
import type { AniListMedia } from "@/lib/api/anilist";
import { getDisplayTitle, getMangaType } from "@/lib/api/anilist";

interface HeroSectionProps {
  mediaList: AniListMedia[];
  loading?: boolean;
}

export default function HeroSection({ mediaList, loading = false }: HeroSectionProps) {
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (!mediaList || mediaList.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % mediaList.length);
    }, 9000);
    return () => clearInterval(interval);
  }, [mediaList]);

  const { scrollY } = useScroll();
  const yParallax = useTransform(scrollY, [0, 500], [0, 120]);

  if (loading || !mediaList || mediaList.length === 0) {
    return (
      <div className="relative w-full" style={{ height: "420px" }}>
        <div className="skeleton absolute inset-0 rounded-none" />
        <div className="absolute bottom-6 left-0 right-0 px-4 md:pl-[96px] flex justify-center md:justify-start">
          <div className="glass p-5 w-full max-w-[460px]">
            <div className="skeleton h-6 w-48 rounded mb-3" />
            <div className="skeleton h-3 w-32 rounded mb-2" />
            <div className="skeleton h-10 w-36 rounded mt-4" />
          </div>
        </div>
      </div>
    );
  }

  const media = mediaList[currentIndex];
  const title = getDisplayTitle(media);
  const type = getMangaType(media);
  const bannerUrl = media.bannerImage || media.coverImage.extraLarge;

  return (
    <div className="relative w-full overflow-hidden" style={{ height: "420px" }}>
      <AnimatePresence mode="wait">
        <motion.div
          key={media.id}
          className="absolute inset-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.75 }}
        >
          <motion.div className="absolute inset-0" style={{ y: yParallax }}>
            <Image
              src={bannerUrl}
              alt={title}
              fill
              priority
              sizes="100vw"
              className="object-cover"
              style={{ filter: "brightness(0.6) saturate(1.05) contrast(1.05)" }}
            />
          </motion.div>

          <div
            className="absolute inset-0 z-[1]"
            style={{
              background:
                "linear-gradient(to top, rgba(5,5,4,1) 0%, rgba(5,5,4,0.78) 38%, rgba(5,5,4,0.22) 68%, transparent 100%)",
            }}
          />

          <div
            className="absolute inset-0 z-[1]"
            style={{
              background:
                "linear-gradient(to right, rgba(5,5,4,0.66) 0%, transparent 34%, transparent 68%, rgba(5,5,4,0.52) 100%)",
            }}
          />

          <div className="absolute bottom-6 left-0 right-0 w-full px-4 flex justify-center md:justify-start md:bottom-10 md:pl-[96px] z-[5]">
            <div className="relative w-full max-w-[460px]">
              <div
                className="hero-glow-layer absolute -inset-2.5 rounded-lg bg-transparent pointer-events-none z-0"
                style={{ filter: "blur(12px)" }}
                aria-hidden="true"
              />

              <motion.div
                className="hero-glass-card relative z-10 w-full rounded-lg px-5 py-5"
                initial={{ y: 18, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.18, duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
              >
                <div
                  aria-hidden="true"
                  className="absolute top-0 left-[8%] right-[8%] h-px rounded-full pointer-events-none"
                  style={{
                    background:
                      "linear-gradient(to right, transparent, rgba(243,240,230,0.18), var(--accent-violet), rgba(243,240,230,0.18), transparent)",
                    opacity: 0.6,
                  }}
                />

                <span
                  className="editorial-label"
                  style={{ color: type === "MANHWA" ? "var(--accent-cyan)" : "var(--accent-violet)" }}
                >
                  {type} / Featured
                </span>

                <h1
                  className="text-2xl md:text-3xl font-extrabold mt-2 leading-tight drop-shadow-md line-clamp-2"
                  style={{
                    fontFamily: "var(--font-display)",
                    color: "var(--text-primary)",
                    letterSpacing: "0",
                  }}
                >
                  {title}
                </h1>

                <div className="flex flex-wrap gap-1.5 mt-2.5">
                  {media.genres.slice(0, 3).map((genre) => (
                    <span key={genre} className="genre-pill">
                      {genre}
                    </span>
                  ))}
                  {media.averageScore && (
                    <span
                      className="genre-pill flex items-center gap-1"
                      style={{
                        background: "var(--color-highlight-dim)",
                        borderColor: "rgba(159,231,215,0.28)",
                        color: "var(--accent-cyan)",
                      }}
                    >
                      Score {media.averageScore}
                    </span>
                  )}
                </div>

                <Link href={`/manga/${media.id}`}>
                  <motion.button
                    className="mt-4 flex items-center gap-2 px-5 py-2.5 rounded-md font-semibold text-sm"
                    style={{
                      fontFamily: "var(--font-display)",
                      background: "var(--accent-violet)",
                      color: "#050504",
                      boxShadow: "0 10px 30px rgba(214,255,77,0.18), 0 1px 3px rgba(0,0,0,0.3)",
                    }}
                    whileHover={{
                      y: -2,
                      boxShadow: "0 14px 34px rgba(214,255,77,0.24), 0 1px 3px rgba(0,0,0,0.3)",
                    }}
                    whileTap={{ scale: 0.96 }}
                  >
                    <Play size={15} fill="currentColor" />
                    Start Reading
                  </motion.button>
                </Link>
              </motion.div>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>

      {mediaList.length > 1 && (
        <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-2 z-20 md:bottom-4 md:pl-20">
          {mediaList.map((m, idx) => (
            <button
              key={m.id}
              onClick={() => setCurrentIndex(idx)}
              className="rounded-full transition-all duration-300"
              aria-label={`Show featured title ${idx + 1}`}
              style={{
                width: idx === currentIndex ? "20px" : "6px",
                height: "6px",
                background: idx === currentIndex ? "var(--accent-violet)" : "rgba(243,240,230,0.35)",
                boxShadow: idx === currentIndex ? "0 0 8px rgba(214,255,77,0.34)" : "none",
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
