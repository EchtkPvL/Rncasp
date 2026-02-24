import { useEffect, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";

interface SSEOptions {
  slug?: string;
  enabled?: boolean;
}

export function useSSE({ slug, enabled = true }: SSEOptions = {}) {
  const queryClient = useQueryClient();
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const connect = useCallback(() => {
    if (!enabled) return;

    const url = slug ? `/api/events/${slug}/sse` : "/api/sse";
    const es = new EventSource(url, { withCredentials: true });
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const eventType: string = data.type;

        if (eventType.startsWith("shift.") || eventType === "coverage.updated") {
          // Invalidate grid and shift data for the affected event
          const eventID = data.event_id;
          if (slug) {
            queryClient.invalidateQueries({ queryKey: ["events", slug, "grid"] });
            queryClient.invalidateQueries({ queryKey: ["events", slug, "shifts"] });
            queryClient.invalidateQueries({ queryKey: ["events", slug, "coverage"] });
          } else if (eventID) {
            // Invalidate all event-related queries
            queryClient.invalidateQueries({ queryKey: ["events"] });
          }
          if (eventType.startsWith("shift.")) {
            queryClient.invalidateQueries({ queryKey: ["my-shifts"] });
          }
        }

        if (eventType.startsWith("event.")) {
          if (slug) {
            queryClient.invalidateQueries({ queryKey: ["events", slug] });
            queryClient.invalidateQueries({ queryKey: ["events", slug, "grid"] });
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
      // Reconnect with exponential backoff capped at 30s
      reconnectTimeoutRef.current = setTimeout(connect, 5000);
    };
  }, [enabled, slug, queryClient]);

  useEffect(() => {
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
