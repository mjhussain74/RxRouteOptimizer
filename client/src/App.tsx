import { useEffect, useState } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import "@fontsource/inter";
import { useAuthStore } from "./lib/authStore";
import Login from "./components/Login";
import AdminDashboard from "./components/AdminDashboard";
import PharmacyDashboard from "./components/PharmacyDashboard";
import PharmacyAdminDashboard from "./components/PharmacyAdminDashboard";
import DriverApp from "./components/DriverApp";
import { Loader2 } from "lucide-react";

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
        <DriverApp 
          driverId={driverId} 
          onBack={() => setView("dashboard")} 
        />
      );
    }

    if (isLoading) {
      return (
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-400" />
        </div>
      );
    }

    if (!isAuthenticated) {
      return <Login />;
    }

    if (user?.role === 'admin') {
      return (
        <AdminDashboard 
          onLogout={handleLogout}
          onOpenDriverView={(id: number) => {
            setDriverId(id);
            setView("driver");
          }} 
        />
      );
    }

    if (user?.role === 'pharmacy_admin') {
      return (
        <PharmacyAdminDashboard 
          onLogout={handleLogout}
          pharmacyId={user?.pharmacyId || null}
          pharmacyName={user?.pharmacyName}
          onOpenDriverView={(id: number) => {
            setDriverId(id);
            setView("driver");
          }}
        />
      );
    }

    if (user?.role === 'driver' && user?.driverId) {
      return (
        <DriverApp 
          driverId={user.driverId} 
          onBack={handleLogout}
        />
      );
    }

    return (
      <PharmacyDashboard 
        onLogout={handleLogout}
        pharmacyId={user?.pharmacyId || null}
        pharmacyName={user?.pharmacyName}
      />
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
