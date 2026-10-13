export const APP_NAME = "TradeForge";
export const APP_TAGLINE = "Trading analysis bot · NSE & BSE";

/**
 * Logo mark: a trading bot — robot head inside a neon hexagon badge, visor
 * showing a rising candlestick chart. Inline SVG so it scales crisply.
 */
export function LogoMark({ size = 32, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" className={className}>
      <defs>
        <linearGradient id="tfNeon" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#22d3ee" />
          <stop offset="55%" stopColor="#6366f1" />
          <stop offset="100%" stopColor="#a855f7" />
        </linearGradient>
        <linearGradient id="tfTile" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#0b1220" />
          <stop offset="100%" stopColor="#1a1440" />
        </linearGradient>
        <linearGradient id="tfGreen" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="#10b981" />
          <stop offset="100%" stopColor="#6ee7b7" />
        </linearGradient>
        <radialGradient id="tfGlow" cx="0.5" cy="0.55" r="0.55">
          <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
        </radialGradient>
      </defs>
      <path d="M32 2 L58 17 L58 47 L32 62 L6 47 L6 17 Z" fill="url(#tfTile)" />
      <path d="M32 2 L58 17 L58 47 L32 62 L6 47 L6 17 Z" fill="url(#tfGlow)" />
      <path d="M32 2 L58 17 L58 47 L32 62 L6 47 L6 17 Z" fill="none" stroke="url(#tfNeon)" strokeWidth="2.4" strokeLinejoin="round" />
      <line x1="32" y1="9" x2="32" y2="15" stroke="#22d3ee" strokeWidth="2" strokeLinecap="round" />
      <circle cx="32" cy="8" r="4" fill="#6ee7b7" opacity="0.25" />
      <circle cx="32" cy="8" r="2.4" fill="#6ee7b7" />
      <rect x="12.5" y="25" width="4" height="12" rx="2" fill="url(#tfNeon)" />
      <rect x="47.5" y="25" width="4" height="12" rx="2" fill="url(#tfNeon)" />
      <rect x="17" y="15" width="30" height="32" rx="8" fill="#0f172a" stroke="url(#tfNeon)" strokeWidth="2" />
      <rect x="20.5" y="19" width="23" height="17" rx="4" fill="#020617" />
      <line x1="24.5" y1="23" x2="24.5" y2="33" stroke="#f87171" strokeWidth="1.1" strokeLinecap="round" />
      <rect x="23" y="25.5" width="3" height="5.5" rx="0.7" fill="#f87171" />
      <g stroke="#6ee7b7" strokeWidth="1.1" strokeLinecap="round">
        <line x1="30" y1="21.5" x2="30" y2="32" />
        <line x1="35.5" y1="21" x2="35.5" y2="29.5" />
        <line x1="41" y1="20.5" x2="41" y2="27" />
      </g>
      <g fill="url(#tfGreen)">
        <rect x="28.5" y="25" width="3" height="5" rx="0.7" />
        <rect x="34" y="23" width="3" height="4.6" rx="0.7" />
        <rect x="39.5" y="21.5" width="3" height="4" rx="0.7" />
      </g>
      <path d="M22.5 33 L28.5 30 L34 28 L39.5 25 L42.5 22.5" fill="none" stroke="#22d3ee" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="26" y1="40.5" x2="38" y2="40.5" stroke="#22d3ee" strokeWidth="1.8" strokeLinecap="round" />
      <line x1="29" y1="44" x2="35" y2="44" stroke="#6366f1" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function Wordmark({ size = "md" }: { size?: "md" | "lg" }) {
  const cls = size === "lg" ? "text-3xl" : "text-[18px]";
  return (
    <span className={`${cls} font-extrabold tracking-tight text-zinc-900`}>
      Trade
      <span className="bg-gradient-to-r from-cyan-500 via-indigo-500 to-violet-500 bg-clip-text text-transparent">Forge</span>
    </span>
  );
}

export function Brand({ withTagline = false }: { withTagline?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark size={40} className="drop-shadow-[0_2px_6px_rgba(99,102,241,0.35)]" />
      <span className="flex flex-col leading-none">
        <Wordmark />
        {withTagline && (
          <span className="mt-1 text-[10.5px] font-medium uppercase tracking-[0.14em] text-zinc-400">{APP_TAGLINE}</span>
        )}
      </span>
    </span>
  );
}
