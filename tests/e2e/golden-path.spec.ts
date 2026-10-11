import { randomBytes } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { clearInbox, waitForEmailLink } from './fixtures/maildev-client';

const INDEXNOW_MOCK_URL = 'http://127.0.0.1:4012';

test.describe('golden path', () => {
  test('signup through project creation to an IndexNow submission reaching SUBMITTED', async ({ page }) => {
    const runId = randomBytes(4).toString('hex');
    const email = `e2e-${runId}@example.com`;
    const password = `Sup3rSecret!${runId}`;
    const hostname = `e2e-${runId}.example.com`;
    const submittedUrl = `https://${hostname}/e2e-test-page`;

    await clearInbox();

    // --- signup ---
    await page.goto('/signup');
    await page.getByLabel('Name').fill(`E2E User ${runId}`);
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Sign up' }).click();
    // Longer timeout than the suite default: this is the very first request
    // to a webServer that just booted (cold Postgres pool) doing intentionally
    // slow scrypt password hashing — 20s has been observed to be too tight.
    await expect(page.getByText('Check your email')).toBeVisible({ timeout: 45_000 });

    // --- verify email (read the link MailDev caught, don't click through it) ---
    const verifyLink = await waitForEmailLink(email);
    await page.goto(verifyLink);

    // --- login ---
    await page.goto('/login');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible({ timeout: 30_000 });

    // --- create project (owner is the signed-in user directly — no organization, docs/adr/0013) ---
    await page.getByRole('link', { name: 'New project' }).click();
    await page.getByLabel('Name').fill(`E2E Project ${runId}`);
    await page.getByLabel('Slug').fill(`e2e-project-${runId}`);
    await page.getByRole('button', { name: 'Create project' }).click();
    // The project gets one generated IndexNow key at creation — no separate
    // domain-add/verify step exists anymore.
    await expect(page.getByRole('heading', { name: 'IndexNow key' })).toBeVisible();

    const projectUrl = page.url();

    // --- submit a URL (uses the project's own IndexNow key regardless of hostname) ---
    await page.goto(`${projectUrl}/submit`);
    await expect(page.getByRole('button', { name: 'Submit' })).toBeEnabled();
    await page.getByLabel('URLs').fill(submittedUrl);
    await page.getByRole('button', { name: 'Submit' }).click();
    await expect(page.getByText('1 accepted, 0 rejected')).toBeVisible();

    await page.getByRole('button', { name: 'View submissions' }).click();
    await page.locator('a[href*="/submissions/"]').first().click();

    // --- submission reaches SUBMITTED (async — the submission worker calls IndexNow) ---
    // .first() rather than a single strict match: once it succeeds, "SUBMITTED"
    // legitimately appears twice (the header badge and the attempt-history row).
    await expect(async () => {
      await page.reload();
      await expect(page.getByText('SUBMITTED', { exact: true }).first()).toBeVisible();
    }).toPass({ timeout: 45_000, intervals: [1500] });

    // --- the push actually reached the (mocked) IndexNow endpoint for this host ---
    const indexNowRequests = (await (await fetch(`${INDEXNOW_MOCK_URL}/__requests`)).json()) as Array<{
      host?: string;
    }>;
    expect(indexNowRequests.some((r) => r.host === hostname)).toBe(true);
  });
});
