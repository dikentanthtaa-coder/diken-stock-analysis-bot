export const APP_NAME = "TradeForge";
export const APP_TAGLINE = "Research · Plan · Backtest · Trade";

/**
 * Logo mark: deep navy tile, three ascending candlesticks in forge-fire
 * amber/orange, and a white breakout arrow cutting through the top.
 */
export function LogoMark({ size = 32, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true" className={className}>
      <defs>
        <linearGradient id="tfTile" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#111827" />
          <stop offset="100%" stopColor="#1e1b4b" />
        </linearGradient>
        <linearGradient id="tfFire" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="#f97316" />
          <stop offset="100%" stopColor="#fbbf24" />
        </linearGradient>
        <linearGradient id="tfGlow" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#fbbf24" stopOpacity="0" />
          <stop offset="100%" stopColor="#fbbf24" stopOpacity="0.35" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="10" fill="url(#tfTile)" />
      <rect x="1" y="1" width="38" height="38" rx="9" fill="none" stroke="#fff" strokeOpacity="0.08" />
      {/* ember glow */}
      <ellipse cx="22" cy="30" rx="14" ry="6" fill="url(#tfGlow)" />
      {/* candles */}
      <g stroke="#fbbf24" strokeWidth="1.6" strokeLinecap="round" opacity="0.7">
        <line x1="11" y1="18" x2="11" y2="31" />
        <line x1="20" y1="13" x2="20" y2="27" />
        <line x1="29" y1="8" x2="29" y2="22" />
      </g>
      <g fill="url(#tfFire)">
        <rect x="8.5" y="21" width="5" height="8" rx="1.2" />
        <rect x="17.5" y="16" width="5" height="8" rx="1.2" />
        <rect x="26.5" y="11" width="5" height="8" rx="1.2" />
      </g>
      {/* breakout arrow */}
      <path
        d="M8 30 L15 24 L20 26.5 L30 14"
        fill="none"
        stroke="#fff"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M25.5 13.2 L30.8 13.2 L30.8 18.5" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Wordmark({ size = "md" }: { size?: "md" | "lg" }) {
  const cls = size === "lg" ? "text-3xl" : "text-[17px]";
  return (
    <span className={`${cls} font-extrabold tracking-tight text-zinc-900`}>
      Trade
      <span className="bg-gradient-to-r from-amber-500 to-orange-600 bg-clip-text text-transparent">Forge</span>
    </span>
  );
}

export function Brand({ withTagline = false }: { withTagline?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark size={34} className="shadow-md shadow-indigo-900/20" />
      <span className="flex flex-col leading-none">
        <Wordmark />
        {withTagline && (
          <span className="mt-1 text-[10.5px] font-medium uppercase tracking-[0.14em] text-zinc-400">{APP_TAGLINE}</span>
        )}
      </span>
    </span>
  );
}
