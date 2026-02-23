import { BrowserRouter, Routes, Route, Navigate } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Suspense } from "react";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/layout/AppLayout";
import { ToastProvider } from "@/components/common/Toast";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import { DashboardPage } from "@/pages/DashboardPage";
import { LoginPage } from "@/pages/LoginPage";
import { RegisterPage } from "@/pages/RegisterPage";
import { TeamManagementPage } from "@/pages/TeamManagementPage";
import { EventPage } from "@/pages/EventPage";
import { EventSettingsPage } from "@/pages/EventSettingsPage";
import { SecuritySettingsPage } from "@/pages/SecuritySettingsPage";
import { OAuthProvidersPage } from "@/pages/OAuthProvidersPage";
import { NotificationPreferencesPage } from "@/pages/NotificationPreferencesPage";
import { SMTPSettingsPage } from "@/pages/SMTPSettingsPage";
import { DummyAccountsPage } from "@/pages/DummyAccountsPage";
import { ICalSettingsPage } from "@/pages/ICalSettingsPage";
import { AuditLogPage } from "@/pages/AuditLogPage";
import { PublicEventPage } from "@/pages/PublicEventPage";
import { AppSettingsPage } from "@/pages/AppSettingsPage";
import { AdminDashboardPage } from "@/pages/AdminDashboardPage";
import { UserManagementPage } from "@/pages/UserManagementPage";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-[var(--color-muted-foreground)]">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

function SuperAdminRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-[var(--color-muted-foreground)]">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (user.role !== "super_admin") {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

function GuestRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return null;
  }

  if (user) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Suspense fallback={null}>
        <ToastProvider>
        <BrowserRouter>
          <AuthProvider>
            <ErrorBoundary>
            <Routes>
              <Route element={<AppLayout />}>
                <Route
                  index
                  element={
                    <ProtectedRoute>
                      <DashboardPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="login"
                  element={
                    <GuestRoute>
                      <LoginPage />
                    </GuestRoute>
                  }
                />
                <Route
                  path="register"
                  element={
                    <GuestRoute>
                      <RegisterPage />
                    </GuestRoute>
                  }
                />
                <Route
                  path="teams"
                  element={
                    <SuperAdminRoute>
                      <TeamManagementPage />
                    </SuperAdminRoute>
                  }
                />
                <Route
                  path="events"
                  element={<Navigate to="/" replace />}
                />
                <Route
                  path="events/:slug"
                  element={
                    <ProtectedRoute>
                      <EventPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="events/:slug/settings"
                  element={
                    <SuperAdminRoute>
                      <EventSettingsPage />
                    </SuperAdminRoute>
                  }
                />
                <Route
                  path="settings/security"
                  element={
                    <ProtectedRoute>
                      <SecuritySettingsPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="admin/oauth"
                  element={
                    <SuperAdminRoute>
                      <OAuthProvidersPage />
                    </SuperAdminRoute>
                  }
                />
                <Route
                  path="settings/notifications"
                  element={
                    <ProtectedRoute>
                      <NotificationPreferencesPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="admin/smtp"
                  element={
                    <SuperAdminRoute>
                      <SMTPSettingsPage />
                    </SuperAdminRoute>
                  }
                />
                <Route
                  path="admin/dummy-accounts"
                  element={
                    <SuperAdminRoute>
                      <DummyAccountsPage />
                    </SuperAdminRoute>
                  }
                />
                <Route
                  path="settings/ical"
                  element={
                    <ProtectedRoute>
                      <ICalSettingsPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="admin/audit-log"
                  element={
                    <SuperAdminRoute>
                      <AuditLogPage />
                    </SuperAdminRoute>
                  }
                />
                <Route
                  path="admin/settings"
                  element={
                    <SuperAdminRoute>
                      <AppSettingsPage />
                    </SuperAdminRoute>
                  }
                />
                <Route
                  path="admin/dashboard"
                  element={
                    <SuperAdminRoute>
                      <AdminDashboardPage />
                    </SuperAdminRoute>
                  }
                />
                <Route
                  path="admin/users"
                  element={
                    <SuperAdminRoute>
                      <UserManagementPage />
                    </SuperAdminRoute>
                  }
                />
                <Route
                  path="public/events/:slug"
                  element={<PublicEventPage />}
                />
              </Route>
            </Routes>
            </ErrorBoundary>
          </AuthProvider>
        </BrowserRouter>
        </ToastProvider>
      </Suspense>
    </QueryClientProvider>
  );
}

export default App;
