import type { ReactNode } from "react";
import { X } from "lucide-react";

export function Modal({ title, onClose, children, width = 560 }: { title: string; onClose?: () => void; children: ReactNode; width?: number }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className="rounded-xl border border-line bg-panel shadow-2xl" style={{ width }}>
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="text-sm font-semibold">{title}</h2>
          {onClose && (
            <button className="btn btn-icon" onClick={onClose} aria-label="Close">
              <X size={14} />
            </button>
          )}
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}
