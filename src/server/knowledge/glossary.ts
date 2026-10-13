// Trading glossary used for concept detection in transcripts.
// GTF teaches demand/supply-zone price action, so that vocabulary dominates.
// `variants` include Devanagari transliterations because the course
// transcripts are Hindi auto-captions.
// Definitions are standard reference definitions (NOT quotes from the
// videos) — concept entries therefore link to source timestamps where the
// term is actually taught, and the definition is labelled as reference text.

export interface GlossaryTerm {
  name: string;
  definition: string;
  tags: string[];
  variants: string[]; // lowercase latin and devanagari substrings
}

export const GLOSSARY: GlossaryTerm[] = [
  {
    name: "Demand Zone",
    definition:
      "A price area where strong buying previously originated; price rallied away from it, suggesting unfilled institutional buy orders may remain.",
    tags: ["demand-supply", "zone"],
    variants: ["demand zone", "डिमांड जोन", "डिमांड ज़ोन", "डिमांड एरिया"],
  },
  {
    name: "Supply Zone",
    definition:
      "A price area where strong selling previously originated; price dropped away from it, suggesting unfilled institutional sell orders may remain.",
    tags: ["demand-supply", "zone"],
    variants: ["supply zone", "सप्लाई जोन", "सप्लाई ज़ोन", "सप्लाई एरिया"],
  },
  {
    name: "Base Candle",
    definition:
      "A small-bodied candle (body typically less than ~50% of its range) marking pause/accumulation inside a zone.",
    tags: ["demand-supply", "candlestick"],
    variants: ["base candle", "base candles", "बेस कैंडल", "बेसिंग"],
  },
  {
    name: "Boring Candle",
    definition:
      "GTF term for a small-bodied, low-momentum candle; a sequence of boring candles forms the base of a zone.",
    tags: ["demand-supply", "candlestick"],
    variants: ["boring candle", "बोरिंग कैंडल"],
  },
  {
    name: "Exciting Candle",
    definition:
      "GTF term for a large-bodied, high-momentum candle showing strong imbalance (rally or drop) away from a base.",
    tags: ["demand-supply", "candlestick"],
    variants: ["exciting candle", "एक्साइटिंग कैंडल", "एक्साइटिंग मूव"],
  },
  {
    name: "Rally",
    definition: "A strong upward price move of consecutive bullish candles.",
    tags: ["demand-supply", "structure"],
    variants: ["rally", "रैली"],
  },
  {
    name: "Drop",
    definition: "A strong downward price move of consecutive bearish candles.",
    tags: ["demand-supply", "structure"],
    variants: ["ड्रॉप", "drop base", "rally drop", "ड्राप"],
  },
  {
    name: "Drop-Base-Rally (DBR)",
    definition:
      "Zone pattern: a drop into a base followed by a rally away — a demand zone formation at a turning point.",
    tags: ["demand-supply", "pattern"],
    variants: ["dbr", "drop base rally", "डीबीआर", "ड्रॉप बेस रैली"],
  },
  {
    name: "Rally-Base-Rally (RBR)",
    definition:
      "Zone pattern: a rally, a pause (base), then continuation rally — a demand zone formed in an uptrend.",
    tags: ["demand-supply", "pattern"],
    variants: ["rbr", "rally base rally", "आरबीआर", "रैली बेस रैली"],
  },
  {
    name: "Drop-Base-Drop (DBD)",
    definition:
      "Zone pattern: a drop, a pause (base), then continuation drop — a supply zone formed in a downtrend.",
    tags: ["demand-supply", "pattern"],
    variants: ["dbd", "drop base drop", "डीबीडी", "ड्रॉप बेस ड्रॉप"],
  },
  {
    name: "Rally-Base-Drop (RBD)",
    definition:
      "Zone pattern: a rally into a base followed by a drop away — a supply zone formation at a turning point.",
    tags: ["demand-supply", "pattern"],
    variants: ["rbd", "rally base drop", "आरबीडी", "रैली बेस ड्रॉप"],
  },
  {
    name: "Fresh Zone",
    definition:
      "A demand/supply zone that price has not returned to since it was created; considered stronger than a tested zone.",
    tags: ["demand-supply", "zone"],
    variants: ["fresh zone", "फ्रेश जोन", "फ्रेश ज़ोन"],
  },
  {
    name: "Tested Zone",
    definition:
      "A zone price has already revisited; each test consumes pending orders and weakens the zone.",
    tags: ["demand-supply", "zone"],
    variants: ["tested zone", "टेस्टेड जोन", "जोन टेस्ट"],
  },
  {
    name: "Support",
    definition:
      "A horizontal price level where falling price has repeatedly found buying interest.",
    tags: ["levels"],
    variants: ["support level", "सपोर्ट", "support "],
  },
  {
    name: "Resistance",
    definition:
      "A horizontal price level where rising price has repeatedly found selling interest.",
    tags: ["levels"],
    variants: ["resistance", "रेजिस्टेंस", "रेसिस्टेन्स"],
  },
  {
    name: "Breakout",
    definition:
      "Price closing beyond a defined level/zone, signalling potential trend continuation or start.",
    tags: ["levels", "entry"],
    variants: ["breakout", "ब्रेकआउट", "ब्रेक आउट"],
  },
  {
    name: "Retest",
    definition:
      "Price returning to a broken level/zone after a breakout, often watched for entry confirmation.",
    tags: ["levels", "entry"],
    variants: ["retest", "री टेस्ट", "रीटेस्ट", "रिटेस्ट"],
  },
  {
    name: "Stop Loss",
    definition:
      "A predefined exit price that caps the loss if the trade thesis fails. Not a guaranteed fill price (gaps/slippage).",
    tags: ["risk"],
    variants: ["stop loss", "stoploss", "स्टॉप लॉस", "स्टॉपलॉस", "एसएल"],
  },
  {
    name: "Target",
    definition:
      "A predefined price objective where part or all of the position is booked.",
    tags: ["risk"],
    variants: ["target", "टारगेट", "टार्गेट"],
  },
  {
    name: "Risk-Reward Ratio",
    definition:
      "Reward per share divided by risk per share; swing setups commonly require at least 1:2.",
    tags: ["risk"],
    variants: ["risk reward", "risk to reward", "रिस्क रिवॉर्ड", "रिस्क टू रिवॉर्ड", "आरआर"],
  },
  {
    name: "Position Sizing",
    definition:
      "Choosing trade quantity from risk budget and stop distance rather than from available capital alone.",
    tags: ["risk"],
    variants: ["position sizing", "position size", "पोजीशन साइजिंग", "क्वांटिटी कितनी"],
  },
  {
    name: "Trend",
    definition:
      "Sustained directional price movement: higher highs/lows (uptrend) or lower highs/lows (downtrend).",
    tags: ["structure"],
    variants: ["uptrend", "downtrend", "अपट्रेंड", "डाउनट्रेंड", "ट्रेंड"],
  },
  {
    name: "Market Structure",
    definition:
      "The sequence of swing highs and swing lows that defines trend state and key levels.",
    tags: ["structure"],
    variants: ["market structure", "मार्केट स्ट्रक्चर", "स्ट्रक्चर"],
  },
  {
    name: "Swing High / Swing Low",
    definition:
      "Local price extremes used to map structure; a swing high is flanked by lower highs, a swing low by higher lows.",
    tags: ["structure"],
    variants: ["swing high", "swing low", "स्विंग हाई", "स्विंग लो"],
  },
  {
    name: "Pullback",
    definition:
      "A counter-trend retracement within an ongoing trend, often toward a zone or moving average.",
    tags: ["structure"],
    variants: ["pullback", "पुलबैक", "रिट्रेसमेंट", "retracement"],
  },
  {
    name: "Consolidation",
    definition:
      "Sideways, range-bound price action reflecting balance between buyers and sellers.",
    tags: ["structure"],
    variants: ["consolidation", "कंसोलिडेशन", "साइडवेज", "sideways"],
  },
  {
    name: "Volume",
    definition:
      "Shares traded per period; used to confirm the conviction behind moves and breakouts.",
    tags: ["confirmation"],
    variants: ["volume", "वॉल्यूम", "वोल्यूम"],
  },
  {
    name: "Liquidity",
    definition:
      "Ease of executing size without moving price; also resting orders around obvious levels.",
    tags: ["confirmation"],
    variants: ["liquidity", "लिक्विडिटी"],
  },
  {
    name: "Institutional Activity",
    definition:
      "Large-participant (FII/DII/fund) order flow that leaves footprints such as zones and volume spikes.",
    tags: ["demand-supply"],
    variants: ["institution", "इंस्टीट्यूशन", "इंस्टिट्यूशन", "बिग प्लेयर", "big players", "smart money", "स्मार्ट मनी"],
  },
  {
    name: "Timeframe",
    definition:
      "The candle interval under analysis; higher timeframes define context, lower ones refine entries.",
    tags: ["process"],
    variants: ["timeframe", "time frame", "टाइम फ्रेम", "टाइमफ्रेम"],
  },
  {
    name: "Entry",
    definition:
      "The price/condition at which a planned trade is opened.",
    tags: ["entry"],
    variants: ["एंट्री", "entry point", "एंट्री पॉइंट"],
  },
  {
    name: "Candlestick",
    definition:
      "Price bar showing open, high, low and close; body/wick proportions convey momentum.",
    tags: ["candlestick"],
    variants: ["candlestick", "कैंडलस्टिक", "कैंडल", "candle"],
  },
  {
    name: "Gap",
    definition:
      "A price jump between sessions leaving an untraded area; affects stops and zone quality.",
    tags: ["structure"],
    variants: ["gap up", "gap down", "गैप अप", "गैप डाउन", "गैप"],
  },
  {
    name: "Curve Analysis",
    definition:
      "GTF term for judging where current price sits between major higher-timeframe demand and supply (low vs high on the curve).",
    tags: ["demand-supply", "process"],
    variants: ["curve analysis", "कर्व एनालिसिस", "कर्व", "curve"],
  },
  {
    name: "Risk Management",
    definition:
      "The discipline of limiting loss per trade and overall drawdown via stops, sizing and exposure caps.",
    tags: ["risk"],
    variants: ["risk management", "रिस्क मैनेजमेंट"],
  },
  {
    name: "Paper Trading",
    definition:
      "Recording hypothetical trades without real money to validate a strategy.",
    tags: ["process"],
    variants: ["paper trading", "पेपर ट्रेडिंग", "पेपर ट्रेड"],
  },
  {
    name: "Backtesting",
    definition:
      "Evaluating a strategy's rules against historical data before risking capital.",
    tags: ["process"],
    variants: ["backtesting", "backtest", "बैकटेस्टिंग", "बैक टेस्टिंग", "बैकटेस्ट"],
  },
];
