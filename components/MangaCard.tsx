"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import type { AniListMedia } from "@/lib/api/anilist";
import { getDisplayTitle, getMangaType } from "@/lib/api/anilist";

interface MangaCardProps {
  media: AniListMedia;
  index?: number;
  variant?: "portrait" | "continue";
  progress?: { chapter: number; totalChapters: number | null };
}

export default function MangaCard({ media, index = 0, variant = "portrait", progress }: MangaCardProps) {
  const title = getDisplayTitle(media);
  const type = getMangaType(media);
  const coverUrl = media.coverImage.extraLarge || media.coverImage.large;

  if (variant === "continue" && progress) {
    const pct = progress.totalChapters
      ? Math.min((progress.chapter / progress.totalChapters) * 100, 100)
      : 0;

    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.05, duration: 0.3 }}
      >
        <Link href={`/manga/${media.id}`} className="block w-[140px]">
          <motion.div
            className="relative overflow-hidden rounded-lg"
            style={{ aspectRatio: "3/4" }}
            whileHover={{ y: -6, scale: 1.03 }}
            whileTap={{ scale: 0.96 }}
            transition={{ duration: 0.3 }}
          >
            <Image
              src={coverUrl}
              alt={title}
              fill
              sizes="140px"
              className="object-cover"
            />
            {/* Gradient overlay */}
            <div
              className="absolute inset-0"
              style={{
                background: "linear-gradient(to top, rgba(5,5,4,0.92) 0%, transparent 55%)",
              }}
            />
            {/* Info */}
            <div className="absolute bottom-0 left-0 right-0 p-3">
              <p
                className="text-xs font-semibold text-text-primary truncate"
                style={{
                  fontFamily: "var(--font-display)",
                  textShadow: "0 1px 6px rgba(0, 0, 0, 0.8)",
                }}
              >
                {title}
              </p>
              <p className="text-[10px] text-text-muted mt-0.5" style={{ fontFamily: "var(--font-mono)" }}>
                Ch {progress.chapter}
              </p>
              {/* Progress bar */}
              <div className="progress-bar mt-2">
                <motion.div
                  className="progress-fill"
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.6, ease: "easeOut", delay: index * 0.05 + 0.2 }}
                />
              </div>
            </div>
          </motion.div>
        </Link>
      </motion.div>
    );
  }

  // Portrait card (default)
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.3 }}
    >
      <Link href={`/manga/${media.id}`} className="block w-[140px]">
          <motion.div
            className="relative overflow-hidden rounded-lg group"
            style={{ aspectRatio: "3/4" }}
            whileHover={{ y: -6, scale: 1.03 }}
            whileTap={{ scale: 0.96 }}
            transition={{ duration: 0.3 }}
          >
          <Image
            src={coverUrl}
            alt={title}
            fill
            sizes="140px"
            className="object-cover transition-transform duration-500 group-hover:scale-105"
          />
          {/* Gradient overlay */}
          <div
            className="absolute inset-0"
            style={{
              background: "linear-gradient(to top, rgba(5,5,4,0.92) 0%, transparent 55%)",
            }}
          />
          {/* Type badge */}
          <div className="absolute top-2 right-2 flex flex-col items-end gap-1.5">
            {/* Score badge */}
            {media.averageScore && (
              <div
                className="flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold"
                style={{
                  background: "rgba(5, 5, 4, 0.72)",
                  color: "var(--accent-cyan)",
                  backdropFilter: "blur(12px)",
                  WebkitBackdropFilter: "blur(12px)",
                  border: "1px solid rgba(159, 231, 215, 0.28)",
                }}
              >
                ★
              </div>
            )}
            {/* Type badge */}
            <span
              className="text-[9px] font-bold px-1.5 py-0.5 rounded"
              style={{
                background:
                  type === "MANHWA"
                    ? "rgba(159, 231, 215, 0.16)"
                    : type === "MANHUA"
                      ? "rgba(240, 216, 168, 0.16)"
                      : "rgba(214, 255, 77, 0.14)",
                color:
                  type === "MANHWA"
                    ? "var(--accent-cyan)"
                    : type === "MANHUA"
                      ? "var(--accent-rose)"
                      : "var(--accent-violet)",
              }}
            >
              {type}
            </span>
          </div>
          {/* Info */}
          <div className="absolute bottom-0 left-0 right-0 p-3">
            <p
              className="text-xs font-semibold text-text-primary truncate"
              style={{
                fontFamily: "var(--font-display)",
                textShadow: "0 1px 6px rgba(0, 0, 0, 0.8)",
              }}
            >
              {title}
            </p>
            <div className="flex items-center gap-1.5 mt-1">
              {media.averageScore && (
                <span
                  className="text-[10px] font-medium"
                  style={{
                    color: "var(--accent-cyan)",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  ★ {media.averageScore}%
                </span>
              )}
              {media.genres[0] && (
                <span className="text-[10px] text-text-muted truncate">
                  {media.genres[0]}
                </span>
              )}
            </div>
          </div>
        </motion.div>
      </Link>
    </motion.div>
  );
}
