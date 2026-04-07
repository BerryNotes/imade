"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
export function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <motion.nav
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className="fixed top-0 left-0 right-0 z-50"
    >
      <div className="mx-auto max-w-6xl px-6 py-5 flex items-center justify-between">
        <a
          href="/"
          className="font-display text-lg font-bold tracking-tight text-text"
        >
          iMade
        </a>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-8">
          <a
            href="/"
            className="text-sm text-text-muted hover:text-text transition-colors duration-200"
          >
            Home
          </a>
<a
            href="/changelog"
            className="text-sm text-text-muted hover:text-text transition-colors duration-200"
          >
            Changelog
          </a>
          <a
            href="https://app.imade.one"
            className="text-sm font-semibold text-white bg-accent hover:bg-accent/80 px-4 py-2 rounded-lg transition-colors duration-200"
          >
            Log In
          </a>
        </div>

        {/* Mobile hamburger */}
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="md:hidden flex flex-col gap-1.5 p-2"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
        >
          <span
            className={`block w-5 h-0.5 bg-text transition-all duration-200 ${
              menuOpen ? "rotate-45 translate-y-2" : ""
            }`}
          />
          <span
            className={`block w-5 h-0.5 bg-text transition-all duration-200 ${
              menuOpen ? "opacity-0" : ""
            }`}
          />
          <span
            className={`block w-5 h-0.5 bg-text transition-all duration-200 ${
              menuOpen ? "-rotate-45 -translate-y-2" : ""
            }`}
          />
        </button>
      </div>

      {/* Mobile menu dropdown */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="md:hidden overflow-hidden border-t border-border"
            style={{ background: "rgba(13, 13, 26, 0.95)", backdropFilter: "blur(12px)" }}
          >
            <div className="flex flex-col px-6 py-4 gap-4">
              <a
                href="/"
                onClick={() => setMenuOpen(false)}
                className="text-sm text-text-muted hover:text-text transition-colors duration-200"
              >
                Home
              </a>
<a
                href="/changelog"
                onClick={() => setMenuOpen(false)}
                className="text-sm text-text-muted hover:text-text transition-colors duration-200"
              >
                Changelog
              </a>
              <a
                href="https://app.imade.one"
                onClick={() => setMenuOpen(false)}
                className="text-sm font-semibold text-white bg-accent hover:bg-accent/80 px-4 py-2 rounded-lg transition-colors duration-200 text-center"
              >
                Log In
              </a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.nav>
  );
}
