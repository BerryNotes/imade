import type { Metadata } from "next";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { ChangelogContent } from "@/components/changelog-content";

export const metadata: Metadata = {
  title: "Changelog — iMade",
  description: "Version history and release notes for iMade.",
};

export default function ChangelogPage() {
  return (
    <>
      <div className="relative" style={{ zIndex: 2 }}>
        <Navbar />
        <main className="pt-28 pb-20 px-6">
          <ChangelogContent />
        </main>
        <Footer />
      </div>
    </>
  );
}
