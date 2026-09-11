const MAILDEV_URL = process.env.MAILDEV_URL ?? 'http://localhost:1080';

interface MailDevEmail {
  id: string;
  to: { address: string }[];
  html: string;
  time: string;
}

/** Polls MailDev's REST API for the most recent email to `toAddress`, extracting the first link from its HTML body. */
export async function waitForEmailLink(
  toAddress: string,
  { timeoutMs = 15_000, pollIntervalMs = 500 } = {},
): Promise<string> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    // maildev@2.2.1's REST API has no /api prefix — just /email. (A stray
    // npx-cached maildev@3.x, which does use /api/email, was what actually
    // served earlier local runs via a leftover process Playwright reused —
    // this only surfaced once a genuinely fresh 2.2.1 instance was running.)
    const response = await fetch(`${MAILDEV_URL}/email`);
    const emails = (await response.json()) as MailDevEmail[];
    const match = emails
      .filter((email) => email.to.some((to) => to.address === toAddress))
      .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())[0];

    if (match) {
      const linkMatch = /href="([^"]+)"/.exec(match.html);
      if (linkMatch) return linkMatch[1];
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  throw new Error(`No email with a link arrived for ${toAddress} within ${timeoutMs}ms`);
}

export async function clearInbox(): Promise<void> {
  await fetch(`${MAILDEV_URL}/email/all`, { method: 'DELETE' }).catch(() => undefined);
}
