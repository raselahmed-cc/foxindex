import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteNav } from '@/components/marketing/site-nav';
import { Pricing } from '@/components/marketing/pricing';

export const metadata: Metadata = {
  title: 'FoxIndex — Get your new pages into Google faster',
  description:
    'Submit URLs to Google, Bing, Yandex, Naver, Seznam and Yep in one step, and track every URL. Pay per URL with bKash, Nagad or card. A real account manager on live chat and WhatsApp.',
  openGraph: {
    title: 'FoxIndex — Get your new pages into Google faster',
    description: 'Submit URLs to Google and five more search engines in one step, and track every URL.',
    type: 'website',
  },
};

const FEED = [
  { url: 'techbazar.com.bd/laptops/lenovo-ideapad-slim-5', tone: 'ok', label: 'Accepted', time: '2h 14m' },
  { url: 'dhakafoodie.net/best-biryani-mirpur', tone: 'ok', label: 'Accepted', time: '3h 40m' },
  { url: 'hostpro.io/blog/nginx-vs-litespeed', tone: 'info', label: 'Submitted', time: '12m' },
  { url: 'jobsbd.co/jobs/senior-react-developer-4421', tone: 'info', label: 'Submitted', time: '4m' },
  { url: 'shopnear.my/product/wireless-earbuds-x3', tone: 'warn', label: 'Queued', time: 'now' },
] as const;

const PILL: Record<string, string> = {
  ok: 'bg-auth-ok-soft text-auth-ok',
  info: 'bg-auth-accent-soft text-auth-accent',
  warn: 'bg-auth-warn-soft text-auth-warn',
};

const ENGINES = ['Google', 'Bing', 'Yandex', 'Naver', 'Seznam', 'Yep'];

const STEPS = [
  { k: 'Step 1', title: 'Create your account', body: 'Sign up and confirm your email. A real account manager approves you — usually within a few hours — and you get 100 free credits.' },
  { k: 'Step 2', title: 'Submit URLs', body: 'Paste a list, upload a CSV, point us at your sitemap, or call the REST API. Each URL goes to every engine you choose.' },
  { k: 'Step 3', title: 'Track every URL', body: 'See the status of each URL per engine. If Google turns a submission down, its credit is refunded automatically.' },
];

const FEATURES = [
  { title: 'A real account manager', body: 'Live chat and WhatsApp with a person who knows your sites — not a bot.' },
  { title: 'Pay the way you already do', body: 'bKash, Nagad, Rocket, cards or bank transfer. Credits never expire.' },
  { title: 'Built for agencies', body: 'Unlimited sites, bulk CSV and sitemap import, and named batches for every client.' },
  { title: 'API and support you can rely on', body: 'API keys with per-key limits, plus support tickets with response-time targets.' },
];

const FAQ = [
  {
    q: 'Why does my account need approval?',
    a: 'Every account is checked by a real manager before it goes live. It keeps spam sites off the platform, which keeps submission quotas healthy for everyone. Most approvals happen within a few hours.',
  },
  {
    q: 'Does one credit mean one URL?',
    a: 'One credit covers one URL submitted to Google. Bing, Yandex, Naver, Seznam and Yep are included free with every submission.',
  },
  {
    q: 'What do I need for Google submissions?',
    a: 'Google accepts submissions for a site once FoxIndex is added as an owner in your Search Console. The Sites page shows the exact address and steps — it takes a minute. If a Google submission still fails, the credit is refunded automatically.',
  },
  {
    q: 'Can I add credit without a card?',
    a: 'Yes. Pay with bKash, Nagad, Rocket or a bank transfer and your account manager adds the credit — or buy a pack by card in a few clicks.',
  },
  {
    q: 'Can I connect my own tools?',
    a: 'Yes. Create API keys in your dashboard and submit URLs or read their status from any script or app. Each key can be limited to one site and a monthly credit budget.',
  },
];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-auth-bg text-auth-text">
      <div className="mx-auto max-w-[1180px] px-5 sm:px-8">
        <SiteNav />

        <section className="grid items-center gap-12 py-14 lg:grid-cols-[1.05fr_1fr] lg:py-20">
          <div>
            <h1 className="text-[40px] leading-[1.06] font-semibold tracking-tight text-balance sm:text-[56px]">Get your new pages into Google in hours, not weeks.</h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-auth-text2">
              Paste your URLs. FoxIndex submits them to Google, Bing, Yandex and three more search engines in one step — and shows you the status of every single URL.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href="/signup" className="rounded-md bg-auth-accent px-5 py-3 font-medium text-white hover:bg-auth-accent2">Create free account</Link>
              <a href="#how" className="rounded-md border border-auth-line2 px-5 py-3 hover:bg-auth-surface2">See how it works</a>
            </div>
            <p className="mt-4 text-sm text-auth-text3">100 free credits after approval. No card needed.</p>
          </div>

          <div className="overflow-hidden rounded-2xl border border-auth-line bg-auth-surface shadow-[0_40px_90px_-40px_rgba(0,0,0,0.9)]" aria-label="Example submissions">
            <div className="flex items-center justify-between border-b border-auth-line px-4 py-3 text-[13px] text-auth-text2">
              <span>Submissions · example</span>
              <span className="flex items-center gap-1.5 text-auth-ok"><span className="h-1.5 w-1.5 rounded-full bg-auth-ok" />Live</span>
            </div>
            {FEED.map((row) => (
              <div key={row.url} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 border-b border-auth-line px-4 py-3 font-mono text-[12.5px] last:border-b-0">
                <span className="truncate">{row.url}</span>
                <span className={`rounded-full px-2.5 py-0.5 font-sans text-xs font-medium ${PILL[row.tone]}`}>{row.label}</span>
                <span className="w-12 text-right text-xs text-auth-text3">{row.time}</span>
              </div>
            ))}
            <div className="flex flex-wrap gap-x-6 gap-y-1 border-t border-auth-line px-4 py-3 text-[13px] text-auth-text3">
              <span><b className="text-auth-text">6</b> search engines</span>
              <span><b className="text-auth-text">1</b> credit per URL</span>
              <span>Refund if Google declines</span>
            </div>
          </div>
        </section>

        <section id="engines" className="flex flex-wrap items-center gap-2.5 border-y border-auth-line py-6" aria-label="Supported search engines">
          {ENGINES.map((e) => (
            <span key={e} className="rounded-full border border-auth-line2 px-3.5 py-1.5 text-sm">{e}</span>
          ))}
          <span className="text-sm text-auth-text3">— one submission reaches all of them</span>
        </section>

        <section id="how" className="scroll-mt-6 py-20">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Three steps from publish to submitted</h2>
          <p className="mt-2 max-w-xl text-auth-text2">Set up once. After that, getting a new page in front of search engines is a paste and a click.</p>
          <div className="mt-8 grid overflow-hidden rounded-xl border border-auth-line md:grid-cols-3">
            {STEPS.map((s, i) => (
              <div key={s.k} className={`bg-auth-surface p-6 ${i > 0 ? 'border-t border-auth-line md:border-t-0 md:border-l' : ''}`}>
                <div className="font-mono text-xs text-auth-accent">{s.k}</div>
                <h3 className="mt-2 text-lg font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-auth-text2">{s.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="pb-20">
          <div className="grid gap-4 sm:grid-cols-2">
            {FEATURES.map((f) => (
              <div key={f.title} className="rounded-xl border border-auth-line bg-auth-surface p-6">
                <h3 className="font-semibold">{f.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-auth-text2">{f.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="pricing" className="scroll-mt-6 pb-20">
          <Pricing />
        </section>

        <section id="faq" className="scroll-mt-6 pb-20">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Questions people ask before signing up</h2>
          <div className="mt-6 border-t border-auth-line">
            {FAQ.map((f, i) => (
              <details key={f.q} open={i === 0} className="group border-b border-auth-line py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">
                  {f.q}
                  <span className="text-auth-text3 group-open:hidden">+</span>
                  <span className="hidden text-auth-text3 group-open:inline">−</span>
                </summary>
                <p className="mt-2.5 max-w-2xl text-sm leading-relaxed text-auth-text2">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="border-t border-auth-line py-20 text-center">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Stop waiting for the crawler.</h2>
          <p className="mx-auto mt-3 max-w-md text-auth-text2">Create an account and submit your first hundred URLs on us.</p>
          <Link href="/signup" className="mt-7 inline-block rounded-md bg-auth-accent px-5 py-3 font-medium text-white hover:bg-auth-accent2">Create free account</Link>
        </section>

        <footer className="flex flex-wrap items-center justify-between gap-4 border-t border-auth-line py-8 text-sm text-auth-text3">
          <span>© {new Date().getFullYear()} FoxIndex</span>
          <nav aria-label="Footer" className="flex flex-wrap gap-5">
            <a href="#pricing" className="hover:text-auth-text">Pricing</a>
            <a href="#faq" className="hover:text-auth-text">FAQ</a>
            <Link href="/login" className="hover:text-auth-text">Log in</Link>
            <Link href="/signup" className="hover:text-auth-text">Create account</Link>
          </nav>
        </footer>
      </div>
    </div>
  );
}
