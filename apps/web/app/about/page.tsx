import { Metadata } from "next";
import Link from "next/link";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";

export const metadata: Metadata = {
  title: "About Us | MD Shakib Islamic Books",
  description:
    "A trusted destination for authentic Islamic books, carefully curated for knowledge seekers and learners across the world.",
};

export default function AboutPage() {
  return (
    <div className="min-h-screen flex flex-col bg-[#0B0B0B] text-[#F5F5F5]">
      <Navbar />

      <main className="flex-grow">
        {/* 1. HERO SECTION */}
        <section className="relative py-[110px] md:py-[150px] text-center overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-black/80 to-black/95" />

          <div className="relative z-10 max-w-[900px] mx-auto px-6">
            <h1 className="font-serif text-3xl md:text-5xl font-bold text-[#C9A24A] mb-6 tracking-wide uppercase">
              About MD Shakib
            </h1>

            <p className="text-neutral-300 text-sm md:text-lg leading-relaxed max-w-2xl mx-auto font-light">
              A trusted destination for authentic Islamic books, carefully curated for knowledge seekers and learners across the world.
            </p>
          </div>
        </section>

        {/* 2. STATS SECTION */}
        <section className="py-6 bg-[#111111] border-y border-[#2A2A2A]">
          <div className="max-w-[1100px] mx-auto px-4 grid grid-cols-4 gap-2 text-center">
            <div>
              <h3 className="text-lg md:text-2xl font-serif text-[#C9A24A] font-bold">
                500+
              </h3>
              <p className="text-neutral-400 text-[10px] md:text-sm mt-1 uppercase tracking-wider">
                Islamic Books
              </p>
            </div>

            <div>
              <h3 className="text-lg md:text-2xl font-serif text-[#C9A24A] font-bold">
                50+
              </h3>
              <p className="text-neutral-400 text-[10px] md:text-sm mt-1 uppercase tracking-wider">
                Authors
              </p>
            </div>

            <div>
              <h3 className="text-lg md:text-2xl font-serif text-[#C9A24A] font-bold">
                1000+
              </h3>
              <p className="text-neutral-400 text-[10px] md:text-sm mt-1 uppercase tracking-wider">
                Readers
              </p>
            </div>

            <div>
              <h3 className="text-lg md:text-2xl font-serif text-[#C9A24A] font-bold">
                100%
              </h3>
              <p className="text-neutral-400 text-[10px] md:text-sm mt-1 uppercase tracking-wider">
                Authentic
              </p>
            </div>
          </div>
        </section>

        {/* 3. MISSION SECTION */}
        <section className="py-[70px] md:py-[100px]">
          <div className="max-w-[1200px] mx-auto px-6 grid md:grid-cols-2 gap-12 items-center">
            <div className="w-full h-[260px] md:h-[320px] rounded-xl bg-[#111111] border border-[#2A2A2A] flex flex-col items-center justify-center p-8 text-center shadow-luxury relative overflow-hidden group hover:border-[#C9A24A] transition-colors">
              <div className="w-20 h-20 rounded-full bg-[#1A1A1A] border border-[#C9A24A] flex items-center justify-center text-[#C9A24A] mb-4 shadow-[0_0_20px_rgba(201,162,74,0.2)]">
                <svg
                  className="w-10 h-10"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="1.5"
                    d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                  />
                </svg>
              </div>
              <p className="font-serif text-[#C9A24A] text-lg font-bold">Nurturing Knowledge &amp; Faith</p>
              <p className="text-xs text-neutral-400 mt-2 max-w-xs font-light">Connecting every home with authentic Islamic literature and scholarly heritage.</p>
            </div>

            <div>
              <h2 className="font-serif text-2xl md:text-3xl text-[#C9A24A] mb-4 uppercase tracking-wide">
                Our Mission
              </h2>

              <p className="text-neutral-400 leading-relaxed text-sm md:text-base font-light">
                Our mission is to make authentic Islamic knowledge accessible to everyone. We carefully select and curate books from trusted scholars and publishers so readers can explore Islamic teachings with clarity and authenticity.
              </p>
            </div>
          </div>
        </section>

        {/* 4. ISLAMIC QUOTE */}
        <section className="py-[70px] bg-[#111111] border-y border-[#2A2A2A] text-center">
          <div className="max-w-[800px] mx-auto px-6">
            <p className="text-xl md:text-2xl text-[#C9A24A] font-serif leading-relaxed italic">
              &ldquo;Seeking knowledge is an obligation upon every Muslim.&rdquo;
            </p>

            <p className="text-neutral-500 text-sm mt-4 font-serif">
              — Prophet Muhammad ﷺ
            </p>
          </div>
        </section>

        {/* 5. WHY CHOOSE US */}
        <section className="py-[70px] md:py-[100px]">
          <div className="max-w-[1200px] mx-auto px-6">
            <h2 className="text-center font-serif text-2xl md:text-3xl text-[#C9A24A] mb-12 uppercase tracking-wide">
              Why Choose Us
            </h2>

            <div className="grid md:grid-cols-3 gap-8">
              <div className="p-6 border border-[#2A2A2A] rounded-xl bg-[#0B0B0B] hover:border-[#C9A24A] hover:scale-[1.02] transition-all duration-300">
                <h3 className="font-serif text-lg text-[#C9A24A] mb-3">
                  Authentic Islamic Books
                </h3>

                <p className="text-neutral-400 text-sm leading-relaxed font-light">
                  Carefully selected books from reliable scholars and publishers ensuring authentic Islamic knowledge.
                </p>
              </div>

              <div className="p-6 border border-[#2A2A2A] rounded-xl bg-[#0B0B0B] hover:border-[#C9A24A] hover:scale-[1.02] transition-all duration-300">
                <h3 className="font-serif text-lg text-[#C9A24A] mb-3">
                  Curated Knowledge
                </h3>

                <p className="text-neutral-400 text-sm leading-relaxed font-light">
                  Our collection is thoughtfully curated so readers can easily discover the books they need for learning and reflection.
                </p>
              </div>

              <div className="p-6 border border-[#2A2A2A] rounded-xl bg-[#0B0B0B] hover:border-[#C9A24A] hover:scale-[1.02] transition-all duration-300">
                <h3 className="font-serif text-lg text-[#C9A24A] mb-3">
                  Trusted by Readers
                </h3>

                <p className="text-neutral-400 text-sm leading-relaxed font-light">
                  A growing community of readers trust our collection for reliable and meaningful Islamic literature.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* 6. VALUES */}
        <section className="py-[70px] md:py-[100px] bg-[#111111] border-y border-[#2A2A2A]">
          <div className="max-w-[1200px] mx-auto px-6">
            <h2 className="text-center font-serif text-2xl md:text-3xl text-[#C9A24A] mb-12 uppercase tracking-wide">
              Our Values
            </h2>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <div className="p-6 border border-[#2A2A2A] rounded-xl text-center bg-[#0B0B0B] hover:border-[#C9A24A] transition-all duration-300">
                <h3 className="text-[#C9A24A] font-serif mb-2 font-semibold">
                  Authenticity
                </h3>
                <p className="text-neutral-400 text-sm font-light">
                  Ensuring the authenticity of Islamic teachings.
                </p>
              </div>

              <div className="p-6 border border-[#2A2A2A] rounded-xl text-center bg-[#0B0B0B] hover:border-[#C9A24A] transition-all duration-300">
                <h3 className="text-[#C9A24A] font-serif mb-2 font-semibold">
                  Accessibility
                </h3>
                <p className="text-neutral-400 text-sm font-light">
                  Making Islamic knowledge easily accessible.
                </p>
              </div>

              <div className="p-6 border border-[#2A2A2A] rounded-xl text-center bg-[#0B0B0B] hover:border-[#C9A24A] transition-all duration-300">
                <h3 className="text-[#C9A24A] font-serif mb-2 font-semibold">
                  Community
                </h3>
                <p className="text-neutral-400 text-sm font-light">
                  Building a community of knowledge seekers.
                </p>
              </div>

              <div className="p-6 border border-[#2A2A2A] rounded-xl text-center bg-[#0B0B0B] hover:border-[#C9A24A] transition-all duration-300">
                <h3 className="text-[#C9A24A] font-serif mb-2 font-semibold">
                  Integrity
                </h3>
                <p className="text-neutral-400 text-sm font-light">
                  Providing trusted and verified resources.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* 7. FOUNDER MESSAGE */}
        <section className="py-[80px]">
          <div className="max-w-[900px] mx-auto px-6 text-center">
            <h2 className="font-serif text-2xl md:text-3xl text-[#C9A24A] mb-6 uppercase tracking-wide">
              Message From The Founder
            </h2>

            <p className="text-neutral-400 leading-relaxed text-sm md:text-base max-w-2xl mx-auto font-light">
              Our goal is to make authentic Islamic knowledge accessible to everyone. Through this platform we carefully curate books that help readers grow in knowledge, reflection, and understanding.
            </p>
          </div>
        </section>

        {/* 8. CTA */}
        <section className="py-[80px] bg-[#111111] border-t border-[#2A2A2A] text-center">
          <div className="max-w-[700px] mx-auto px-6">
            <h2 className="font-serif text-2xl md:text-3xl text-[#C9A24A] mb-4 uppercase tracking-wide">
              Start Your Journey of Knowledge
            </h2>

            <p className="text-neutral-400 mb-8 text-sm md:text-base font-light">
              Explore our curated collection of Islamic books and deepen your understanding.
            </p>

            <Link
              href="/books"
              className="inline-block px-8 py-3 bg-[#C9A24A] text-black font-semibold rounded-lg hover:bg-[#E5C87B] transition-all shadow-md"
            >
              Browse Books
            </Link>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
