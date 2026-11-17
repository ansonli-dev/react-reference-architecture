export default function Loading() {
  return (
    <div
      aria-busy="true"
      className="border-line bg-accent h-28 rounded-lg border motion-safe:animate-pulse"
    />
  );
}
