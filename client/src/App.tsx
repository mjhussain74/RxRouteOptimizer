import { useEffect, useState, lazy, Suspense } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import "@fontsource/inter";
import { useAuthStore } from "./lib/authStore";
import Login from "./components/Login";
import { Loader2 } from "lucide-react";

const AdminDashboard = lazy(() => import("./components/AdminDashboard"));
const PharmacyDashboard = lazy(() => import("./components/PharmacyDashboard"));
const PharmacyAdminDashboard = lazy(() => import("./components/PharmacyAdminDashboard"));
const DriverApp = lazy(() => import("./components/DriverApp"));

function LoadingFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-blue-400" />
    </div>
  );
}

function App() {
  const { user, isAuthenticated, isLoading, logout, checkSession } = useAuthStore();
  const [view, setView] = useState<"dashboard" | "driver">("dashboard");
  const [driverId, setDriverId] = useState<number | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const driverParam = params.get("driver");
    if (driverParam) {
      setDriverId(parseInt(driverParam));
      setView("driver");
    }
  }, []);

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  const handleLogout = async () => {
    await logout();
  };

  const renderContent = () => {
    if (view === "driver" && driverId) {
      return (
        <Suspense fallback={<LoadingFallback />}>
          <DriverApp 
            driverId={driverId} 
            onBack={() => setView("dashboard")} 
          />
        </Suspense>
      );
    }

    if (isLoading) {
      return <LoadingFallback />;
    }

    if (!isAuthenticated) {
      return <Login />;
    }

    if (user?.role === 'admin') {
      return (
        <Suspense fallback={<LoadingFallback />}>
          <AdminDashboard 
            onLogout={handleLogout}
            onOpenDriverView={(id: number) => {
              setDriverId(id);
              setView("driver");
            }} 
          />
        </Suspense>
      );
    }

    if (user?.role === 'pharmacy_admin') {
      return (
        <Suspense fallback={<LoadingFallback />}>
          <PharmacyAdminDashboard 
            onLogout={handleLogout}
            pharmacyId={user?.pharmacyId || null}
            pharmacyName={user?.pharmacyName}
            onOpenDriverView={(id: number) => {
              setDriverId(id);
              setView("driver");
            }}
          />
        </Suspense>
      );
    }

    if (user?.role === 'driver' && user?.driverId) {
      return (
        <Suspense fallback={<LoadingFallback />}>
          <DriverApp 
            driverId={user.driverId} 
            onBack={handleLogout}
          />
        </Suspense>
      );
    }

    return (
      <Suspense fallback={<LoadingFallback />}>
        <PharmacyDashboard 
          onLogout={handleLogout}
          pharmacyId={user?.pharmacyId || null}
          pharmacyName={user?.pharmacyName}
        />
      </Suspense>
    );
  };

  return (
    <QueryClientProvider client={queryClient}>
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
        {renderContent()}
      </div>
    </QueryClientProvider>
  );
}

export default App;
