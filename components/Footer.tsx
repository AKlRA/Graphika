"use client";

import { motion } from "framer-motion";
import { Heart } from "lucide-react";

export default function Footer() {
  return (
    <footer className="fixed bottom-20 md:bottom-6 right-4 z-40 opacity-80 select-none flex flex-col items-end pointer-events-none">
      <div
        className="flex items-center gap-1.5 text-[10px] font-medium px-3 py-2 rounded-full pointer-events-auto shadow-lg"
        style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border-default)",
          color: "var(--text-secondary)"
        }}
      >
        <span>Designed with</span>
        <motion.div
          animate={{ scale: [1, 1.2, 1] }}
          transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
        >
          <Heart size={10} fill="var(--accent-rose)" color="var(--accent-rose)" />
        </motion.div>
        <span>by Bhuvan M H</span>
      </div>
    </footer>
  );
}
