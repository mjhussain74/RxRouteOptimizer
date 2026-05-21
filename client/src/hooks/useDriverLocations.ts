import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";

export interface DriverLocation {
  driverId: number;
  lat: number;
  lng: number;
  updatedAt: Date;
  name: string;
}

export function useDriverLocations(
  initialDrivers: any[],
): Map<number, DriverLocation> {
  const [locations, setLocations] = useState<Map<number, DriverLocation>>(
    () => {
      const map = new Map<number, DriverLocation>();
      for (const d of initialDrivers) {
        if (d.currentLat && d.currentLng) {
          map.set(d.id, {
            driverId: d.id,
            lat: d.currentLat,
            lng: d.currentLng,
            updatedAt: d.lastLocationUpdate
              ? new Date(d.lastLocationUpdate)
              : new Date(0),
            name: d.name,
          });
        }
      }
      return map;
    },
  );

  const driverNamesRef = useRef<Map<number, string>>(new Map());

  useEffect(() => {
    for (const d of initialDrivers) {
      driverNamesRef.current.set(d.id, d.name);
    }
  }, [initialDrivers]);

  useEffect(() => {
    setLocations((prev) => {
      const next = new Map(prev);
      for (const d of initialDrivers) {
        if (d.currentLat && d.currentLng) {
          const existing = next.get(d.id);
          const restTs = d.lastLocationUpdate
            ? new Date(d.lastLocationUpdate).getTime()
            : 0;
          if (!existing || existing.updatedAt.getTime() < restTs) {
            next.set(d.id, {
              driverId: d.id,
              lat: d.currentLat,
              lng: d.currentLng,
              updatedAt: d.lastLocationUpdate
                ? new Date(d.lastLocationUpdate)
                : new Date(0),
              name: d.name,
            });
          }
        }
      }
      return next;
    });
  }, [initialDrivers]);

  useEffect(() => {
    const socket: Socket = io({ path: "/socket.io" });

    socket.on(
      "location_update",
      (data: { driverId: number; lat: number; lng: number }) => {
        setLocations((prev) => {
          const next = new Map(prev);
          const name =
            driverNamesRef.current.get(data.driverId) ??
            `Driver ${data.driverId}`;
          next.set(data.driverId, {
            driverId: data.driverId,
            lat: data.lat,
            lng: data.lng,
            updatedAt: new Date(),
            name,
          });
          return next;
        });
      },
    );

    return () => {
      socket.disconnect();
    };
  }, []);

  return locations;
}
