"use client";

import { useState, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Layers, ArrowUpDown, ExternalLink, Search } from "lucide-react";
import { type ChapterGroup } from "@/lib/chapters";
import { type ReadingProgress } from "@/lib/storage";
import BottomSheet from "./BottomSheet";

interface ChapterListProps {
  groups: ChapterGroup[];
  allScanlators: string[];
  onChapterSelect: (group: ChapterGroup) => void;
  readProgress: ReadingProgress | null;
  /** Chapter numbers opened from this list or reader (dims rows). */
  touchedChapters: Set<number>;
}

type SourceFilter = "all" | "mangadex" | "comix";

function formatDate(dateStr: string): string {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays}d ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return "";
  }
}

export default function ChapterList({
  groups,
  allScanlators,
  onChapterSelect,
  readProgress,
  touchedChapters,
}: ChapterListProps) {
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [scanlatorFilter, setScanlatorFilter] = useState<string>("all");
  const [sortAsc, setSortAsc] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerGroup, setPickerGroup] = useState<ChapterGroup | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [jumpInput, setJumpInput] = useState("");

  const lastReadChapter = readProgress?.chapter ?? -1;

  const chapterVisited = (ch: number) =>
    touchedChapters.has(ch) ||
    (lastReadChapter >= 0 && ch <= lastReadChapter + 1e-6);

  const filteredGroups = useMemo(() => {
    let result = groups;

    // Source filter
    if (sourceFilter !== "all") {
      result = result.filter((g) =>
        g.versions.some((v) => 
          sourceFilter === "mangadex" ? v.source === "mangadex" : v.source !== "mangadex"
        )
      );
    }

    // Scanlator filter
    if (scanlatorFilter !== "all") {
      result = result.filter((g) =>
        g.versions.some(
          (v) => v.scanlationGroup.toLowerCase() === scanlatorFilter.toLowerCase()
        )
      );
    }

    // Sort
    if (sortAsc) {
      result = [...result].sort((a, b) => a.chapterNumber - b.chapterNumber);
    } else {
      result = [...result].sort((a, b) => b.chapterNumber - a.chapterNumber);
    }

    return result;
  }, [groups, sourceFilter, scanlatorFilter, sortAsc]);

  const sourceTabStyle = (active: boolean) => ({
    background: active ? "rgba(214, 255, 77, 0.12)" : "transparent",
    color: active ? "var(--accent-violet)" : "var(--text-muted)",
    border: active ? "1px solid rgba(214, 255, 77, 0.24)" : "1px solid transparent",
  });

  return (
    <>
      <div className="glass overflow-hidden">
        {/* Sticky filter bar */}
        <div
          className="sticky top-0 z-10 px-4 py-3 flex flex-col gap-2"
          style={{
            background: "rgba(5, 5, 4, 0.94)",
            backdropFilter: "blur(12px)",
            borderBottom: "1px solid var(--border-subtle)",
          }}
        >
          {/* Source tabs + sort */}
          <div className="flex items-center gap-2">
            {(["all", "mangadex", "comix"] as SourceFilter[]).map((src) => (
              <button
                key={src}
                onClick={() => setSourceFilter(src)}
                className="px-3 py-1.5 rounded-full text-xs font-semibold transition-all duration-200"
                style={sourceTabStyle(sourceFilter === src)}
              >
                {src === "all" ? "All" : src === "mangadex" ? "MD" : "CK"}
              </button>
            ))}

            <div className="flex-1" />

            {/* Scanlator dropdown */}
            {allScanlators.length > 1 && (
              <div className="relative">
                <select
                  value={scanlatorFilter}
                  onChange={(e) => setScanlatorFilter(e.target.value)}
                  className="pl-3 pr-8 py-1.5 text-xs font-medium cursor-pointer"
                  style={{
                    color: "var(--text-secondary)",
                    backgroundColor: "rgba(243, 240, 230, 0.055)",
                  }}
                >
                  <option value="all">All Groups</option>
                  {allScanlators.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Sort toggle */}
            <button
              onClick={() => setSortAsc(!sortAsc)}
              className="w-8 h-8 flex items-center justify-center rounded-full transition-all"
              style={{ background: "var(--border-default)" }}
              title={sortAsc ? "Sort descending" : "Sort ascending"}
            >
              <ArrowUpDown size={14} className="text-text-muted" />
            </button>
          </div>

          {/* Chapter count & Jump */}
          <div className="flex items-center justify-between w-full mt-2">
            <p className="text-[11px] text-text-muted">
              {filteredGroups.length} chapter{filteredGroups.length !== 1 ? "s" : ""}
              {(() => {
                const extCount = filteredGroups.filter(g => g.activeVersion.type === "external").length;
                return extCount > 0 ? ` • ${extCount} external` : "";
              })()}
            </p>
            
            {filteredGroups.length > 100 && (
              <div
                className="flex items-center gap-1.5 px-2 py-1 rounded-md"
                style={{ background: "var(--border-default)", border: "1px solid var(--border-default)" }}
              >
                <Search size={10} className="text-text-muted" />
                <input
                  type="number"
                  placeholder="Jump to..."
                  value={jumpInput}
                  onChange={(e) => {
                    setJumpInput(e.target.value);
                    const ch = parseFloat(e.target.value);
                    if (!isNaN(ch)) {
                      const el = containerRef.current?.querySelector(`[data-chapter="${ch}"]`);
                      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
                    }
                  }}
                  className="bg-transparent text-[10px] text-text-primary w-12 outline-none"
                />
              </div>
            )}
          </div>
        </div>

        {/* Chapter rows */}
        <div className="max-h-[60vh] overflow-y-auto pb-4" ref={containerRef}>
          {filteredGroups.map((group) => {
            const active = group.activeVersion;
            const isExternal = active.type === "external";
            const isVisited = chapterVisited(group.chapterNumber);
            const isCurrent =
              lastReadChapter >= 0 &&
              Math.abs(group.chapterNumber - lastReadChapter) < 0.01;
            const isNew =
              !isVisited && !isExternal && group.chapterNumber > lastReadChapter + 1e-6;
            const hasMultiple = group.versions.length > 1;

            return (
              <motion.button
                key={group.chapterNumber}
                data-chapter={group.chapterNumber}
                className="w-full flex items-center gap-3 px-4 min-h-[56px] transition-all duration-200 text-left"
                style={{
                  opacity: isVisited && !isCurrent ? 0.45 : isExternal ? 0.72 : 1,
                  borderLeft: isCurrent
                    ? "2px solid var(--accent-violet)"
                    : "2px solid transparent",
                  background: isCurrent
                    ? "rgba(214, 255, 77, 0.06)"
                    : isVisited
                      ? "rgba(255,255,255,0.02)"
                      : "transparent",
                }}
                whileHover={
                  isExternal
                    ? { scale: 1.01, x: 4, backgroundColor: "rgba(212,160,23,0.08)" }
                    : { scale: 1.01, x: 4, backgroundColor: "rgba(255, 255, 255, 0.04)" }
                }
                onClick={() => {
                  if (typeof navigator !== "undefined" && navigator.vibrate) {
                    navigator.vibrate(10);
                  }
                  onChapterSelect(group);
                }}
                whileTap={{ scale: 0.98 }}
              >
                {/* Icon: external-link for external, dot for new, spacer for read */}
                {isExternal ? (
                  <ExternalLink
                    size={14}
                    className="flex-shrink-0"
                    style={{ color: isVisited ? "var(--text-muted)" : "#D4A017" }}
                  />
                ) : isNew && !isCurrent ? (
                  <div
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ background: "var(--accent-cyan)", boxShadow: "0 0 6px rgba(159, 231, 215, 0.36)" }}
                  />
                ) : (
                  <div className="w-2 flex-shrink-0" />
                )}

                {/* Chapter number */}
                <span
                  className="text-sm font-semibold flex-shrink-0 w-14 transition-colors"
                  style={{
                    fontFamily: "var(--font-mono)",
                    color: isCurrent
                      ? "var(--accent-violet)"
                      : isVisited
                        ? "var(--text-muted)"
                        : "var(--text-primary)",
                  }}
                >
                  {group.chapterString}
                </span>

                {/* Scanlator + title */}
                <div
                  className={`flex-1 min-w-0 transition-opacity ${isVisited && !isCurrent ? "opacity-55" : "opacity-100"}`}
                >
                  <p className="text-xs text-text-secondary truncate">
                    {active.scanlationGroup}
                  </p>
                  {active.title && (
                    <p className="text-[11px] text-text-muted truncate mt-0.5">
                      {active.title}
                    </p>
                  )}
                </div>

                {/* Source badge */}
                {isExternal ? (
                  <span
                    className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full flex-shrink-0"
                    style={{
                      background: "rgba(212,160,23,0.12)",
                      color: "#D4A017",
                      border: "1px solid rgba(212,160,23,0.2)",
                    }}
                  >
                    EXTERNAL
                  </span>
                ) : (
                  <span
                    className={active.source === "mangadex" ? "badge-md" : "badge-ck"}
                  >
                    {active.source === "mangadex" ? "MD" : "CK"}
                  </span>
                )}

                {/* Date */}
                <span
                  className="text-[10px] text-text-muted flex-shrink-0 w-14 text-right"
                  style={{ fontFamily: "var(--font-mono)" }}
                >
                  {formatDate(active.uploadedAt)}
                </span>

                {/* Multi-version icon */}
                {hasMultiple && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setPickerGroup(group);
                      setPickerOpen(true);
                    }}
                    className="w-7 h-7 flex items-center justify-center rounded-md flex-shrink-0"
                    style={{ background: "var(--border-default)" }}
                  >
                    <Layers size={13} className="text-text-muted" />
                  </button>
                )}
              </motion.button>
            );
          })}

          {filteredGroups.length === 0 && (
            <div className="py-12 text-center">
              <p className="text-sm text-text-muted">No chapters found</p>
            </div>
          )}
        </div>
      </div>

      {/* Version picker bottom sheet */}
      <BottomSheet
        isOpen={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title={`Chapter ${pickerGroup?.chapterString} — Sources`}
      >
        {pickerGroup && (
          <div className="flex flex-col gap-2">
            {pickerGroup.versions.map((version, i) => (
              <button
                key={`${version.source}-${version.scanlationGroup}-${i}`}
                className="flex items-center gap-3 p-3 rounded-xl transition-all"
                style={{
                  background:
                    version === pickerGroup.activeVersion
                      ? "rgba(214,255,77,0.1)"
                      : "rgba(255,255,255,0.03)",
                  border:
                    version === pickerGroup.activeVersion
                      ? "1px solid rgba(214,255,77,0.28)"
                      : "1px solid rgba(255,255,255,0.06)",
                }}
                onClick={() => {
                  onChapterSelect({
                    ...pickerGroup,
                    activeVersion: version,
                  });
                  setPickerOpen(false);
                }}
              >
                <span
                  className={version.source === "mangadex" ? "badge-md" : "badge-ck"}
                >
                  {version.source === "mangadex" ? "MD" : "CK"}
                </span>
                <div className="flex-1 text-left">
                  <p className="text-sm text-text-primary font-medium">
                    {version.scanlationGroup}
                  </p>
                  <p className="text-[11px] text-text-muted">
                    {formatDate(version.uploadedAt)}
                  </p>
                </div>
                {version === pickerGroup.activeVersion && (
                  <span className="text-[10px] font-bold" style={{ color: "var(--accent-violet)" }}>
                    ACTIVE
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </BottomSheet>
    </>
  );
}
