"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { Home, Search, BookOpen } from "lucide-react";
import { motion } from "framer-motion";

const NAV_ITEMS = [
  { href: "/", icon: Home, label: "Home" },
  { href: "/search", icon: Search, label: "Search" },
  { href: "/library", icon: BookOpen, label: "Library" },
];

export default function BottomNav() {
  const pathname = usePathname();

  // Hide on reader pages
  if (pathname.includes("/read")) return null;

  return (
    <>
      {/* Spacer to avoid content hiding behind fixed nav */}
      <div className="h-20 md:hidden" />

      {/* Mobile bottom nav */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-50 md:hidden safe-bottom"
        style={{
          background: "var(--glass-bg)",
          backdropFilter: "var(--glass-blur)",
          WebkitBackdropFilter: "var(--glass-blur)",
          borderTop: "1px solid var(--border-subtle)",
        }}
      >
        <div className="flex items-center justify-around h-16 max-w-md mx-auto px-6">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => typeof navigator !== 'undefined' && navigator.vibrate?.(10)}
                className="relative flex flex-col items-center justify-center gap-1 min-w-[44px] min-h-[44px]"
              >
                <motion.div
                  className="relative flex flex-col items-center"
                  whileTap={{ scale: 0.9 }}
                >
                  <Icon
                    size={22}
                    className="transition-colors duration-200"
                    style={{
                      color: isActive ? "var(--accent-violet)" : "var(--text-muted)",
                    }}
                  />
                  {isActive && (
                    <motion.div
                      layoutId="nav-glow"
                      className="absolute -bottom-1 w-5 h-0.5 rounded-full"
                      style={{
                        background: "var(--accent-violet)",
                        boxShadow: "0 0 12px var(--accent-violet)",
                      }}
                      transition={{ type: "spring", stiffness: 400, damping: 30 }}
                    />
                  )}
                  <span
                    className="text-[10px] mt-1 font-medium transition-colors duration-200"
                    style={{ color: isActive ? "var(--accent-violet)" : "var(--text-muted)" }}
                  >
                    {item.label}
                  </span>
                </motion.div>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Desktop sidebar */}
      <aside
        className="hidden md:flex fixed left-0 top-0 bottom-0 z-50 w-20 flex-col items-center py-8 gap-6"
        style={{
          background: "var(--bg-surface)",
          backdropFilter: "var(--glass-blur)",
          borderRight: "1px solid var(--border-default)",
        }}
      >

        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="relative flex flex-col items-center justify-center gap-1 min-w-[44px] min-h-[44px] rounded-xl transition-all duration-200"
              style={{
                background: isActive ? "rgba(124, 111, 247, 0.1)" : "transparent",
              }}
            >
              <Icon
                size={22}
                style={{ color: isActive ? "var(--accent-violet)" : "var(--text-muted)" }}
              />
              <span
                className="text-[9px] font-medium"
                style={{ color: isActive ? "var(--accent-violet)" : "var(--text-muted)" }}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </aside>
    </>
  );
}
