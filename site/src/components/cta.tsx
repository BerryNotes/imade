"use client";

import { Reveal } from "./reveal";
export function CTA() {
  return (
    <section id="cta" className="py-32 px-6 relative">
      {/* Glow */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[300px] rounded-full opacity-[0.06] pointer-events-none"
        aria-hidden="true"
        style={{
          background:
            "radial-gradient(circle, var(--color-accent) 0%, transparent 70%)",
        }}
      />

      <div className="relative max-w-2xl mx-auto text-center">
        <Reveal>
          <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tight mb-4">
            Stop flying blind.
            <br />
            <span className="text-accent">Start growing deliberately.</span>
          </h2>
        </Reveal>

        <Reveal delay={0.1}>
          <p className="text-text-muted mb-10 max-w-md mx-auto leading-relaxed">
            Structure your own judgement. Track your progress.
            Know exactly where you stand.
          </p>
        </Reveal>

      </div>
    </section>
  );
}
