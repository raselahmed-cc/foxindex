import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage } from '@/components/marketing/legal-page';

export const metadata: Metadata = {
  title: 'Terms of Service — FoxIndex',
  description: 'The terms for using FoxIndex: accounts, credits, refunds, acceptable use and Google access.',
};

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" updated="November 10, 2026">
      <p>
        These terms apply to your use of FoxIndex at foxindex.net and its API. By creating an account you agree to them. If you use FoxIndex for a company,
        you confirm you may agree on its behalf.
      </p>

      <h2>Your account</h2>
      <ul>
        <li>Give accurate details. Every account is reviewed by a FoxIndex account manager before activation, and we may decline or suspend accounts that break these terms.</li>
        <li>Keep your password and API keys safe; you are responsible for activity on your account.</li>
      </ul>

      <h2>What FoxIndex does — and doesn’t</h2>
      <p>
        FoxIndex submits the URLs you choose to search engines (Google through the Indexing API where you have given access, and Bing, Yandex, Naver, Seznam and
        Yep through IndexNow) and reports their status. <strong>Search engines alone decide whether and when a page is crawled or indexed.</strong> We do not
        promise that any page will be indexed or ranked, or how quickly.
      </p>

      <h2>Credits and payments</h2>
      <ul>
        <li>Submitting a URL uses credits at the price shown before you submit. Credits do not expire.</li>
        <li>Online payments are processed by our payment partners; manual payments are added after your account manager confirms them.</li>
        <li>Unused credits are not refundable or exchangeable for cash.</li>
      </ul>

      <h2>Refunds for submissions</h2>
      <ul>
        <li><strong>Refunded automatically:</strong> credits for a URL that could not be submitted because of a technical error on our side or the search engine’s.</li>
        <li><strong>Not refunded:</strong> URLs that were submitted but not indexed, and URLs a search engine rejected because of the site or URL itself (for example, the site isn’t connected or verified, the IndexNow key file is missing, or the URL is invalid).</li>
      </ul>

      <h2>Google access</h2>
      <p>
        If you connect Google Search Console, you authorise FoxIndex to submit URLs and read index status for sites you own, as described in our{' '}
        <Link href="/privacy">Privacy Policy</Link>. Only connect accounts and submit URLs for websites you own or are authorised to manage. You can disconnect at
        any time.
      </p>

      <h2>Acceptable use</h2>
      <p>Don’t use FoxIndex to:</p>
      <ul>
        <li>submit pages you have no right to submit, or content that is illegal, malicious, deceptive or infringes others’ rights;</li>
        <li>submit spam, phishing, malware or pages built to manipulate search engines against their guidelines;</li>
        <li>interfere with the service, get around limits, or access other customers’ data.</li>
      </ul>
      <p>We may suspend accounts that do, and remaining credits may be forfeited when the breach is serious.</p>

      <h2>Availability and liability</h2>
      <p>
        We work to keep FoxIndex available and accurate but provide it “as is”. Search engines can change or limit their services at any time. To the extent the
        law allows, FoxIndex is not liable for indirect losses such as lost traffic, rankings or revenue, and our total liability is limited to the amount you paid
        us in the three months before the claim.
      </p>

      <h2>Closing your account</h2>
      <p>You can close your account from Settings. We may close accounts that break these terms or stay inactive for a long time, after notice where possible.</p>

      <h2>Changes</h2>
      <p>We may update these terms. We’ll change the date above and tell account holders about important changes before they apply.</p>

      <h2>Contact</h2>
      <p>Questions? Message us through the live chat on <Link href="/">foxindex.net</Link> or your account manager in the dashboard.</p>
    </LegalPage>
  );
}
