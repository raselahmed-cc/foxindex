import { z } from 'zod';

export const submitReviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  body: z.string().trim().min(20, 'Write at least a sentence or two').max(600),
  displayName: z.string().trim().min(2).max(60),
  company: z.string().trim().max(80).optional(),
  jobTitle: z.string().trim().max(80).optional(),
  /** The client must agree before anything can be shown publicly. */
  consent: z.literal(true, { error: 'Please agree to let us show your review' }),
});
export type SubmitReviewInput = z.infer<typeof submitReviewSchema>;

export const REVIEW_STATUSES = ['pending', 'approved', 'rejected'] as const;

export const reviewListQuerySchema = z.object({
  status: z.enum([...REVIEW_STATUSES, 'all']).default('pending'),
});
export type ReviewListQuery = z.infer<typeof reviewListQuerySchema>;

export const moderateReviewSchema = z
  .object({
    status: z.enum(REVIEW_STATUSES).optional(),
    featured: z.boolean().optional(),
  })
  .refine((v) => v.status !== undefined || v.featured !== undefined, { message: 'Nothing to change' });
export type ModerateReviewInput = z.infer<typeof moderateReviewSchema>;

export const publicReviewQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(12).default(6),
});
export type PublicReviewQuery = z.infer<typeof publicReviewQuerySchema>;
