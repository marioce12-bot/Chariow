import { notFound } from "next/navigation";
import CreativePerformanceReadOnlyPreview from "@/components/dashboard/CreativePerformanceReadOnlyPreview";

export default function CreativePerformancePreviewPage() {
  if (process.env.VERCEL_ENV !== "preview") notFound();

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-6 text-gray-900 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Aperçu en lecture seule : les rapports sont consultables, aucune campagne ni donnée ne peut être modifiée.
        </div>
        <CreativePerformanceReadOnlyPreview />
      </div>
    </main>
  );
}
