import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";

export interface DriverLocation {
  driverId: number;
  lat: number;
  lng: number;
  updatedAt: Date;
  name: string;
}

/**
 * Subscribes to real-time driver location updates via Socket.IO.
 *
 * Security: only accepts `location_update` events for driver IDs that are
 * present in `initialDrivers` (which is already pharmacy-scoped by the REST
 * API).  Events for unknown driver IDs — including those from other pharmacies
 * that the global socket broadcast may carry — are silently ignored.
 */
export function useDriverLocations(
  initialDrivers: any[],
): Map<number, DriverLocation> {
  const [locations, setLocations] = useState<Map<number, DriverLocation>>(
    () => {
      const map = new Map<number, DriverLocation>();
      for (const d of initialDrivers) {
        if (d.currentLat != null && d.currentLng != null) {
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

  // Allowlist of driver IDs this session is permitted to see.
  // Updated whenever the REST-scoped drivers list changes.
  const allowedDriverIdsRef = useRef<Set<number>>(
    new Set(initialDrivers.map((d) => d.id)),
  );

  // Names map so Socket.IO events can show the driver name even without a REST refresh.
  const driverNamesRef = useRef<Map<number, string>>(new Map());

  useEffect(() => {
    const ids = new Set<number>();
    for (const d of initialDrivers) {
      ids.add(d.id);
      driverNamesRef.current.set(d.id, d.name);
    }
    allowedDriverIdsRef.current = ids;
  }, [initialDrivers]);

  // Seed REST data into state whenever the drivers prop refreshes.
  // Only overwrites if the REST timestamp is newer than the last Socket update.
  useEffect(() => {
    setLocations((prev) => {
      const next = new Map(prev);
      for (const d of initialDrivers) {
        if (d.currentLat != null && d.currentLng != null) {
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
        // Security: reject events for driver IDs outside this session's scope.
        if (!allowedDriverIdsRef.current.has(data.driverId)) return;

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
