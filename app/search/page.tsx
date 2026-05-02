import { Suspense } from "react";
import SearchPageContent from "./search-content";

export default function SearchPage() {
  return (
    <Suspense fallback={<SearchPageSkeleton />}>
      <SearchPageContent />
    </Suspense>
  );
}

function SearchPageSkeleton() {
  return (
    <div
      className="min-h-dvh flex flex-col"
      style={{ background: "var(--bg-base)" }}
    >
      <div className="pt-14 md:ml-20 pb-4 flex-1">
        <div className="px-4 pt-6 pb-2">
          <div className="h-10 rounded-lg bg-white/10 animate-pulse" />
        </div>
      </div>
    </div>
  );
}
