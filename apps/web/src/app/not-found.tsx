import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-auth-bg px-6 text-auth-text">
      <div className="max-w-md text-center">
        <p className="mb-2 font-mono text-sm text-auth-text3">404</p>
        <h1 className="mb-2 text-2xl font-semibold tracking-tight">Page not found</h1>
        <p className="mb-6 text-auth-text2">The page you’re looking for doesn’t exist or has moved.</p>
        <Link href="/" className="rounded-md bg-auth-accent px-4 py-2 text-sm font-medium text-white hover:bg-auth-accent2">Go to the home page</Link>
      </div>
    </main>
  );
}
