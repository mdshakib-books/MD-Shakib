import { Metadata } from "next";
import Link from "next/link";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Button } from "@/components/ui/Button";
import { AboutMissionLottie } from "@/components/about/AboutMissionLottie";

export const metadata: Metadata = {
  title: "About Us | MD Shakib Islamic Books",
  description:
    "A trusted destination for authentic Islamic books, carefully curated for knowledge seekers and learners across the world.",
};

export default function AboutPage() {
  return (
    <div className="min-h-screen flex flex-col bg-dark-bg text-[#F5F5F5]">
      <Navbar />

      <main className="flex-grow">
        {/* 1. HERO SECTION */}
        <section className="relative py-20 md:py-32 text-center overflow-hidden border-b border-dark-border">
          <div className="absolute inset-0 bg-gradient-to-b from-black/80 to-black/95" />

          <div className="relative z-10 max-w-[900px] mx-auto px-6">
            <h1 className="font-serif text-3xl md:text-5xl font-bold text-[var(--color-primary-gold)] mb-6 tracking-wide uppercase">
              About MD Shakib
            </h1>

            <p className="text-neutral-300 text-sm md:text-lg leading-relaxed max-w-2xl mx-auto font-light">
              A trusted destination for authentic Islamic books, carefully curated for knowledge seekers and learners across the world.
            </p>
          </div>
        </section>

        {/* 2. STATS SECTION */}
        <section className="py-8 bg-dark-surface border-b border-dark-border">
          <div className="max-w-[1100px] mx-auto px-4 grid grid-cols-4 gap-4 text-center">
            <div>
              <h3 className="text-xl md:text-3xl font-serif text-[var(--color-primary-gold)] font-bold">
                500+
              </h3>
              <p className="text-neutral-400 text-[10px] md:text-xs mt-1 uppercase tracking-wider font-medium">
                Islamic Books
              </p>
            </div>

            <div>
              <h3 className="text-xl md:text-3xl font-serif text-[var(--color-primary-gold)] font-bold">
                50+
              </h3>
              <p className="text-neutral-400 text-[10px] md:text-xs mt-1 uppercase tracking-wider font-medium">
                Authors
              </p>
            </div>

            <div>
              <h3 className="text-xl md:text-3xl font-serif text-[var(--color-primary-gold)] font-bold">
                1000+
              </h3>
              <p className="text-neutral-400 text-[10px] md:text-xs mt-1 uppercase tracking-wider font-medium">
                Readers
              </p>
            </div>

            <div>
              <h3 className="text-xl md:text-3xl font-serif text-[var(--color-primary-gold)] font-bold">
                100%
              </h3>
              <p className="text-neutral-400 text-[10px] md:text-xs mt-1 uppercase tracking-wider font-medium">
                Authentic
              </p>
            </div>
          </div>
        </section>

        {/* 3. MISSION SECTION */}
        <section className="py-16 md:py-24">
          <div className="max-w-[1200px] mx-auto px-6 grid md:grid-cols-2 gap-12 items-center">
            <AboutMissionLottie />

            <div>
              <h2 className="font-serif text-2xl md:text-3xl text-[var(--color-primary-gold)] mb-4 uppercase tracking-wide">
                Our Mission
              </h2>

              <p className="text-neutral-300 leading-relaxed text-sm md:text-base font-light">
                Our mission is to make authentic Islamic knowledge accessible to everyone. We carefully select and curate books from trusted scholars and publishers so readers can explore Islamic teachings with clarity, rigor, and spiritual authenticity.
              </p>
            </div>
          </div>
        </section>

        {/* 4. ISLAMIC QUOTE */}
        <section className="py-16 bg-dark-surface border-y border-dark-border text-center">
          <div className="max-w-[800px] mx-auto px-6">
            <p className="text-xl md:text-2xl text-[var(--color-primary-gold)] font-serif leading-relaxed italic">
              &ldquo;Seeking knowledge is an obligation upon every Muslim.&rdquo;
            </p>

            <p className="text-neutral-400 text-sm mt-4 font-serif">
              — Prophet Muhammad ﷺ
            </p>
          </div>
        </section>

        {/* 5. WHY CHOOSE US */}
        <section className="py-16 md:py-24">
          <div className="max-w-[1200px] mx-auto px-6">
            <h2 className="text-center font-serif text-2xl md:text-3xl text-[var(--color-primary-gold)] mb-12 uppercase tracking-wide">
              Why Choose Us
            </h2>

            <div className="grid md:grid-cols-3 gap-8">
              <div className="p-8 border border-dark-border rounded-xl bg-dark-surface hover:border-[var(--color-primary-gold)] hover:scale-[1.01] transition-all duration-300 shadow-luxury">
                <h3 className="font-serif text-lg text-[var(--color-primary-gold)] mb-3">
                  Authentic Islamic Books
                </h3>

                <p className="text-neutral-400 text-sm leading-relaxed font-light">
                  Carefully selected books from reliable scholars and verified publishers ensuring sound Islamic knowledge.
                </p>
              </div>

              <div className="p-8 border border-dark-border rounded-xl bg-dark-surface hover:border-[var(--color-primary-gold)] hover:scale-[1.01] transition-all duration-300 shadow-luxury">
                <h3 className="font-serif text-lg text-[var(--color-primary-gold)] mb-3">
                  Curated Knowledge
                </h3>

                <p className="text-neutral-400 text-sm leading-relaxed font-light">
                  Our collection is thoughtfully curated so readers can easily discover classical and contemporary works for study and reflection.
                </p>
              </div>

              <div className="p-8 border border-dark-border rounded-xl bg-dark-surface hover:border-[var(--color-primary-gold)] hover:scale-[1.01] transition-all duration-300 shadow-luxury">
                <h3 className="font-serif text-lg text-[var(--color-primary-gold)] mb-3">
                  Trusted by Readers
                </h3>

                <p className="text-neutral-400 text-sm leading-relaxed font-light">
                  A growing community of readers and students trust our platform for fast delivery, pristine editions, and customer care.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* 6. VALUES */}
        <section className="py-16 md:py-24 bg-dark-surface border-y border-dark-border">
          <div className="max-w-[1200px] mx-auto px-6">
            <h2 className="text-center font-serif text-2xl md:text-3xl text-[var(--color-primary-gold)] mb-12 uppercase tracking-wide">
              Our Values
            </h2>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <div className="p-6 border border-dark-border rounded-xl text-center bg-dark-card hover:border-[var(--color-primary-gold)] transition-all duration-300">
                <h3 className="text-[var(--color-primary-gold)] font-serif mb-2 font-semibold">
                  Authenticity
                </h3>
                <p className="text-neutral-400 text-xs font-light">
                  Upholding soundness of scholarly sources and publications.
                </p>
              </div>

              <div className="p-6 border border-dark-border rounded-xl text-center bg-dark-card hover:border-[var(--color-primary-gold)] transition-all duration-300">
                <h3 className="text-[var(--color-primary-gold)] font-serif mb-2 font-semibold">
                  Accessibility
                </h3>
                <p className="text-neutral-400 text-xs font-light">
                  Delivering classical literature across regions efficiently.
                </p>
              </div>

              <div className="p-6 border border-dark-border rounded-xl text-center bg-dark-card hover:border-[var(--color-primary-gold)] transition-all duration-300">
                <h3 className="text-[var(--color-primary-gold)] font-serif mb-2 font-semibold">
                  Community
                </h3>
                <p className="text-neutral-400 text-xs font-light">
                  Nurturing students, seekers, and families in their learning journey.
                </p>
              </div>

              <div className="p-6 border border-dark-border rounded-xl text-center bg-dark-card hover:border-[var(--color-primary-gold)] transition-all duration-300">
                <h3 className="text-[var(--color-primary-gold)] font-serif mb-2 font-semibold">
                  Integrity
                </h3>
                <p className="text-neutral-400 text-xs font-light">
                  Operating with ethical commerce, clear pricing, and transparency.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* 7. FOUNDER MESSAGE */}
        <section className="py-20">
          <div className="max-w-[900px] mx-auto px-6 text-center">
            <h2 className="font-serif text-2xl md:text-3xl text-[var(--color-primary-gold)] mb-6 uppercase tracking-wide">
              Message From The Founder
            </h2>

            <p className="text-neutral-300 leading-relaxed text-sm md:text-base max-w-2xl mx-auto font-light">
              Our ambition is to preserve the tradition of sacred learning by bringing pristine, authentic Islamic texts directly into your hands. Every title is handled with reverence and respect for the knowledge it contains.
            </p>
          </div>
        </section>

        {/* 8. CTA */}
        <section className="py-20 bg-dark-surface border-t border-dark-border text-center">
          <div className="max-w-[700px] mx-auto px-6">
            <h2 className="font-serif text-2xl md:text-3xl text-[var(--color-primary-gold)] mb-4 uppercase tracking-wide">
              Start Your Journey of Knowledge
            </h2>

            <p className="text-neutral-400 mb-8 text-sm md:text-base font-light">
              Explore our curated collection of classical works, Quranic translations, and prophetic biographies.
            </p>

            <Link href="/books">
              <Button variant="primary" size="lg">
                Browse Collection
              </Button>
            </Link>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
