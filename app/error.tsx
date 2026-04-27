"use client";

import { useEffect } from "react";
import { motion } from "framer-motion";
import BottomNav from "@/components/BottomNav";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div
      className="min-h-dvh"
      style={{ background: "var(--bg-base)", paddingBottom: 80 }}
    >
      <div className="flex flex-col items-center justify-center min-h-[80vh] px-6">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass w-full max-w-sm p-8 text-center"
          style={{ borderRadius: "var(--radius-xl)" }}
        >
          <div
            className="w-16 h-16 rounded-full mx-auto mb-6 flex items-center justify-center"
            style={{ background: "rgba(240, 98, 146, 0.15)" }}
          >
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--accent-rose)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <h2
            className="text-xl font-bold mb-2 text-text-primary"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Something went wrong
          </h2>
          <p className="text-sm text-text-muted mb-8">
            We couldn&apos;t load this section. Please try again.
          </p>
          <button
            onClick={() => reset()}
            className="w-full py-3 rounded-xl font-bold text-sm transition-transform active:scale-95"
            style={{
              fontFamily: "var(--font-display)",
              background: "var(--accent-violet)",
              color: "#fff",
              boxShadow: "0 4px 20px rgba(124, 111, 247, 0.3)",
            }}
          >
            Try again
          </button>
        </motion.div>
      </div>
      <BottomNav />
    </div>
  );
}
