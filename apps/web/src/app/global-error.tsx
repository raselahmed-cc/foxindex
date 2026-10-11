'use client';

/** Last-resort boundary for errors in the root layout itself (renders its own <html>). */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: '#0b0d12', color: '#e8ebf2', fontFamily: 'system-ui, sans-serif' }}>
        <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center' }}>
          <div>
            <h1 style={{ fontSize: 24, marginBottom: 8 }}>FoxIndex is having trouble</h1>
            <p style={{ color: '#9aa3b5', marginBottom: 24 }}>Please try again in a moment.</p>
            <button onClick={reset} style={{ background: '#6b8cff', color: '#fff', border: 0, borderRadius: 6, padding: '10px 16px', fontSize: 14, cursor: 'pointer' }}>
              Try again
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
