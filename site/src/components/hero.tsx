"use client";

import { motion } from "framer-motion";
export function Hero() {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
      {/* Gradient orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
        <div
          className="absolute -top-1/4 -left-1/4 w-[600px] h-[600px] rounded-full opacity-[0.07]"
          style={{
            background:
              "radial-gradient(circle, var(--color-accent) 0%, transparent 70%)",
          }}
        />
        <div
          className="absolute -bottom-1/4 -right-1/4 w-[500px] h-[500px] rounded-full opacity-[0.05]"
          style={{
            background:
              "radial-gradient(circle, var(--color-gold) 0%, transparent 70%)",
          }}
        />
      </div>

      <div className="relative z-10 max-w-3xl mx-auto px-6 text-center">
        {/* Headline */}
        <motion.h1
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
          className="font-display text-5xl sm:text-6xl md:text-7xl font-bold tracking-tight leading-[1.05] mb-6"
        >
          See your growth.
          <br />
          <span className="text-accent">Find your strongest work.</span>
        </motion.h1>

        {/* Subheadline */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="text-lg text-text-muted max-w-lg mx-auto mb-10 leading-relaxed"
        >
          Stop guessing which beats hit hardest. Compare your songs head-to-head
          and let your own judgement, applied consistently over time, reveal your
          real strengths and growth.
        </motion.p>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="flex items-center justify-center gap-4"
        >
          <a
            href="#how-it-works"
            className="px-7 py-3.5 rounded-xl font-display font-medium text-sm text-text-muted border border-border hover:border-border-light hover:text-text transition-all duration-200"
          >
            How it works
          </a>
        </motion.div>

        {/* Scroll indicator */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 1.2 }}
          className="absolute bottom-12 left-1/2 -translate-x-1/2"
          aria-hidden="true"
        >
          <motion.div
            animate={{ y: [0, 6, 0] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            className="w-5 h-8 rounded-full border border-border-light flex items-start justify-center p-1"
          >
            <div className="w-1 h-1.5 rounded-full bg-text-dim" />
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
