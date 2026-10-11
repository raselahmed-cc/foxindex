import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { tickets, users, type Database } from '@foxindex/database';
import type { TicketReportQuery } from '@foxindex/validation';
import { AuthorizationError } from '../../common/errors/app-error';
import { DATABASE } from '../../database/database.module';
import { SupportSettingsService } from './support-settings.service';
import { isStaff, ticketScope, type TicketActor } from './ticket-scope';
import { SLA_SQL } from './tickets.service';

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const pct = (part: unknown, whole: unknown) => (Number(whole) > 0 ? Math.round((Number(part) / Number(whole)) * 1000) / 10 : null);

/**
 * Support analytics over a 7/30/90-day window, scoped like the ticket list
 * (managers see their book, admins everything). Staff-opened tickets are
 * excluded from response-time metrics — they start with the agent's message.
 */
@Injectable()
export class TicketReportsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(SupportSettingsService) private readonly settings: SupportSettingsService,
  ) {}

  async report(actor: TicketActor, { days }: TicketReportQuery) {
    if (!isStaff(actor)) throw new AuthorizationError();
    const settings = await this.settings.get();
    const tz = settings.businessHours.timezone;
    const scope = ticketScope(actor) ?? sql`true`;
    const since = sql`now() - make_interval(days => ${days})`;
    const inbound = sql`${tickets.source} <> 'staff'`;

    const [kpi, series, categories, priorities, agents, tags, csatDist] = await Promise.all([
      this.db.execute<Record<string, string | null>>(sql`
        SELECT
          count(*) FILTER (WHERE ${tickets.createdAt} >= ${since}) AS created,
          count(*) FILTER (WHERE ${tickets.resolvedAt} >= ${since}) AS resolved,
          count(*) FILTER (WHERE ${tickets.status} IN ('open', 'in_progress', 'waiting_on_client')) AS backlog,
          count(*) FILTER (WHERE ${tickets.status} IN ('open', 'in_progress', 'waiting_on_client') AND ${tickets.assignedManagerId} IS NULL) AS unassigned,
          count(*) FILTER (WHERE ${SLA_SQL.breached}) AS breached_now,
          percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM ${tickets.firstResponseAt} - ${tickets.createdAt}) / 60)
            FILTER (WHERE ${tickets.createdAt} >= ${since} AND ${tickets.firstResponseAt} IS NOT NULL AND ${inbound}) AS median_first_response,
          percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM ${tickets.resolvedAt} - ${tickets.createdAt}) / 60)
            FILTER (WHERE ${tickets.resolvedAt} >= ${since}) AS median_resolution,
          count(*) FILTER (WHERE ${tickets.createdAt} >= ${since} AND ${inbound} AND ${tickets.firstResponseDueAt} IS NOT NULL
            AND (${tickets.firstResponseAt} IS NOT NULL OR ${tickets.firstResponseDueAt} <= now())) AS fr_measured,
          count(*) FILTER (WHERE ${tickets.createdAt} >= ${since} AND ${inbound} AND ${tickets.firstResponseAt} <= ${tickets.firstResponseDueAt}) AS fr_met,
          count(*) FILTER (WHERE ${tickets.resolvedAt} >= ${since} AND ${tickets.resolutionDueAt} IS NOT NULL) AS res_measured,
          count(*) FILTER (WHERE ${tickets.resolvedAt} >= ${since} AND ${tickets.resolvedAt} <= ${tickets.resolutionDueAt}) AS res_met,
          avg(${tickets.csatRating}) FILTER (WHERE ${tickets.csatAt} >= ${since}) AS csat_avg,
          count(${tickets.csatRating}) FILTER (WHERE ${tickets.csatAt} >= ${since}) AS csat_count,
          count(*) FILTER (WHERE ${tickets.csatAt} >= ${since} AND ${tickets.csatRating} >= 4) AS csat_positive
        FROM ${tickets} WHERE ${scope}`),
      this.db.execute<{ day: string; created: string; resolved: string }>(sql`
        WITH d AS (
          SELECT generate_series(date_trunc('day', (now() AT TIME ZONE ${tz}) - make_interval(days => ${days - 1})), date_trunc('day', now() AT TIME ZONE ${tz}), interval '1 day')::date AS day
        )
        SELECT to_char(d.day, 'YYYY-MM-DD') AS day,
          (SELECT count(*) FROM ${tickets} WHERE ${scope} AND (${tickets.createdAt} AT TIME ZONE ${tz})::date = d.day) AS created,
          (SELECT count(*) FROM ${tickets} WHERE ${scope} AND (${tickets.resolvedAt} AT TIME ZONE ${tz})::date = d.day) AS resolved
        FROM d ORDER BY d.day`),
      this.db.execute<{ category: string; n: string }>(sql`
        SELECT ${tickets.category} AS category, count(*) AS n FROM ${tickets}
        WHERE ${scope} AND ${tickets.createdAt} >= ${since} GROUP BY 1 ORDER BY 2 DESC`),
      this.db.execute<{ priority: string; n: string; breached: string }>(sql`
        SELECT ${tickets.priority} AS priority, count(*) AS n,
          count(*) FILTER (WHERE ${tickets.firstResponseBreachedAt} IS NOT NULL OR ${tickets.resolutionBreachedAt} IS NOT NULL) AS breached
        FROM ${tickets} WHERE ${scope} AND ${tickets.createdAt} >= ${since} GROUP BY 1`),
      this.db.execute<Record<string, string | null>>(sql`
        SELECT u.id, u.name, u.availability,
          count(*) FILTER (WHERE t.status IN ('open', 'in_progress', 'waiting_on_client')) AS open,
          count(*) FILTER (WHERE t.resolved_at >= ${since}) AS resolved,
          percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM t.first_response_at - t.created_at) / 60)
            FILTER (WHERE t.created_at >= ${since} AND t.first_response_at IS NOT NULL AND t.source <> 'staff') AS median_first_response,
          count(*) FILTER (WHERE t.created_at >= ${since} AND (t.first_response_breached_at IS NOT NULL OR t.resolution_breached_at IS NOT NULL)) AS breaches,
          avg(t.csat_rating) FILTER (WHERE t.csat_at >= ${since}) AS csat_avg,
          count(t.csat_rating) FILTER (WHERE t.csat_at >= ${since}) AS csat_count
        FROM ${tickets} t JOIN ${users} u ON u.id = t.assigned_manager_id
        WHERE t.id IN (SELECT ${tickets.id} FROM ${tickets} WHERE ${scope})
        GROUP BY u.id, u.name, u.availability
        ORDER BY open DESC, resolved DESC`),
      this.db.execute<{ tag: string; n: string }>(sql`
        SELECT tag, count(*) AS n FROM ${tickets}, unnest(${tickets.tags}) AS tag
        WHERE ${scope} AND ${tickets.createdAt} >= ${since} GROUP BY tag ORDER BY 2 DESC LIMIT 10`),
      this.db.execute<{ rating: number; n: string }>(sql`
        SELECT ${tickets.csatRating} AS rating, count(*) AS n FROM ${tickets}
        WHERE ${scope} AND ${tickets.csatAt} >= ${since} AND ${tickets.csatRating} IS NOT NULL GROUP BY 1`),
    ]);

    const k = kpi.rows[0] ?? {};
    const dist = new Map(csatDist.rows.map((r) => [Number(r.rating), Number(r.n)]));
    return {
      days,
      timezone: tz,
      totals: {
        created: Number(k.created ?? 0),
        resolved: Number(k.resolved ?? 0),
        backlog: Number(k.backlog ?? 0),
        unassigned: Number(k.unassigned ?? 0),
        breachedNow: Number(k.breached_now ?? 0),
        medianFirstResponseMinutes: num(k.median_first_response),
        medianResolutionMinutes: num(k.median_resolution),
        firstResponseSlaPercent: pct(k.fr_met, k.fr_measured),
        resolutionSlaPercent: pct(k.res_met, k.res_measured),
        csatAverage: k.csat_avg === null || k.csat_avg === undefined ? null : Math.round(Number(k.csat_avg) * 10) / 10,
        csatResponses: Number(k.csat_count ?? 0),
        csatPositivePercent: pct(k.csat_positive, k.csat_count),
      },
      series: series.rows.map((r) => ({ day: r.day, created: Number(r.created), resolved: Number(r.resolved) })),
      categories: categories.rows.map((r) => ({ category: r.category, count: Number(r.n) })),
      priorities: priorities.rows.map((r) => ({ priority: r.priority, count: Number(r.n), breached: Number(r.breached) })),
      csatDistribution: [1, 2, 3, 4, 5].map((rating) => ({ rating, count: dist.get(rating) ?? 0 })),
      tags: tags.rows.map((r) => ({ tag: r.tag, count: Number(r.n) })),
      agents: agents.rows.map((r) => ({
        id: r.id as string,
        name: r.name as string,
        availability: r.availability as string,
        open: Number(r.open ?? 0),
        resolved: Number(r.resolved ?? 0),
        medianFirstResponseMinutes: num(r.median_first_response),
        breaches: Number(r.breaches ?? 0),
        csatAverage: r.csat_avg === null ? null : Math.round(Number(r.csat_avg) * 10) / 10,
        csatResponses: Number(r.csat_count ?? 0),
      })),
    };
  }
}
