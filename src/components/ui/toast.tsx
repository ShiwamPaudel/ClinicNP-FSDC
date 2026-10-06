"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import { Check, Info, X, AlertCircle } from "lucide-react";
import { cn } from "@/lib/cn";

type ToastKind = "success" | "error" | "info";
interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastApi {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const remove = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const push = useCallback(
    (kind: ToastKind, message: string) => {
      const id = nextId.current++;
      setToasts((t) => [...t, { id, kind, message }]);
      // errors linger 6s, others 3s
      const ttl = kind === "error" ? 6000 : 3000;
      setTimeout(() => remove(id), ttl);
    },
    [remove],
  );

  const api = useMemo<ToastApi>(
    () => ({
      success: (m) => push("success", m),
      error: (m) => push("error", m),
      info: (m) => push("info", m),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onClose={() => remove(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  const tone =
    toast.kind === "success"
      ? "bg-ok-100 text-ok-600"
      : toast.kind === "error"
        ? "bg-danger-100 text-danger-600"
        : "bg-info-100 text-info-600";
  const Icon =
    toast.kind === "success" ? Check : toast.kind === "error" ? AlertCircle : Info;
  return (
    <div
      role="status"
      className={cn(
        "pointer-events-auto flex items-center gap-2 rounded-[10px] border border-line px-4 py-2.5 text-[14px] shadow-[0_1px_2px_rgb(22_36_27_/_6%),0_4px_12px_rgb(22_36_27_/_5%)]",
        "motion-safe:animate-[toast_150ms_ease-out]",
        tone,
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span>{toast.message}</span>
      {toast.kind === "error" && (
        <button onClick={onClose} aria-label="Close" className="ml-2">
          <X className="h-3.5 w-3.5" />
        </button>
      )}
      <style>{`@keyframes toast{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}`}</style>
    </div>
  );
}
