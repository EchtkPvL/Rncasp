import { useState, useEffect, useCallback, createContext, useContext } from "react";

interface Toast {
  id: string;
  message: string;
  type: "success" | "error" | "info";
}

interface ToastContextValue {
  toast: (message: string, type?: "success" | "error" | "info") => void;
}

const ToastContext = createContext<ToastContextValue>({
  toast: () => {},
});

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((message: string, type: "success" | "error" | "info" = "success") => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { id, message, type }]);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toast: addToast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={removeToast} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setExiting(true), 3000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (exiting) {
      const timer = setTimeout(() => onDismiss(toast.id), 300);
      return () => clearTimeout(timer);
    }
  }, [exiting, toast.id, onDismiss]);

  const bgColor = toast.type === "error"
    ? "bg-[var(--color-destructive)]"
    : toast.type === "info"
    ? "bg-[var(--color-info)]"
    : "bg-[var(--color-success)]";

  return (
    <div
      className={`${bgColor} rounded-md px-4 py-2.5 text-sm text-[var(--color-text-on-color)] shadow-lg cursor-pointer min-w-[200px] max-w-[360px]`}
      style={{
        animation: exiting ? "toast-out 0.3s ease-in forwards" : "toast-in 0.3s ease-out",
      }}
      onClick={() => setExiting(true)}
    >
      {toast.message}
    </div>
  );
}
