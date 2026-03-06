import React, { useEffect } from "react";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import ProductGrid from "../components/ProductGrid";
import CategoryTabs from "../components/CategoryTabs";
import SearchBar from "../components/SearchBar";
import { useBooks } from "../hooks/useBooks";

const BooksPage = () => {
    const { books, loading } = useBooks();

    useEffect(() => {
        console.log("BooksPage loaded. Fetching all books...");
    }, []);

    return (
        <div className="min-h-screen flex flex-col bg-gray-50">
            <Navbar />
            <main className="flex-grow container mx-auto px-4 py-8">
                <h1 className="text-3xl font-bold mb-6">Our Collection</h1>

                <div className="mb-8 space-y-4">
                    <SearchBar />
                    <CategoryTabs
                        categories={["Quran", "Hadith", "Fiqh", "History"]}
                        activeCategory=""
                        onSelectCategory={() => {}}
                    />
                </div>

                <ProductGrid books={books} loading={loading} />
            </main>
            <Footer />
        </div>
    );
};

export default BooksPage;
