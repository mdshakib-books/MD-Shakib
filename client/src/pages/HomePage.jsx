import React, { useEffect } from "react";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import ProductGrid from "../components/ProductGrid";
import CategoryTabs from "../components/home/CategoryTabs";
import HeroSection from "../components/home/HeroSection";
import TrustIndicators from "../components/home/TrustIndicators";
import OrderSteps from "../components/home/OrderSteps";
import Reviews from "../components/home/Reviews";
import { useBooks } from "../hooks/useBooks";

const HomePage = () => {
    const { books, loading } = useBooks({ limit: 15 });

    useEffect(() => {
        window.scrollTo(0, 0);
    }, []);

    return (
        <div className="min-h-screen flex flex-col bg-[var(--color-main-bg)]">
            <Navbar />

            <main className="flex-grow w-full overflow-hidden">
                <HeroSection />
                <TrustIndicators />

                <ProductGrid
                    books={books?.slice(0, 8)}
                    loading={loading}
                    isCarousel={true}
                />

                <OrderSteps />
                <Reviews />
            </main>

            <Footer />
        </div>
    );
};

export default HomePage;
