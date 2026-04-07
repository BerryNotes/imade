"use client";

import { Reveal } from "./reveal";

interface ChangeEntry {
  items: string[];
}

interface Release {
  version: string;
  date: string;
  latest?: boolean;
  sections: { label: string; entries: ChangeEntry }[];
}

const releases: Release[] = [
  {
    version: "2.8.1",
    date: "February 16, 2026",
    latest: true,
    sections: [
      {
        label: "New",
        entries: {
          items: [
            "Listen time Elo adjustment: songs you listen to more get a subtle ranking boost",
          ],
        },
      },
      {
        label: "Improved",
        entries: {
          items: [
            "Stats: summary cards moved to Breakdown tab only",
            "Stats: month boxes in Timeline are less bright with stronger outlines",
            "Library: queue actions play immediately when nothing is playing",
          ],
        },
      },
    ],
  },
  {
    version: "2.8.0",
    date: "February 15, 2026",
    sections: [
      {
        label: "New",
        entries: {
          items: [
            "Email verification: new accounts must verify their email before logging in",
            "Password reset via email with secure token links (1-hour expiry)",
            "Resend verification email option on login screen",
            "Password changes now require email reset flow",
            "Security headers: X-Frame-Options, X-Content-Type-Options, HSTS, XSS protection",
          ],
        },
      },
      {
        label: "Improved",
        entries: {
          items: [
            "Profile settings: email displayed as read-only, username still editable",
            "Activity log tracks username changes, password resets, and email verifications",
            "Email features optional — Electron/local mode works without Resend API key",
          ],
        },
      },
    ],
  },
  {
    version: "2.7.0",
    date: "February 14, 2026",
    sections: [
      {
        label: "New",
        entries: {
          items: [
            "Growth tab: hover tooltips on monthly calendar showing song count, avg Elo, and top songs",
            "Upload tab: \"Start Ranking\" button guides new users to Compare after first upload",
            "Account settings: shows plan type (Trial/Full) and app version",
          ],
        },
      },
      {
        label: "Improved",
        entries: {
          items: [
            "Stats tab: listening stats accessible without any comparisons",
            "Session progress bar: two-phase calculation prevents backwards jumps after tier sort",
            "Sessions always available: re-comparisons offered when all unique pairs are exhausted",
            "Lazy-loaded tabs auto-reload on stale cache instead of crashing",
            "Cache-Control headers on index.html prevent stale chunk issues after rebuilds",
          ],
        },
      },
      {
        label: "Fixed",
        entries: {
          items: [
            "Tier sort no longer exhausts all pairs with small libraries (7 songs)",
            "Starting a new session no longer glitches/flashes when all songs are ranked",
            "Stats tab no longer crashes with listening data and zero comparisons",
          ],
        },
      },
    ],
  },
  {
    version: "2.6.2",
    date: "February 14, 2026",
    sections: [
      {
        label: "New",
        entries: {
          items: [
            "Multi-user authentication with bcrypt passwords, session management, and rate limiting",
            "Genre change via three-dot menu popup on each song row",
            "Username displayed next to profile avatar in header",
            "Favicon on app pages",
          ],
        },
      },
      {
        label: "Improved",
        entries: {
          items: [
            "Visualizer performance: removed shadow effects and gradients, 30fps frame limiter",
            "Spectrograph preserves history on resize and fullscreen toggle",
            "Case-insensitive username login",
          ],
        },
      },
      {
        label: "Fixed",
        entries: {
          items: [
            "Visualizer crash: switched from createMediaElementSource to captureStream for reliable audio analysis",
            "Visualizer continues working after skipping songs",
          ],
        },
      },
    ],
  },
  {
    version: "2.6.1",
    date: "February 13, 2026",
    sections: [
      {
        label: "New",
        entries: {
          items: [
            "Spectrograph: logarithmic frequency scale (20 Hz \u2013 10 kHz) with labeled axis",
          ],
        },
      },
      {
        label: "Improved",
        entries: {
          items: [
            "Spectrograph FFT resolution increased (8192-point) for precise low-frequency display",
          ],
        },
      },
    ],
  },
  {
    version: "2.6.0",
    date: "February 13, 2026",
    sections: [
      {
        label: "New",
        entries: {
          items: [
            "Visualizer: Wave 3D history plane FX (press Shift) \u2014 scrolling waveform history with slow rotation",
            "Visualizer: Orbit multi-ring FX \u2014 3 perpendicular rings (XY/XZ/YZ planes) with rainbow colors",
            "Visualizer: Sphere cube wireframe FX \u2014 12 edges + face diagonals with frequency-reactive distortion",
            "Visualizer: Grid rainbow shockwave FX \u2014 bass-driven concentric pulse rings with diagonal mesh",
            "Visualizer: Spectrograph palette swap FX \u2014 purple default, ocean blue-cyan-yellow-white on Shift",
            "Visualizer: Particles volume-reactive sizing \u2014 dots grow with higher volume",
            "Visualizer: Laser volume-sensitive copy spacing",
          ],
        },
      },
      {
        label: "Improved",
        entries: {
          items: [
            "Particles redesigned: free-roaming across canvas with constant speed and edge wrapping",
            "Grid default simplified to dots only (no lines)",
            "Wave FX uses decoupled history buffer for smoother depth without lag",
            "Perspective projection clamped to prevent behind-camera glitching",
          ],
        },
      },
      {
        label: "Fixed",
        entries: {
          items: [
            "Bulletproof local auth: session always forced on every request, preventing data loss on server restart",
          ],
        },
      },
    ],
  },
  {
    version: "2.5.0",
    date: "February 12, 2026",
    sections: [
      {
        label: "New",
        entries: {
          items: [
            "Visualizer: freeze frame on pause \u2014 visualization holds last frame instead of fading out",
            "Visualizer: Radial 3D sphere FX (press Shift in Radial mode) \u2014 spinning sphere with frequency bars",
            "Visualizer: EQ color shift FX (press Shift in EQ mode) \u2014 hue cycles with the music",
            "Per-song notes feature with document icon indicator",
            "Multi-user web app mode with SQLite auth and per-user data isolation",
            "Shared data mode: web server auto-detects and shares Electron app data",
          ],
        },
      },
      {
        label: "Improved",
        entries: {
          items: [
            "Renamed Bars mode to EQ",
            "Laser size reduced for tighter Lissajous figures",
            "Held keys (Shift, Space) no longer rapid-toggle \u2014 single press only",
            "Audio playback: Web Audio context resumes before play to prevent silent start",
          ],
        },
      },
      {
        label: "Fixed",
        entries: {
          items: [
            "Auth: sign out and back in preserves all data",
            "Auto-login uses consistent account across Electron and web modes",
          ],
        },
      },
    ],
  },
  {
    version: "2.4.0",
    date: "February 9, 2026",
    sections: [
      {
        label: "New",
        entries: {
          items: [
            "Audio Visualizer tab with 8 interactive modes: Bars, Radial, Wave, Particles, Orbit, Sphere, Grid, and Laser",
            "Custom frameless title bar replacing native Electron chrome",
            "Keyboard shortcuts on Visualizer: Space to pause, Left/Right arrows to skip songs",
            "Player idle state shows prompt when no song is playing",
            "MIDI synth integration: polyphonic oscillator synth routes through visualizer analyser node",
            "MIDI settings in Settings: device selector, waveform picker",
          ],
        },
      },
      {
        label: "Improved",
        entries: {
          items: [
            "Smooth animations throughout the app: tab transitions, battle card effects, list stagger entrances",
            "Button press and hover transitions on all interactive elements",
            "Web Audio API integration for real-time frequency and waveform analysis",
            "Visualizer auto-hides controls and cursor after 2s of inactivity",
            "Overhauled StatsTab analytics, sticky sidebars, comparison improvements",
          ],
        },
      },
    ],
  },
  {
    version: "2.3.3",
    date: "February 8, 2026",
    sections: [
      {
        label: "Fixed",
        entries: {
          items: [
            "Server Elo calculation now matches frontend algorithm (base 500, source-based K-values, dampened)",
            "baseElo of 0 no longer overrides computed rankings",
          ],
        },
      },
    ],
  },
  {
    version: "2.3.2",
    date: "February 8, 2026",
    sections: [
      {
        label: "Fixed",
        entries: {
          items: [
            "Comparison source field now saved correctly (tier/quick/classic/bracket K-values)",
            "Tier mode deadlock with single unranked song now routes to quick mode",
          ],
        },
      },
    ],
  },
  {
    version: "2.3.1",
    date: "February 7, 2026",
    sections: [
      {
        label: "Fixed",
        entries: {
          items: [
            "Data integrity: atomic writes (.tmp + rename) prevent file corruption on crash",
            "Automatic .bak backup recovery if main data file is corrupted",
          ],
        },
      },
    ],
  },
  {
    version: "2.3.0",
    date: "February 6, 2026",
    sections: [
      {
        label: "New",
        entries: {
          items: [
            "App icon with branded \u201ciM\u201d design",
            "Cross-platform builds: Windows, macOS, and Linux via GitHub Actions CI",
            "Update checker with dismissible toast notification",
          ],
        },
      },
    ],
  },
  {
    version: "2.2.0",
    date: "February 5, 2026",
    sections: [
      {
        label: "Changed",
        entries: {
          items: [
            "Switched build output from portable .exe to .zip to reduce false-positive security warnings",
            "Removed unused light theme setting",
          ],
        },
      },
    ],
  },
  {
    version: "2.1.0",
    date: "February 4, 2026",
    sections: [
      {
        label: "New",
        entries: {
          items: [
            "Migrated from monolithic HTML to Vite + React component architecture",
            "Portable build (no installer required)",
            "Express server bound to localhost only \u2014 no more Windows Firewall prompts",
            "Asar bundling for smaller package size",
          ],
        },
      },
    ],
  },
  {
    version: "2.0.0",
    date: "February 3, 2026",
    sections: [
      {
        label: "New",
        entries: {
          items: [
            "Initial public release",
            "Elo ranking system for music producers",
            "Head-to-head comparisons (Classic & Quick modes)",
            "Bracket tournaments",
            "Genre tagging and filtering",
            "Built-in audio player with queue",
            "Smart playlists from rankings",
            "Stats dashboard with scatter plots",
            "CSV and M3U export",
            "Fully offline \u2014 no accounts, no cloud",
          ],
        },
      },
    ],
  },
];

const sectionColors: Record<string, string> = {
  New: "text-green-400",
  Improved: "text-blue-400",
  Fixed: "text-amber-400",
  Changed: "text-purple-400",
};

export function ChangelogContent() {
  return (
    <div className="max-w-3xl mx-auto">
      <Reveal>
        <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tight mb-3">
          Changelog
        </h1>
        <p className="text-text-muted text-lg mb-16">
          Version history and release notes.
        </p>
      </Reveal>

      <div className="relative">
        {/* Timeline line */}
        <div className="absolute left-[7px] top-2 bottom-0 w-px bg-border" />

        {releases.map((release, ri) => (
          <Reveal key={release.version} delay={ri * 0.05}>
            <div className="relative pl-10 pb-14 last:pb-0">
              {/* Timeline dot */}
              <div
                className={`absolute left-0 top-1.5 w-[15px] h-[15px] rounded-full border-2 ${
                  release.latest
                    ? "border-accent bg-accent/30"
                    : "border-border-light bg-bg-raised"
                }`}
              />

              {/* Version header */}
              <div className="flex flex-wrap items-baseline gap-3 mb-4">
                <h2 className="font-display text-xl font-bold tracking-tight">
                  v{release.version}
                </h2>
                {release.latest && (
                  <span className="text-[11px] font-medium uppercase tracking-wider text-accent bg-accent/10 px-2 py-0.5 rounded-full">
                    Latest
                  </span>
                )}
                <span className="text-sm text-text-dim">
                  {release.date}
                </span>
              </div>

              {/* Sections */}
              <div className="space-y-4">
                {release.sections.map((section) => (
                  <div key={section.label}>
                    <h3
                      className={`text-xs font-semibold uppercase tracking-wider mb-2 ${
                        sectionColors[section.label] || "text-text-muted"
                      }`}
                    >
                      {section.label}
                    </h3>
                    <ul className="space-y-1.5">
                      {section.entries.items.map((item, i) => (
                        <li
                          key={i}
                          className="text-sm text-text-muted leading-relaxed pl-4 relative before:content-[''] before:absolute before:left-0 before:top-[9px] before:w-1.5 before:h-1.5 before:rounded-full before:bg-border-light"
                        >
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>
        ))}
      </div>
    </div>
  );
}
