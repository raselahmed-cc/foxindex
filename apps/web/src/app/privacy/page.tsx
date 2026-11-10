import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage } from '@/components/marketing/legal-page';

export const metadata: Metadata = {
  title: 'Privacy Policy — FoxIndex',
  description: 'What FoxIndex collects, why, who it is shared with, and how Google user data is handled.',
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="November 10, 2026">
      <p>
        FoxIndex (“we”, “us”) helps website owners submit their pages to search engines and track whether they are indexed. This policy explains what
        information we collect at foxindex.net, why we collect it, who we share it with and the choices you have.
      </p>

      <h2>Information we collect</h2>
      <ul>
        <li><strong>Account details:</strong> your name, email address, date of birth, phone/WhatsApp number, country and city, and a hashed version of your password (we never store your password itself).</li>
        <li><strong>Sites and URLs:</strong> the website domains and page URLs you submit, and their submission and indexing status.</li>
        <li><strong>Payments:</strong> credit purchases, amounts, transaction IDs and the payment method used. Card numbers are entered on our payment partners’ pages (aamarPay, PayPal) and are never stored by FoxIndex; for saved cards we keep only the brand, the last four digits and a reference token.</li>
        <li><strong>Support:</strong> messages you send through live chat, website chat and support tickets, including any files you attach.</li>
        <li><strong>Technical data:</strong> IP address, browser type and login sessions, used for security, rate limiting and preventing abuse.</li>
        <li><strong>Google account data</strong> — only if you choose “Connect Google Search Console”. See the next section.</li>
      </ul>

      <h2>Google user data</h2>
      <p>
        When you connect Google Search Console, you sign in with Google and choose to grant FoxIndex access. We request only these permissions:
      </p>
      <ul>
        <li><strong>Your email address</strong> — to show which Google account is connected.</li>
        <li><strong>Indexing API</strong> (<code>auth/indexing</code>) — to notify Google about the URLs <em>you</em> submit through FoxIndex, for sites you own.</li>
        <li><strong>Search Console, read-only</strong> (<code>auth/webmasters.readonly</code>) — to list the sites you own so we know which URLs we may submit, and to check (URL Inspection) whether your submitted URLs are indexed.</li>
      </ul>
      <p>
        We use this data <strong>only</strong> to provide those features to you. We do not use it for advertising, we do not sell it, we do not share it with
        anyone except Google itself, and we do not use it to train artificial-intelligence or machine-learning models. People at FoxIndex do not read it unless
        you ask us to help with a problem, it is needed for security or abuse investigation, or the law requires it. Your Google refresh token is stored encrypted
        (AES-256-GCM).
      </p>
      <p>
        FoxIndex’s use and transfer of information received from Google APIs adheres to the{' '}
        <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noreferrer">Google API Services User Data Policy</a>, including the Limited Use requirements.
      </p>
      <p>
        You can disconnect at any time on the <strong>Sites</strong> page in your dashboard (this also revokes our access with Google), or from your Google
        account at <a href="https://myaccount.google.com/permissions" target="_blank" rel="noreferrer">myaccount.google.com/permissions</a>. When you disconnect,
        we delete the stored token and the list of your Search Console sites.
      </p>

      <h2>How we use information</h2>
      <ul>
        <li>To run the service: submit your URLs, check their indexing status, manage credits and process payments.</li>
        <li>To review and approve accounts, provide support through your account manager, and send service emails (verification codes, receipts, replies and alerts you can switch off in Settings).</li>
        <li>To keep FoxIndex secure, prevent fraud and abuse, and meet legal obligations.</li>
      </ul>

      <h2>Who we share information with</h2>
      <p>We share only what each partner needs to provide its part of the service:</p>
      <ul>
        <li><strong>Search engines:</strong> the URLs you submit are sent to Google (Indexing API) and to the IndexNow network (Bing, Yandex, Naver, Seznam, Yep).</li>
        <li><strong>Payment partners:</strong> aamarPay and PayPal process online payments.</li>
        <li><strong>Hosting and email providers</strong> that store our data and deliver our emails.</li>
        <li><strong>Authorities</strong>, when the law requires it.</li>
      </ul>
      <p>We do not sell personal information.</p>

      <h2>How long we keep information</h2>
      <p>
        We keep your account data while your account is open. Payment and credit records are kept as long as accounting law requires. When you close your
        account we delete or anonymise the rest within a reasonable period, except where we must keep it by law. Google tokens are deleted as soon as you
        disconnect Google.
      </p>

      <h2>Your choices and rights</h2>
      <ul>
        <li>Update your profile in <strong>Settings</strong>, change which emails you receive, and download your credit history.</li>
        <li>Ask us for a copy of your data, to correct it, or to delete your account — use <strong>Settings → Danger zone</strong> or contact your account manager.</li>
        <li>Disconnect Google, remove saved payment methods and delete API keys at any time from your dashboard.</li>
      </ul>

      <h2>Security</h2>
      <p>
        Passwords are hashed, secrets and tokens are encrypted at rest, all traffic uses HTTPS, and access to customer data inside FoxIndex is limited by role.
        No method is perfectly secure, but we work to protect your information and will notify you if a breach affects you.
      </p>

      <h2>Children</h2>
      <p>FoxIndex is a business service and is not intended for anyone under 18.</p>

      <h2>Changes</h2>
      <p>If we change this policy in a meaningful way we will update the date above and let account holders know by email or in the dashboard.</p>

      <h2>Contact</h2>
      <p>
        Questions about privacy? Message us through the live chat on <Link href="/">foxindex.net</Link> or your account manager in the dashboard.
      </p>
    </LegalPage>
  );
}
