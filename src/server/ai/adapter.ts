import "server-only";
import { env } from "@/lib/env";

// Provider-independent AI adapter. The core app never requires AI:
// the "heuristic" provider is pure deterministic keyword logic and is
// always available. A real LLM provider is used only when configured.

export interface AiRuleExtraction {
  title: string;
  ruleText: string; // as taught (quoted/paraphrased from transcript)
  timestamp: string | null;
  interpretation?: string; // model's reading, kept separate from source
}

export interface AiProvider {
  readonly id: string;
  readonly available: boolean;
  /** Extract explicitly-taught strategy rules from a transcript. */
  extractRules(input: {
    videoTitle: string;
    transcript: string;
  }): Promise<AiRuleExtraction[]>;
  /** Free-form explanation support (used later for analysis narratives). */
  explain(prompt: string): Promise<string>;
}

class NoAiProvider implements AiProvider {
  readonly id = "none";
  readonly available = false;
  async extractRules(): Promise<AiRuleExtraction[]> {
    throw new Error(
      "No AI provider configured. Set AI_PROVIDER and AI_API_KEY in .env (e.g. a free Gemini key) to enable AI extraction. Heuristic extraction works without it.",
    );
  }
  async explain(): Promise<string> {
    throw new Error("No AI provider configured.");
  }
}

/** Gemini REST provider (free tier available). UNVERIFIED until a key is
 *  configured and a real call succeeds — the UI treats it as optional. */
class GeminiProvider implements AiProvider {
  readonly id = "gemini";
  readonly available = true;
  constructor(private apiKey: string) {}

  private async generate(prompt: string): Promise<string> {
    const res = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": this.apiKey,
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
        }),
        signal: AbortSignal.timeout(60_000),
      },
    );
    if (!res.ok) {
      throw new Error(`Gemini API error ${res.status}: ${(await res.text()).slice(0, 300)}`);
    }
    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    return data.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") ?? "";
  }

  async extractRules(input: {
    videoTitle: string;
    transcript: string;
  }): Promise<AiRuleExtraction[]> {
    const prompt = [
      "You are extracting trading rules EXPLICITLY TAUGHT in a Hindi stock-trading course transcript.",
      "Rules: only include rules the teacher clearly states. Do NOT invent or complete partial rules.",
      "For each rule return JSON: {title, ruleText (English translation of what was taught), timestamp (mm:ss from the [mm:ss] markers), interpretation (optional: your reading, clearly separate)}.",
      'Return ONLY a JSON array, no prose. Video: ' + input.videoTitle,
      "Transcript:",
      input.transcript.slice(0, 100_000),
    ].join("\n");
    const text = await this.generate(prompt);
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return [];
    const parsed = JSON.parse(match[0]) as AiRuleExtraction[];
    return parsed.filter((r) => r.title && r.ruleText);
  }

  async explain(prompt: string): Promise<string> {
    return this.generate(prompt);
  }
}

export function getAiProvider(): AiProvider {
  if (env.AI_PROVIDER === "gemini" && env.AI_API_KEY) {
    return new GeminiProvider(env.AI_API_KEY);
  }
  return new NoAiProvider();
}
