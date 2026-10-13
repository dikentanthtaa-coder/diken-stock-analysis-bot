export const metadata = { title: "Knowledge" };
import { Suspense } from "react";
import { db } from "@/lib/db";
import { KnowledgeClient } from "./ui";
import { PageLoader } from "../loader";

export default function KnowledgePage() {
  return (
    <Suspense
      fallback={
        <PageLoader label="Loading knowledge base" />
      }
    >
      <KnowledgeContent />
    </Suspense>
  );
}

async function KnowledgeContent() {
  const [conceptCount, ruleCount, completedVideos] = await Promise.all([
    db.concept.count(),
    db.strategyRule.count(),
    db.video.count({ where: { status: "Completed" } }),
  ]);

  return (
    <main className="mx-auto max-w-5xl px-4 py-5 sm:py-8">
      <h1 className="text-xl font-semibold tracking-tight text-zinc-900 sm:text-2xl">
        Trading Knowledge Base
      </h1>
      <p className="mt-1 text-sm text-zinc-600">
        {conceptCount} concept entries · {ruleCount} rules ·{" "}
        {completedVideos} transcripts available. Concept definitions are
        reference text; source links show where the course teaches each term.
      </p>
      <KnowledgeClient
        counts={{ conceptCount, ruleCount, completedVideos }}
      />
    </main>
  );
}
