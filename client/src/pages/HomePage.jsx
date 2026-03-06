import React, { useEffect } from "react";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import ProductGrid from "../components/ProductGrid";
import { useBooks } from "../hooks/useBooks";

const HomePage = () => {
    const { books, loading } = useBooks({ limit: 4 });

    useEffect(() => {
        console.log("HomePage loaded. Fetching featured books...");
    }, []);

    return (
        <div className="min-h-screen flex flex-col bg-gray-50">
            <Navbar />
            <main className="flex-grow container mx-auto px-4 py-8">
                <div className="bg-blue-600 text-white rounded-lg p-8 mb-10 text-center">
                    <h1 className="text-4xl font-bold mb-4">
                        Welcome to MD Shakib Islamic Books
                    </h1>
                    <p className="text-xl">
                        Discover a wide range of authentic Islamic literature
                    </p>
                </div>

                <section>
                    <div className="flex justify-between items-center mb-6">
                        <h2 className="text-2xl font-bold">Featured Books</h2>
                        <a
                            href="/books"
                            className="text-blue-600 hover:underline"
                        >
                            View All
                        </a>
                    </div>
                    <ProductGrid books={books} loading={loading} />
                </section>
            </main>
            <Footer />
        </div>
    );
};

export default HomePage;
