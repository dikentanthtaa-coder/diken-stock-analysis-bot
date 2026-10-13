// Pure OHLCV validation (unit-testable, no IO).

export interface CandleLike {
  date: string; // YYYY-MM-DD
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface ValidationReport {
  valid: CandleLike[];
  rejected: { candle: CandleLike; reason: string }[];
  duplicates: string[]; // dates seen more than once
  possibleGaps: string[]; // weekday dates with no candle (may be holidays)
  warnings: string[];
}

export function validateCandles(candles: CandleLike[]): ValidationReport {
  const report: ValidationReport = {
    valid: [],
    rejected: [],
    duplicates: [],
    possibleGaps: [],
    warnings: [],
  };

  const seen = new Set<string>();
  const sorted = [...candles].sort((a, b) => a.date.localeCompare(b.date));

  for (const c of sorted) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(c.date)) {
      report.rejected.push({ candle: c, reason: "bad date format" });
      continue;
    }
    if (seen.has(c.date)) {
      report.duplicates.push(c.date);
      continue; // keep first occurrence only
    }
    seen.add(c.date);

    const nums = [c.open, c.high, c.low, c.close, c.volume];
    if (nums.some((n) => typeof n !== "number" || !Number.isFinite(n))) {
      report.rejected.push({ candle: c, reason: "non-finite value" });
      continue;
    }
    if (c.open <= 0 || c.high <= 0 || c.low <= 0 || c.close <= 0) {
      report.rejected.push({ candle: c, reason: "non-positive price" });
      continue;
    }
    if (c.volume < 0) {
      report.rejected.push({ candle: c, reason: "negative volume" });
      continue;
    }
    const eps = 1e-6;
    if (
      c.high + eps < Math.max(c.open, c.close) ||
      c.low - eps > Math.min(c.open, c.close) ||
      c.high + eps < c.low
    ) {
      report.rejected.push({ candle: c, reason: "OHLC bounds violated" });
      continue;
    }
    report.valid.push(c);
  }

  // Weekday gap detection between consecutive valid candles.
  for (let i = 1; i < report.valid.length; i++) {
    const prev = new Date(report.valid[i - 1].date + "T00:00:00Z");
    const curr = new Date(report.valid[i].date + "T00:00:00Z");
    const d = new Date(prev);
    d.setUTCDate(d.getUTCDate() + 1);
    while (d < curr) {
      const dow = d.getUTCDay();
      if (dow !== 0 && dow !== 6) {
        report.possibleGaps.push(d.toISOString().slice(0, 10));
      }
      d.setUTCDate(d.getUTCDate() + 1);
    }
  }
  if (report.possibleGaps.length > 0) {
    report.warnings.push(
      `${report.possibleGaps.length} weekday(s) missing candles — exchange holidays or data gaps.`,
    );
  }
  if (report.duplicates.length > 0) {
    report.warnings.push(`${report.duplicates.length} duplicate date(s) dropped.`);
  }
  if (report.rejected.length > 0) {
    report.warnings.push(`${report.rejected.length} candle(s) rejected by sanity checks.`);
  }
  return report;
}
