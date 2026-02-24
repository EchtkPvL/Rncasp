import { useState, useEffect } from "react";
import { Outlet } from "react-router";
import { Navbar } from "./Navbar";
import { useAuth } from "@/contexts/AuthContext";
import { useColorPalette } from "@/hooks/useColorPalette";
import { useAppName } from "@/hooks/useAppName";
import { useHotkey } from "@/hooks/useKeyboard";
import { KeyboardShortcutHelp } from "@/components/common/KeyboardShortcutHelp";

export function AppLayout() {
  const { user, logout } = useAuth();
  useColorPalette();
  const appName = useAppName();

  useEffect(() => {
    document.title = appName;
  }, [appName]);

  const [showKeyboardHelp, setShowKeyboardHelp] = useState(false);
  useHotkey("?", () => setShowKeyboardHelp(true));

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
      <KeyboardShortcutHelp open={showKeyboardHelp} onClose={() => setShowKeyboardHelp(false)} />
    </div>
  );
}
