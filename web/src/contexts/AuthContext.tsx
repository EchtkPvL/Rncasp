import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import type { User, LoginResult } from "@/api/types";
import { authApi } from "@/api/auth";

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<LoginResult>;
  verifyTOTP: (pendingToken: string, code: string) => Promise<User>;
  register: (
    username: string,
    password: string,
    fullName: string,
    email?: string,
    language?: string
  ) => Promise<User>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function isTOTPChallenge(
  data: LoginResult
): data is { totp_required: true; pending_token: string } {
  return typeof data === "object" && data !== null && "totp_required" in data;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    authApi
      .me()
      .then((res) => setUser(res.data ?? null))
      .catch(() => setUser(null))
      .finally(() => setIsLoading(false));
  }, []);

  const login = useCallback(
    async (username: string, password: string): Promise<LoginResult> => {
      const res = await authApi.login({ username, password });
      const data = res.data!;
      if (isTOTPChallenge(data)) {
        return data;
      }
      setUser(data);
      return data;
    },
    []
  );

  const verifyTOTP = useCallback(
    async (pendingToken: string, code: string): Promise<User> => {
      const res = await authApi.totpVerify(pendingToken, code);
      const u = res.data!;
      setUser(u);
      return u;
    },
    []
  );

  const register = useCallback(
    async (
      username: string,
      password: string,
      fullName: string,
      email?: string,
      language?: string
    ) => {
      const res = await authApi.register({
        username,
        password,
        full_name: fullName,
        email,
        language,
      });
      const u = res.data!;
      setUser(u);
      return u;
    },
    []
  );

  const logout = useCallback(async () => {
    await authApi.logout();
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const res = await authApi.me();
      setUser(res.data ?? null);
    } catch {
      // ignore - user stays as-is
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, isLoading, login, verifyTOTP, register, logout, refreshUser }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
