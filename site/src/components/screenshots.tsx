"use client";

import { Reveal } from "./reveal";
import Image from "next/image";

type Screenshot = {
  label: string;
  subtitle: string;
  desc: string;
  file: string;
  beforeFile?: string;
};

const screenshots: Screenshot[] = [
  {
    label: "Catalog",
    subtitle: "From chaos to catalog",
    desc: "Turn a messy folder of hundreds of audio files into a structured, searchable library. Filter by genre, bulk tag, and find any song instantly.",
    file: "screenshot-library.png",
    beforeFile: "screenshot-folder.png",
  },
  {
    label: "Compare",
    subtitle: "Replace gut feeling with real decisions",
    desc: "Two songs, one choice. Guided sessions and bracket tournaments structure the process so every comparison counts.",
    file: "screenshot-battle.png",
  },
  {
    label: "Stats",
    subtitle: "See your trajectory over time",
    desc: "Every dot is a song, plotted by creation date and Elo rating. Spot trends across genres and track whether your music is actually improving.",
    file: "screenshot-stats.png",
  },
  {
    label: "Analytics",
    subtitle: "Know your strengths",
    desc: "Genre breakdowns, session history, and win/loss records reveal which styles you dominate and where to double down.",
    file: "screenshot-analytics.png",
  },
  {
    label: "Visualizer",
    subtitle: "9 modes of audio visualization",
    desc: "Bars, radial, wave, EQ, spectrograph, orbit, sphere, grid, and laser — all reacting to your music in real time.",
    file: "screenshot-visualizer.png",
  },
];

export function Screenshots() {
  return (
    <section id="screenshots" className="py-32 px-6">
      <div className="max-w-6xl mx-auto">
        <Reveal>
          <div className="text-center mb-24">
            <p className="text-xs font-medium text-accent tracking-widest uppercase mb-3">
              See it in action
            </p>
            <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tight">
              Your creative feedback loop
            </h2>
          </div>
        </Reveal>

        <div className="space-y-32">
          {screenshots.map((s, i) => (
            <Reveal key={s.label} delay={0.1}>
              {s.beforeFile ? (
                <div className="flex flex-col items-center gap-8">
                  {/* Before / After full width */}
                  <div className="w-full flex flex-row items-center gap-4">
                    <div className="flex-1 group relative rounded-2xl border border-border overflow-hidden bg-bg-card transition-colors duration-300 hover:border-border-light">
                      <div className="absolute top-3 left-3 z-10 px-2.5 py-1 rounded-md text-[11px] font-medium tracking-wide uppercase bg-red-500/20 text-red-400 border border-red-500/20 backdrop-blur-sm">
                        Before
                      </div>
                      <Image
                        src={`/screenshots/${s.beforeFile}`}
                        alt={`${s.label} before`}
                        width={1280}
                        height={800}
                        className="w-full h-auto transition-transform duration-500 group-hover:scale-[1.02]"
                      />
                    </div>
                    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" className="shrink-0 text-accent opacity-60" aria-hidden="true">
                      <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <div className="flex-1 group relative rounded-2xl border border-border overflow-hidden bg-bg-card transition-colors duration-300 hover:border-border-light">
                      <div className="absolute top-3 left-3 z-10 px-2.5 py-1 rounded-md text-[11px] font-medium tracking-wide uppercase bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 backdrop-blur-sm">
                        After
                      </div>
                      <Image
                        src={`/screenshots/${s.file}`}
                        alt={`${s.label} after`}
                        width={1280}
                        height={800}
                        className="w-full h-auto transition-transform duration-500 group-hover:scale-[1.02]"
                      />
                    </div>
                  </div>
                  {/* Description centered below */}
                  <div className="text-center max-w-xl">
                    <span className="text-xs font-medium text-accent tracking-widest uppercase">
                      {s.label}
                    </span>
                    <h3 className="font-display text-2xl sm:text-3xl font-bold tracking-tight mt-2 mb-4">
                      {s.subtitle}
                    </h3>
                    <p className="text-text-muted leading-relaxed">
                      {s.desc}
                    </p>
                  </div>
                </div>
              ) : (
                <div
                  className={`flex flex-col ${
                    i % 2 === 0 ? "md:flex-row" : "md:flex-row-reverse"
                  } items-center gap-12 md:gap-16`}
                >
                  <div className="w-full md:w-3/5 group relative rounded-2xl border border-border overflow-hidden bg-bg-card transition-colors duration-300 hover:border-border-light">
                    <Image
                      src={`/screenshots/${s.file}`}
                      alt={`${s.label} screenshot`}
                      width={1280}
                      height={800}
                      className="w-full h-auto transition-transform duration-500 group-hover:scale-[1.02]"
                    />
                  </div>
                  <div className="w-full md:w-2/5">
                    <span className="text-xs font-medium text-accent tracking-widest uppercase">
                      {s.label}
                    </span>
                    <h3 className="font-display text-2xl sm:text-3xl font-bold tracking-tight mt-2 mb-4">
                      {s.subtitle}
                    </h3>
                    <p className="text-text-muted leading-relaxed">
                      {s.desc}
                    </p>
                  </div>
                </div>
              )}
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
