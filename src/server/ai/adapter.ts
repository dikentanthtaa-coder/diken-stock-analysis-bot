import "server-only";
import Anthropic from "@anthropic-ai/sdk";
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

/** Claude provider via the official Anthropic SDK. Uses adaptive thinking
 *  (always on for Opus 5.5) with explicit medium effort, and the server-side
 *  refusal fallback so a declined request is re-run on a fallback model
 *  inside the same call. UNVERIFIED until a key is configured. */
class ClaudeProvider implements AiProvider {
  readonly id = "claude";
  readonly available = true;
  private client: Anthropic;
  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey, maxRetries: 2, timeout: 90_000 });
  }

  private async generate(system: string, prompt: string): Promise<string> {
    try {
      const response = await this.client.beta.messages.create({
        model: "claude-opus-5-5",
        max_tokens: 16000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "medium" },
        system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: prompt }],
      });
      if (response.stop_reason === "refusal") {
        throw new Error(
          `Claude declined this request${response.stop_details?.category ? ` (${response.stop_details.category})` : ""}.`,
        );
      }
      return response.content
        .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");
    } catch (error) {
      if (error instanceof Anthropic.AuthenticationError) throw new Error("Claude API key rejected (AI_API_KEY).");
      if (error instanceof Anthropic.RateLimitError) throw new Error("Claude API rate limit reached; try again shortly.");
      if (error instanceof Anthropic.APIError) throw new Error(`Claude API error ${error.status}: ${error.message}`);
      throw error;
    }
  }

  async extractRules(input: { videoTitle: string; transcript: string }): Promise<AiRuleExtraction[]> {
    const system = [
      "You extract trading rules EXPLICITLY TAUGHT in a Hindi stock-trading course transcript.",
      "Only include rules the teacher clearly states. Never invent or complete partial rules.",
      'Return ONLY a JSON array of {"title","ruleText","timestamp","interpretation"}: ruleText is an English rendering of what was taught; timestamp is mm:ss from the [mm:ss] markers; interpretation is your own reading, kept separate.',
    ].join(" ");
    const text = await this.generate(system, `Video: ${input.videoTitle}

Transcript:
${input.transcript}`);
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return [];
    const parsed = JSON.parse(match[0]) as AiRuleExtraction[];
    return parsed.filter((r) => r.title && r.ruleText);
  }

  async explain(prompt: string): Promise<string> {
    return this.generate(
      "You are a disciplined, quantitative equity-research assistant for Indian (NSE/BSE) stocks. You explain mechanically generated technical signals. You never guarantee outcomes, never invent numbers, cite only the values given, and state the data's freshness. Plain prose, no markdown headers.",
      prompt,
    );
  }
}

export function getAiProvider(): AiProvider {
  if (env.AI_PROVIDER === "claude" && env.AI_API_KEY) {
    return new ClaudeProvider(env.AI_API_KEY);
  }
  if (env.AI_PROVIDER === "gemini" && env.AI_API_KEY) {
    return new GeminiProvider(env.AI_API_KEY);
  }
  return new NoAiProvider();
}
