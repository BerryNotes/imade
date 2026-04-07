export function Footer() {
  return (
    <footer className="py-10 px-6 border-t border-border">
      <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <span className="font-display text-sm text-text-dim">
            iMade
          </span>
          <span className="hidden sm:block w-px h-3 bg-border" />
          <span className="text-xs text-text-dim">
            Built for producers, by a producer.
          </span>
        </div>

        <div className="flex items-center gap-5">
          <a
            href="https://www.youtube.com/@Berrynote"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-text-dim hover:text-text-muted transition-colors"
          >
            YouTube
          </a>
          <a
            href="mailto:berrynote994@gmail.com"
            className="text-xs text-text-dim hover:text-text-muted transition-colors"
          >
            berrynote994@gmail.com
          </a>
          <a
            href="/changelog"
            className="text-xs text-text-dim hover:text-text-muted transition-colors"
          >
            v2.8.1
          </a>
        </div>
      </div>
    </footer>
  );
}
