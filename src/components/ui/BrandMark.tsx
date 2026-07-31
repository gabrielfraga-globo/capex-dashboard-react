export function BrandMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="brandGrad" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="var(--gradient-a)" />
          <stop offset="1" stopColor="var(--gradient-b)" />
        </linearGradient>
      </defs>
      <circle cx="16" cy="16" r="14.5" stroke="url(#brandGrad)" strokeWidth="1.6" opacity="0.35" />
      <circle cx="16" cy="16" r="9.5" stroke="url(#brandGrad)" strokeWidth="1.6" opacity="0.6" />
      <circle cx="16" cy="16" r="2.4" fill="url(#brandGrad)" />
      <path d="M16 16 L24 9" stroke="url(#brandGrad)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
