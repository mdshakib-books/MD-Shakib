import React, { useEffect } from "react";
import { Link } from "react-router-dom";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { DotLottieReact } from "@lottiefiles/dotlottie-react";

const AboutPage = () => {
    useEffect(() => {
        window.scrollTo(0, 0);
    }, []);

    return (
        <div className="min-h-screen flex flex-col bg-[#0B0B0B] text-[#F5F5F5]">
            <Navbar />

            <main className="flex-grow">
                {/* HERO SECTION */}
                <section className="relative py-[110px] md:py-[150px] text-center overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-b from-black/80 to-black/95"></div>

                    <div className="relative z-10 max-w-[900px] mx-auto px-6">
                        <h1 className="font-heading text-3xl md:text-5xl font-bold text-[#C9A24A] mb-6 tracking-wide">
                            About MD Shakib
                        </h1>

                        <p className="text-gray-300 text-sm md:text-lg leading-relaxed">
                            A trusted destination for authentic Islamic books,
                            carefully curated for knowledge seekers and learners
                            across the world.
                        </p>
                    </div>
                </section>

                {/* STATS SECTION */}
                <section className="py-6 bg-[#111111] border-y border-[#2A2A2A]">
                    <div className="max-w-[1100px] mx-auto px-4 grid grid-cols-4 gap-2 text-center">
                        <div>
                            <h3 className="text-lg md:text-2xl font-heading text-[#C9A24A]">
                                500+
                            </h3>
                            <p className="text-gray-400 text-[10px] md:text-sm mt-1">
                                Islamic Books
                            </p>
                        </div>

                        <div>
                            <h3 className="text-lg md:text-2xl font-heading text-[#C9A24A]">
                                50+
                            </h3>
                            <p className="text-gray-400 text-[10px] md:text-sm mt-1">
                                Authors
                            </p>
                        </div>

                        <div>
                            <h3 className="text-lg md:text-2xl font-heading text-[#C9A24A]">
                                1000+
                            </h3>
                            <p className="text-gray-400 text-[10px] md:text-sm mt-1">
                                Readers
                            </p>
                        </div>

                        <div>
                            <h3 className="text-lg md:text-2xl font-heading text-[#C9A24A]">
                                100%
                            </h3>
                            <p className="text-gray-400 text-[10px] md:text-sm mt-1">
                                Authentic
                            </p>
                        </div>
                    </div>
                </section> 

                {/* MISSION SECTION */}
                <section className="py-[70px] md:py-[100px]">
                    <div className="max-w-[1200px] mx-auto px-6 grid md:grid-cols-2 gap-12 items-center">
                        <div className="w-full h-[260px] md:h-[320px] rounded-xl flex items-center justify-center text-[#C9A24A] text-lg font-heading">
                            <DotLottieReact
                                src="https://lottie.host/5ebc2c19-0da1-437d-9129-323967dd35f2/nJ7OSQpbM0.lottie"
                                loop
                                autoplay
                            />
                        </div>

                        <div>
                            <h2 className="font-heading text-2xl md:text-3xl text-[#C9A24A] mb-4">
                                Our Mission
                            </h2>

                            <p className="text-gray-400 leading-relaxed text-sm md:text-base">
                                Our mission is to make authentic Islamic
                                knowledge accessible to everyone. We carefully
                                select and curate books from trusted scholars
                                and publishers so readers can explore Islamic
                                teachings with clarity and authenticity.
                            </p>
                        </div>
                    </div>
                </section>

                {/* ISLAMIC QUOTE */}
                <section className="py-[70px] bg-[#111111] border-y border-[#2A2A2A] text-center">
                    <div className="max-w-[800px] mx-auto px-6">
                        <p className="text-xl md:text-2xl text-[#C9A24A] font-heading leading-relaxed">
                            “Seeking knowledge is an obligation upon every
                            Muslim.”
                        </p>

                        <p className="text-gray-500 text-sm mt-4">
                            — Prophet Muhammad ﷺ
                        </p>
                    </div>
                </section>

                {/* WHY CHOOSE US */}
                <section className="py-[70px] md:py-[100px]">
                    <div className="max-w-[1200px] mx-auto px-6">
                        <h2 className="text-center font-heading text-2xl md:text-3xl text-[#C9A24A] mb-12">
                            Why Choose Us
                        </h2>

                        <div className="grid md:grid-cols-3 gap-8">
                            <div className="p-6 border border-[#2A2A2A] rounded-xl bg-[#0B0B0B] hover:border-[#C9A24A] hover:scale-[1.02] transition">
                                <h3 className="font-heading text-lg text-[#C9A24A] mb-3">
                                    Authentic Islamic Books
                                </h3>

                                <p className="text-gray-400 text-sm leading-relaxed">
                                    Carefully selected books from reliable
                                    scholars and publishers ensuring authentic
                                    Islamic knowledge.
                                </p>
                            </div>

                            <div className="p-6 border border-[#2A2A2A] rounded-xl bg-[#0B0B0B] hover:border-[#C9A24A] hover:scale-[1.02] transition">
                                <h3 className="font-heading text-lg text-[#C9A24A] mb-3">
                                    Curated Knowledge
                                </h3>

                                <p className="text-gray-400 text-sm leading-relaxed">
                                    Our collection is thoughtfully curated so
                                    readers can easily discover the books they
                                    need for learning and reflection.
                                </p>
                            </div>

                            <div className="p-6 border border-[#2A2A2A] rounded-xl bg-[#0B0B0B] hover:border-[#C9A24A] hover:scale-[1.02] transition">
                                <h3 className="font-heading text-lg text-[#C9A24A] mb-3">
                                    Trusted by Readers
                                </h3>

                                <p className="text-gray-400 text-sm leading-relaxed">
                                    A growing community of readers trust our
                                    collection for reliable and meaningful
                                    Islamic literature.
                                </p>
                            </div>
                        </div>
                    </div>
                </section>

                {/* VALUES */}
                <section className="py-[70px] md:py-[100px] bg-[#111111] border-y border-[#2A2A2A]">
                    <div className="max-w-[1200px] mx-auto px-6">
                        <h2 className="text-center font-heading text-2xl md:text-3xl text-[#C9A24A] mb-12">
                            Our Values
                        </h2>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                            <div className="p-6 border border-[#2A2A2A] rounded-xl text-center hover:border-[#C9A24A] transition">
                                <h3 className="text-[#C9A24A] font-heading mb-2">
                                    Authenticity
                                </h3>
                                <p className="text-gray-400 text-sm">
                                    Ensuring the authenticity of Islamic
                                    teachings.
                                </p>
                            </div>

                            <div className="p-6 border border-[#2A2A2A] rounded-xl text-center hover:border-[#C9A24A] transition">
                                <h3 className="text-[#C9A24A] font-heading mb-2">
                                    Accessibility
                                </h3>
                                <p className="text-gray-400 text-sm">
                                    Making Islamic knowledge easily accessible.
                                </p>
                            </div>

                            <div className="p-6 border border-[#2A2A2A] rounded-xl text-center hover:border-[#C9A24A] transition">
                                <h3 className="text-[#C9A24A] font-heading mb-2">
                                    Community
                                </h3>
                                <p className="text-gray-400 text-sm">
                                    Building a community of knowledge seekers.
                                </p>
                            </div>

                            <div className="p-6 border border-[#2A2A2A] rounded-xl text-center hover:border-[#C9A24A] transition">
                                <h3 className="text-[#C9A24A] font-heading mb-2">
                                    Integrity
                                </h3>
                                <p className="text-gray-400 text-sm">
                                    Providing trusted and verified resources.
                                </p>
                            </div>
                        </div>
                    </div>
                </section>

                {/* FOUNDER MESSAGE */}
                <section className="py-[80px]">
                    <div className="max-w-[900px] mx-auto px-6 text-center">
                        <h2 className="font-heading text-2xl md:text-3xl text-[#C9A24A] mb-6">
                            Message From The Founder
                        </h2>

                        <p className="text-gray-400 leading-relaxed text-sm md:text-base">
                            Our goal is to make authentic Islamic knowledge
                            accessible to everyone. Through this platform we
                            carefully curate books that help readers grow in
                            knowledge, reflection, and understanding.
                        </p>
                    </div>
                </section>

                {/* CTA */}
                <section className="py-[80px] bg-[#111111] border-t border-[#2A2A2A] text-center">
                    <div className="max-w-[700px] mx-auto px-6">
                        <h2 className="font-heading text-2xl md:text-3xl text-[#C9A24A] mb-4">
                            Start Your Journey of Knowledge
                        </h2>

                        <p className="text-gray-400 mb-8 text-sm md:text-base">
                            Explore our curated collection of Islamic books and
                            deepen your understanding.
                        </p>

                        <Link
                            to="/books"
                            className="inline-block px-8 py-3 bg-[#C9A24A] text-black font-semibold rounded-lg hover:bg-[#E5C87B] transition"
                        >
                            Browse Books
                        </Link>
                    </div>
                </section>
            </main>

            <Footer />
        </div>
    );
};

export default AboutPage;
