"use client";

import { Reveal } from "./reveal";

const features = [
  {
    title: "Elo ranking system",
    desc: "The same algorithm used in chess. Every comparison updates ratings so your best work rises to the top.",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
        <polyline points="17 6 23 6 23 12" />
      </svg>
    ),
  },
  {
    title: "Head-to-head battles",
    desc: "Pick between two songs at a time. No overthinking — just honest, in-the-moment decisions.",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
      </svg>
    ),
  },
  {
    title: "Bracket tournaments",
    desc: "Run structured elimination brackets to find your top songs from any pool. Great for picking singles.",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="3" width="6" height="5" rx="1" />
        <rect x="2" y="16" width="6" height="5" rx="1" />
        <rect x="16" y="9.5" width="6" height="5" rx="1" />
        <path d="M8 5.5h4v13H8" />
        <path d="M12 12h4" />
      </svg>
    ),
  },
  {
    title: "Genre analysis",
    desc: "See which genres you dominate. Filter rankings, run genre-specific sessions, track strengths over time.",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        <path d="M2 12h20" />
      </svg>
    ),
  },
  {
    title: "Smart playlists",
    desc: "Build playlists from your rankings or create custom ones. Export as M3U for any player.",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 18V5l12-2v13" />
        <circle cx="6" cy="18" r="3" />
        <circle cx="18" cy="16" r="3" />
      </svg>
    ),
  },
  {
    title: "Audio visualizer",
    desc: "9 visual modes with reactive effects. Watch your music come alive while you listen and compare.",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="1" y="6" width="4" height="12" rx="1" />
        <rect x="7" y="3" width="4" height="18" rx="1" />
        <rect x="13" y="8" width="4" height="8" rx="1" />
        <rect x="19" y="5" width="4" height="14" rx="1" />
      </svg>
    ),
  },
];

export function Features() {
  return (
    <section id="features" className="py-32 px-6">
      <div className="max-w-5xl mx-auto">
        <Reveal>
          <div className="text-center mb-16">
            <p className="text-xs font-medium text-accent tracking-widest uppercase mb-3">
              Features
            </p>
            <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tight">
              Everything you need to evaluate your work
            </h2>
          </div>
        </Reveal>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((f, i) => (
            <Reveal key={f.title} delay={i * 0.08} variant="fadeUp">
              <div className="group p-6 rounded-2xl border border-border-light bg-bg-card hover:bg-bg-card-hover hover:border-accent/30 transition-colors duration-300">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-4 text-text-muted group-hover:text-accent transition-colors duration-300"
                  style={{ background: "rgba(129, 140, 248, 0.12)" }}
                >
                  {f.icon}
                </div>
                <h3 className="font-display text-sm font-medium text-text mb-2">
                  {f.title}
                </h3>
                <p className="text-sm text-text-muted leading-relaxed">
                  {f.desc}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
