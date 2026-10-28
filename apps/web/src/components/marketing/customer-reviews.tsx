'use client';

import { useEffect, useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export interface PublicReview {
  id: string;
  rating: number;
  body: string;
  displayName: string;
  company: string | null;
  jobTitle: string | null;
}

/** Approved customer reviews only; null while loading or if the API is unreachable. */
function useReviews(limit: number): PublicReview[] | null {
  const [reviews, setReviews] = useState<PublicReview[] | null>(null);
  useEffect(() => {
    fetch(`${API_URL}/api/v1/public/reviews?limit=${limit}`)
      .then((r) => r.json())
      .then((j: { success?: boolean; data?: PublicReview[] }) => setReviews(j.success && j.data ? j.data : []))
      .catch(() => setReviews([]));
  }, [limit]);
  return reviews;
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

function Stars({ rating }: { rating: number }) {
  return (
    <span className="text-[15px] tracking-[2px] text-auth-fox" aria-label={`${rating} out of 5 stars`}>
      {'★'.repeat(rating)}
      <span className="text-auth-line2">{'★'.repeat(5 - rating)}</span>
    </span>
  );
}

function ReviewCard({ review, className }: { review: PublicReview; className?: string }) {
  const byline = [review.jobTitle, review.company].filter(Boolean).join(', ');
  return (
    <figure className={`rounded-2xl border border-auth-line bg-auth-surface p-6 ${className ?? ''}`}>
      <Stars rating={review.rating} />
      <blockquote className="mt-2.5 text-base leading-relaxed text-auth-text">&ldquo;{review.body}&rdquo;</blockquote>
      <figcaption className="mt-4 flex items-center gap-2.5 text-[13px] text-auth-text3">
        <span className="flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-auth-accent to-[#9B6BFF] text-[11px] font-semibold text-white">
          {initials(review.displayName)}
        </span>
        <div>
          <b className="block font-medium text-auth-text2">{review.displayName}</b>
          {byline && <span>{byline}</span>}
          <span className="block text-[11.5px]">Verified FoxIndex customer</span>
        </div>
      </figcaption>
    </figure>
  );
}

/** Signup sidebar: the top approved review, or plain facts until there is one. */
export function ReviewSpotlight({ className }: { className?: string }) {
  const reviews = useReviews(1);
  if (reviews === null) return <div className={`h-[150px] rounded-2xl border border-auth-line bg-auth-surface ${className ?? ''}`} aria-hidden />;
  if (reviews[0]) return <ReviewCard review={reviews[0]} className={className} />;
  return (
    <div className={`rounded-2xl border border-auth-line bg-auth-surface p-6 text-[13.5px] text-auth-text2 ${className ?? ''}`}>
      <b className="mb-2 block text-base font-medium text-auth-text">What you can count on</b>
      <ul className="space-y-1.5">
        <li>Every URL goes to Google, Bing, Yandex, Naver, Seznam and Yep.</li>
        <li>If a URL can&apos;t be submitted, its credit comes back automatically.</li>
        <li>Your credits never expire.</li>
      </ul>
    </div>
  );
}

/** Homepage section — renders nothing until at least one review is approved. */
export function ReviewsSection() {
  const reviews = useReviews(6);
  if (!reviews || reviews.length === 0) return null;
  return (
    <section id="reviews" className="scroll-mt-6 pb-20">
      <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">What our customers say</h2>
      <p className="mt-2 max-w-xl text-auth-text2">Reviews from FoxIndex customers, published with their permission.</p>
      <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {reviews.map((r) => (
          <ReviewCard key={r.id} review={r} />
        ))}
      </div>
    </section>
  );
}
