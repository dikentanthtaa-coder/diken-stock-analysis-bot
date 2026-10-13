import { describe, it, expect } from "vitest";
import { validateCandles } from "./validate";

const good = (date: string, over: Partial<Record<string, number>> = {}) => ({
  date,
  open: 100,
  high: 110,
  low: 95,
  close: 105,
  volume: 1000,
  ...over,
});

describe("validateCandles", () => {
  it("accepts sane candles", () => {
    const r = validateCandles([good("2026-01-01"), good("2026-01-02")]);
    expect(r.valid).toHaveLength(2);
    expect(r.rejected).toHaveLength(0);
  });

  it("rejects high below close and low above open", () => {
    const r = validateCandles([
      good("2026-01-01", { high: 101, close: 105 }), // high < close
      good("2026-01-02", { low: 102, open: 100 }), // low > open
    ]);
    expect(r.valid).toHaveLength(0);
    expect(r.rejected.map((x) => x.reason)).toEqual([
      "OHLC bounds violated",
      "OHLC bounds violated",
    ]);
  });

  it("rejects non-positive prices and negative volume", () => {
    const r = validateCandles([
      good("2026-01-01", { open: 0 }),
      good("2026-01-02", { volume: -5 }),
      good("2026-01-03", { close: NaN }),
    ]);
    expect(r.valid).toHaveLength(0);
    expect(r.rejected).toHaveLength(3);
  });

  it("drops duplicate dates keeping the first", () => {
    const r = validateCandles([good("2026-01-05"), good("2026-01-05", { close: 99 })]);
    expect(r.valid).toHaveLength(1);
    expect(r.valid[0].close).toBe(105);
    expect(r.duplicates).toEqual(["2026-01-05"]);
  });

  it("flags weekday gaps but not weekends", () => {
    // 2026-01-02 is a Friday; 2026-01-06 is Tuesday. Missing Monday 01-05.
    const r = validateCandles([good("2026-01-02"), good("2026-01-06")]);
    expect(r.possibleGaps).toEqual(["2026-01-05"]);
  });

  it("sorts out-of-order input by date", () => {
    const r = validateCandles([good("2026-01-02"), good("2026-01-01")]);
    expect(r.valid.map((c) => c.date)).toEqual(["2026-01-01", "2026-01-02"]);
  });
});
