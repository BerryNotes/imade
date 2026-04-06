"use client";

import { Reveal } from "./reveal";

const steps = [
  {
    num: "01",
    title: "Build your catalog",
    desc: "Drop your beats and tracks into iMade. It organizes everything by genre, date, and metadata — turning scattered files into a structured catalog you can actually evaluate.",
    icon: (
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="17 8 12 3 7 8" />
        <line x1="12" y1="3" x2="12" y2="15" />
      </svg>
    ),
  },
  {
    num: "02",
    title: "Make honest decisions",
    desc: "Pick between two songs at a time — no overthinking, no mood bias. Guided sessions and bracket tournaments structure the process so every comparison counts.",
    icon: (
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
      </svg>
    ),
  },
  {
    num: "03",
    title: "Understand your trajectory",
    desc: "Elo ratings reveal which genres you excel at, whether your music is improving, and where to double down. Make intentional choices about what to release, pitch, or sharpen.",
    icon: (
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <line x1="18" y1="20" x2="18" y2="10" />
        <line x1="12" y1="20" x2="12" y2="4" />
        <line x1="6" y1="20" x2="6" y2="14" />
      </svg>
    ),
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="py-32 px-6 relative">
      {/* Divider line */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-px h-24 bg-gradient-to-b from-transparent to-border" />

      <div className="max-w-4xl mx-auto">
        <Reveal>
          <div className="text-center mb-20">
            <p className="text-xs font-medium text-accent tracking-widest uppercase mb-3">
              How it works
            </p>
            <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tight">
              From scattered files to real self-awareness
            </h2>
          </div>
        </Reveal>

        <div className="space-y-0">
          {steps.map((step, i) => (
            <Reveal key={step.num} delay={i * 0.12}>
              <div className="group relative flex gap-8 py-10 border-b border-border last:border-0">
                {/* Number */}
                <div className="flex-shrink-0 w-14 pt-1">
                  <span className="font-display text-2xl font-bold text-border-light group-hover:text-accent transition-colors duration-300">
                    {step.num}
                  </span>
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-3">
                    <span className="text-text-muted group-hover:text-accent transition-colors duration-300">
                      {step.icon}
                    </span>
                    <h3 className="font-display text-lg font-medium text-text">
                      {step.title}
                    </h3>
                  </div>
                  <p className="text-sm text-text-muted leading-relaxed max-w-md">
                    {step.desc}
                  </p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
