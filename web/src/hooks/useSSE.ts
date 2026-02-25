import { useEffect, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";

interface SSEOptions {
  slug?: string;
  enabled?: boolean;
}

const BACKOFF_INITIAL_MS = 1000;
const BACKOFF_MAX_MS = 30000;
const MAX_RETRIES = 20;

export function useSSE({ slug, enabled = true }: SSEOptions = {}) {
  const queryClient = useQueryClient();
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const backoffRef = useRef(BACKOFF_INITIAL_MS);
  const retriesRef = useRef(0);

  const connect = useCallback(() => {
    if (!enabled) return;
    if (retriesRef.current >= MAX_RETRIES) return;

    const url = slug ? `/api/events/${slug}/sse` : "/api/sse";
    const es = new EventSource(url, { withCredentials: true });
    eventSourceRef.current = es;

    es.onopen = () => {
      // Reset backoff on successful connection
      backoffRef.current = BACKOFF_INITIAL_MS;
      retriesRef.current = 0;
    };

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const eventType: string = data.type;

        if (eventType.startsWith("shift.") || eventType === "coverage.updated") {
          if (slug) {
            queryClient.invalidateQueries({ queryKey: ["events", slug, "grid"] });
          } else if (data.event_id) {
            queryClient.invalidateQueries({ queryKey: ["events"] });
          }
          if (eventType.startsWith("shift.")) {
            queryClient.invalidateQueries({ queryKey: ["my-shifts"] });
          }
        }

        if (eventType.startsWith("event.")) {
          if (slug) {
            queryClient.invalidateQueries({ queryKey: ["events", slug] });
          }
          queryClient.invalidateQueries({ queryKey: ["events"] });
        }

        // Always refresh notification count on any SSE event
        queryClient.invalidateQueries({ queryKey: ["notifications", "unread-count"] });
      } catch {
        // Ignore parse errors for non-JSON messages (e.g., "connected")
      }
    };

    es.onerror = () => {
      es.close();
      eventSourceRef.current = null;
      retriesRef.current++;
      if (retriesRef.current < MAX_RETRIES) {
        const delay = backoffRef.current;
        backoffRef.current = Math.min(delay * 2, BACKOFF_MAX_MS);
        reconnectTimeoutRef.current = setTimeout(connect, delay);
      }
    };
  }, [enabled, slug, queryClient]);

  useEffect(() => {
    backoffRef.current = BACKOFF_INITIAL_MS;
    retriesRef.current = 0;
    connect();

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [connect]);
}
