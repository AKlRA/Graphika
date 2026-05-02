"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}

export default function BottomSheet({ isOpen, onClose, title, children }: BottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);

  // Close on escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isOpen, onClose]);

  // Prevent body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Overlay */}
          <motion.div
            className="fixed inset-0 z-[60] sheet-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Sheet — bottom on mobile, centered on desktop */}
          {/* Mobile: bottom sheet */}
          <motion.div
            ref={sheetRef}
            className="fixed z-[70] md:hidden bottom-0 left-0 right-0 max-h-[85vh] overflow-hidden"
            style={{
              background: "rgba(12,12,10,0.98)",
              borderTopLeftRadius: 12,
              borderTopRightRadius: 12,
              border: "1px solid var(--border-default)",
              borderBottom: "none",
            }}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={0.2}
            onDragEnd={(_, info) => {
              if (info.offset.y > 100 || info.velocity.y > 500) onClose();
            }}
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-2">
              <div className="w-10 h-1 rounded-full bg-text-muted opacity-50" />
            </div>
            {title && (
              <div className="flex items-center justify-between px-5 pb-3">
                <h3
                  className="text-base font-bold text-text-primary"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  {title}
                </h3>
                <button
                  onClick={onClose}
                  className="w-8 h-8 flex items-center justify-center rounded-full"
                  style={{ background: "var(--border-default)" }}
                >
                  <X size={16} className="text-text-secondary" />
                </button>
              </div>
            )}
            <div className="px-5 pb-8 safe-bottom">{children}</div>
          </motion.div>

          {/* Desktop: centered dialog */}
          <motion.div
            className="fixed z-[70] hidden md:flex items-center justify-center inset-0 pointer-events-none"
          >
            <motion.div
              className="pointer-events-auto max-w-md w-full max-h-[70vh] overflow-hidden"
              style={{
                background: "rgba(12,12,10,0.98)",
                borderRadius: 8,
                border: "1px solid var(--border-default)",
              }}
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.2 }}
            >
              {title && (
                <div className="flex items-center justify-between px-6 pt-5 pb-3">
                  <h3
                    className="text-base font-bold text-text-primary"
                    style={{ fontFamily: "var(--font-display)" }}
                  >
                    {title}
                  </h3>
                  <button
                    onClick={onClose}
                    className="w-8 h-8 flex items-center justify-center rounded-full"
                    style={{ background: "rgba(255,255,255,0.06)" }}
                  >
                    <X size={16} className="text-text-secondary" />
                  </button>
                </div>
              )}
              <div className="px-6 pb-6">{children}</div>
            </motion.div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
