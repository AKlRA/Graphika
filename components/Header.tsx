"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Search } from "lucide-react";
import { motion } from "framer-motion";

export default function Header() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    document.documentElement.classList.remove("light");
    localStorage.removeItem("theme");

    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <motion.header
      className="fixed top-0 left-0 right-0 z-40 safe-top md:left-20"
      style={{
        background: scrolled ? "rgba(5,5,4,0.86)" : "rgba(5,5,4,0.54)",
        backdropFilter: "var(--glass-blur)",
        WebkitBackdropFilter: "var(--glass-blur)",
        borderBottom: scrolled
          ? "1px solid var(--border-default)"
          : "1px solid transparent",
      }}
      initial={{ y: -14, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.28 }}
    >
      <div className="flex items-center justify-between h-14 px-4 max-w-7xl mx-auto">
        <Link href="/" className="flex items-center gap-2">
          <Image
            src="/graphika-mark.svg"
            width={48}
            height={48}
            className="rounded-md object-cover"
            alt="Graphika Logo"
          />
          <div>
            <h1
              className="text-base font-extrabold leading-none"
              style={{
                fontFamily: "var(--font-display)",
                color: "var(--text-primary)",
                letterSpacing: "0",
              }}
            >
              Graphika
            </h1>
            <p className="editorial-label mt-1 hidden sm:block">Reader</p>
          </div>
        </Link>

        <Link href="/search" aria-label="Search manga">
          <motion.div
            className="glass glass-hover flex items-center gap-2 px-3 h-9 cursor-pointer"
            style={{ borderRadius: 6 }}
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.97 }}
          >
            <Search size={15} className="text-text-muted" />
            <span className="editorial-label hidden sm:inline">Search</span>
          </motion.div>
        </Link>
      </div>
    </motion.header>
  );
}
