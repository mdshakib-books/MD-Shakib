"use client";

import * as React from "react";
import type { ReviewItem, BookRatingSummary } from "@/lib/commerce/reviews";

interface BookReviewsSectionProps {
  bookId: string;
}

export function BookReviewsSection({ bookId }: BookReviewsSectionProps) {
  const [reviews, setReviews] = React.useState<ReviewItem[]>([]);
  const [summary, setSummary] = React.useState<BookRatingSummary>({
    averageRating: 0,
    totalReviews: 0,
    ratingCounts: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
  });
  const [loading, setLoading] = React.useState(true);

  // Review submission state
  const [isEligible, setIsEligible] = React.useState<boolean | null>(null);
  const [eligibilityReason, setEligibilityReason] = React.useState<string | null>(null);
  const [showReviewForm, setShowReviewForm] = React.useState(false);
  const [rating, setRating] = React.useState(5);
  const [title, setTitle] = React.useState("");
  const [comment, setComment] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [formMsg, setFormMsg] = React.useState<{ type: "success" | "error"; text: string } | null>(null);

  const refreshReviews = React.useCallback(async () => {
    try {
      const res = await fetch(`/api/reviews?bookId=${bookId}`);
      const data = await res.json();
      if (data.reviews) {
        setReviews(data.reviews);
        setSummary(data.summary);
      }
    } catch (err) {
      console.error("Failed to refresh reviews:", err);
    }
  }, [bookId]);

  React.useEffect(() => {
    let ignore = false;

    async function loadInitialData() {
      try {
        const [revRes, eligRes] = await Promise.all([
          fetch(`/api/reviews?bookId=${bookId}`),
          fetch(`/api/reviews?bookId=${bookId}&checkEligibility=true`),
        ]);
        const revData = await revRes.json();
        const eligData = await eligRes.json();

        if (ignore) return;

        if (revData.reviews) {
          setReviews(revData.reviews);
          setSummary(revData.summary);
        }
        setIsEligible(eligData.isEligible);
        if (!eligData.isEligible) {
          setEligibilityReason(eligData.reason);
        }
        if (eligData.existingReview) {
          setRating(eligData.existingReview.rating);
          setTitle(eligData.existingReview.title);
          setComment(eligData.existingReview.comment);
        }
      } catch (err) {
        console.error("Failed to load review data:", err);
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    loadInitialData();

    return () => {
      ignore = true;
    };
  }, [bookId]);

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFormMsg(null);

    try {
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookId, rating, title, comment }),
      });

      const data = await res.json();
      if (!res.ok) {
        setFormMsg({ type: "error", text: data.error || "Failed to submit review." });
        return;
      }

      setFormMsg({ type: "success", text: "Thank you! Your verified review has been published." });
      setShowReviewForm(false);
      refreshReviews();
    } catch (err: any) {
      setFormMsg({ type: "error", text: err.message || "Network error" });
    } finally {
      setSubmitting(false);
    }
  };

  const renderStars = (starCount: number) => {
    return (
      <div className="flex items-center text-[#C9A24A]">
        {[1, 2, 3, 4, 5].map((i) => (
          <svg
            key={i}
            className={`w-4 h-4 ${i <= starCount ? "fill-current" : "text-neutral-700"}`}
            viewBox="0 0 20 20"
          >
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
          </svg>
        ))}
      </div>
    );
  };

  return (
    <div className="border-t border-[#222222] pt-12 mt-12 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <p className="text-[#C9A24A] text-xs uppercase tracking-[0.25em] font-semibold font-sans mb-1">
            Community &amp; Verified Feedback
          </p>
          <h2 className="text-xl md:text-2xl font-serif text-white font-semibold uppercase tracking-wide">
            Customer Reviews ({summary.totalReviews})
          </h2>
        </div>

        {isEligible ? (
          <button
            type="button"
            onClick={() => setShowReviewForm((v) => !v)}
            className="px-4 py-2 bg-[#C9A24A] text-black font-semibold text-xs rounded-lg hover:bg-[#E5C87B] transition-colors self-start sm:self-auto"
          >
            {showReviewForm ? "Cancel Review" : "Write a Verified Review"}
          </button>
        ) : eligibilityReason ? (
          <span className="text-[11px] text-neutral-400 bg-[#161616] border border-[#2A2A2A] px-3 py-1.5 rounded-lg max-w-sm">
            {eligibilityReason}
          </span>
        ) : null}
      </div>

      {formMsg && (
        <div
          className={`p-3 rounded-lg text-xs mb-6 ${
            formMsg.type === "success"
              ? "bg-emerald-950/20 border border-emerald-500/30 text-emerald-400"
              : "bg-red-950/20 border border-red-500/30 text-red-400"
          }`}
        >
          {formMsg.text}
        </div>
      )}

      {/* Review Form Drawer/Card */}
      {showReviewForm && (
        <form
          onSubmit={handleSubmitReview}
          className="bg-[#141414] border border-[#C9A24A]/40 rounded-xl p-6 mb-8 max-w-xl space-y-4"
        >
          <h3 className="text-sm font-semibold text-white uppercase tracking-wider">
            Share Your Experience
          </h3>

          <div>
            <label className="block text-xs font-medium text-neutral-300 mb-1">Your Rating</label>
            <div className="flex items-center gap-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(star)}
                  className="p-1 focus:outline-none"
                >
                  <svg
                    className={`w-6 h-6 ${star <= rating ? "text-[#C9A24A] fill-current" : "text-neutral-700"}`}
                    viewBox="0 0 20 20"
                  >
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                </button>
              ))}
              <span className="text-xs text-neutral-400 ml-2">{rating} out of 5 stars</span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-300 mb-1">Review Headline</label>
            <input
              type="text"
              required
              placeholder="e.g. Invaluable reference for classical studies"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-[#1C1C1C] border border-[#2A2A2A] rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-[#C9A24A]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-300 mb-1">Detailed Review</label>
            <textarea
              required
              rows={4}
              placeholder="Describe paper quality, print clarity, translation accuracy, or personal reflections..."
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              className="w-full bg-[#1C1C1C] border border-[#2A2A2A] rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-[#C9A24A]"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setShowReviewForm(false)}
              className="px-4 py-2 border border-[#2A2A2A] text-neutral-400 text-xs rounded-lg hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 bg-[#C9A24A] text-black font-semibold text-xs rounded-lg hover:bg-[#E5C87B] disabled:opacity-50"
            >
              {submitting ? "Publishing..." : "Submit Review"}
            </button>
          </div>
        </form>
      )}

      {/* Ratings Summary Card */}
      {summary.totalReviews > 0 && (
        <div className="bg-[#141414] border border-[#2A2A2A] rounded-xl p-6 mb-8 grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
          <div className="text-center md:border-r md:border-[#2A2A2A] pr-4">
            <div className="text-4xl font-serif font-bold text-[#C9A24A]">
              {summary.averageRating.toFixed(1)}
            </div>
            <div className="flex justify-center my-1.5">{renderStars(Math.round(summary.averageRating))}</div>
            <p className="text-xs text-neutral-400">Based on {summary.totalReviews} verified ratings</p>
          </div>

          <div className="md:col-span-2 space-y-1.5">
            {[5, 4, 3, 2, 1].map((st) => {
              const count = summary.ratingCounts[st as 1 | 2 | 3 | 4 | 5] || 0;
              const pct = summary.totalReviews > 0 ? (count / summary.totalReviews) * 100 : 0;
              return (
                <div key={st} className="flex items-center gap-3 text-xs">
                  <span className="w-12 text-neutral-400">{st} star</span>
                  <div className="flex-1 h-2 rounded-full bg-[#1C1C1C] overflow-hidden border border-[#2A2A2A]">
                    <div
                      className="h-full bg-[#C9A24A] rounded-full transition-all duration-300"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="w-8 text-right text-neutral-500 text-[11px]">{count}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Reviews List */}
      {loading ? (
        <div className="text-center py-10 text-xs text-neutral-500">Loading reviews...</div>
      ) : reviews.length === 0 ? (
        <div className="bg-[#141414] border border-[#2A2A2A] rounded-xl p-8 text-center text-xs text-neutral-500">
          No customer reviews yet. Be the first verified reader to review this work.
        </div>
      ) : (
        <div className="space-y-4">
          {reviews.map((r) => (
            <div key={r.id} className="bg-[#141414] border border-[#2A2A2A] rounded-xl p-5">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  {renderStars(r.rating)}
                  <span className="text-xs font-semibold text-white ml-1">{r.title}</span>
                </div>
                <span className="text-[10px] text-neutral-500">
                  {new Date(r.createdAt).toLocaleDateString()}
                </span>
              </div>
              <p className="text-xs text-neutral-300 leading-relaxed mb-3">{r.comment}</p>
              <div className="flex items-center gap-2 text-[10px] text-neutral-500">
                <span>By {r.userName}</span>
                <span>•</span>
                <span className="text-emerald-400 flex items-center gap-1">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Verified Purchase
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
