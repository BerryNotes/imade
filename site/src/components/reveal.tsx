"use client";

import { useReducedMotion } from "framer-motion";
import { motion, type Variants } from "framer-motion";
import type { ReactNode, CSSProperties } from "react";

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 32 },
  visible: { opacity: 1, y: 0 },
};

const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
};

const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: { opacity: 1, scale: 1 },
};

const noMotion: Variants = {
  hidden: { opacity: 1 },
  visible: { opacity: 1 },
};

const variants: Record<string, Variants> = { fadeUp, fadeIn, scaleIn };

interface RevealProps {
  children: ReactNode;
  variant?: "fadeUp" | "fadeIn" | "scaleIn";
  delay?: number;
  duration?: number;
  className?: string;
  style?: CSSProperties;
}

export function Reveal({
  children,
  variant = "fadeUp",
  delay = 0,
  duration = 0.7,
  className,
  style,
}: RevealProps) {
  const reduced = useReducedMotion();

  return (
    <motion.div
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-60px" }}
      variants={reduced ? noMotion : variants[variant]}
      transition={{ duration: reduced ? 0 : duration, delay: reduced ? 0 : delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
      style={style}
    >
      {children}
    </motion.div>
  );
}
