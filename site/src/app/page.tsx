import { Navbar } from "@/components/navbar";
import { Hero } from "@/components/hero";
import { Screenshots } from "@/components/screenshots";
import { Features } from "@/components/features";
import { HowItWorks } from "@/components/how-it-works";
import { CTA } from "@/components/cta";
import { Footer } from "@/components/footer";
export default function Home() {
  return (
    <>
      <div className="relative" style={{ zIndex: 2 }}>
        <Navbar />
        <main>
          <Hero />
          <Screenshots />
          <Features />
          <HowItWorks />
          <CTA />
        </main>
        <Footer />
      </div>
    </>
  );
}
