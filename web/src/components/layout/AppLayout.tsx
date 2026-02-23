import { Outlet } from "react-router";
import { Navbar } from "./Navbar";
import { useAuth } from "@/contexts/AuthContext";
import { useColorPalette } from "@/hooks/useColorPalette";

export function AppLayout() {
  const { user, logout } = useAuth();
  useColorPalette();

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar
        user={user ? { username: user.username, role: user.role } : null}
        onLogout={logout}
      />
      <main className="flex-1">
        <div className="mx-auto max-w-7xl px-4 py-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
