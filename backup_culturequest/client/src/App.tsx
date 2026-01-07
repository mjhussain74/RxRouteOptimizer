import { useEffect, useState } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import "@fontsource/inter";
import Dashboard from "./components/Dashboard";
import DriverApp from "./components/DriverApp";

function App() {
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

  return (
    <QueryClientProvider client={queryClient}>
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
        {view === "dashboard" ? (
          <Dashboard onOpenDriverView={(id) => {
            setDriverId(id);
            setView("driver");
          }} />
        ) : (
          <DriverApp 
            driverId={driverId} 
            onBack={() => setView("dashboard")} 
          />
        )}
      </div>
    </QueryClientProvider>
  );
}

export default App;
