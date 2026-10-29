import { useStore } from "../store";

export function Toasts() {
  const toasts = useStore((s) => s.toasts);
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`max-w-md rounded-lg border px-3 py-2 shadow-lg ${t.tone === "error" ? "border-danger bg-panel text-danger" : "border-line bg-panel"}`}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}
