export const APP_NAME = "DKN Alpha";
export const APP_TAGLINE = "Swing research for NSE & BSE";

/** Gradient tile with three rising candlesticks and a spark line. */
export function LogoMark({ size = 32, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      aria-hidden="true"
      className={className}
    >
      <defs>
        <linearGradient id="dknGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#4f46e5" />
          <stop offset="100%" stopColor="#7c3aed" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill="url(#dknGrad)" />
      {/* candles */}
      <g stroke="#fff" strokeWidth="1.4" strokeLinecap="round" opacity="0.55">
        <line x1="9" y1="13" x2="9" y2="25" />
        <line x1="16" y1="9" x2="16" y2="22" />
        <line x1="23" y1="6" x2="23" y2="18" />
      </g>
      <g fill="#fff">
        <rect x="7" y="16" width="4" height="7" rx="1" opacity="0.8" />
        <rect x="14" y="12" width="4" height="7" rx="1" opacity="0.9" />
        <rect x="21" y="8" width="4" height="7" rx="1" />
      </g>
      {/* alpha spark */}
      <path
        d="M6 26 L12 22 L17 23.5 L26 14"
        fill="none"
        stroke="#a7f3d0"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="26" cy="14" r="1.8" fill="#a7f3d0" />
    </svg>
  );
}

export function Wordmark({ size = "md" }: { size?: "md" | "lg" }) {
  const cls = size === "lg" ? "text-2xl" : "text-[16px]";
  return (
    <span className={`${cls} font-semibold tracking-tight text-zinc-900`}>
      DKN<span className="ml-1 font-medium text-indigo-600">Alpha</span>
    </span>
  );
}

export function Brand({ withTagline = false }: { withTagline?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark size={32} className="shadow-sm" />
      <span className="flex flex-col leading-none">
        <Wordmark />
        {withTagline && (
          <span className="mt-0.5 text-[11px] text-zinc-500">{APP_TAGLINE}</span>
        )}
      </span>
    </span>
  );
}
