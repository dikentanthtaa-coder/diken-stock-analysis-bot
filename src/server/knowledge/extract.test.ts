import { describe, it, expect } from "vitest";
import {
  parseStoredTranscript,
  findConceptMentions,
  findCandidateRules,
  formatTimestamp,
} from "./extract";
import { GLOSSARY } from "./glossary";

describe("parseStoredTranscript", () => {
  it("parses [mm:ss] lines into segments", () => {
    const segs = parseStoredTranscript("[00:00] hello\n[01:30] डिमांड जोन");
    expect(segs).toEqual([
      { startSec: 0, text: "hello" },
      { startSec: 90, text: "डिमांड जोन" },
    ]);
  });

  it("appends continuation lines to the previous segment", () => {
    const segs = parseStoredTranscript("[00:05] part one\ncontinued text");
    expect(segs).toHaveLength(1);
    expect(segs[0].text).toBe("part one continued text");
  });

  it("handles minutes over 59 (no hour rollover in format)", () => {
    const segs = parseStoredTranscript("[75:10] late segment");
    expect(segs[0].startSec).toBe(75 * 60 + 10);
  });
});

describe("formatTimestamp", () => {
  it("formats seconds as mm:ss", () => {
    expect(formatTimestamp(0)).toBe("00:00");
    expect(formatTimestamp(90)).toBe("01:30");
    expect(formatTimestamp(3671)).toBe("61:11");
  });
});

describe("findConceptMentions", () => {
  it("finds Devanagari variant mentions with first timestamp", () => {
    const segs = parseStoredTranscript(
      "[00:10] आज हम डिमांड जोन के बारे में\n[02:00] डिमांड जोन कैसे बनता है",
    );
    const mentions = findConceptMentions(segs, GLOSSARY);
    const dz = mentions.find((m) => m.term.name === "Demand Zone");
    expect(dz).toBeDefined();
    expect(dz!.firstSec).toBe(10);
    expect(dz!.count).toBe(2);
  });

  it("ignores terms mentioned only once (passing reference)", () => {
    const segs = parseStoredTranscript("[00:10] सिर्फ एक बार सप्लाई जोन");
    const mentions = findConceptMentions(segs, GLOSSARY);
    expect(mentions.find((m) => m.term.name === "Supply Zone")).toBeUndefined();
  });

  it("matches latin-script variants case-insensitively", () => {
    const segs = parseStoredTranscript(
      "[00:00] The Breakout happened\n[00:30] another BREAKOUT retest",
    );
    const mentions = findConceptMentions(segs, GLOSSARY);
    expect(mentions.find((m) => m.term.name === "Breakout")).toBeDefined();
  });
});

describe("findCandidateRules", () => {
  it("flags rule-like excerpts containing marker + trading noun", () => {
    const segs = parseStoredTranscript(
      "[00:00] मार्केट की बात करें\n[00:10] हमेशा स्टॉप लॉस लगाना है\n[00:20] यह जरूरी है",
    );
    const rules = findCandidateRules(segs);
    expect(rules.length).toBeGreaterThan(0);
    expect(rules[0].excerpt).toContain("स्टॉप");
  });

  it("does not flag plain narration", () => {
    const segs = parseStoredTranscript(
      "[00:00] आज मौसम अच्छा है\n[00:10] चलिए शुरू करते हैं",
    );
    expect(findCandidateRules(segs)).toHaveLength(0);
  });

  it("caps candidates per video and avoids overlapping windows", () => {
    const lines = Array.from({ length: 100 }, (_, i) => {
      const m = String(Math.floor(i / 60)).padStart(2, "0");
      const s = String(i % 60).padStart(2, "0");
      return `[${m}:${s}] हमेशा स्टॉप लॉस जरूरी है ट्रेड में`;
    }).join("\n");
    const rules = findCandidateRules(parseStoredTranscript(lines));
    expect(rules.length).toBeLessThanOrEqual(12);
  });
});
