import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { Server as SocketIOServer } from "socket.io";
import multer from "multer";
import Papa from "papaparse";
import { storage } from "./storage";
import { normalizeAddress } from "../shared/addressUtils";

const upload = multer({ storage: multer.memoryStorage() });

declare module 'express-session' {
  interface SessionData {
    user: {
      id: number;
      username: string;
      role: string;
      pharmacyId: number | null;
    } | null;
  }
}

function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session?.user) {
    return res.status(401).json({ message: "Authentication required" });
  }
  next();
}

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.session?.user) {
    return res.status(401).json({ message: "Authentication required" });
  }
  if (req.session.user.role !== 'admin') {
    return res.status(403).json({ message: "Admin access required" });
  }
  next();
}

// Helper to get pharmacy context from session
interface PharmacyContext {
  isAdmin: boolean;
  pharmacyId: number | null;
  userId: number;
  username: string;
}

function getPharmacyContext(session: any): PharmacyContext | null {
  if (!session?.user) return null;
  return {
    isAdmin: session.user.role === 'admin',
    pharmacyId: session.user.pharmacyId ? Number(session.user.pharmacyId) : null,
    userId: session.user.id,
    username: session.user.username
  };
}

// Middleware that requires pharmacy context for non-admin users
function requirePharmacyScope(req: Request, res: Response, next: NextFunction) {
  if (!req.session?.user) {
    return res.status(401).json({ message: "Authentication required" });
  }
  // Admins can access everything
  if (req.session.user.role === 'admin') {
    return next();
  }
  // Non-admins must have a pharmacy association
  if (!req.session.user.pharmacyId) {
    return res.status(403).json({ message: "Your account is not associated with a pharmacy. Please contact admin." });
  }
  next();
}

async function checkBatchOwnership(batchId: number, session: any): Promise<boolean> {
  if (session?.user?.role === 'admin') return true;
  if (!session?.user?.pharmacyId) return false;
  const batch = await storage.getBatch(batchId);
  if (!batch?.pharmacyId) return false;
  return Number(batch.pharmacyId) === Number(session.user.pharmacyId);
}

async function checkDeliveryOwnership(deliveryId: number, session: any): Promise<boolean> {
  if (session?.user?.role === 'admin') return true;
  if (!session?.user?.pharmacyId) return false;
  const delivery = await storage.getDelivery(deliveryId);
  if (!delivery) return false;
  
  // If delivery has a batch, check batch ownership
  if (delivery.batchId) {
    return checkBatchOwnership(delivery.batchId, session);
  }
  
  // Deliveries without batches are not accessible to pharmacy users
  // (should not occur in normal flow since all deliveries require a batch)
  return false;
}

async function checkRouteOwnership(routeId: number, session: any): Promise<boolean> {
  if (session?.user?.role === 'admin') return true;
  if (!session?.user?.pharmacyId) return false;
  const route = await storage.getRoute(routeId);
  if (!route?.batchId) return false;
  return checkBatchOwnership(route.batchId, session);
}

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

  // Authentication endpoints
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { username, password } = req.body;
      
      if (!username || !password) {
        return res.status(400).json({ message: "Username and password are required" });
      }

      const user = await storage.validateUserPassword(username, password);
      
      if (!user) {
        return res.status(401).json({ message: "Invalid username or password" });
      }

      // Store user in session
      req.session.user = {
        id: user.id,
        username: user.username,
        role: user.role,
        pharmacyId: user.pharmacyId
      };

      // Get pharmacy name if user has pharmacyId
      let pharmacyName = undefined;
      if (user.pharmacyId) {
        const pharmacy = await storage.getPharmacy(user.pharmacyId);
        pharmacyName = pharmacy?.name;
      }

      res.json({
        user: {
          id: user.id,
          username: user.username,
          role: user.role,
          pharmacyId: user.pharmacyId,
          pharmacyName
        }
      });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ message: "Login failed" });
    }
  });

  // Logout endpoint
  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ message: "Logout failed" });
      }
      res.clearCookie('connect.sid');
      res.json({ message: "Logged out successfully" });
    });
  });

  // Get current session user
  app.get("/api/auth/me", (req, res) => {
    if (!req.session?.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    res.json({ user: req.session.user });
  });

  app.post("/api/auth/register", requireAdmin, async (req, res) => {
    try {
      const { username, password, role, pharmacyId } = req.body;
      
      if (!username || !password) {
        return res.status(400).json({ message: "Username and password are required" });
      }

      // Check if username already exists
      const existingUser = await storage.getUserByUsername(username);
      if (existingUser) {
        return res.status(400).json({ message: "Username already exists" });
      }

      const user = await storage.createUser({
        username,
        password,
        role: role || "dispatcher",
        pharmacyId: pharmacyId || null
      });

      res.json({
        user: {
          id: user.id,
          username: user.username,
          role: user.role,
          pharmacyId: user.pharmacyId
        }
      });
    } catch (error) {
      console.error("Registration error:", error);
      res.status(500).json({ message: "Registration failed" });
    }
  });

  // Setup initial admin user (only works if no users exist)
  app.post("/api/auth/setup", async (req, res) => {
    try {
      const existingUsers = await storage.getUsers();
      if (existingUsers.length > 0) {
        return res.status(400).json({ message: "Setup already completed. Users exist." });
      }

      const { username, password } = req.body;
      if (!username || !password) {
        return res.status(400).json({ message: "Username and password are required" });
      }

      const user = await storage.createUser({
        username,
        password,
        role: "admin",
        pharmacyId: null
      });

      res.json({
        message: "Admin user created successfully",
        user: {
          id: user.id,
          username: user.username,
          role: user.role
        }
      });
    } catch (error) {
      console.error("Setup error:", error);
      res.status(500).json({ message: "Setup failed" });
    }
  });

  // Check if setup is needed
  app.get("/api/auth/needs-setup", async (req, res) => {
    try {
      const existingUsers = await storage.getUsers();
      res.json({ needsSetup: existingUsers.length === 0 });
    } catch (error) {
      res.status(500).json({ needsSetup: false });
    }
  });

  // Get all users (admin only)
  app.get("/api/users", requireAdmin, async (req, res) => {
    try {
      const users = await storage.getUsers();
      res.json(users);
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  // Update user
  app.patch("/api/users/:id", requireAdmin, async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      const { role, pharmacyId } = req.body;
      const user = await storage.updateUser(userId, { role, pharmacyId });
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      res.json(user);
    } catch (error) {
      console.error("Error updating user:", error);
      res.status(500).json({ error: "Failed to update user" });
    }
  });

  // Delete user
  app.delete("/api/users/:id", requireAdmin, async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      const deleted = await storage.deleteUser(userId);
      if (!deleted) {
        return res.status(404).json({ error: "User not found" });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting user:", error);
      res.status(500).json({ error: "Failed to delete user" });
    }
  });

  app.get("/api/drivers", requireAdmin, async (req, res) => {
    try {
      const drivers = await storage.getDrivers();
      res.json(drivers);
    } catch (error) {
      console.error("Error fetching drivers:", error);
      res.status(500).json({ error: "Failed to fetch drivers" });
    }
  });

  app.post("/api/drivers", requireAdmin, async (req, res) => {
    try {
      const driver = await storage.createDriver(req.body);
      res.json(driver);
    } catch (error) {
      res.status(500).json({ error: "Failed to create driver" });
    }
  });

  app.get("/api/drivers/:id", requireAdmin, async (req, res) => {
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

  app.get("/api/drivers/:id/routes", requireAdmin, async (req, res) => {
    try {
      const routes = await storage.getRoutesByDriver(parseInt(req.params.id));
      res.json(routes);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch driver routes" });
    }
  });

  app.get("/api/batches", requirePharmacyScope, async (req, res) => {
    try {
      const ctx = getPharmacyContext(req.session);
      if (!ctx) return res.status(401).json({ error: "Not authenticated" });
      
      let batches: any[];
      if (ctx.isAdmin) {
        batches = await storage.getBatches();
        console.log(`[Batches API] Admin ${ctx.username}, returning all ${batches.length} batches`);
      } else {
        batches = await storage.getBatchesByPharmacy(ctx.pharmacyId!);
        console.log(`[Batches API] User ${ctx.username} (pharmacy ${ctx.pharmacyId}), returning ${batches.length} batches`);
      }
      
      res.json(batches);
    } catch (error) {
      console.error("Error fetching batches:", error);
      res.status(500).json({ error: "Failed to fetch batches" });
    }
  });

  app.patch("/api/batches/:id/status", requireAuth, async (req, res) => {
    try {
      const batchId = parseInt(req.params.id);
      
      // Check pharmacy ownership
      if (!await checkBatchOwnership(batchId, req.session)) {
        return res.status(403).json({ error: "Access denied to this batch" });
      }
      
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

  app.post("/api/batches/upload", requireAuth, upload.single("file"), async (req, res) => {
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

      // Get pharmacyId from session for ownership
      const session = req.session as any;
      const pharmacyId = session?.user?.pharmacyId || null;
      
      const batch = await storage.createBatch({
        name: req.body.name || `Batch ${new Date().toLocaleDateString()}`,
        status: "processing",
        totalDeliveries: parsed.data.length,
        pharmacyId
      });

      const deliveries: any[] = [];
      const prescriptions: any[] = [];
      let skippedCount = 0;
      const skippedReasons: string[] = [];
      
      // Debug: Log the column names from the first row
      if (parsed.data.length > 0) {
        const firstRow = parsed.data[0] as any;
        console.log("CSV Column names detected:", Object.keys(firstRow));
        console.log("First row sample data:", JSON.stringify(firstRow).substring(0, 500));
      }
      
      // Map to track deliveries by normalized address hash
      const addressDeliveryMap = new Map<string, any>();
      
      // Helper function to clean Excel formula format (="value" -> value)
      const cleanExcelValue = (val: any): string => {
        if (!val) return '';
        let str = String(val).trim();
        // Remove Excel formula wrapper ="..." 
        if (str.startsWith('="') && str.endsWith('"')) {
          str = str.slice(2, -1);
        }
        // Also handle just = prefix
        if (str.startsWith('=')) {
          str = str.slice(1);
        }
        return str.trim();
      };
      
      for (const row of parsed.data as any[]) {
        // Support both old format (address column) and new format (separate address fields)
        // Column names are case-insensitive - check multiple variations
        const streetAddress = cleanExcelValue(row.PATADDRESS || row.pataddress || row.PatAddress || 
                              row.patientaddress || row.PatientAddress || 
                              row.street || row.Street || row.STREET || '');
        const city = cleanExcelValue(row.PATCITY || row.patcity || row.PatCity || 
                     row.city || row.City || row.CITY || '');
        const state = cleanExcelValue(row.PATSTATE || row.patstate || row.PatState || 
                      row.state || row.State || row.STATE || 'MI');
        const zipCode = cleanExcelValue(row.PATZIP || row.patzip || row.PatZip || 
                        row.zip || row.Zip || row.ZIP || row.zipcode || row.ZipCode || '');
        
        // Check if we have component address fields or a full address
        let addressText: string;
        let normalizedData: { streetAddress: string; city: string; state: string; zipCode: string; normalizedHash: string; fullAddress: string } | null = null;
        
        if (streetAddress && city && state) {
          // New format with separate fields
          normalizedData = normalizeAddress(streetAddress, city, state, zipCode);
          addressText = normalizedData.fullAddress;
        } else {
          // Old format with single address column
          addressText = row.address || row.Address || row.ADDRESS || '';
        }
        
        if (!addressText || addressText.trim() === '') {
          skippedCount++;
          skippedReasons.push("Missing address");
          continue;
        }

        // Get RX number (required field) - support multiple column name variations
        const rxNumber = cleanExcelValue(row.RXNO || row.rxno || row.RxNo || row.Rxno ||
                         row.rx_number || row.Rx_Number || row.RX_NUMBER ||
                         row.rx_no || row.Rx_No || row.RX_NO ||
                         row.rxNumber || row.RxNumber || row.RXNUMBER ||
                         row.RX || row.rx || row.Rx || '');
        if (!rxNumber) {
          skippedCount++;
          skippedReasons.push(`Missing RX number for address: ${addressText.substring(0, 30)}...`);
          continue;
        }

        // Get customer info - support multiple column name variations
        const customerName = cleanExcelValue(row.PATIENTNAME || row.patientname || row.PatientName ||
                             row.patname || row.PatName || row.PATNAME ||
                             row.customer_name || row.customerName || row.CustomerName ||
                             row.name || row.Name || row.NAME || '');
        const customerPhone = cleanExcelValue(row.PATPHONE || row.patphone || row.PatPhone ||
                              row.patientphone || row.PatientPhone ||
                              row.customer_phone || row.customerPhone || row.CustomerPhone ||
                              row.phone || row.Phone || row.PHONE || '');
        const notes = cleanExcelValue(row.delivery || row.Delivery || row.DELIVERY ||
                      row.notes || row.Notes || row.NOTES ||
                      row.comments || row.Comments || row.DRUGNAME || row.drugname || '');
        
        // Check if we already have an ACTIVE delivery for this address (address consolidation)
        // Only consolidate with deliveries that are not completed or cancelled
        let delivery: any;
        const addressKey = normalizedData?.normalizedHash || addressText.toLowerCase().trim();
        
        // Check in-memory map first, but verify the delivery is still active
        const cachedDelivery = addressDeliveryMap.get(addressKey);
        const isActive = cachedDelivery && 
          cachedDelivery.status !== 'complete' && 
          cachedDelivery.status !== 'completed' && 
          cachedDelivery.status !== 'cancelled';
        
        if (isActive) {
          // Use existing active delivery
          delivery = cachedDelivery;
        } else {
          // Create new delivery (either no cached delivery, or cached one is completed/cancelled)
          const geocoded = await geocodeAddress(addressText);
          const deliveryIdentifier = await storage.generateUniqueDeliveryIdentifier();
          
          delivery = await storage.createDelivery({
            batchId: batch.id,
            deliveryIdentifier,
            addressText,
            streetAddress: normalizedData?.streetAddress || null,
            city: normalizedData?.city || null,
            state: normalizedData?.state || null,
            zipCode: normalizedData?.zipCode || null,
            normalizedAddressHash: normalizedData?.normalizedHash || null,
            lat: geocoded?.lat || null,
            lng: geocoded?.lng || null,
            customerName,
            customerPhone,
            rxNumber: null, // No longer storing single RX on delivery
            notes,
            priority: row.priority || "normal",
            status: geocoded ? "geocoded" : "pending"
          });
          
          deliveries.push(delivery);
          addressDeliveryMap.set(addressKey, delivery);
          
          // Small delay to avoid rate limiting on geocoding
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        // Create prescription linked to delivery
        const prescription = await storage.createPrescription({
          deliveryId: delivery.id,
          batchId: batch.id,
          rxNumber,
          patientName: customerName,
          patientPhone: customerPhone,
          notes,
          entryMethod: "upload"
        });
        
        prescriptions.push(prescription);
      }

      await storage.updateBatchStatus(batch.id, "ready");

      res.json({
        batch,
        deliveries,
        prescriptions,
        geocodedCount: deliveries.filter((d: any) => d.lat && d.lng).length,
        totalDeliveries: deliveries.length,
        totalPrescriptions: prescriptions.length,
        skippedCount,
        skippedReasons: skippedReasons.slice(0, 5)
      });
    } catch (error) {
      console.error("Upload error:", error);
      res.status(500).json({ error: "Failed to process CSV" });
    }
  });

  app.get("/api/batches/:id", requireAuth, async (req, res) => {
    try {
      const batchId = parseInt(req.params.id);
      
      // Check pharmacy ownership
      if (!await checkBatchOwnership(batchId, req.session)) {
        return res.status(403).json({ error: "Access denied to this batch" });
      }
      
      const batch = await storage.getBatch(batchId);
      if (!batch) {
        return res.status(404).json({ error: "Batch not found" });
      }
      const deliveries = await storage.getDeliveriesByBatch(batch.id);
      const prescriptions = await storage.getPrescriptionsByBatch(batch.id);
      
      // Attach prescriptions to their respective deliveries
      const deliveriesWithPrescriptions = deliveries.map(delivery => ({
        ...delivery,
        prescriptions: prescriptions.filter(p => p.deliveryId === delivery.id)
      }));
      
      res.json({ batch, deliveries: deliveriesWithPrescriptions, prescriptions });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch batch" });
    }
  });
  
  // Prescription endpoints
  app.get("/api/prescriptions/batch/:batchId", requireAuth, async (req, res) => {
    try {
      const batchId = parseInt(req.params.batchId);
      
      // Check pharmacy ownership
      if (!await checkBatchOwnership(batchId, req.session)) {
        return res.status(403).json({ error: "Access denied to this batch" });
      }
      
      const prescriptions = await storage.getPrescriptionsByBatch(batchId);
      res.json(prescriptions);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch prescriptions" });
    }
  });
  
  app.get("/api/prescriptions/delivery/:deliveryId", requireAuth, async (req, res) => {
    try {
      const deliveryId = parseInt(req.params.deliveryId);
      
      // Check pharmacy ownership
      if (!await checkDeliveryOwnership(deliveryId, req.session)) {
        return res.status(403).json({ error: "Access denied to this delivery" });
      }
      
      const prescriptions = await storage.getPrescriptionsByDelivery(deliveryId);
      res.json(prescriptions);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch prescriptions" });
    }
  });
  
  app.post("/api/prescriptions", requireAuth, async (req, res) => {
    try {
      if (!req.body.rxNumber) {
        return res.status(400).json({ error: "RX number is required" });
      }
      if (!req.body.deliveryId) {
        return res.status(400).json({ error: "Delivery ID is required" });
      }
      
      // Check delivery ownership
      if (!await checkDeliveryOwnership(req.body.deliveryId, req.session)) {
        return res.status(403).json({ error: "Access denied to this delivery" });
      }
      
      const prescription = await storage.createPrescription(req.body);
      io.emit("prescription_created", prescription);
      res.json(prescription);
    } catch (error) {
      console.error("Create prescription error:", error);
      res.status(500).json({ error: "Failed to create prescription" });
    }
  });
  
  app.put("/api/prescriptions/:id", requireAuth, async (req, res) => {
    try {
      const prescriptionId = parseInt(req.params.id);
      const prescription = await storage.getPrescription(prescriptionId);
      if (!prescription) {
        return res.status(404).json({ error: "Prescription not found" });
      }
      
      // Check delivery ownership
      if (!await checkDeliveryOwnership(prescription.deliveryId, req.session)) {
        return res.status(403).json({ error: "Access denied to this prescription" });
      }
      
      const updatedPrescription = await storage.updatePrescription(prescriptionId, req.body);
      io.emit("prescription_updated", updatedPrescription);
      res.json(updatedPrescription);
    } catch (error) {
      res.status(500).json({ error: "Failed to update prescription" });
    }
  });
  
  app.delete("/api/prescriptions/:id", requireAuth, async (req, res) => {
    try {
      const prescriptionId = parseInt(req.params.id);
      const prescription = await storage.getPrescription(prescriptionId);
      if (!prescription) {
        return res.status(404).json({ error: "Prescription not found" });
      }
      
      // Check delivery ownership
      if (!await checkDeliveryOwnership(prescription.deliveryId, req.session)) {
        return res.status(403).json({ error: "Access denied to this prescription" });
      }
      
      const success = await storage.deletePrescription(prescriptionId);
      if (!success) {
        return res.status(404).json({ error: "Prescription not found" });
      }
      io.emit("prescription_deleted", { id: prescriptionId });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete prescription" });
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

  app.get("/api/routes", requirePharmacyScope, async (req, res) => {
    try {
      const ctx = getPharmacyContext(req.session);
      if (!ctx) return res.status(401).json({ error: "Not authenticated" });
      
      let routes: any[];
      if (ctx.isAdmin) {
        routes = await storage.getRoutes();
        console.log(`[Routes API] Admin ${ctx.username}, returning all ${routes.length} routes`);
      } else {
        routes = await storage.getRoutesByPharmacy(ctx.pharmacyId!);
        console.log(`[Routes API] User ${ctx.username} (pharmacy ${ctx.pharmacyId}), returning ${routes.length} routes`);
      }
      
      res.json(routes);
    } catch (error) {
      console.error("Error fetching routes:", error);
      res.status(500).json({ error: "Failed to fetch routes" });
    }
  });

  app.get("/api/routes/:id", requireAuth, async (req, res) => {
    try {
      const routeId = parseInt(req.params.id);
      
      // Check pharmacy ownership
      if (!await checkRouteOwnership(routeId, req.session)) {
        return res.status(403).json({ error: "Access denied to this route" });
      }
      
      const route = await storage.getRoute(routeId);
      if (!route) {
        return res.status(404).json({ error: "Route not found" });
      }
      const stops = await storage.getRouteStops(route.id);
      
      // Attach prescriptions to each delivery - fetch delivery directly by ID
      const stopsWithDeliveries = await Promise.all(
        stops.map(async (stop) => {
          if (!stop.deliveryId) {
            return { ...stop, delivery: null };
          }
          const delivery = await storage.getDelivery(stop.deliveryId);
          if (delivery) {
            const prescriptions = await storage.getPrescriptionsByDelivery(delivery.id);
            return {
              ...stop,
              delivery: { ...delivery, prescriptions }
            };
          }
          return { ...stop, delivery: null };
        })
      );

      res.json({ route, stops: stopsWithDeliveries });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch route" });
    }
  });

  // Detailed route report with delivery proofs
  app.get("/api/routes/:id/report", requireAuth, async (req, res) => {
    try {
      const routeId = parseInt(req.params.id);
      
      // Check pharmacy ownership
      if (!await checkRouteOwnership(routeId, req.session)) {
        return res.status(403).json({ error: "Access denied to this route" });
      }
      
      const route = await storage.getRoute(routeId);
      if (!route) {
        return res.status(404).json({ error: "Route not found" });
      }
      
      const driver = route.driverId ? await storage.getDriver(route.driverId) : null;
      const stops = await storage.getRouteStops(route.id);
      
      // Build detailed stops with delivery proofs
      const detailedStops = await Promise.all(
        stops.map(async (stop) => {
          const delivery = stop.deliveryId ? await storage.getDelivery(stop.deliveryId) : null;
          const prescriptions = delivery ? await storage.getPrescriptionsByDelivery(delivery.id) : [];
          const proof = await storage.getDeliveryProof(stop.id);
          
          return {
            id: stop.id,
            sequence: stop.sequence,
            status: stop.status,
            priority: stop.priority,
            packageScanned: stop.packageScanned,
            eta: stop.eta,
            actualArrival: stop.actualArrival,
            delivery: delivery ? {
              id: delivery.id,
              deliveryIdentifier: delivery.deliveryIdentifier,
              addressText: delivery.addressText,
              streetAddress: delivery.streetAddress,
              city: delivery.city,
              state: delivery.state,
              zipCode: delivery.zipCode,
              customerName: delivery.customerName,
              customerPhone: delivery.customerPhone,
              status: delivery.status,
            } : null,
            prescriptions: prescriptions.map(p => ({
              id: p.id,
              rxNumber: p.rxNumber,
              patientName: p.patientName,
              verified: stop.packageScanned || false,
            })),
            proof: proof ? {
              hasSignature: !!proof.signature,
              hasPhoto: !!proof.picture,
              signatureData: proof.signature,
              photoData: proof.picture,
              notes: proof.notes,
              timestamp: proof.createdAt,
              barcode: proof.barcode,
            } : null,
          };
        })
      );
      
      // Calculate summary stats
      const completedStops = detailedStops.filter(s => s.status === 'complete' || s.status === 'completed');
      const pendingStops = detailedStops.filter(s => s.status === 'pending');
      const cancelledStops = detailedStops.filter(s => s.status === 'cancelled');
      const stopsWithProof = detailedStops.filter(s => s.proof?.hasSignature || s.proof?.hasPhoto);
      const totalPrescriptions = detailedStops.reduce((acc, s) => acc + s.prescriptions.length, 0);
      const verifiedPrescriptions = detailedStops.reduce((acc, s) => acc + s.prescriptions.filter(p => p.verified).length, 0);
      
      res.json({
        route: {
          id: route.id,
          name: route.name,
          status: route.status,
          startAddress: route.startAddress,
          estimatedDistance: route.estimatedDistance,
          estimatedDuration: route.estimatedDuration,
          createdAt: route.createdAt,
          dispatchedAt: route.dispatchedAt,
          completedAt: route.completedAt,
        },
        driver: driver ? {
          id: driver.id,
          name: driver.name,
          phone: driver.phone,
        } : null,
        summary: {
          totalStops: detailedStops.length,
          completedStops: completedStops.length,
          pendingStops: pendingStops.length,
          cancelledStops: cancelledStops.length,
          stopsWithProof: stopsWithProof.length,
          totalPrescriptions,
          verifiedPrescriptions,
        },
        stops: detailedStops,
      });
    } catch (error) {
      console.error("Route report error:", error);
      res.status(500).json({ error: "Failed to generate route report" });
    }
  });

  app.post("/api/routes/optimize", requireAuth, async (req, res) => {
    try {
      const { batchId, deliveryIds, zoneId, startLat, startLng, startAddress, routeName } = req.body;

      if (startLat === undefined || startLng === undefined) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      let geocodedDeliveries: any[] = [];
      
      // Support both old batch-based and new deliveryIds-based approach
      if (deliveryIds && Array.isArray(deliveryIds) && deliveryIds.length > 0) {
        // New approach: use selected delivery IDs
        // Verify ownership of all delivery IDs
        for (const id of deliveryIds) {
          if (!await checkDeliveryOwnership(id, req.session)) {
            return res.status(403).json({ error: "Access denied to one or more deliveries" });
          }
        }
        
        const allDeliveries = await Promise.all(
          deliveryIds.map(id => storage.getDelivery(id))
        );
        geocodedDeliveries = allDeliveries.filter(d => d && d.lat && d.lng) as any[];
      } else if (batchId) {
        // Check batch ownership
        if (!await checkBatchOwnership(batchId, req.session)) {
          return res.status(403).json({ error: "Access denied to this batch" });
        }
        
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

  app.post("/api/routes/:id/assign", requireAuth, async (req, res) => {
    try {
      const { driverId } = req.body;
      const routeId = parseInt(req.params.id);

      // Check pharmacy ownership
      if (!await checkRouteOwnership(routeId, req.session)) {
        return res.status(403).json({ error: "Access denied to this route" });
      }

      const route = await storage.assignRouteToDriver(routeId, driverId);
      if (!route) {
        return res.status(404).json({ error: "Route not found" });
      }

      res.json(route);
    } catch (error) {
      res.status(500).json({ error: "Failed to assign route" });
    }
  });

  app.post("/api/routes/:id/dispatch", requireAuth, async (req, res) => {
    try {
      const routeId = parseInt(req.params.id);
      
      // Check pharmacy ownership
      if (!await checkRouteOwnership(routeId, req.session)) {
        return res.status(403).json({ error: "Access denied to this route" });
      }
      
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

      // Attach prescriptions to each delivery
      const stopsWithDeliveries = await Promise.all(
        stops.map(async (stop) => {
          const delivery = deliveries.find(d => d.id === stop.deliveryId);
          if (delivery) {
            const prescriptions = await storage.getPrescriptionsByDelivery(delivery.id);
            return {
              ...stop,
              delivery: { ...delivery, prescriptions }
            };
          }
          return { ...stop, delivery: null };
        })
      );

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
      const routeId = parseInt(req.params.routeId);
      const stopId = parseInt(req.params.stopId);
      const stop = await storage.completeRouteStop(stopId);

      if (!stop) {
        return res.status(404).json({ error: "Stop not found" });
      }

      io.emit("stop_status_update", { stopId, status: "completed" });

      // Check if all stops are completed - if so, mark route as complete
      const allStops = await storage.getRouteStops(routeId);
      const allCompleted = allStops.every(s => s.status === "completed");
      if (allCompleted) {
        await storage.updateRoute(routeId, { status: "complete", completedAt: new Date() });
        io.emit("route_completed", { routeId });
        console.log(`✅ All stops completed - Route ${routeId} marked as complete`);
      }

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
      const routeId = parseInt(req.params.routeId);
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
      
      // Check if all stops are completed - if so, mark route as complete
      const allStops = await storage.getRouteStops(routeId);
      const allCompleted = allStops.every(s => s.status === "completed");
      if (allCompleted) {
        await storage.updateRoute(routeId, { status: "complete", completedAt: new Date() });
        io.emit("route_completed", { routeId });
        console.log(`✅ All stops completed - Route ${routeId} marked as complete`);
      }
      
      res.json({ proof, stop: completedStop });
    } catch (error: any) {
      console.error("Proof submission error:", error);
      const errorMessage = error?.message || "Failed to submit proof";
      res.status(500).json({ error: errorMessage });
    }
  });

  // Cancel a delivery stop (can't deliver)
  app.post("/api/routes/:routeId/stops/:stopId/cancel", async (req, res) => {
    try {
      const routeId = parseInt(req.params.routeId);
      const stopId = parseInt(req.params.stopId);
      const { reason } = req.body;

      if (!reason) {
        return res.status(400).json({ error: "Cancellation reason is required" });
      }

      // Update the stop status to cancelled with the reason as notes
      const cancelledStop = await storage.updateRouteStop(stopId, { 
        status: "cancelled",
        notes: `CANCELLED: ${reason}`
      });

      if (!cancelledStop) {
        return res.status(404).json({ error: "Stop not found" });
      }

      // Also update the delivery status to cancelled
      if (cancelledStop.deliveryId) {
        await storage.updateDeliveryStatus(cancelledStop.deliveryId, "cancelled");
      }

      io.emit("stop_status_update", { stopId, status: "cancelled" });
      console.log(`❌ Stop ${stopId} cancelled: ${reason}`);

      // Check if all stops are completed or cancelled - if so, mark route as complete
      const allStops = await storage.getRouteStops(routeId);
      const allDone = allStops.every(s => s.status === "completed" || s.status === "cancelled");
      if (allDone) {
        await storage.updateRoute(routeId, { status: "complete", completedAt: new Date() });
        io.emit("route_completed", { routeId });
        console.log(`✅ All stops done - Route ${routeId} marked as complete`);
      }

      res.json({ stop: cancelledStop });
    } catch (error) {
      console.error("Cancel delivery error:", error);
      res.status(500).json({ error: "Failed to cancel delivery" });
    }
  });

  // Pharmacy endpoints (admin only for management)
  app.get("/api/pharmacies", requireAdmin, async (req, res) => {
    try {
      const pharmacies = await storage.getPharmacies();
      res.json(pharmacies);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch pharmacies" });
    }
  });

  app.post("/api/pharmacies", requireAdmin, async (req, res) => {
    try {
      const pharmacy = await storage.createPharmacy(req.body);
      res.json(pharmacy);
    } catch (error) {
      res.status(500).json({ error: "Failed to create pharmacy" });
    }
  });

  app.get("/api/pharmacies/:id", requireAuth, async (req, res) => {
    try {
      const pharmacyId = parseInt(req.params.id);
      const session = req.session as any;
      
      // Non-admin users can only access their own pharmacy
      if (session?.user?.role !== 'admin' && session?.user?.pharmacyId !== pharmacyId) {
        return res.status(403).json({ error: "Access denied to this pharmacy" });
      }
      
      const pharmacy = await storage.getPharmacy(pharmacyId);
      if (!pharmacy) {
        return res.status(404).json({ error: "Pharmacy not found" });
      }
      res.json(pharmacy);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch pharmacy" });
    }
  });

  app.put("/api/pharmacies/:id", requireAdmin, async (req, res) => {
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

  // Delivery Zone endpoints (admin only for global view)
  app.get("/api/zones", requireAdmin, async (req, res) => {
    try {
      const zones = await storage.getDeliveryZones();
      res.json(zones);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch zones" });
    }
  });

  app.post("/api/zones", requireAdmin, async (req, res) => {
    try {
      const zone = await storage.createDeliveryZone(req.body);
      res.json(zone);
    } catch (error) {
      res.status(500).json({ error: "Failed to create zone" });
    }
  });

  app.put("/api/zones/:id", requireAdmin, async (req, res) => {
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

  app.delete("/api/zones/:id", requireAdmin, async (req, res) => {
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

  // Driver zone assignment (admin only)
  app.get("/api/drivers/:id/zones", requireAdmin, async (req, res) => {
    try {
      const zones = await storage.getDriverZones(parseInt(req.params.id));
      res.json(zones);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch driver zones" });
    }
  });

  app.post("/api/drivers/:id/zones", requireAdmin, async (req, res) => {
    try {
      const { zoneId } = req.body;
      const driverZone = await storage.assignDriverToZone(parseInt(req.params.id), zoneId);
      res.json(driverZone);
    } catch (error) {
      res.status(500).json({ error: "Failed to assign driver to zone" });
    }
  });

  app.delete("/api/drivers/:driverId/zones/:zoneId", requireAdmin, async (req, res) => {
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

  // Get all active deliveries (excluding complete/cancelled) - MUST be before :id routes
  app.get("/api/deliveries/active", requirePharmacyScope, async (req, res) => {
    try {
      const ctx = getPharmacyContext(req.session);
      if (!ctx) return res.status(401).json({ error: "Not authenticated" });
      
      const zoneId = req.query.zoneId ? parseInt(req.query.zoneId as string) : null;
      let activeDeliveries: any[];
      
      if (ctx.isAdmin) {
        activeDeliveries = zoneId 
          ? await storage.getActiveDeliveriesByZone(zoneId)
          : await storage.getActiveDeliveries();
        console.log(`[Active Deliveries API] Admin ${ctx.username}, returning all ${activeDeliveries.length} deliveries`);
      } else {
        activeDeliveries = await storage.getActiveDeliveriesByPharmacy(ctx.pharmacyId!);
        console.log(`[Active Deliveries API] User ${ctx.username} (pharmacy ${ctx.pharmacyId}), returning ${activeDeliveries.length} deliveries`);
        
        // If zone filtering is also requested, apply it
        if (zoneId) {
          const zone = await storage.getDeliveryZone(zoneId);
          if (zone) {
            activeDeliveries = activeDeliveries.filter(d => {
              if (!d.lat || !d.lng) return false;
              const distance = Math.sqrt(
                Math.pow(Number(d.lat) - Number(zone.centerLat), 2) +
                Math.pow(Number(d.lng) - Number(zone.centerLng), 2)
              ) * 111000;
              return distance <= zone.radiusMeters;
            });
          }
        }
      }
      
      // Attach prescriptions to each delivery
      const deliveriesWithPrescriptions = await Promise.all(
        activeDeliveries.map(async (delivery) => {
          const prescriptions = await storage.getPrescriptionsByDelivery(delivery.id);
          return { ...delivery, prescriptions };
        })
      );
      
      res.json(deliveriesWithPrescriptions);
    } catch (error) {
      console.error("Get active deliveries error:", error);
      res.status(500).json({ error: "Failed to get active deliveries" });
    }
  });

  // Enhanced delivery endpoints
  app.get("/api/deliveries/:id", requireAuth, async (req, res) => {
    try {
      const deliveryId = parseInt(req.params.id);
      
      // Check pharmacy ownership
      if (!await checkDeliveryOwnership(deliveryId, req.session)) {
        return res.status(403).json({ error: "Access denied to this delivery" });
      }
      
      const delivery = await storage.getDelivery(deliveryId);
      if (!delivery) {
        return res.status(404).json({ error: "Delivery not found" });
      }
      res.json(delivery);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch delivery" });
    }
  });

  app.post("/api/deliveries", requireAuth, async (req, res) => {
    try {
      if (!req.body.rxNumber) {
        return res.status(400).json({ error: "RX number is required" });
      }
      if (!req.body.addressText) {
        return res.status(400).json({ error: "Address is required" });
      }
      
      // Generate delivery identifier
      const batchId = req.body.batchId;
      
      // Check batch ownership if batchId is provided
      if (batchId && !await checkBatchOwnership(batchId, req.session)) {
        return res.status(403).json({ error: "Access denied to this batch" });
      }
      
      let deliveryIdentifier = null;
      if (batchId) {
        deliveryIdentifier = await storage.generateUniqueDeliveryIdentifier();
      }
      
      // Create the delivery (rxNumber is stored on prescription, not delivery)
      const { rxNumber, ...deliveryData } = req.body;
      const delivery = await storage.createDelivery({
        ...deliveryData,
        deliveryIdentifier,
        rxNumber: null // No longer storing RX on delivery directly
      });
      
      // Create associated prescription
      if (rxNumber) {
        await storage.createPrescription({
          deliveryId: delivery.id,
          batchId: batchId || null,
          rxNumber,
          patientName: req.body.customerName || null,
          patientPhone: req.body.customerPhone || null,
          notes: req.body.notes || null,
          entryMethod: "manual"
        });
      }
      
      // Fetch the delivery with prescriptions
      const prescriptions = await storage.getPrescriptionsByDelivery(delivery.id);
      
      io.emit("delivery_created", { ...delivery, prescriptions });
      res.json({ ...delivery, prescriptions });
    } catch (error) {
      console.error("Create delivery error:", error);
      res.status(500).json({ error: "Failed to create delivery" });
    }
  });

  app.put("/api/deliveries/:id", requireAuth, async (req, res) => {
    try {
      const deliveryId = parseInt(req.params.id);
      
      // Check pharmacy ownership
      if (!await checkDeliveryOwnership(deliveryId, req.session)) {
        return res.status(403).json({ error: "Access denied to this delivery" });
      }
      
      const delivery = await storage.updateDelivery(deliveryId, req.body);
      if (!delivery) {
        return res.status(404).json({ error: "Delivery not found" });
      }
      res.json(delivery);
    } catch (error) {
      res.status(500).json({ error: "Failed to update delivery" });
    }
  });

  app.delete("/api/deliveries/:id", requireAuth, async (req, res) => {
    try {
      const deliveryId = parseInt(req.params.id);
      
      // Check pharmacy ownership
      if (!await checkDeliveryOwnership(deliveryId, req.session)) {
        return res.status(403).json({ error: "Access denied to this delivery" });
      }
      
      const success = await storage.deleteDelivery(deliveryId);
      if (!success) {
        return res.status(404).json({ error: "Delivery not found" });
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete delivery" });
    }
  });

  // Split delivery - move prescriptions to a new delivery
  app.post("/api/deliveries/:id/split", requireAuth, async (req, res) => {
    try {
      const sourceDeliveryId = parseInt(req.params.id);
      
      // Check pharmacy ownership
      if (!await checkDeliveryOwnership(sourceDeliveryId, req.session)) {
        return res.status(403).json({ error: "Access denied to this delivery" });
      }
      
      const { prescriptionIds } = req.body;
      
      if (!prescriptionIds || !Array.isArray(prescriptionIds) || prescriptionIds.length === 0) {
        return res.status(400).json({ error: "prescriptionIds array is required" });
      }
      
      // Verify source delivery exists and has enough prescriptions
      const sourcePrescriptions = await storage.getPrescriptionsByDelivery(sourceDeliveryId);
      if (sourcePrescriptions.length <= prescriptionIds.length) {
        return res.status(400).json({ error: "Cannot split all prescriptions - at least one must remain in the original delivery" });
      }
      
      const newDelivery = await storage.splitDelivery(sourceDeliveryId, prescriptionIds);
      if (!newDelivery) {
        return res.status(404).json({ error: "Delivery not found" });
      }
      
      // Fetch prescriptions for the new delivery
      const newPrescriptions = await storage.getPrescriptionsByDelivery(newDelivery.id);
      
      io.emit("delivery_split", { sourceDeliveryId, newDelivery, newPrescriptions });
      res.json({ delivery: newDelivery, prescriptions: newPrescriptions });
    } catch (error) {
      console.error("Split delivery error:", error);
      res.status(500).json({ error: "Failed to split delivery" });
    }
  });

  // Merge deliveries - combine multiple deliveries into one
  app.post("/api/deliveries/:id/merge", requireAuth, async (req, res) => {
    try {
      const targetDeliveryId = parseInt(req.params.id);
      
      // Check pharmacy ownership
      if (!await checkDeliveryOwnership(targetDeliveryId, req.session)) {
        return res.status(403).json({ error: "Access denied to this delivery" });
      }
      
      const { sourceDeliveryIds } = req.body;
      
      if (!sourceDeliveryIds || !Array.isArray(sourceDeliveryIds) || sourceDeliveryIds.length === 0) {
        return res.status(400).json({ error: "sourceDeliveryIds array is required" });
      }
      
      // Make sure target is not in source list
      if (sourceDeliveryIds.includes(targetDeliveryId)) {
        return res.status(400).json({ error: "Target delivery cannot be in source list" });
      }
      
      const mergedDelivery = await storage.mergeDeliveries(targetDeliveryId, sourceDeliveryIds);
      if (!mergedDelivery) {
        return res.status(404).json({ error: "Target delivery not found" });
      }
      
      // Fetch all prescriptions for the merged delivery
      const prescriptions = await storage.getPrescriptionsByDelivery(targetDeliveryId);
      
      io.emit("deliveries_merged", { targetDeliveryId, sourceDeliveryIds, prescriptions });
      res.json({ delivery: mergedDelivery, prescriptions });
    } catch (error) {
      console.error("Merge deliveries error:", error);
      res.status(500).json({ error: "Failed to merge deliveries" });
    }
  });

  // Move a single prescription to another delivery
  app.post("/api/prescriptions/:id/move", requireAuth, async (req, res) => {
    try {
      const prescriptionId = parseInt(req.params.id);
      const { targetDeliveryId } = req.body;
      
      if (!targetDeliveryId) {
        return res.status(400).json({ error: "targetDeliveryId is required" });
      }
      
      // Verify source delivery still has prescriptions after move
      const prescription = await storage.getPrescription(prescriptionId);
      if (!prescription) {
        return res.status(404).json({ error: "Prescription not found" });
      }
      
      // Check pharmacy ownership for both source and target deliveries
      if (!await checkDeliveryOwnership(prescription.deliveryId, req.session)) {
        return res.status(403).json({ error: "Access denied to source delivery" });
      }
      if (!await checkDeliveryOwnership(targetDeliveryId, req.session)) {
        return res.status(403).json({ error: "Access denied to target delivery" });
      }
      
      const sourcePrescriptions = await storage.getPrescriptionsByDelivery(prescription.deliveryId);
      if (sourcePrescriptions.length <= 1) {
        return res.status(400).json({ error: "Cannot move the last prescription from a delivery. Delete the delivery instead." });
      }
      
      const movedPrescription = await storage.movePrescriptionToDelivery(prescriptionId, targetDeliveryId);
      if (!movedPrescription) {
        return res.status(404).json({ error: "Failed to move prescription" });
      }
      
      io.emit("prescription_moved", { prescriptionId, targetDeliveryId, sourceDeliveryId: prescription.deliveryId });
      res.json(movedPrescription);
    } catch (error) {
      console.error("Move prescription error:", error);
      res.status(500).json({ error: "Failed to move prescription" });
    }
  });

  // Update delivery status (complete/cancelled)
  app.patch("/api/deliveries/:id/status", requireAuth, async (req, res) => {
    try {
      const deliveryId = parseInt(req.params.id);
      
      // Check pharmacy ownership
      if (!await checkDeliveryOwnership(deliveryId, req.session)) {
        return res.status(403).json({ error: "Access denied to this delivery" });
      }
      
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
  app.put("/api/routes/:routeId/stops/:stopId", requireAuth, async (req, res) => {
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

  app.get("/api/deliveries/:id/ocr-logs", requireAuth, async (req, res) => {
    try {
      const logs = await storage.getOcrLogs(parseInt(req.params.id));
      res.json(logs);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch OCR logs" });
    }
  });

  // Order-level reporting endpoint - returns deliveries with proof data for pharmacy-scoped reporting
  app.get("/api/reports/orders", requirePharmacyScope, async (req, res) => {
    try {
      const ctx = getPharmacyContext(req.session);
      if (!ctx) return res.status(401).json({ error: "Not authenticated" });
      
      const pharmacyId = req.query.pharmacyId ? parseInt(req.query.pharmacyId as string) : null;
      const batchId = req.query.batchId ? parseInt(req.query.batchId as string) : null;
      const status = req.query.status as string | undefined;
      
      // Get deliveries with pharmacy filtering
      let allDeliveries: any[];
      if (ctx.isAdmin) {
        // Admin can filter by pharmacy or see all
        if (pharmacyId) {
          allDeliveries = await storage.getDeliveriesByPharmacy(pharmacyId);
        } else {
          allDeliveries = await storage.getDeliveries();
        }
      } else {
        allDeliveries = await storage.getDeliveriesByPharmacy(ctx.pharmacyId!);
      }
      
      // Filter by batch if specified
      if (batchId) {
        allDeliveries = allDeliveries.filter(d => d.batchId === batchId);
      }
      
      // Filter by status if specified
      if (status) {
        if (status === "open") {
          // Open orders = not complete and not cancelled
          allDeliveries = allDeliveries.filter(d => d.status !== "complete" && d.status !== "cancelled");
        } else {
          allDeliveries = allDeliveries.filter(d => d.status === status);
        }
      }
      
      // Enrich each delivery with prescriptions and proof data
      const ordersWithDetails = await Promise.all(
        allDeliveries.map(async (delivery) => {
          const prescriptions = await storage.getPrescriptionsByDelivery(delivery.id);
          
          // Find route stop for this delivery to get proof
          const routeStop = await storage.getRouteStopByDeliveryId(delivery.id);
          let proof = null;
          let routeInfo = null;
          
          if (routeStop) {
            proof = await storage.getDeliveryProof(routeStop.id);
            const route = await storage.getRoute(routeStop.routeId!);
            if (route) {
              const driver = route.driverId ? await storage.getDriver(route.driverId) : null;
              routeInfo = {
                routeId: route.id,
                routeName: route.name,
                routeStatus: route.status,
                driverName: driver?.name || null,
                completedAt: routeStop.actualArrival
              };
            }
          }
          
          return {
            ...delivery,
            prescriptions,
            proof: proof ? {
              hasSignature: !!proof.signature,
              hasPhoto: !!proof.picture,
              signatureData: proof.signature,
              photoData: proof.picture,
              notes: proof.notes,
              barcode: proof.barcode,
              timestamp: proof.createdAt
            } : null,
            route: routeInfo
          };
        })
      );
      
      console.log(`[Orders Report API] User ${ctx.username}, returning ${ordersWithDetails.length} orders`);
      res.json(ordersWithDetails);
    } catch (error) {
      console.error("Orders report error:", error);
      res.status(500).json({ error: "Failed to fetch orders report" });
    }
  });

  return httpServer;
}
