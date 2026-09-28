/** Shown instantly while a page loads, so a click never looks ignored. */
export default function Loading() {
  return (
    <div className="flex flex-col gap-5" role="status" aria-label="Loading page">
      <div className="skeleton h-8 w-1/3" />
      <div className="skeleton skeleton-text w-2/3" />
      <div className="skeleton h-28 w-full" />
      <div className="grid gap-4 md:grid-cols-2">
        <div className="skeleton h-24" />
        <div className="skeleton h-24" />
      </div>
      <div className="skeleton skeleton-text w-1/2" />
    </div>
  );
}
