"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Search, Moon, Sun } from "lucide-react";
import { motion } from "framer-motion";

export default function Header() {
  const [isDark, setIsDark] = useState(true);

  useEffect(() => {
    // Read preference on mount
    const saved = localStorage.getItem("theme");
    const prefersDark = saved === null ? true : saved === "dark";
    setIsDark(prefersDark);
    if (!prefersDark) {
      document.documentElement.classList.add("light");
    }
  }, []);

  const toggleTheme = () => {
    setIsDark((prev) => {
      const next = !prev;
      if (next) {
        document.documentElement.classList.remove("light");
        localStorage.setItem("theme", "dark");
      } else {
        document.documentElement.classList.add("light");
        localStorage.setItem("theme", "light");
      }
      return next;
    });
  };

  return (
    <motion.header
      className="fixed top-0 left-0 right-0 z-40 safe-top md:left-20"
      style={{
        background: "var(--glass-bg)",
        backdropFilter: "var(--glass-blur)",
        WebkitBackdropFilter: "var(--glass-blur)",
        borderBottom: "1px solid var(--border-default)",
      }}
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      <div className="flex items-center justify-between h-14 px-4 max-w-7xl mx-auto">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2">
          <Image
            src="/logo.png"
            width={32}
            height={32}
            className="rounded-lg object-cover"
            alt="Graphika Logo"
          />
          <h1
            className="text-base font-extrabold tracking-tight"
            style={{
              fontFamily: "var(--font-display)",
              background: "linear-gradient(135deg, var(--accent-violet) 0%, var(--accent-rose) 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              color: "var(--text-primary)",
            }}
          >
            Graphika
          </h1>
        </Link>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {/* Theme Toggle */}
          <button
            onClick={toggleTheme}
            className="glass flex items-center justify-center w-8 h-8 rounded-full transition-colors"
            title="Toggle theme"
          >
            {isDark ? (
              <Moon size={14} className="text-text-muted" />
            ) : (
              <Sun size={14} className="text-text-muted" />
            )}
          </button>

          {/* Search pill */}
          <Link href="/search">
            <motion.div
              className="glass glass-hover flex items-center gap-2 px-3 h-8 cursor-pointer"
              style={{ borderRadius: "var(--radius-full)" }}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
            >
              <Search size={14} className="text-text-muted" />
              <span className="text-xs text-text-muted hidden sm:inline">Search manga…</span>
            </motion.div>
          </Link>
        </div>
      </div>
    </motion.header>
  );
}
