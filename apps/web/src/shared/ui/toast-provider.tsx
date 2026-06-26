"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";

export type ToastVariant = "success" | "error" | "info";

export type ToastInput = {
  message: string;
  variant?: ToastVariant;
  /** Auto-dismiss after ms (default 4000). Set 0 to keep until dismissed. */
  duration?: number;
};

type ToastItem = ToastInput & {
  id: string;
  variant: ToastVariant;
};

type ToastContextValue = {
  toast: (input: ToastInput) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const variantStyles: Record<
  ToastVariant,
  { ring: string; icon: typeof CheckCircle2; iconClass: string }
> = {
  success: {
    ring: "ring-emerald-400/25",
    icon: CheckCircle2,
    iconClass: "text-emerald-400",
  },
  error: {
    ring: "ring-red-400/25",
    icon: AlertCircle,
    iconClass: "text-red-400",
  },
  info: {
    ring: "ring-sky-400/25",
    icon: Info,
    iconClass: "text-sky-400",
  },
};

function ToastViewport({ items, onDismiss }: { items: ToastItem[]; onDismiss: (id: string) => void }) {
  if (items.length === 0) {
    return null;
  }

  return (
    <div
      className="pointer-events-none fixed bottom-4 right-4 z-[110] flex w-full max-w-sm flex-col gap-2 p-4 sm:bottom-6 sm:right-6"
      aria-live="polite"
      aria-relevant="additions"
    >
      {items.map((item) => {
        const style = variantStyles[item.variant];
        const Icon = style.icon;
        return (
          <div
            key={item.id}
            className={`pointer-events-auto flex items-start gap-3 rounded-vision-xl border border-white/[0.1] bg-vision-card-dark/95 p-4 shadow-vision-xxl ring-1 backdrop-blur-xl transition duration-300 ${style.ring}`}
            role="status"
          >
            <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${style.iconClass}`} aria-hidden />
            <p className="flex-1 text-sm font-medium leading-snug text-white">{item.message}</p>
            <button
              type="button"
              onClick={() => onDismiss(item.id)}
              className="shrink-0 rounded-lg p-1 text-vision-muted transition hover:bg-white/10 hover:text-white"
              aria-label="Cerrar notificación"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
        );
      })}
    </div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: string) => {
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (input: ToastInput) => {
      const id = crypto.randomUUID();
      const item: ToastItem = {
        id,
        message: input.message,
        variant: input.variant ?? "info",
        duration: input.duration,
      };
      setItems((prev) => [...prev, item]);

      const duration = input.duration ?? 4000;
      if (duration > 0) {
        const timer = setTimeout(() => dismiss(id), duration);
        timersRef.current.set(id, timer);
      }
    },
    [dismiss]
  );

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const timer of timers.values()) {
        clearTimeout(timer);
      }
      timers.clear();
    };
  }, []);

  const value = useMemo<ToastContextValue>(
    () => ({
      toast,
      success: (message) => toast({ message, variant: "success" }),
      error: (message) => toast({ message, variant: "error" }),
      info: (message) => toast({ message, variant: "info" }),
    }),
    [toast]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport items={items} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return ctx;
}
