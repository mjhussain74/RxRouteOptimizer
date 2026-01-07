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

  app.patch("/api/batches/:id/status", async (req, res) => {
    try {
      const batchId = parseInt(req.params.id);
      const { status } = req.body;
      
      if (!status || !["pending", "ready", "complete", "cancelled"].includes(status)) {
        return res.status(400).json({ error: "Invalid status. Must be pending, ready, complete, or cancelled" });
      }
      
      const batch = await storage.updateBatchStatus(batchId, status);
      if (!batch) {
        return res.status(404).json({ error: "Batch not found" });
      }
      
      // Also update all deliveries in the batch to match
      if (status === "complete" || status === "cancelled") {
        const deliveriesInBatch = await storage.getDeliveriesByBatch(batchId);
        for (const delivery of deliveriesInBatch) {
          if (delivery.status !== "complete" && delivery.status !== "cancelled") {
            await storage.updateDeliveryStatus(delivery.id, status);
          }
        }
      }
      
      res.json(batch);
    } catch (error) {
      console.error("Error updating batch status:", error);
      res.status(500).json({ error: "Failed to update batch status" });
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
          rxNumber: row.rx_number || row.rx_no || row.Rx_Number || row.RxNo || null,
          notes: row.notes || row.Notes || null,
          priority: row.priority || "normal",
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
      const { batchId, deliveryIds, zoneId, startLat, startLng, startAddress, routeName } = req.body;

      if (startLat === undefined || startLng === undefined) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      let geocodedDeliveries: any[] = [];
      
      // Support both old batch-based and new deliveryIds-based approach
      if (deliveryIds && Array.isArray(deliveryIds) && deliveryIds.length > 0) {
        // New approach: use selected delivery IDs
        const allDeliveries = await Promise.all(
          deliveryIds.map(id => storage.getDelivery(id))
        );
        geocodedDeliveries = allDeliveries.filter(d => d && d.lat && d.lng) as any[];
      } else if (batchId) {
        // Old approach: use batch
        const batch = await storage.getBatch(batchId);
        if (!batch) {
          return res.status(404).json({ error: "Batch not found" });
        }
        const deliveries = await storage.getDeliveriesByBatch(batchId);
        geocodedDeliveries = deliveries.filter(d => d.lat && d.lng);
      } else {
        return res.status(400).json({ error: "Either batchId or deliveryIds is required" });
      }

      if (geocodedDeliveries.length === 0) {
        return res.status(400).json({ error: "No geocoded deliveries found" });
      }

      // Separate urgent and normal priority deliveries
      const urgentDeliveries = geocodedDeliveries.filter(d => d.priority === "urgent");
      const normalDeliveries = geocodedDeliveries.filter(d => d.priority !== "urgent");

      let optimizedOrder: number[] = [];
      let totalDistance = 0;
      let estimatedDuration = 0;
      let currentLat = startLat;
      let currentLng = startLng;

      // Optimize urgent deliveries first (if any)
      if (urgentDeliveries.length > 0) {
        const urgentResult = await optimizeRouteWithGoogle(
          currentLat,
          currentLng,
          urgentDeliveries.map(d => ({ id: d.id, lat: d.lat!, lng: d.lng! }))
        );
        if (urgentResult && urgentResult.order.length > 0) {
          optimizedOrder = [...urgentResult.order];
          totalDistance += urgentResult.distance;
          estimatedDuration += urgentResult.duration;
          // Get the last urgent delivery's location for continuing to normal deliveries
          const lastUrgentId = urgentResult.order[urgentResult.order.length - 1];
          const lastUrgent = urgentDeliveries.find(d => d.id === lastUrgentId);
          if (lastUrgent) {
            currentLat = lastUrgent.lat!;
            currentLng = lastUrgent.lng!;
          }
        } else {
          // Fallback: use nearest neighbor for urgent deliveries
          const fallbackResult = optimizeRouteFallback(
            currentLat,
            currentLng,
            urgentDeliveries.map(d => ({ id: d.id, lat: d.lat!, lng: d.lng! }))
          );
          optimizedOrder = [...fallbackResult.order];
          totalDistance += fallbackResult.distance;
          estimatedDuration += fallbackResult.duration;
          const lastUrgentId = fallbackResult.order[fallbackResult.order.length - 1];
          const lastUrgent = urgentDeliveries.find(d => d.id === lastUrgentId);
          if (lastUrgent) {
            currentLat = lastUrgent.lat!;
            currentLng = lastUrgent.lng!;
          }
        }
      }

      // Optimize normal deliveries (if any)
      if (normalDeliveries.length > 0) {
        const normalResult = await optimizeRouteWithGoogle(
          currentLat,
          currentLng,
          normalDeliveries.map(d => ({ id: d.id, lat: d.lat!, lng: d.lng! }))
        );
        if (normalResult && normalResult.order.length > 0) {
          optimizedOrder = [...optimizedOrder, ...normalResult.order];
          totalDistance += normalResult.distance;
          estimatedDuration += normalResult.duration;
        } else {
          // Fallback: use nearest neighbor for normal deliveries
          const fallbackResult = optimizeRouteFallback(
            currentLat,
            currentLng,
            normalDeliveries.map(d => ({ id: d.id, lat: d.lat!, lng: d.lng! }))
          );
          optimizedOrder = [...optimizedOrder, ...fallbackResult.order];
          totalDistance += fallbackResult.distance;
          estimatedDuration += fallbackResult.duration;
        }
      }

      if (optimizedOrder.length === 0) {
        return res.status(500).json({ error: "Failed to optimize route" });
      }

      const route = await storage.createRoute({
        batchId: batchId || null,
        zoneId: zoneId || null,
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
        const delivery = geocodedDeliveries.find(d => d.id === optimizedOrder[i]);
        await storage.createRouteStop({
          routeId: route.id,
          deliveryId: optimizedOrder[i],
          sequence: i + 1,
          status: "pending",
          priority: delivery?.priority || "normal"
        });
        // Mark delivery as active when added to a route
        if (delivery) {
          await storage.updateDeliveryStatus(delivery.id, 'active');
        }
      }

      const stops = await storage.getRouteStops(route.id);
      const stopsWithDeliveries = stops.map(stop => ({
        ...stop,
        delivery: geocodedDeliveries.find(d => d.id === stop.deliveryId)
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
      const { signature, picture, notes, barcode } = req.body;

      // Allow submission if: signature OR picture provided, OR notes provided (skip with note), OR barcode provided
      if (!signature && !picture && !notes && !barcode) {
        return res.status(400).json({ error: "Signature, picture, notes, or barcode required" });
      }

      // Create the delivery proof
      console.log(`📝 Creating delivery proof for stop ${stopId} with barcode: ${barcode || 'none'}`);
      const proof = await storage.createDeliveryProof({
        stopId,
        signature: signature || null,
        picture: picture || null,
        notes: notes || null,
        barcode: barcode || null
      });

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

  // Pharmacy endpoints
  app.get("/api/pharmacies", async (req, res) => {
    try {
      const pharmacies = await storage.getPharmacies();
      res.json(pharmacies);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch pharmacies" });
    }
  });

  app.post("/api/pharmacies", async (req, res) => {
    try {
      const pharmacy = await storage.createPharmacy(req.body);
      res.json(pharmacy);
    } catch (error) {
      res.status(500).json({ error: "Failed to create pharmacy" });
    }
  });

  app.get("/api/pharmacies/:id", async (req, res) => {
    try {
      const pharmacy = await storage.getPharmacy(parseInt(req.params.id));
      if (!pharmacy) {
        return res.status(404).json({ error: "Pharmacy not found" });
      }
      res.json(pharmacy);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch pharmacy" });
    }
  });

  app.put("/api/pharmacies/:id", async (req, res) => {
    try {
      const pharmacy = await storage.updatePharmacy(parseInt(req.params.id), req.body);
      if (!pharmacy) {
        return res.status(404).json({ error: "Pharmacy not found" });
      }
      res.json(pharmacy);
    } catch (error) {
      res.status(500).json({ error: "Failed to update pharmacy" });
    }
  });

  // Delivery Zone endpoints
  app.get("/api/zones", async (req, res) => {
    try {
      const zones = await storage.getDeliveryZones();
      res.json(zones);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch zones" });
    }
  });

  app.post("/api/zones", async (req, res) => {
    try {
      const zone = await storage.createDeliveryZone(req.body);
      res.json(zone);
    } catch (error) {
      res.status(500).json({ error: "Failed to create zone" });
    }
  });

  app.put("/api/zones/:id", async (req, res) => {
    try {
      const zone = await storage.updateDeliveryZone(parseInt(req.params.id), req.body);
      if (!zone) {
        return res.status(404).json({ error: "Zone not found" });
      }
      res.json(zone);
    } catch (error) {
      res.status(500).json({ error: "Failed to update zone" });
    }
  });

  app.delete("/api/zones/:id", async (req, res) => {
    try {
      const success = await storage.deleteDeliveryZone(parseInt(req.params.id));
      if (!success) {
        return res.status(404).json({ error: "Zone not found" });
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete zone" });
    }
  });

  // Driver zone assignment
  app.get("/api/drivers/:id/zones", async (req, res) => {
    try {
      const zones = await storage.getDriverZones(parseInt(req.params.id));
      res.json(zones);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch driver zones" });
    }
  });

  app.post("/api/drivers/:id/zones", async (req, res) => {
    try {
      const { zoneId } = req.body;
      const driverZone = await storage.assignDriverToZone(parseInt(req.params.id), zoneId);
      res.json(driverZone);
    } catch (error) {
      res.status(500).json({ error: "Failed to assign driver to zone" });
    }
  });

  app.delete("/api/drivers/:driverId/zones/:zoneId", async (req, res) => {
    try {
      const success = await storage.removeDriverFromZone(
        parseInt(req.params.driverId),
        parseInt(req.params.zoneId)
      );
      if (!success) {
        return res.status(404).json({ error: "Assignment not found" });
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to remove driver from zone" });
    }
  });

  // Enhanced delivery endpoints
  app.get("/api/deliveries/:id", async (req, res) => {
    try {
      const delivery = await storage.getDelivery(parseInt(req.params.id));
      if (!delivery) {
        return res.status(404).json({ error: "Delivery not found" });
      }
      res.json(delivery);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch delivery" });
    }
  });

  app.post("/api/deliveries", async (req, res) => {
    try {
      const delivery = await storage.createDelivery(req.body);
      io.emit("delivery_created", delivery);
      res.json(delivery);
    } catch (error) {
      console.error("Create delivery error:", error);
      res.status(500).json({ error: "Failed to create delivery" });
    }
  });

  app.put("/api/deliveries/:id", async (req, res) => {
    try {
      const delivery = await storage.updateDelivery(parseInt(req.params.id), req.body);
      if (!delivery) {
        return res.status(404).json({ error: "Delivery not found" });
      }
      res.json(delivery);
    } catch (error) {
      res.status(500).json({ error: "Failed to update delivery" });
    }
  });

  app.delete("/api/deliveries/:id", async (req, res) => {
    try {
      const success = await storage.deleteDelivery(parseInt(req.params.id));
      if (!success) {
        return res.status(404).json({ error: "Delivery not found" });
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete delivery" });
    }
  });

  // Get all active deliveries (excluding complete/cancelled)
  app.get("/api/deliveries/active", async (req, res) => {
    try {
      const zoneId = req.query.zoneId ? parseInt(req.query.zoneId as string) : null;
      let activeDeliveries;
      
      if (zoneId) {
        activeDeliveries = await storage.getActiveDeliveriesByZone(zoneId);
      } else {
        activeDeliveries = await storage.getActiveDeliveries();
      }
      
      res.json(activeDeliveries);
    } catch (error) {
      console.error("Get active deliveries error:", error);
      res.status(500).json({ error: "Failed to get active deliveries" });
    }
  });

  // Update delivery status (complete/cancelled)
  app.patch("/api/deliveries/:id/status", async (req, res) => {
    try {
      const { status } = req.body;
      const validStatuses = ['pending', 'geocoded', 'active', 'complete', 'cancelled'];
      
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
      }
      
      const delivery = await storage.updateDeliveryStatus(parseInt(req.params.id), status);
      if (!delivery) {
        return res.status(404).json({ error: "Delivery not found" });
      }
      
      io.emit("delivery_status_updated", delivery);
      res.json(delivery);
    } catch (error) {
      res.status(500).json({ error: "Failed to update delivery status" });
    }
  });

  // Route stop priority update
  app.put("/api/routes/:routeId/stops/:stopId", async (req, res) => {
    try {
      const stop = await storage.updateRouteStop(parseInt(req.params.stopId), req.body);
      if (!stop) {
        return res.status(404).json({ error: "Stop not found" });
      }
      io.emit("stop_updated", stop);
      res.json(stop);
    } catch (error) {
      res.status(500).json({ error: "Failed to update stop" });
    }
  });

  // Package scanning for route activation
  app.post("/api/routes/:routeId/stops/:stopId/scan", async (req, res) => {
    try {
      const stop = await storage.markPackageScanned(parseInt(req.params.stopId));
      if (!stop) {
        return res.status(404).json({ error: "Stop not found" });
      }
      io.emit("package_scanned", { stopId: stop.id, routeId: parseInt(req.params.routeId) });
      res.json(stop);
    } catch (error) {
      res.status(500).json({ error: "Failed to mark package as scanned" });
    }
  });

  // Route activation
  app.post("/api/routes/:id/activate", async (req, res) => {
    try {
      const routeId = parseInt(req.params.id);
      const stops = await storage.getRouteStops(routeId);
      
      // Check if all packages are scanned
      const allScanned = stops.every(s => s.packageScanned);
      if (!allScanned) {
        return res.status(400).json({ 
          error: "All packages must be scanned before activating route",
          scannedCount: stops.filter(s => s.packageScanned).length,
          totalCount: stops.length
        });
      }

      const route = await storage.activateRoute(routeId);
      if (!route) {
        return res.status(404).json({ error: "Route not found" });
      }

      io.emit("route_activated", route);
      res.json(route);
    } catch (error) {
      res.status(500).json({ error: "Failed to activate route" });
    }
  });

  // Set stop as urgent priority
  app.post("/api/routes/:routeId/stops/:stopId/urgent", async (req, res) => {
    try {
      const routeId = parseInt(req.params.routeId);
      const stopId = parseInt(req.params.stopId);
      
      // Mark this stop as urgent
      const stop = await storage.updateRouteStop(stopId, { priority: "urgent" });
      if (!stop) {
        return res.status(404).json({ error: "Stop not found" });
      }
      
      // Reorder stops to put urgent ones first
      const allStops = await storage.getRouteStops(routeId);
      const pendingStops = allStops.filter(s => s.status !== "completed");
      const urgentStops = pendingStops.filter(s => s.priority === "urgent");
      const normalStops = pendingStops.filter(s => s.priority !== "urgent");
      
      // Reorder: urgent first, then normal
      const reorderedStops = [...urgentStops, ...normalStops];
      for (let i = 0; i < reorderedStops.length; i++) {
        await storage.updateRouteStop(reorderedStops[i].id, { sequence: i + 1 });
      }
      
      io.emit("route_updated", { routeId });
      res.json({ success: true, stop });
    } catch (error) {
      res.status(500).json({ error: "Failed to set urgent priority" });
    }
  });

  // OCR logging
  app.post("/api/ocr/log", async (req, res) => {
    try {
      const log = await storage.createOcrLog(req.body);
      res.json(log);
    } catch (error) {
      res.status(500).json({ error: "Failed to create OCR log" });
    }
  });

  app.get("/api/deliveries/:id/ocr-logs", async (req, res) => {
    try {
      const logs = await storage.getOcrLogs(parseInt(req.params.id));
      res.json(logs);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch OCR logs" });
    }
  });

  return httpServer;
}
