import { useAuth } from "@/contexts/AuthContext";

/** Returns true if the user prefers 12-hour time format */
export function useTimeFormat(): boolean {
  const { user } = useAuth();
  return user?.time_format === "12h";
}
