import type { Express } from "express";
import { createServer, type Server } from "http";
import { Server as SocketIOServer } from "socket.io";
import multer from "multer";
import Papa from "papaparse";
import { storage } from "./storage";

const upload = multer({ storage: multer.memoryStorage() });

interface GeocodedAddress {
  address: string;
  lat: number;
  lng: number;
  customerName?: string;
  customerPhone?: string;
  notes?: string;
}

async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      console.error('❌ Google Maps API key not configured in environment');
      console.error('Available env keys:', Object.keys(process.env).filter(k => k.includes('GOOGLE') || k.includes('API')));
      return null;
    }

    const encodedAddress = encodeURIComponent(address);
    console.log(`🔄 Geocoding address: ${address}`);
    
    const response = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodedAddress}&key=${apiKey}`
    );
    const data = await response.json();
    
    if (data.error_message) {
      console.error(`❌ Geocoding API error for "${address}":`, data.error_message);
      return null;
    }
    
    if (data.results && data.results.length > 0) {
      const location = data.results[0].geometry.location;
      console.log(`✅ Successfully geocoded "${address}" to [${location.lat}, ${location.lng}]`);
      return {
        lat: location.lat,
        lng: location.lng
      };
    }
    console.warn(`⚠️ No results found for address: ${address}`);
    return null;
  } catch (error) {
    console.error('❌ Geocoding error:', error);
    return null;
  }
}

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function optimizeRouteNearestNeighbor(
  startLat: number,
  startLng: number,
  deliveries: Array<{ id: number; lat: number; lng: number }>
): number[] {
  const unvisited = [...deliveries];
  const order: number[] = [];
  let currentLat = startLat;
  let currentLng = startLng;

  while (unvisited.length > 0) {
    let nearestIndex = 0;
    let nearestDistance = Infinity;

    for (let i = 0; i < unvisited.length; i++) {
      const distance = calculateDistance(
        currentLat,
        currentLng,
        unvisited[i].lat,
        unvisited[i].lng
      );
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = i;
      }
    }

    const nearest = unvisited.splice(nearestIndex, 1)[0];
    order.push(nearest.id);
    currentLat = nearest.lat;
    currentLng = nearest.lng;
  }

  return order;
}

async function optimizeRouteWithGoogle(
  startLat: number,
  startLng: number,
  deliveries: Array<{ id: number; lat: number; lng: number }>
): Promise<{ order: number[]; distance: number; duration: number } | null> {
  try {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      console.log('Google Routes API key not configured, falling back to nearest-neighbor algorithm');
      return optimizeRouteFallback(startLat, startLng, deliveries);
    }

    const waypoints = deliveries.map(d => ({
      location: { latitude: d.lat, longitude: d.lng }
    }));

    const requestBody = {
      origin: {
        location: { latitude: startLat, longitude: startLng }
      },
      destination: {
        location: { latitude: startLat, longitude: startLng }
      },
      intermediates: waypoints,
      optimizeWaypointOrder: true,
      travelMode: "DRIVE",
      routingPreference: "TRAFFIC_AWARE_OPTIMAL",
      computeAlternativeRoutes: false
    };

    console.log('Calling Google Routes API with', deliveries.length, 'waypoints');
    console.log('Request body:', JSON.stringify(requestBody, null, 2).substring(0, 200));

    const response = await fetch(
      `https://routes.googleapis.com/routes/v2:computeRoutes?key=${apiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Client": "gl-node/16.0.0",
          "X-Goog-FieldMask": "routes.legs,routes.optimizedIntermediateWaypointOrder,routes.duration,routes.distanceMeters"
        },
        body: JSON.stringify(requestBody)
      }
    );

    console.log('Google Routes API response status:', response.status);

    if (response.status === 403) {
      console.log('Google Routes API returned 403 Forbidden. Ensure Routes API is enabled in Google Cloud Console.');
      return optimizeRouteFallback(startLat, startLng, deliveries);
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.log('Google Routes API error:', response.status, 'Response:', errorText.substring(0, 300));
      return optimizeRouteFallback(startLat, startLng, deliveries);
    }

    const responseText = await response.text();
    if (!responseText) {
      console.log('Empty response from Google Routes API, using fallback');
      return optimizeRouteFallback(startLat, startLng, deliveries);
    }

    console.log('Google Routes API response received, parsing...');
    const data = JSON.parse(responseText);

    if (!data.routes || data.routes.length === 0) {
      console.log('No routes from Google API response, using fallback');
      return optimizeRouteFallback(startLat, startLng, deliveries);
    }

    const route = data.routes[0];
    const optimizedWaypointOrder = route.optimizedIntermediateWaypointOrder || [];
    console.log('Optimized waypoint order from Google:', optimizedWaypointOrder);
    
    const order = optimizedWaypointOrder.map((idx: number) => deliveries[idx].id);
    
    const legs = route.legs || [];
    let totalDistance = 0;
    let totalDuration = 0;

    for (const leg of legs) {
      if (leg.distanceMeters) totalDistance += leg.distanceMeters;
      if (leg.duration) {
        const durationMs = leg.duration.match(/(\d+)s/)?.[1];
        if (durationMs) totalDuration += parseInt(durationMs);
      }
    }

    console.log('Successfully optimized route with Google API:', { order, distance: totalDistance / 1000, duration: Math.round(totalDuration / 60) });

    return {
      order,
      distance: totalDistance / 1000,
      duration: Math.round(totalDuration / 60)
    };
  } catch (error) {
    console.log('Google Routes API call failed, using fallback:', error);
    return optimizeRouteFallback(startLat, startLng, deliveries);
  }
}

function optimizeRouteFallback(
  startLat: number,
  startLng: number,
  deliveries: Array<{ id: number; lat: number; lng: number }>
): { order: number[]; distance: number; duration: number } {
  const order = optimizeRouteNearestNeighbor(startLat, startLng, deliveries);
  const deliveriesMap = new Map(deliveries.map(d => [d.id, { lat: d.lat, lng: d.lng }]));
  const distance = calculateTotalDistance(order, deliveriesMap, startLat, startLng);
  const durationSeconds = Math.round(distance / 30 * 60 * 60);
  const durationMinutes = Math.round(durationSeconds / 60);
  
  return { order, distance, duration: durationMinutes };
}

function calculateTotalDistance(
  order: number[],
  deliveriesMap: Map<number, { lat: number; lng: number }>,
  startLat: number,
  startLng: number
): number {
  let total = 0;
  let currentLat = startLat;
  let currentLng = startLng;

  for (const id of order) {
    const delivery = deliveriesMap.get(id);
    if (delivery) {
      total += calculateDistance(currentLat, currentLng, delivery.lat, delivery.lng);
      currentLat = delivery.lat;
      currentLng = delivery.lng;
    }
  }

  return total;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    },
    path: "/socket.io"
  });

  const driverSockets = new Map<number, string>();

  io.on("connection", (socket) => {
    console.log("Client connected:", socket.id);

    socket.on("register_driver", (driverId: number) => {
      driverSockets.set(driverId, socket.id);
      console.log(`Driver ${driverId} registered with socket ${socket.id}`);
    });

    socket.on("driver_location", async (data: { driverId: number; lat: number; lng: number }) => {
      await storage.recordDriverLocation(data.driverId, data.lat, data.lng);
      io.emit("location_update", data);
    });

    socket.on("stop_completed", async (data: { stopId: number; routeId: number }) => {
      await storage.completeRouteStop(data.stopId);
      io.emit("stop_status_update", { stopId: data.stopId, status: "completed" });
    });

    socket.on("disconnect", () => {
      for (const [driverId, socketId] of driverSockets.entries()) {
        if (socketId === socket.id) {
          driverSockets.delete(driverId);
          break;
        }
      }
      console.log("Client disconnected:", socket.id);
    });
  });

  app.get("/api/drivers", async (req, res) => {
    try {
      const drivers = await storage.getDrivers();
      res.json(drivers);
    } catch (error) {
      console.error("Error fetching drivers:", error);
      res.status(500).json({ error: "Failed to fetch drivers" });
    }
  });

  app.post("/api/drivers", async (req, res) => {
    try {
      const driver = await storage.createDriver(req.body);
      res.json(driver);
    } catch (error) {
      res.status(500).json({ error: "Failed to create driver" });
    }
  });

  app.get("/api/drivers/:id", async (req, res) => {
    try {
      const driver = await storage.getDriver(parseInt(req.params.id));
      if (!driver) {
        return res.status(404).json({ error: "Driver not found" });
      }
      res.json(driver);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch driver" });
    }
  });

  app.get("/api/drivers/:id/routes", async (req, res) => {
    try {
      const routes = await storage.getRoutesByDriver(parseInt(req.params.id));
      res.json(routes);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch driver routes" });
    }
  });

  app.get("/api/batches", async (req, res) => {
    try {
      const batches = await storage.getBatches();
      res.json(batches);
    } catch (error) {
      console.error("Error fetching batches:", error);
      res.status(500).json({ error: "Failed to fetch batches" });
    }
  });

  app.post("/api/batches/upload", upload.single("file"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const csvContent = req.file.buffer.toString("utf-8");
      const parsed = Papa.parse(csvContent, {
        header: true,
        skipEmptyLines: true
      });

      if (parsed.errors.length > 0) {
        return res.status(400).json({ error: "Invalid CSV format", details: parsed.errors });
      }

      const batch = await storage.createBatch({
        name: req.body.name || `Batch ${new Date().toLocaleDateString()}`,
        status: "processing",
        totalDeliveries: parsed.data.length
      });

      const deliveries: any[] = [];
      for (const row of parsed.data as any[]) {
        const addressText = row.address || row.Address || row.ADDRESS || 
                           `${row.street || ''} ${row.city || ''} ${row.state || ''} ${row.zip || ''}`.trim();
        
        if (!addressText) continue;

        const geocoded = await geocodeAddress(addressText);
        
        const delivery = await storage.createDelivery({
          batchId: batch.id,
          addressText,
          lat: geocoded?.lat || null,
          lng: geocoded?.lng || null,
          customerName: row.customer_name || row.customerName || row.name || null,
          customerPhone: row.customer_phone || row.customerPhone || row.phone || null,
          notes: row.notes || row.Notes || null,
          status: geocoded ? "geocoded" : "pending"
        });

        deliveries.push(delivery);

        await new Promise(resolve => setTimeout(resolve, 100));
      }

      await storage.updateBatchStatus(batch.id, "ready");

      res.json({
        batch,
        deliveries,
        geocodedCount: deliveries.filter(d => d.lat && d.lng).length,
        totalCount: deliveries.length
      });
    } catch (error) {
      console.error("Upload error:", error);
      res.status(500).json({ error: "Failed to process CSV" });
    }
  });

  app.get("/api/batches/:id", async (req, res) => {
    try {
      const batch = await storage.getBatch(parseInt(req.params.id));
      if (!batch) {
        return res.status(404).json({ error: "Batch not found" });
      }
      const deliveries = await storage.getDeliveriesByBatch(batch.id);
      res.json({ batch, deliveries });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch batch" });
    }
  });

  app.get("/api/geocode", async (req, res) => {
    try {
      const { address } = req.query;
      if (!address || typeof address !== "string") {
        return res.status(400).json({ error: "Address required" });
      }

      const geocoded = await geocodeAddress(address);
      if (!geocoded) {
        return res.status(400).json({ error: "Could not geocode address" });
      }

      res.json(geocoded);
    } catch (error) {
      console.error("Geocode error:", error);
      res.status(500).json({ error: "Failed to geocode address" });
    }
  });

  app.get("/api/routes", async (req, res) => {
    try {
      const routes = await storage.getRoutes();
      res.json(routes);
    } catch (error) {
      console.error("Error fetching routes:", error);
      res.status(500).json({ error: "Failed to fetch routes" });
    }
  });

  app.get("/api/routes/:id", async (req, res) => {
    try {
      const route = await storage.getRoute(parseInt(req.params.id));
      if (!route) {
        return res.status(404).json({ error: "Route not found" });
      }
      const stops = await storage.getRouteStops(route.id);
      const deliveryIds = stops.map(s => s.deliveryId);
      const batch = route.batchId ? await storage.getBatch(route.batchId) : null;
      const deliveries = batch ? await storage.getDeliveriesByBatch(batch.id) : [];
      
      const stopsWithDeliveries = stops.map(stop => ({
        ...stop,
        delivery: deliveries.find(d => d.id === stop.deliveryId)
      }));

      res.json({ route, stops: stopsWithDeliveries });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch route" });
    }
  });

  app.post("/api/routes/optimize", async (req, res) => {
    try {
      const { batchId, startLat, startLng, startAddress, routeName } = req.body;

      if (!batchId || startLat === undefined || startLng === undefined) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      const batch = await storage.getBatch(batchId);
      if (!batch) {
        return res.status(404).json({ error: "Batch not found" });
      }

      const deliveries = await storage.getDeliveriesByBatch(batchId);
      const geocodedDeliveries = deliveries.filter(d => d.lat && d.lng);

      if (geocodedDeliveries.length === 0) {
        return res.status(400).json({ error: "No geocoded deliveries found" });
      }

      // Use Google Routes API for optimization
      const optimizationResult = await optimizeRouteWithGoogle(
        startLat,
        startLng,
        geocodedDeliveries.map(d => ({ id: d.id, lat: d.lat!, lng: d.lng! }))
      );

      if (!optimizationResult) {
        return res.status(500).json({ error: "Failed to optimize route with Google Routes API" });
      }

      const { order: optimizedOrder, distance: totalDistance, duration: estimatedDuration } = optimizationResult;

      const route = await storage.createRoute({
        batchId,
        name: routeName || `Route ${new Date().toLocaleTimeString()}`,
        status: "optimized",
        startLat,
        startLng,
        startAddress: startAddress || "Starting Point",
        estimatedDuration,
        estimatedDistance: totalDistance,
        optimizedOrder
      });

      for (let i = 0; i < optimizedOrder.length; i++) {
        await storage.createRouteStop({
          routeId: route.id,
          deliveryId: optimizedOrder[i],
          sequence: i + 1,
          status: "pending"
        });
      }

      const stops = await storage.getRouteStops(route.id);
      const stopsWithDeliveries = stops.map(stop => ({
        ...stop,
        delivery: deliveries.find(d => d.id === stop.deliveryId)
      }));

      res.json({ 
        route, 
        stops: stopsWithDeliveries,
        totalDistance,
        estimatedDuration
      });
    } catch (error) {
      console.error("Optimization error:", error);
      res.status(500).json({ error: "Failed to optimize route" });
    }
  });

  app.post("/api/routes/:id/assign", async (req, res) => {
    try {
      const { driverId } = req.body;
      const routeId = parseInt(req.params.id);

      const route = await storage.assignRouteToDriver(routeId, driverId);
      if (!route) {
        return res.status(404).json({ error: "Route not found" });
      }

      res.json(route);
    } catch (error) {
      res.status(500).json({ error: "Failed to assign route" });
    }
  });

  app.post("/api/routes/:id/dispatch", async (req, res) => {
    try {
      const routeId = parseInt(req.params.id);
      const route = await storage.getRoute(routeId);

      if (!route) {
        return res.status(404).json({ error: "Route not found" });
      }

      if (!route.driverId) {
        return res.status(400).json({ error: "Route must be assigned to a driver first" });
      }

      const updatedRoute = await storage.dispatchRoute(routeId);
      const stops = await storage.getRouteStops(routeId);
      const batch = route.batchId ? await storage.getBatch(route.batchId) : null;
      const deliveries = batch ? await storage.getDeliveriesByBatch(batch.id) : [];

      const stopsWithDeliveries = stops.map(stop => ({
        ...stop,
        delivery: deliveries.find(d => d.id === stop.deliveryId)
      }));

      const driverSocketId = driverSockets.get(route.driverId);
      if (driverSocketId) {
        io.to(driverSocketId).emit("route_dispatched", {
          route: updatedRoute,
          stops: stopsWithDeliveries
        });
      }

      io.emit("route_dispatched", {
        route: updatedRoute,
        stops: stopsWithDeliveries
      });

      res.json({ route: updatedRoute, stops: stopsWithDeliveries });
    } catch (error) {
      res.status(500).json({ error: "Failed to dispatch route" });
    }
  });

  app.post("/api/routes/:routeId/stops/:stopId/complete", async (req, res) => {
    try {
      const stopId = parseInt(req.params.stopId);
      const stop = await storage.completeRouteStop(stopId);

      if (!stop) {
        return res.status(404).json({ error: "Stop not found" });
      }

      io.emit("stop_status_update", { stopId, status: "completed" });

      res.json(stop);
    } catch (error) {
      res.status(500).json({ error: "Failed to complete stop" });
    }
  });

  app.post("/api/drivers/:id/location", async (req, res) => {
    try {
      const driverId = parseInt(req.params.id);
      const { lat, lng } = req.body;

      const location = await storage.recordDriverLocation(driverId, lat, lng);
      io.emit("location_update", { driverId, lat, lng });

      res.json(location);
    } catch (error) {
      res.status(500).json({ error: "Failed to record location" });
    }
  });

  app.post("/api/routes/:routeId/stops/:stopId/proof", async (req, res) => {
    try {
      const stopId = parseInt(req.params.stopId);
      const { signature, picture, notes } = req.body;

      // Allow submission if: signature OR picture provided, OR notes provided (skip with note)
      if (!signature && !picture && !notes) {
        return res.status(400).json({ error: "Signature, picture, or notes required" });
      }

      // Create the delivery proof
      console.log(`📝 Creating delivery proof for stop ${stopId}`);
      const proof = await (storage as any).createDeliveryProof(
        stopId,
        signature || null,
        picture || null,
        notes || null
      );

      // Automatically mark the stop as completed when proof is submitted
      console.log(`✅ Proof submitted for stop ${stopId}, marking as completed`);
      const completedStop = await storage.completeRouteStop(stopId);
      
      io.emit("proof_submitted", { stopId, proof });
      io.emit("stop_status_update", { stopId, status: "completed" });
      
      res.json({ proof, stop: completedStop });
    } catch (error) {
      console.error("Proof submission error:", error);
      res.status(500).json({ error: "Failed to submit proof" });
    }
  });

  return httpServer;
}
