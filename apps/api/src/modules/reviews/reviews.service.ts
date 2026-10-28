import { Inject, Injectable } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
import { reviews, users, type Database } from '@foxindex/database';
import type { ModerateReviewInput, PublicReviewQuery, ReviewListQuery, SubmitReviewInput } from '@foxindex/validation';
import { NotFoundError, ValidationError } from '../../common/errors/app-error';
import { DATABASE } from '../../database/database.module';
import { AuditLogService } from '../audit-logs/audit-log.service';

type ReviewRow = typeof reviews.$inferSelect;

@Injectable()
export class ReviewsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(AuditLogService) private readonly auditLog: AuditLogService,
  ) {}

  private toDto(r: ReviewRow) {
    return {
      id: r.id,
      rating: r.rating,
      body: r.body,
      displayName: r.displayName,
      company: r.company,
      jobTitle: r.jobTitle,
      status: r.status as 'pending' | 'approved' | 'rejected',
      featured: r.featured,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }

  // ── Client ──────────────────────────────────────────────────────────────

  async mine(userId: string) {
    const row = await this.db.query.reviews.findFirst({ where: eq(reviews.userId, userId) });
    return row ? this.toDto(row) : null;
  }

  /** Create or edit the client's one review. Any edit goes back to the approval queue. */
  async submit(userId: string, input: SubmitReviewInput) {
    const user = await this.db.query.users.findFirst({ where: eq(users.id, userId), columns: { status: true, role: true } });
    if (!user || user.role !== 'client' || user.status !== 'active') throw new ValidationError('Only active customers can leave a review');
    const values = {
      rating: input.rating,
      body: input.body,
      displayName: input.displayName,
      company: input.company || null,
      jobTitle: input.jobTitle || null,
      status: 'pending',
      featured: false,
      reviewedBy: null,
      reviewedAt: null,
      updatedAt: new Date(),
    };
    const [row] = await this.db
      .insert(reviews)
      .values({ userId, ...values })
      .onConflictDoUpdate({ target: reviews.userId, set: values })
      .returning();
    await this.auditLog.record({ actorId: userId, action: 'review.submit', targetType: 'review', targetId: row.id, metadata: { rating: input.rating } });
    return this.toDto(row);
  }

  // ── Public ──────────────────────────────────────────────────────────────

  async published(query: PublicReviewQuery) {
    const rows = await this.db
      .select()
      .from(reviews)
      .where(eq(reviews.status, 'approved'))
      .orderBy(desc(reviews.featured), desc(reviews.rating), desc(reviews.updatedAt))
      .limit(query.limit);
    // Only what the client chose to show — never email, user id or anything else.
    return rows.map((r) => ({ id: r.id, rating: r.rating, body: r.body, displayName: r.displayName, company: r.company, jobTitle: r.jobTitle }));
  }

  // ── Staff ───────────────────────────────────────────────────────────────

  async list(query: ReviewListQuery) {
    const rows = await this.db
      .select({ r: reviews, email: users.email, accountName: users.name })
      .from(reviews)
      .innerJoin(users, eq(users.id, reviews.userId))
      .where(query.status === 'all' ? undefined : eq(reviews.status, query.status))
      .orderBy(desc(reviews.updatedAt))
      .limit(200);
    return rows.map(({ r, email, accountName }) => ({ ...this.toDto(r), client: { id: r.userId, name: accountName, email } }));
  }

  async moderate(actorId: string, id: string, input: ModerateReviewInput) {
    const existing = await this.db.query.reviews.findFirst({ where: eq(reviews.id, id) });
    if (!existing) throw new NotFoundError('Review');
    const status = input.status ?? existing.status;
    if (input.featured && status !== 'approved') throw new ValidationError('Approve the review before featuring it');
    const [row] = await this.db
      .update(reviews)
      .set({
        status,
        // Un-approving a review also un-features it.
        featured: status === 'approved' ? (input.featured ?? existing.featured) : false,
        ...(input.status ? { reviewedBy: actorId, reviewedAt: new Date() } : {}),
      })
      .where(eq(reviews.id, id))
      .returning();
    await this.auditLog.record({ actorId, action: 'review.moderate', targetType: 'review', targetId: id, metadata: input });
    return this.toDto(row);
  }
}
