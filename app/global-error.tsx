"use client";

import { useEffect } from "react";
import { motion } from "framer-motion";

export default function GlobalError({
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
    <html lang="en">
      <body>
        <div
          className="min-h-dvh flex items-center justify-center p-6"
          style={{ background: "var(--bg-base)", color: "var(--text-primary)" }}
        >
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass w-full max-w-sm p-8 text-center"
            style={{ borderRadius: "var(--radius-xl)" }}
          >
            <div
              className="w-16 h-16 rounded-full mx-auto mb-6 flex items-center justify-center"
              style={{ background: "rgba(240, 216, 168, 0.14)" }}
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
              A critical error occurred while loading this page.
            </p>
            <button
              onClick={() => reset()}
              className="w-full py-3 rounded-xl font-bold text-sm transition-transform active:scale-95"
              style={{
                fontFamily: "var(--font-display)",
                background: "var(--accent-violet)",
                color: "#050504",
                boxShadow: "0 10px 28px rgba(214, 255, 77, 0.16)",
              }}
            >
              Try again
            </button>
          </motion.div>
        </div>
      </body>
    </html>
  );
}
