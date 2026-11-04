import * as React from "react";
import { ScrollReveal } from "@/components/ui/ScrollReveal";

interface ReviewItem {
  id: number;
  name: string;
  role?: string;
  review: string;
  rating: number;
}

const defaultReviews: ReviewItem[] = [
  {
    id: 1,
    name: "Ahmad K.",
    role: "Verified Reader",
    review:
      "The quality of the books is amazing. Fast shipping and the packaging felt incredibly premium. Highly recommended!",
    rating: 5,
  },
  {
    id: 2,
    name: "Sarah M.",
    role: "Islamic Studies Student",
    review:
      "I found exactly what I was looking for. The UI is gorgeous and the ordering process was so smooth.",
    rating: 5,
  },
  {
    id: 3,
    name: "Omar F.",
    role: "Verified Buyer",
    review:
      "Truly a luxury Islamic bookstore experience. The selection of Tafseer books is unmatched.",
    rating: 5,
  },
];

function renderStars(rating: number) {
  return Array.from({ length: 5 }).map((_, i) => (
    <svg
      key={i}
      className={`w-4 h-4 ${
        i < rating ? "text-[#C9A24A] fill-current" : "text-neutral-700"
      }`}
      viewBox="0 0 20 20"
      fill="currentColor"
    >
      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
    </svg>
  ));
}

export function Reviews({ customReviews }: { customReviews?: ReviewItem[] }) {
  const reviews = customReviews && customReviews.length > 0 ? customReviews : defaultReviews;

  return (
    <section className="py-20 max-w-[1200px] mx-auto px-4 sm:px-6 w-full">
      <div className="flex flex-col items-center justify-center text-center mb-12">
        <p className="text-[#C9A24A] text-xs uppercase tracking-[0.25em] font-semibold font-sans mb-2">
          Reader Community
        </p>
        <h2 className="text-2xl md:text-3xl font-serif font-bold text-white uppercase tracking-wide">
          What Our Customers Say
        </h2>
        <div className="w-16 h-0.5 bg-[#C9A24A]/70 rounded-full mt-4" />
      </div>

      <ScrollReveal>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {reviews.map((review) => (
            <div
              key={review.id}
              className="bg-[#141414] border border-[#262626] rounded-2xl p-6 sm:p-7 shadow-luxury hover:border-[#C9A24A]/50 hover:-translate-y-1 hover:shadow-luxury-hover transition-all duration-[var(--duration-card)] [transition-timing-function:var(--ease-luxury)] flex flex-col justify-between"
            >
              <div>
                <div className="flex space-x-1 mb-4" aria-label={`${review.rating} out of 5 stars`}>
                  {renderStars(review.rating)}
                </div>
                <p className="text-neutral-300 italic text-sm md:text-base leading-relaxed mb-6 font-light">
                  &ldquo;{review.review}&rdquo;
                </p>
              </div>

              <div className="flex items-center space-x-3 pt-4 border-t border-[#222222]">
                <div className="w-10 h-10 rounded-full bg-[#1C1C1C] border border-[#C9A24A]/40 flex items-center justify-center text-[#C9A24A] font-serif font-bold text-sm shadow-inner">
                  {review.name.charAt(0)}
                </div>
                <div>
                  <p className="font-semibold text-white text-sm">
                    {review.name}
                  </p>
                  <p className="text-[11px] text-[#C9A24A] font-medium tracking-wide">
                    {review.role || "Verified Reader"}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </ScrollReveal>
    </section>
  );
}
