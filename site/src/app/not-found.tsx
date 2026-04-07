import Link from "next/link";

export default function NotFound() {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-6 text-center"
      style={{ zIndex: 2, position: "relative" }}
    >
      <h1 className="font-display text-7xl font-bold tracking-tight text-accent mb-4">
        404
      </h1>
      <p className="text-lg text-text-muted mb-8">
        This page doesn&apos;t exist.
      </p>
      <Link
        href="/"
        className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl font-display font-medium text-sm text-white transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
        style={{
          background: "linear-gradient(135deg, #4338ca, #6366f1)",
          boxShadow: "0 0 32px rgba(99, 102, 241, 0.2)",
        }}
      >
        Back to home
      </Link>
    </div>
  );
}
