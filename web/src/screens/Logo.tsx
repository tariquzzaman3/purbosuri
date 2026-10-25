/** The Purbosuri mark: a sprouting leaf on green. Decorative, the name is always written beside it. */
export function Logo({ size = 36 }: { size?: number }) {
  return (
    <svg
      className="logo"
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden="true"
      focusable="false"
    >
      <rect width="64" height="64" rx="14" fill="#1d5a45" />
      <path
        d="M32 50V30m0 0c0-9 6-15 15-15 0 9-6 15-15 15zm0 6c0-7-5-12-12-12 0 7 5 12 12 12z"
        fill="none"
        stroke="#fbf7ef"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
