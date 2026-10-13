"use client";

import { useEffect, useRef } from "react";
import {
  createChart,
  createSeriesMarkers,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  type IChartApi,
  type UTCTimestamp,
  type SeriesMarker,
  type Time,
} from "lightweight-charts";
import { buildSeries } from "@/server/signal/engine";
import type { Bar, Interval } from "@/server/market/intervals";
import type { PatternHit } from "@/server/analysis/patterns";

export interface PriceLine {
  price: number;
  title: string;
  color: string;
  dashed?: boolean;
}

const IST = "Asia/Kolkata";
const fmtTime = new Intl.DateTimeFormat("en-IN", { timeZone: IST, hour: "2-digit", minute: "2-digit", hour12: false });
const fmtDate = new Intl.DateTimeFormat("en-IN", { timeZone: IST, day: "2-digit", month: "short" });
const fmtFull = new Intl.DateTimeFormat("en-IN", { timeZone: IST, day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });

export function SignalChart({
  bars,
  interval,
  patterns,
  priceLines,
  overlays = { ema20: true, ema50: true, bb: true, vwap: true },
}: {
  bars: Bar[];
  interval: Interval;
  patterns: PatternHit[];
  priceLines: PriceLine[];
  overlays?: { ema20: boolean; ema50: boolean; bb: boolean; vwap: boolean };
}) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || bars.length === 0) return;
    const intraday = interval !== "1d";
    const chart = createChart(el, {
      height: el.clientWidth < 640 ? 320 : 440,
      layout: { background: { color: "#ffffff" }, textColor: "#3f3f46", attributionLogo: false },
      grid: { vertLines: { color: "#f4f4f5" }, horzLines: { color: "#f4f4f5" } },
      rightPriceScale: { borderColor: "#e4e4e7" },
      timeScale: {
        borderColor: "#e4e4e7",
        timeVisible: intraday,
        secondsVisible: false,
        tickMarkFormatter: (t: Time) => {
          const d = new Date((t as number) * 1000);
          return intraday ? fmtTime.format(d) : fmtDate.format(d);
        },
      },
      localization: {
        timeFormatter: (t: Time) => (intraday ? fmtFull : fmtDate).format(new Date((t as number) * 1000)),
        priceFormatter: (p: number) => p.toFixed(2),
      },
      crosshair: { mode: 0 },
    });
    chartRef.current = chart;

    const candles = chart.addSeries(CandlestickSeries, {
      upColor: "#059669", downColor: "#dc2626", borderUpColor: "#059669", borderDownColor: "#dc2626",
      wickUpColor: "#059669", wickDownColor: "#dc2626",
    });
    candles.setData(bars.map((b) => ({ time: b.time as UTCTimestamp, open: b.open, high: b.high, low: b.low, close: b.close })));

    const s = buildSeries(bars, interval);
    const line = (vals: (number | null)[], color: string, width: 1 | 2, style: 0 | 1 | 2, title: string) => {
      const ls = chart.addSeries(LineSeries, { color, lineWidth: width, lineStyle: style, priceLineVisible: false, lastValueVisible: false, title, crosshairMarkerVisible: false });
      ls.setData(
        vals.map((v, i) => (v == null ? null : { time: bars[i].time as UTCTimestamp, value: v })).filter((x): x is { time: UTCTimestamp; value: number } => x != null),
      );
    };
    if (overlays.ema20) line(s.ema20, "#4f46e5", 2, 0, "EMA20");
    if (overlays.ema50) line(s.ema50, "#d97706", 2, 0, "EMA50");
    if (overlays.bb) {
      line(s.bb.map((b) => b.upper), "#a1a1aa", 1, 2, "BB+");
      line(s.bb.map((b) => b.lower), "#a1a1aa", 1, 2, "BB−");
    }
    if (overlays.vwap) line(s.vwap, "#0284c7", 1, 1, intraday ? "VWAP" : "VWAP20");

    for (const pl of priceLines) {
      candles.createPriceLine({ price: pl.price, color: pl.color, lineWidth: 1, lineStyle: pl.dashed ? 2 : 0, axisLabelVisible: true, title: pl.title });
    }

    const markers: SeriesMarker<Time>[] = patterns
      .filter((p) => p.index >= 0 && p.index < bars.length)
      .map((p): SeriesMarker<Time> => ({
        time: bars[p.index].time as UTCTimestamp,
        position: p.direction === "bearish" ? "aboveBar" : "belowBar",
        color: p.direction === "bullish" ? "#059669" : p.direction === "bearish" ? "#dc2626" : "#71717a",
        shape: p.direction === "bullish" ? "arrowUp" : p.direction === "bearish" ? "arrowDown" : "circle",
        text: p.name,
      }))
      .sort((a, b) => (a.time as number) - (b.time as number));
    if (markers.length) createSeriesMarkers(candles, markers);

    const vol = chart.addSeries(HistogramSeries, { priceFormat: { type: "volume" }, priceScaleId: "vol", lastValueVisible: false, priceLineVisible: false });
    chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.86, bottom: 0 } });
    vol.setData(bars.map((b) => ({ time: b.time as UTCTimestamp, value: b.volume, color: b.close >= b.open ? "#05966933" : "#dc262633" })));

    const visible = Math.min(bars.length, el.clientWidth < 640 ? 90 : 180);
    chart.timeScale().setVisibleLogicalRange({ from: bars.length - visible, to: bars.length + 3 });

    const onResize = () => chart.applyOptions({ width: el.clientWidth });
    onResize();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      chart.remove();
      chartRef.current = null;
    };
  }, [bars, interval, patterns, priceLines, overlays]);

  return <div ref={ref} className="w-full" />;
}
