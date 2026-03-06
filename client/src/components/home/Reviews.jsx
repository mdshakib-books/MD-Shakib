import React from "react";

const reviews = [
    {
        id: 1,
        name: "Ahmad K.",
        review: "The quality of the books is amazing. Fast shipping and the packaging felt incredibly premium. Highly recommended!",
        rating: 5,
    },
    {
        id: 2,
        name: "Sarah M.",
        review: "I found exactly what I was looking for. The UI is gorgeous and the ordering process was so smooth.",
        rating: 5,
    },
    {
        id: 3,
        name: "Omar F.",
        review: "Truly a luxury Islamic bookstore experience. The selection of Tafseer books is unmatched.",
        rating: 5,
    },
];

const renderStars = (rating) => {
    return Array.from({ length: 5 }).map((_, i) => (
        <svg
            key={i}
            className={`w-4 h-4 md:w-5 md:h-5 ${i < rating ? "text-[var(--color-primary-gold)] fill-current" : "text-gray-600"}`}
            viewBox="0 0 20 20"
        >
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
    ));
};

const Reviews = () => {
    return (
        <section className="py-20 max-w-[1200px] mx-auto px-4 lg:px-6">
            <div className="flex flex-col items-center justify-center text-center mb-10">
                <h2 className="text-2xl md:text-3xl font-heading font-medium text-[var(--color-text-light)] mb-3">
                    What Our Customers Say
                </h2>
                <div className="w-16 h-1 bg-[var(--color-primary-gold)] rounded-full"></div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {reviews.map((review) => (
                    <div
                        key={review.id}
                        className="bg-[#111111] border border-[var(--color-border-dark)] rounded-[12px] p-6 shadow-luxury hover:border-[var(--color-primary-gold)] hover:shadow-[0_8px_30px_rgba(201,162,74,0.1)] transition-all duration-300"
                    >
                        <div className="flex space-x-1 mb-4">
                            {renderStars(review.rating)}
                        </div>
                        <p className="text-gray-300 italic text-sm md:text-base leading-relaxed mb-6 font-light">
                            "{review.review}"
                        </p>
                        <div className="flex items-center space-x-3">
                            <div className="w-10 h-10 rounded-full bg-[var(--color-main-bg)] border border-[var(--color-primary-gold)] flex items-center justify-center text-[var(--color-primary-gold)] font-bold text-sm">
                                {review.name.charAt(0)}
                            </div>
                            <span className="font-medium text-[var(--color-text-light)] text-sm">
                                {review.name}
                            </span>
                        </div>
                    </div>
                ))}
            </div>
        </section>
    );
};

export default Reviews;
