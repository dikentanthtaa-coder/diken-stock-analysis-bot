// Pure, deterministic extraction functions (unit-testable, no DB access).
// These do NOT invent trading rules: concept detection is literal term
// matching, and "candidate rules" are verbatim transcript excerpts that
// merely LOOK rule-like and are flagged for human review.

import type { GlossaryTerm } from "./glossary";

export interface Segment {
  startSec: number;
  text: string;
}

/** Parse stored "[mm:ss] text" transcript content back into segments. */
export function parseStoredTranscript(content: string): Segment[] {
  const segments: Segment[] = [];
  for (const line of content.split("\n")) {
    const m = line.match(/^\[(\d+):(\d{2})\]\s*(.*)$/);
    if (m) {
      segments.push({
        startSec: Number(m[1]) * 60 + Number(m[2]),
        text: m[3],
      });
    } else if (line.trim() && segments.length > 0) {
      segments[segments.length - 1].text += " " + line.trim();
    }
  }
  return segments;
}

export function formatTimestamp(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export interface ConceptMention {
  term: GlossaryTerm;
  firstSec: number;
  count: number;
}

/** Find glossary terms literally present in the transcript. */
export function findConceptMentions(
  segments: Segment[],
  glossary: GlossaryTerm[],
): ConceptMention[] {
  const mentions: ConceptMention[] = [];
  for (const term of glossary) {
    let count = 0;
    let firstSec = -1;
    for (const seg of segments) {
      const text = seg.text.toLowerCase();
      if (term.variants.some((v) => text.includes(v))) {
        count++;
        if (firstSec < 0) firstSec = seg.startSec;
      }
    }
    // Require at least 2 mentions to avoid passing references.
    if (count >= 2 && firstSec >= 0) {
      mentions.push({ term, firstSec, count });
    }
  }
  return mentions;
}

export interface CandidateRule {
  startSec: number;
  excerpt: string; // verbatim transcript text
}

// Conditional / imperative markers (Hindi + English) that make a sentence
// rule-like, and trading nouns that make it trading-relevant.
const RULE_MARKERS = [
  "जब भी", "अगर", "तो ही", "हमेशा", "कभी नहीं", "कभी भी नहीं", "रूल", "नियम",
  "याद रखना", "ध्यान रखना", "जरूरी है", "ज़रूरी है", "मत करना", "नहीं करना",
  "always", "never", "rule", "must", "whenever", "only when", "only if",
];
const TRADING_NOUNS = [
  "जोन", "ज़ोन", "एंट्री", "स्टॉप", "टारगेट", "टार्गेट", "ट्रेड", "रिस्क",
  "कैंडल", "ब्रेकआउट", "रीटेस्ट", "रिटेस्ट", "सपोर्ट", "रेजिस्टेंस", "वॉल्यूम",
  "zone", "entry", "stop", "target", "trade", "risk", "candle", "breakout",
];

/**
 * Flag verbatim transcript windows that look like taught rules.
 * Groups 3 consecutive segments so excerpts carry enough context.
 */
export function findCandidateRules(
  segments: Segment[],
  maxPerVideo = 12,
): CandidateRule[] {
  const out: CandidateRule[] = [];
  let lastPickedIndex = -10;
  for (let i = 0; i < segments.length; i++) {
    const windowSegs = segments.slice(i, i + 3);
    const text = windowSegs.map((s) => s.text).join(" ");
    const lower = text.toLowerCase();
    const hasMarker = RULE_MARKERS.some((m) => lower.includes(m));
    const hasNoun = TRADING_NOUNS.some((n) => lower.includes(n));
    if (hasMarker && hasNoun && i - lastPickedIndex >= 3) {
      out.push({ startSec: segments[i].startSec, excerpt: text.trim() });
      lastPickedIndex = i;
      if (out.length >= maxPerVideo) break;
    }
  }
  return out;
}
