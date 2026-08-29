import { randomBytes } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { clearInbox, waitForEmailLink } from './fixtures/maildev-client';
import { closeDb, setDomainKeyLocation } from './fixtures/db';

const KEY_SERVER_URL = 'http://127.0.0.1:4011';
const INDEXNOW_MOCK_URL = 'http://127.0.0.1:4012';

test.describe('golden path', () => {
  test.afterAll(async () => {
    await closeDb();
  });

  test('signup through domain verification to an IndexNow submission reaching SUBMITTED', async ({ page }) => {
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
    await expect(page.getByText('Check your email')).toBeVisible();

    // --- verify email (read the link MailDev caught, don't click through it) ---
    const verifyLink = await waitForEmailLink(email);
    await page.goto(verifyLink);

    // --- login ---
    await page.goto('/login');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('heading', { name: 'Organizations' })).toBeVisible();

    // --- create organization (creator becomes OWNER) ---
    await page.getByRole('link', { name: 'New organization' }).click();
    await page.getByLabel('Name').fill(`E2E Org ${runId}`);
    await page.getByLabel('Slug').fill(`e2e-org-${runId}`);
    await page.getByRole('button', { name: 'Create organization' }).click();
    await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible();

    // --- create project ---
    await page.getByRole('link', { name: 'New project' }).click();
    await page.getByLabel('Name').fill(`E2E Project ${runId}`);
    await page.getByLabel('Slug').fill(`e2e-project-${runId}`);
    await page.getByRole('button', { name: 'Create project' }).click();
    await expect(page.getByRole('heading', { name: 'Domains' })).toBeVisible();

    // --- add domain ---
    await page.getByRole('link', { name: 'Add domain' }).click();
    await page.getByLabel('Hostname').fill(hostname);
    await page.getByRole('button', { name: 'Add domain' }).click();
    await expect(page.getByRole('heading', { name: hostname })).toBeVisible();

    const projectUrl = page.url().replace(/\/domains\/.*/, '');
    const domainId = new URL(page.url()).pathname.split('/').pop();
    if (!domainId) throw new Error('Could not read domainId from the domain detail page URL');

    // --- host the key file on the local fixture server and point the domain at it ---
    // The API never exposes indexnowKeyLocation for editing — production infers it
    // from the hostname itself, which this fake test hostname doesn't resolve.
    const keyText = await page.locator('.font-mono.break-all').innerText();
    const keyFileUrl = `${KEY_SERVER_URL}/${domainId}.txt`;
    await fetch(`${KEY_SERVER_URL}/__set?path=/${domainId}.txt`, { method: 'PUT', body: keyText });
    await setDomainKeyLocation(domainId, keyFileUrl);

    // --- verify domain (async — the verification worker polls the key file) ---
    // .first() rather than a single strict match: once verification succeeds,
    // "VERIFIED" legitimately appears twice (the header badge and the new row
    // in the verification-history list below it) — either is proof enough.
    await page.getByRole('button', { name: 'Verify now' }).click();
    await expect(async () => {
      await page.reload();
      await expect(page.getByText('VERIFIED', { exact: true }).first()).toBeVisible();
    }).toPass({ timeout: 30_000, intervals: [1500] });

    // --- submit a URL ---
    await page.goto(`${projectUrl}/submit`);
    await expect(page.getByRole('button', { name: 'Submit' })).toBeEnabled();
    await page.getByLabel('URLs').fill(submittedUrl);
    await page.getByRole('button', { name: 'Submit' }).click();
    await expect(page.getByText('1 accepted, 0 rejected')).toBeVisible();

    await page.getByRole('button', { name: 'View submissions' }).click();
    await page.locator('a[href*="/submissions/"]').first().click();

    // --- submission reaches SUBMITTED (async — the submission worker calls IndexNow) ---
    // Same .first() reasoning as domain verification above: the header badge
    // and the attempt-history row both legitimately show "SUBMITTED".
    await expect(async () => {
      await page.reload();
      await expect(page.getByText('SUBMITTED', { exact: true }).first()).toBeVisible();
    }).toPass({ timeout: 30_000, intervals: [1500] });

    // --- the push actually reached the (mocked) IndexNow endpoint for this host ---
    const indexNowRequests = (await (await fetch(`${INDEXNOW_MOCK_URL}/__requests`)).json()) as Array<{
      host?: string;
    }>;
    expect(indexNowRequests.some((r) => r.host === hostname)).toBe(true);
  });
});
