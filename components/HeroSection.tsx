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

  // Auto-rotate every 8 seconds
  useEffect(() => {
    if (!mediaList || mediaList.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % mediaList.length);
    }, 8000);
    return () => clearInterval(interval);
  }, [mediaList]);

  // Parallax effect
  const { scrollY } = useScroll();
  const yParallax = useTransform(scrollY, [0, 500], [0, 150]);

  if (loading || !mediaList || mediaList.length === 0) {
    return (
      <div className="relative w-full" style={{ height: "420px" }}>
        <div className="skeleton absolute inset-0 rounded-none" />
        <div className="absolute bottom-6 left-0 right-0 px-4 md:pl-[96px] flex justify-center md:justify-start">
          <div className="glass p-5 w-full max-w-[460px]">
            <div className="skeleton h-6 w-48 rounded mb-3" />
            <div className="skeleton h-3 w-32 rounded mb-2" />
            <div className="skeleton h-10 w-36 rounded-xl mt-4" />
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
          transition={{ duration: 0.8 }}
        >
          {/* Banner image with parallax */}
          <motion.div className="absolute inset-0" style={{ y: yParallax }}>
            <Image
              src={bannerUrl}
              alt={title}
              fill
              priority
              sizes="100vw"
              className="object-cover"
              style={{ filter: "brightness(0.65) saturate(1.3)" }}
            />
          </motion.div>

          {/* Bottom gradient — darkens where the card sits */}
          <div
            className="absolute inset-0 z-[1]"
            style={{
              background:
                "linear-gradient(to top, rgba(8,8,14,1) 0%, rgba(8,8,14,0.75) 35%, rgba(8,8,14,0.25) 65%, transparent 100%)",
            }}
          />

          {/* Side vignette — cinematic feel */}
          <div
            className="absolute inset-0 z-[1]"
            style={{
              background:
                "linear-gradient(to right, rgba(8,8,14,0.55) 0%, transparent 35%, transparent 65%, rgba(8,8,14,0.55) 100%)",
            }}
          />

          {/* Card area container - Handles Mobile Centering & Desktop Sidebar Offset */}
          <div className="absolute bottom-6 left-0 right-0 w-full px-4 flex justify-center md:justify-start md:bottom-10 md:pl-[96px] z-[5]">
            
            {/* Inner responsive wrapper */}
            <div className="relative w-full max-w-[460px]">
              
              {/* Ambient violet glow layer */}
              <div
                className="hero-glow-layer absolute -inset-2.5 rounded-[20px] bg-transparent pointer-events-none z-0"
                style={{ filter: "blur(12px)" }}
                aria-hidden="true"
              />

              {/* The card itself */}
              <motion.div
                className="hero-glass-card relative z-10 w-full rounded-2xl px-6 py-5"
                initial={{ y: 24, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.2, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
              >
                {/* Top edge light catch */}
                <div
                  aria-hidden="true"
                  className="absolute top-0 left-[8%] right-[8%] h-px rounded-full pointer-events-none"
                  style={{
                    background: "linear-gradient(to right, transparent, rgba(255,255,255,0.2), var(--accent-violet), rgba(255,255,255,0.2), transparent)",
                    opacity: 0.6
                  }}
                />

                {/* Left accent bar */}
                <div
                  aria-hidden="true"
                  className="absolute top-4 bottom-4 left-0 w-[3px] rounded-r-sm pointer-events-none"
                  style={{
                    background: "linear-gradient(to bottom, var(--accent-violet), var(--accent-rose))"
                  }}
                />

                {/* Type badge */}
                <span
                  className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full"
                  style={{
                    background: type === "MANHWA" ? "var(--color-highlight-dim)" : "var(--color-accent-dim)",
                    color: type === "MANHWA" ? "var(--accent-cyan)" : "var(--accent-violet)",
                    border: `1px solid ${type === "MANHWA" ? "rgba(34,211,238,0.25)" : "rgba(124,111,247,0.3)"}`
                  }}
                >
                  {type} • Featured
                </span>

                {/* Title */}
                <h1
                  className="text-xl md:text-2xl font-extrabold mt-2 leading-tight drop-shadow-md line-clamp-2"
                  style={{
                    fontFamily: "var(--font-display)",
                    color: "var(--text-primary)",
                    letterSpacing: "-0.02em",
                  }}
                >
                  {title}
                </h1>

                {/* Genres + score */}
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
                        borderColor: "rgba(34,211,238,0.28)",
                        color: "var(--accent-cyan)",
                      }}
                    >
                      ★ {media.averageScore}%
                    </span>
                  )}
                </div>

                {/* CTA button */}
                <Link href={`/manga/${media.id}`}>
                  <motion.button
                    className="mt-4 flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm text-white"
                    style={{
                      fontFamily: "var(--font-display)",
                      background: "linear-gradient(135deg, var(--accent-violet) 0%, #9B8FFF 100%)",
                      boxShadow: "0 4px 20px rgba(124,111,247,0.45), 0 1px 3px rgba(0,0,0,0.3)",
                    }}
                    whileHover={{
                      scale: 1.04,
                      boxShadow: "0 6px 28px rgba(124,111,247,0.6), 0 1px 3px rgba(0,0,0,0.3)",
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

      {/* Crossfade dots - Shifted md:pl-20 to visually center alongside the 80px sidebar */}
      {mediaList.length > 1 && (
        <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-2 z-20 md:bottom-4 md:pl-20">
          {mediaList.map((m, idx) => (
            <button
              key={m.id}
              onClick={() => setCurrentIndex(idx)}
              className="rounded-full transition-all duration-300"
              style={{
                width: idx === currentIndex ? "20px" : "6px",
                height: "6px",
                background: idx === currentIndex ? "var(--accent-violet)" : "rgba(255,255,255,0.4)",
                boxShadow: idx === currentIndex ? "0 0 8px var(--accent-violet)" : "none"
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}