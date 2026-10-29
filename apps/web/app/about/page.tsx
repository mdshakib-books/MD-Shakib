import { Metadata } from "next";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { PageContainer } from "@/components/layout/PageContainer";

export const metadata: Metadata = {
  title: "About Us | MD Shakib Islamic Books",
  description:
    "A trusted destination for authentic Islamic books, carefully curated for knowledge seekers across the world.",
};

export default function AboutPage() {
  return (
    <div className="min-h-screen flex flex-col bg-[#0B0B0B] text-[#F5F5F5]">
      <Navbar />

      <main className="flex-grow">
        {/* HERO SECTION */}
        <section className="relative py-20 md:py-28 text-center overflow-hidden border-b border-[#2A2A2A]">
          <div className="absolute inset-0 bg-gradient-to-b from-black/80 to-black/95" />
          <div className="relative z-10 max-w-[900px] mx-auto px-6">
            <h1 className="font-serif text-3xl md:text-5xl font-bold text-[#C9A24A] mb-6 tracking-wide uppercase">
              About MD Shakib
            </h1>
            <p className="text-neutral-300 text-sm md:text-lg leading-relaxed max-w-2xl mx-auto">
              A trusted destination for authentic Islamic books, carefully curated for knowledge seekers and learners across the world.
            </p>
          </div>
        </section>

        {/* STATS SECTION */}
        <section className="py-8 bg-[#111111] border-b border-[#2A2A2A]">
          <div className="max-w-[1100px] mx-auto px-4 grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
            <div>
              <h3 className="text-2xl md:text-3xl font-serif text-[#C9A24A] font-bold">500+</h3>
              <p className="text-neutral-400 text-xs md:text-sm mt-1 uppercase tracking-wider">Islamic Books</p>
            </div>
            <div>
              <h3 className="text-2xl md:text-3xl font-serif text-[#C9A24A] font-bold">50+</h3>
              <p className="text-neutral-400 text-xs md:text-sm mt-1 uppercase tracking-wider">Classical Scholars</p>
            </div>
            <div>
              <h3 className="text-2xl md:text-3xl font-serif text-[#C9A24A] font-bold">1,000+</h3>
              <p className="text-neutral-400 text-xs md:text-sm mt-1 uppercase tracking-wider">Active Readers</p>
            </div>
            <div>
              <h3 className="text-2xl md:text-3xl font-serif text-[#C9A24A] font-bold">100%</h3>
              <p className="text-neutral-400 text-xs md:text-sm mt-1 uppercase tracking-wider">Authentic Sourcing</p>
            </div>
          </div>
        </section>

        {/* MISSION SECTION */}
        <PageContainer>
          <div className="grid md:grid-cols-2 gap-12 items-center py-8">
            <div className="w-full h-64 md:h-80 rounded-xl bg-[#161616] border border-[#2A2A2A] flex flex-col items-center justify-center p-8 text-center shadow-lg">
              <span className="text-5xl mb-4">📖</span>
              <p className="font-serif text-[#C9A24A] text-lg font-bold">Nurturing Knowledge &amp; Faith</p>
              <p className="text-xs text-neutral-400 mt-2 max-w-xs">Connecting every home with authentic Islamic literature and scholarly heritage.</p>
            </div>

            <div>
              <h2 className="font-serif text-2xl md:text-3xl text-[#C9A24A] mb-4 uppercase">Our Mission</h2>
              <p className="text-neutral-400 leading-relaxed text-sm md:text-base mb-4">
                Our mission is to make authentic Islamic knowledge accessible to everyone. We carefully select and curate books from trusted scholars and publishers so readers can explore Islamic teachings with clarity, rigor, and authenticity.
              </p>
              <p className="text-neutral-400 leading-relaxed text-sm md:text-base">
                Whether you are seeking Quranic exegesis, Sahih Hadith collections, Islamic jurisprudence, or spiritual refinement, MD Shakib Islamic Books is dedicated to serving your educational and spiritual journey.
              </p>
            </div>
          </div>
        </PageContainer>
      </main>

      <Footer />
    </div>
  );
}

