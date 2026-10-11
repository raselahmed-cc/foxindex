export function FoxLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden="true" className={className}>
      <path d="M6 5 L16 12 L26 5 L26 15 C26 22 21 27 16 28 C11 27 6 22 6 15 Z" fill="#F28C3B" />
      <path d="M16 12 L26 5 L26 15 C26 22 21 27 16 28 Z" fill="#D9732B" />
      <path d="M12 16 C13.5 17.5 18.5 17.5 20 16 L16 22 Z" fill="#0F131A" />
      <circle cx="12.5" cy="15" r="1.4" fill="#0F131A" />
      <circle cx="19.5" cy="15" r="1.4" fill="#0F131A" />
    </svg>
  );
}
