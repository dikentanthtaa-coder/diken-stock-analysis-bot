import "server-only";
import { db } from "@/lib/db";
import { runGate, GATE_DEFAULTS, type GateInput, type GateResult } from "./gate";
import { getMarketRegime } from "@/server/market/regime";

// Collects the account/portfolio context the gate needs from the paper
// book and settings, then runs the pure gate.

export interface GateSettings {
  capital: number;
  maxRiskPct: number;
  maxOpenPositions: number;
  dailyLossLimitPct: number;
  weeklyLossLimitPct: number;
}

export async function getGateSettings(): Promise<GateSettings> {
  const row = await db.setting.findUnique({ where: { key: "discipline" } }).catch(() => null);
  const saved = row ? (JSON.parse(row.value) as Partial<GateSettings>) : {};
  return { ...GATE_DEFAULTS, ...saved };
}

export async function saveGateSettings(s: GateSettings): Promise<void> {
  await db.setting.upsert({
    where: { key: "discipline" },
    update: { value: JSON.stringify(s) },
    create: { key: "discipline", value: JSON.stringify(s) },
  });
}

export interface PortfolioContext {
  openExposure: number;
  openPositions: number;
  pnlToday: number;
  pnlWeek: number;
  consecutiveLosses: number;
}

const IST = "Asia/Kolkata";
const dayKey = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: IST, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

export async function getPortfolioContext(): Promise<PortfolioContext> {
  const [open, closed] = await Promise.all([
    db.paperTrade.findMany({ where: { status: "open" }, select: { entryPrice: true, quantity: true } }),
    db.paperTrade.findMany({
      where: { status: "closed", exitDate: { gte: new Date(Date.now() - 8 * 86_400_000) } },
      select: { entryPrice: true, exitPrice: true, quantity: true, exitDate: true, direction: true },
      orderBy: { exitDate: "desc" },
    }),
  ]);
  const openExposure = open.reduce((a, t) => a + (t.entryPrice ?? 0) * (t.quantity ?? 0), 0);
  const today = dayKey(new Date());
  const weekAgo = Date.now() - 7 * 86_400_000;
  let pnlToday = 0, pnlWeek = 0, consecutiveLosses = 0;
  let streakOpen = true;
  for (const t of closed) {
    if (t.entryPrice == null || t.exitPrice == null || t.quantity == null || !t.exitDate) continue;
    const dir = t.direction === "short" ? -1 : 1;
    const pnl = dir * (t.exitPrice - t.entryPrice) * t.quantity;
    if (dayKey(t.exitDate) === today) pnlToday += pnl;
    if (t.exitDate.getTime() >= weekAgo) pnlWeek += pnl;
    if (streakOpen) {
      if (pnl < 0) consecutiveLosses++;
      else streakOpen = false;
    }
  }
  return { openExposure, openPositions: open.length, pnlToday, pnlWeek, consecutiveLosses };
}

export interface GateRequest {
  direction: "long" | "short";
  entry: number;
  stop: number;
  target1: number | null;
  quantity: number;
  signal?: "BUY" | "SELL" | "HOLD" | null;
  signalConfidence?: number | null;
  dailyTrend?: "uptrend" | "downtrend" | "sideways" | null;
  dataStatus?: string | null;
  atr?: number | null;
  thesis?: string | null;
}

export async function checkTrade(req: GateRequest): Promise<{ result: GateResult; quantity: number; sizingNote: string | null; settings: GateSettings; context: PortfolioContext; regime: { posture: string; exposureCeilingPct: number } | null }> {
  const [settings, context, regime] = await Promise.all([
    getGateSettings(),
    getPortfolioContext(),
    getMarketRegime().catch(() => null),
  ]);
  // Quantity 0 means "size it for me": the risk-based quantity from settings.
  const riskPerShare = req.direction === "long" ? req.entry - req.stop : req.stop - req.entry;
  let quantity = req.quantity;
  let sizingNote: string | null = null;
  if (!(quantity > 0)) {
    const riskQty = riskPerShare > 0 ? Math.floor((settings.capital * settings.maxRiskPct) / 100 / riskPerShare) : 0;
    const budgetQty = Math.floor(settings.capital / req.entry);
    const ceilingQty =
      regime && req.direction === "long"
        ? Math.floor(Math.max(0, (settings.capital * regime.exposureCeilingPct) / 100 - context.openExposure) / req.entry)
        : Infinity;
    quantity = Math.max(0, Math.min(riskQty, budgetQty, ceilingQty));
    sizingNote =
      quantity === ceilingQty && ceilingQty < riskQty
        ? `Size capped by the ${regime!.exposureCeilingPct}% market exposure ceiling (risk rule alone allowed ${riskQty}).`
        : quantity === budgetQty && budgetQty < riskQty
          ? `Size capped by capital (risk rule alone allowed ${riskQty}).`
          : `Sized by the ${settings.maxRiskPct}% risk rule.`;
    if (quantity < 1) quantity = 1;
  }
  const input: GateInput = {
    direction: req.direction,
    entry: req.entry,
    stop: req.stop,
    target1: req.target1,
    quantity,
    capital: settings.capital,
    maxRiskPct: settings.maxRiskPct,
    openExposure: context.openExposure,
    openPositions: context.openPositions,
    maxOpenPositions: settings.maxOpenPositions,
    pnlToday: context.pnlToday,
    pnlWeek: context.pnlWeek,
    dailyLossLimitPct: settings.dailyLossLimitPct,
    weeklyLossLimitPct: settings.weeklyLossLimitPct,
    consecutiveLosses: context.consecutiveLosses,
    exposureCeilingPct: regime?.exposureCeilingPct ?? null,
    marketPosture: regime?.posture ?? null,
    signal: req.signal ?? null,
    signalConfidence: req.signalConfidence ?? null,
    dailyTrend: req.dailyTrend ?? null,
    dataStatus: req.dataStatus ?? null,
    atr: req.atr ?? null,
    thesis: req.thesis ?? null,
  };
  return {
    result: runGate(input),
    quantity,
    sizingNote,
    settings,
    context,
    regime: regime ? { posture: regime.posture, exposureCeilingPct: regime.exposureCeilingPct } : null,
  };
}
