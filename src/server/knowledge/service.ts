import "server-only";
import { db } from "@/lib/db";
import { GLOSSARY } from "./glossary";
import {
  parseStoredTranscript,
  findConceptMentions,
  findCandidateRules,
  formatTimestamp,
} from "./extract";
import { getAiProvider } from "@/server/ai/adapter";

export interface ExtractionSummary {
  videosScanned: number;
  conceptsUpserted: number;
  candidateRules: number;
  aiRules: number;
  aiUsed: boolean;
  aiError?: string;
}

/**
 * Run extraction over all Completed videos with transcripts.
 * - Concepts: literal glossary-term mentions (provenance "taught" for the
 *   mention link; definition text is reference material).
 * - Candidate rules: verbatim rule-like excerpts (validation "ambiguous",
 *   needing review). Never executable conditions.
 * - AI rules: only when an AI provider is configured.
 */
export async function runExtraction(useAi: boolean): Promise<ExtractionSummary> {
  const videos = await db.video.findMany({
    where: { status: "Completed" },
    include: { transcript: true },
  });

  const summary: ExtractionSummary = {
    videosScanned: 0,
    conceptsUpserted: 0,
    candidateRules: 0,
    aiRules: 0,
    aiUsed: false,
  };

  const ai = getAiProvider();

  for (const video of videos) {
    if (!video.transcript) continue;
    summary.videosScanned++;
    const segments = parseStoredTranscript(video.transcript.content);

    // --- Concepts ---
    const mentions = findConceptMentions(segments, GLOSSARY);
    for (const m of mentions) {
      const existing = await db.concept.findFirst({
        where: { name: m.term.name, videoId: video.id },
      });
      const data = {
        name: m.term.name,
        definition: m.term.definition,
        provenance: "taught",
        videoId: video.id,
        timestamp: formatTimestamp(m.firstSec),
        tags: m.term.tags.join(","),
      };
      if (existing) {
        await db.concept.update({ where: { id: existing.id }, data });
      } else {
        await db.concept.create({ data });
      }
      summary.conceptsUpserted++;
    }

    // --- Candidate rules (heuristic, verbatim excerpts) ---
    const candidates = findCandidateRules(segments);
    for (const c of candidates) {
      const timestamp = formatTimestamp(c.startSec);
      const exists = await db.strategyRule.findFirst({
        where: { videoId: video.id, timestamp, provenance: "taught" },
      });
      if (exists) continue;
      await db.strategyRule.create({
        data: {
          title: `Candidate rule @ ${timestamp} — ${video.title.slice(0, 60)}`,
          ruleText: c.excerpt,
          conditions: "[]",
          provenance: "taught", // verbatim quote from source
          videoId: video.id,
          timestamp,
          validation: "ambiguous",
          notes:
            "Auto-flagged verbatim excerpt (rule-like language). Review, rewrite as a clear rule, or delete.",
        },
      });
      summary.candidateRules++;
    }

    // --- AI extraction (optional) ---
    if (useAi && ai.available) {
      summary.aiUsed = true;
      try {
        const rules = await ai.extractRules({
          videoTitle: video.title,
          transcript: video.transcript.content,
        });
        for (const r of rules) {
          const exists = await db.strategyRule.findFirst({
            where: { videoId: video.id, title: r.title, provenance: "interpreted" },
          });
          if (exists) continue;
          await db.strategyRule.create({
            data: {
              title: r.title,
              ruleText: r.ruleText,
              conditions: "[]",
              provenance: "interpreted",
              videoId: video.id,
              timestamp: r.timestamp,
              validation: "unvalidated",
              notes: r.interpretation
                ? `AI interpretation: ${r.interpretation}`
                : "AI-extracted; verify against source before use.",
            },
          });
          summary.aiRules++;
        }
      } catch (error) {
        summary.aiError =
          error instanceof Error ? error.message.slice(0, 300) : "AI failed";
      }
    }
  }

  return summary;
}

export interface SearchResults {
  concepts: Awaited<ReturnType<typeof searchConcepts>>;
  rules: Awaited<ReturnType<typeof searchRules>>;
  transcripts: { videoId: string; videoTitle: string; url: string; snippet: string }[];
}

function searchConcepts(q: string) {
  return db.concept.findMany({
    where: q
      ? { OR: [{ name: { contains: q } }, { definition: { contains: q } }, { tags: { contains: q } }] }
      : {},
    include: { video: { select: { title: true, url: true, youtubeId: true } } },
    orderBy: { name: "asc" },
    take: 200,
  });
}

function searchRules(q: string) {
  return db.strategyRule.findMany({
    where: q
      ? { OR: [{ title: { contains: q } }, { ruleText: { contains: q } }, { notes: { contains: q } }] }
      : {},
    include: { video: { select: { title: true, url: true, youtubeId: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
}

export async function searchKnowledge(q: string): Promise<SearchResults> {
  const [concepts, rules] = await Promise.all([searchConcepts(q), searchRules(q)]);

  let transcripts: SearchResults["transcripts"] = [];
  if (q.length >= 2) {
    const hits = await db.transcript.findMany({
      where: { content: { contains: q } },
      include: { video: { select: { id: true, title: true, url: true } } },
      take: 20,
    });
    transcripts = hits.map((t) => {
      const idx = t.content.indexOf(q);
      const lineStart = t.content.lastIndexOf("\n", idx) + 1;
      const snippet = t.content.slice(lineStart, lineStart + 200);
      return {
        videoId: t.video.id,
        videoTitle: t.video.title,
        url: t.video.url,
        snippet,
      };
    });
  }

  return { concepts, rules, transcripts };
}
