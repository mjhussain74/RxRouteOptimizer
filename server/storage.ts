import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { eq, and, desc, inArray, notInArray, isNotNull } from "drizzle-orm";
import bcrypt from "bcrypt";
import {
  users, drivers, deliveryBatches, deliveries, routes, routeStops, driverLocations, deliveryProofs,
  pharmacies, deliveryZones, driverZones, ocrLogs, prescriptions,
  type User, type InsertUser,
  type Driver, type InsertDriver,
  type DeliveryBatch, type InsertDeliveryBatch,
  type Delivery, type InsertDelivery,
  type Route, type InsertRoute,
  type RouteStop, type InsertRouteStop,
  type DriverLocation,
  type Pharmacy, type InsertPharmacy,
  type DeliveryZone, type InsertDeliveryZone,
  type DriverZone, type InsertDriverZone,
  type DeliveryProof, type InsertDeliveryProof,
  type OcrLog, type InsertOcrLog,
  type Prescription, type InsertPrescription
} from "@shared/schema";

const sql = neon(process.env.DATABASE_URL!);
export const db = drizzle(sql);

const SALT_ROUNDS = 10;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  getPharmacies(): Promise<Pharmacy[]>;
  getPharmacy(id: number): Promise<Pharmacy | undefined>;
  createPharmacy(pharmacy: InsertPharmacy): Promise<Pharmacy>;
  updatePharmacy(id: number, data: Partial<InsertPharmacy>): Promise<Pharmacy | undefined>;
  
  getDeliveryZones(): Promise<DeliveryZone[]>;
  getDeliveryZone(id: number): Promise<DeliveryZone | undefined>;
  createDeliveryZone(zone: InsertDeliveryZone): Promise<DeliveryZone>;
  updateDeliveryZone(id: number, data: Partial<InsertDeliveryZone>): Promise<DeliveryZone | undefined>;
  deleteDeliveryZone(id: number): Promise<boolean>;
  
  getDriverZones(driverId: number): Promise<DriverZone[]>;
  assignDriverToZone(driverId: number, zoneId: number): Promise<DriverZone>;
  removeDriverFromZone(driverId: number, zoneId: number): Promise<boolean>;
  
  getDrivers(): Promise<Driver[]>;
  getDriver(id: number): Promise<Driver | undefined>;
  createDriver(driver: InsertDriver): Promise<Driver>;
  updateDriverLocation(id: number, lat: number, lng: number): Promise<Driver | undefined>;
  updateDriverStatus(id: number, status: string): Promise<Driver | undefined>;
  
  getBatches(): Promise<DeliveryBatch[]>;
  getBatch(id: number): Promise<DeliveryBatch | undefined>;
  createBatch(batch: InsertDeliveryBatch): Promise<DeliveryBatch>;
  updateBatchStatus(id: number, status: string): Promise<DeliveryBatch | undefined>;
  
  getDeliveriesByBatch(batchId: number): Promise<Delivery[]>;
  getActiveDeliveries(): Promise<Delivery[]>;
  getActiveDeliveriesByZone(zoneId: number): Promise<Delivery[]>;
  getDelivery(id: number): Promise<Delivery | undefined>;
  createDelivery(delivery: InsertDelivery): Promise<Delivery>;
  updateDelivery(id: number, data: Partial<InsertDelivery>): Promise<Delivery | undefined>;
  updateDeliveryCoordinates(id: number, lat: number, lng: number): Promise<Delivery | undefined>;
  updateDeliveryStatus(id: number, status: string): Promise<Delivery | undefined>;
  deleteDelivery(id: number): Promise<boolean>;
  
  getRoutes(): Promise<Route[]>;
  getRoute(id: number): Promise<Route | undefined>;
  getRoutesByDriver(driverId: number): Promise<Route[]>;
  createRoute(route: InsertRoute): Promise<Route>;
  updateRoute(id: number, data: Partial<InsertRoute>): Promise<Route | undefined>;
  assignRouteToDriver(routeId: number, driverId: number): Promise<Route | undefined>;
  dispatchRoute(routeId: number): Promise<Route | undefined>;
  activateRoute(routeId: number): Promise<Route | undefined>;
  
  getRouteStops(routeId: number): Promise<RouteStop[]>;
  getRouteStop(id: number): Promise<RouteStop | undefined>;
  createRouteStop(stop: InsertRouteStop): Promise<RouteStop>;
  updateRouteStop(id: number, data: Partial<InsertRouteStop>): Promise<RouteStop | undefined>;
  updateRouteStopStatus(id: number, status: string): Promise<RouteStop | undefined>;
  completeRouteStop(id: number): Promise<RouteStop | undefined>;
  markPackageScanned(id: number): Promise<RouteStop | undefined>;
  
  recordDriverLocation(driverId: number, lat: number, lng: number): Promise<DriverLocation>;
  
  createDeliveryProof(data: InsertDeliveryProof): Promise<DeliveryProof>;
  getDeliveryProof(stopId: number): Promise<DeliveryProof | undefined>;
  
  createOcrLog(log: InsertOcrLog): Promise<OcrLog>;
  getOcrLogs(deliveryId: number): Promise<OcrLog[]>;
  
  // Prescription methods
  getPrescriptionsByDelivery(deliveryId: number): Promise<Prescription[]>;
  getPrescriptionsByBatch(batchId: number): Promise<Prescription[]>;
  getPrescription(id: number): Promise<Prescription | undefined>;
  getPrescriptionByRxNumber(rxNumber: string, batchId: number): Promise<Prescription | undefined>;
  createPrescription(prescription: InsertPrescription): Promise<Prescription>;
  updatePrescription(id: number, data: Partial<InsertPrescription>): Promise<Prescription | undefined>;
  deletePrescription(id: number): Promise<boolean>;
  
  // Delivery matching methods
  findDeliveryByNormalizedAddress(batchId: number, normalizedHash: string): Promise<Delivery | undefined>;
  findActiveDeliveryByNormalizedAddress(batchId: number, normalizedHash: string): Promise<Delivery | undefined>;
  getNextDeliverySequence(batchId: number): Promise<number>;
  
  // Split/merge delivery methods
  movePrescriptionToDelivery(prescriptionId: number, targetDeliveryId: number): Promise<Prescription | undefined>;
  splitDelivery(sourceDeliveryId: number, prescriptionIds: number[]): Promise<Delivery | undefined>;
  mergeDeliveries(targetDeliveryId: number, sourceDeliveryIds: number[]): Promise<Delivery | undefined>;
}

export type SafeUser = Omit<User, 'password'>;

export class DatabaseStorage implements IStorage {
  async getUser(id: number): Promise<User | undefined> {
    const result = await db.select({
      id: users.id,
      username: users.username,
      role: users.role,
      pharmacyId: users.pharmacyId,
      createdAt: users.createdAt
    }).from(users).where(eq(users.id, id));
    if (!result[0]) return undefined;
    return { ...result[0], password: "" } as User;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const result = await db.select({
      id: users.id,
      username: users.username,
      role: users.role,
      pharmacyId: users.pharmacyId,
      createdAt: users.createdAt
    }).from(users).where(eq(users.username, username));
    if (!result[0]) return undefined;
    return { ...result[0], password: "" } as User;
  }

  async createUser(user: InsertUser): Promise<User> {
    const hashedPassword = await hashPassword(user.password);
    const result = await db.insert(users).values({
      ...user,
      password: hashedPassword
    }).returning({
      id: users.id,
      username: users.username,
      role: users.role,
      pharmacyId: users.pharmacyId,
      createdAt: users.createdAt
    });
    return { ...result[0], password: "" } as User;
  }

  async validateUserPassword(username: string, password: string): Promise<SafeUser | null> {
    const result = await db.select().from(users).where(eq(users.username, username));
    if (!result[0]) return null;
    
    const isValid = await verifyPassword(password, result[0].password);
    if (!isValid) return null;
    
    const { password: _, ...safeUser } = result[0];
    return safeUser;
  }

  async getUsers(): Promise<SafeUser[]> {
    const result = await db.select({
      id: users.id,
      username: users.username,
      role: users.role,
      pharmacyId: users.pharmacyId,
      createdAt: users.createdAt
    }).from(users).orderBy(desc(users.createdAt));
    return result as SafeUser[];
  }

  async updateUser(id: number, data: { role?: string; pharmacyId?: number | null }): Promise<SafeUser | undefined> {
    const result = await db.update(users)
      .set(data)
      .where(eq(users.id, id))
      .returning({
        id: users.id,
        username: users.username,
        role: users.role,
        pharmacyId: users.pharmacyId,
        createdAt: users.createdAt
      });
    return result[0] as SafeUser | undefined;
  }

  async deleteUser(id: number): Promise<boolean> {
    const result = await db.delete(users).where(eq(users.id, id)).returning();
    return result.length > 0;
  }

  async getPharmacies(): Promise<Pharmacy[]> {
    return db.select().from(pharmacies).orderBy(desc(pharmacies.createdAt));
  }

  async getPharmacy(id: number): Promise<Pharmacy | undefined> {
    const result = await db.select().from(pharmacies).where(eq(pharmacies.id, id));
    return result[0];
  }

  async createPharmacy(pharmacy: InsertPharmacy): Promise<Pharmacy> {
    const result = await db.insert(pharmacies).values(pharmacy).returning();
    return result[0];
  }

  async updatePharmacy(id: number, data: Partial<InsertPharmacy>): Promise<Pharmacy | undefined> {
    const result = await db.update(pharmacies)
      .set(data)
      .where(eq(pharmacies.id, id))
      .returning();
    return result[0];
  }

  async getDeliveryZones(): Promise<DeliveryZone[]> {
    return db.select().from(deliveryZones).orderBy(desc(deliveryZones.createdAt));
  }

  async getDeliveryZone(id: number): Promise<DeliveryZone | undefined> {
    const result = await db.select().from(deliveryZones).where(eq(deliveryZones.id, id));
    return result[0];
  }

  async createDeliveryZone(zone: InsertDeliveryZone): Promise<DeliveryZone> {
    const result = await db.insert(deliveryZones).values(zone).returning();
    return result[0];
  }

  async updateDeliveryZone(id: number, data: Partial<InsertDeliveryZone>): Promise<DeliveryZone | undefined> {
    const result = await db.update(deliveryZones)
      .set(data)
      .where(eq(deliveryZones.id, id))
      .returning();
    return result[0];
  }

  async deleteDeliveryZone(id: number): Promise<boolean> {
    const result = await db.delete(deliveryZones).where(eq(deliveryZones.id, id)).returning();
    return result.length > 0;
  }

  async getDriverZones(driverId: number): Promise<DriverZone[]> {
    return db.select().from(driverZones).where(eq(driverZones.driverId, driverId));
  }

  async assignDriverToZone(driverId: number, zoneId: number): Promise<DriverZone> {
    const result = await db.insert(driverZones).values({ driverId, zoneId }).returning();
    return result[0];
  }

  async removeDriverFromZone(driverId: number, zoneId: number): Promise<boolean> {
    const result = await db.delete(driverZones)
      .where(and(eq(driverZones.driverId, driverId), eq(driverZones.zoneId, zoneId)))
      .returning();
    return result.length > 0;
  }

  async getDrivers(): Promise<Driver[]> {
    return db.select().from(drivers).orderBy(desc(drivers.createdAt));
  }

  async getDriver(id: number): Promise<Driver | undefined> {
    const result = await db.select().from(drivers).where(eq(drivers.id, id));
    return result[0];
  }

  async createDriver(driver: InsertDriver): Promise<Driver> {
    const result = await db.insert(drivers).values(driver).returning();
    return result[0];
  }

  async updateDriverLocation(id: number, lat: number, lng: number): Promise<Driver | undefined> {
    const result = await db.update(drivers)
      .set({ currentLat: lat, currentLng: lng, lastLocationUpdate: new Date() })
      .where(eq(drivers.id, id))
      .returning();
    return result[0];
  }

  async updateDriverStatus(id: number, status: string): Promise<Driver | undefined> {
    const result = await db.update(drivers)
      .set({ status })
      .where(eq(drivers.id, id))
      .returning();
    return result[0];
  }

  async getBatches(): Promise<DeliveryBatch[]> {
    return db.select().from(deliveryBatches).orderBy(desc(deliveryBatches.createdAt));
  }

  async getBatch(id: number): Promise<DeliveryBatch | undefined> {
    const result = await db.select().from(deliveryBatches).where(eq(deliveryBatches.id, id));
    return result[0];
  }

  async createBatch(batch: InsertDeliveryBatch): Promise<DeliveryBatch> {
    const result = await db.insert(deliveryBatches).values(batch).returning();
    return result[0];
  }

  async updateBatchStatus(id: number, status: string): Promise<DeliveryBatch | undefined> {
    const result = await db.update(deliveryBatches)
      .set({ status })
      .where(eq(deliveryBatches.id, id))
      .returning();
    return result[0];
  }

  async getDeliveriesByBatch(batchId: number): Promise<Delivery[]> {
    return db.select().from(deliveries).where(eq(deliveries.batchId, batchId));
  }

  async getActiveDeliveries(): Promise<Delivery[]> {
    return db.select().from(deliveries).where(
      and(
        notInArray(deliveries.status, ['complete', 'cancelled']),
        isNotNull(deliveries.lat),
        isNotNull(deliveries.lng)
      )
    );
  }

  async getActiveDeliveriesByZone(zoneId: number): Promise<Delivery[]> {
    // Get the zone to find its center and radius
    const zone = await this.getDeliveryZone(zoneId);
    if (!zone) {
      return [];
    }

    // Get all active deliveries with coordinates
    const allActiveDeliveries = await db.select().from(deliveries).where(
      and(
        notInArray(deliveries.status, ['complete', 'cancelled']),
        isNotNull(deliveries.lat),
        isNotNull(deliveries.lng)
      )
    );

    // Filter deliveries within the zone's radius using Haversine formula
    const centerLat = Number(zone.centerLat);
    const centerLng = Number(zone.centerLng);
    const radiusMeters = zone.radiusMeters;

    return allActiveDeliveries.filter(delivery => {
      if (!delivery.lat || !delivery.lng) return false;
      
      const deliveryLat = Number(delivery.lat);
      const deliveryLng = Number(delivery.lng);
      
      // Haversine formula to calculate distance
      const R = 6371000; // Earth's radius in meters
      const dLat = (deliveryLat - centerLat) * Math.PI / 180;
      const dLng = (deliveryLng - centerLng) * Math.PI / 180;
      const a = 
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(centerLat * Math.PI / 180) * Math.cos(deliveryLat * Math.PI / 180) *
        Math.sin(dLng / 2) * Math.sin(dLng / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      const distance = R * c;

      return distance <= radiusMeters;
    });
  }

  async getDelivery(id: number): Promise<Delivery | undefined> {
    const result = await db.select().from(deliveries).where(eq(deliveries.id, id));
    return result[0];
  }

  async createDelivery(delivery: InsertDelivery): Promise<Delivery> {
    const result = await db.insert(deliveries).values(delivery).returning();
    return result[0];
  }

  async updateDelivery(id: number, data: Partial<InsertDelivery>): Promise<Delivery | undefined> {
    const result = await db.update(deliveries)
      .set(data)
      .where(eq(deliveries.id, id))
      .returning();
    return result[0];
  }

  async updateDeliveryCoordinates(id: number, lat: number, lng: number): Promise<Delivery | undefined> {
    const result = await db.update(deliveries)
      .set({ lat, lng })
      .where(eq(deliveries.id, id))
      .returning();
    return result[0];
  }

  async updateDeliveryStatus(id: number, status: string): Promise<Delivery | undefined> {
    const result = await db.update(deliveries)
      .set({ status })
      .where(eq(deliveries.id, id))
      .returning();
    return result[0];
  }

  async deleteDelivery(id: number): Promise<boolean> {
    const result = await db.delete(deliveries).where(eq(deliveries.id, id)).returning();
    return result.length > 0;
  }

  async getRoutes(): Promise<Route[]> {
    return db.select().from(routes).orderBy(desc(routes.createdAt));
  }

  async getRoute(id: number): Promise<Route | undefined> {
    const result = await db.select().from(routes).where(eq(routes.id, id));
    return result[0];
  }

  async getRoutesByDriver(driverId: number): Promise<Route[]> {
    return db.select().from(routes)
      .where(eq(routes.driverId, driverId))
      .orderBy(desc(routes.createdAt));
  }

  async createRoute(route: InsertRoute): Promise<Route> {
    const result = await db.insert(routes).values(route).returning();
    return result[0];
  }

  async updateRoute(id: number, data: Partial<InsertRoute>): Promise<Route | undefined> {
    const result = await db.update(routes)
      .set(data)
      .where(eq(routes.id, id))
      .returning();
    return result[0];
  }

  async assignRouteToDriver(routeId: number, driverId: number): Promise<Route | undefined> {
    const result = await db.update(routes)
      .set({ driverId, status: "assigned" })
      .where(eq(routes.id, routeId))
      .returning();
    return result[0];
  }

  async dispatchRoute(routeId: number): Promise<Route | undefined> {
    const result = await db.update(routes)
      .set({ status: "dispatched", dispatchedAt: new Date() })
      .where(eq(routes.id, routeId))
      .returning();
    return result[0];
  }

  async activateRoute(routeId: number): Promise<Route | undefined> {
    const result = await db.update(routes)
      .set({ status: "active", activatedAt: new Date() })
      .where(eq(routes.id, routeId))
      .returning();
    return result[0];
  }

  async getRouteStops(routeId: number): Promise<RouteStop[]> {
    return db.select().from(routeStops)
      .where(eq(routeStops.routeId, routeId))
      .orderBy(routeStops.sequence);
  }

  async getRouteStop(id: number): Promise<RouteStop | undefined> {
    const result = await db.select().from(routeStops).where(eq(routeStops.id, id));
    return result[0];
  }

  async createRouteStop(stop: InsertRouteStop): Promise<RouteStop> {
    const result = await db.insert(routeStops).values(stop).returning();
    return result[0];
  }

  async updateRouteStop(id: number, data: Partial<InsertRouteStop>): Promise<RouteStop | undefined> {
    const result = await db.update(routeStops)
      .set(data)
      .where(eq(routeStops.id, id))
      .returning();
    return result[0];
  }

  async updateRouteStopStatus(id: number, status: string): Promise<RouteStop | undefined> {
    const result = await db.update(routeStops)
      .set({ status })
      .where(eq(routeStops.id, id))
      .returning();
    return result[0];
  }

  async completeRouteStop(id: number): Promise<RouteStop | undefined> {
    const result = await db.update(routeStops)
      .set({ status: "completed", actualArrival: new Date() })
      .where(eq(routeStops.id, id))
      .returning();
    return result[0];
  }

  async markPackageScanned(id: number): Promise<RouteStop | undefined> {
    const result = await db.update(routeStops)
      .set({ packageScanned: true })
      .where(eq(routeStops.id, id))
      .returning();
    return result[0];
  }

  async recordDriverLocation(driverId: number, lat: number, lng: number): Promise<DriverLocation> {
    const result = await db.insert(driverLocations).values({
      driverId,
      lat,
      lng,
    }).returning();
    
    await this.updateDriverLocation(driverId, lat, lng);
    
    return result[0];
  }

  async createDeliveryProof(data: InsertDeliveryProof): Promise<DeliveryProof> {
    const result = await db.insert(deliveryProofs).values(data).returning();
    return result[0];
  }

  async getDeliveryProof(stopId: number): Promise<DeliveryProof | undefined> {
    const result = await db.select().from(deliveryProofs).where(eq(deliveryProofs.stopId, stopId));
    return result[0];
  }

  async createOcrLog(log: InsertOcrLog): Promise<OcrLog> {
    const result = await db.insert(ocrLogs).values(log).returning();
    return result[0];
  }

  async getOcrLogs(deliveryId: number): Promise<OcrLog[]> {
    return db.select().from(ocrLogs)
      .where(eq(ocrLogs.deliveryId, deliveryId))
      .orderBy(desc(ocrLogs.createdAt));
  }

  // Prescription methods
  async getPrescriptionsByDelivery(deliveryId: number): Promise<Prescription[]> {
    return db.select().from(prescriptions)
      .where(eq(prescriptions.deliveryId, deliveryId))
      .orderBy(desc(prescriptions.createdAt));
  }

  async getPrescriptionsByBatch(batchId: number): Promise<Prescription[]> {
    return db.select().from(prescriptions)
      .where(eq(prescriptions.batchId, batchId))
      .orderBy(desc(prescriptions.createdAt));
  }

  async getPrescription(id: number): Promise<Prescription | undefined> {
    const result = await db.select().from(prescriptions).where(eq(prescriptions.id, id));
    return result[0];
  }

  async getPrescriptionByRxNumber(rxNumber: string, batchId: number): Promise<Prescription | undefined> {
    const result = await db.select().from(prescriptions)
      .where(and(
        eq(prescriptions.rxNumber, rxNumber),
        eq(prescriptions.batchId, batchId)
      ));
    return result[0];
  }

  async createPrescription(prescription: InsertPrescription): Promise<Prescription> {
    const result = await db.insert(prescriptions).values(prescription).returning();
    return result[0];
  }

  async updatePrescription(id: number, data: Partial<InsertPrescription>): Promise<Prescription | undefined> {
    const result = await db.update(prescriptions)
      .set(data)
      .where(eq(prescriptions.id, id))
      .returning();
    return result[0];
  }

  async deletePrescription(id: number): Promise<boolean> {
    const result = await db.delete(prescriptions).where(eq(prescriptions.id, id)).returning();
    return result.length > 0;
  }

  // Delivery matching methods
  async findDeliveryByNormalizedAddress(batchId: number, normalizedHash: string): Promise<Delivery | undefined> {
    const result = await db.select().from(deliveries)
      .where(and(
        eq(deliveries.batchId, batchId),
        eq(deliveries.normalizedAddressHash, normalizedHash)
      ));
    return result[0];
  }

  // Find active (non-completed, non-cancelled) delivery by normalized address - for consolidation
  async findActiveDeliveryByNormalizedAddress(batchId: number, normalizedHash: string): Promise<Delivery | undefined> {
    const result = await db.select().from(deliveries)
      .where(and(
        eq(deliveries.batchId, batchId),
        eq(deliveries.normalizedAddressHash, normalizedHash),
        notInArray(deliveries.status, ['complete', 'completed', 'cancelled'])
      ));
    return result[0];
  }

  async getNextDeliverySequence(batchId: number): Promise<number> {
    const result = await db.select().from(deliveries)
      .where(eq(deliveries.batchId, batchId));
    return result.length + 1;
  }

  // Split/merge delivery methods
  async movePrescriptionToDelivery(prescriptionId: number, targetDeliveryId: number): Promise<Prescription | undefined> {
    const result = await db.update(prescriptions)
      .set({ deliveryId: targetDeliveryId })
      .where(eq(prescriptions.id, prescriptionId))
      .returning();
    return result[0];
  }

  async splitDelivery(sourceDeliveryId: number, prescriptionIds: number[]): Promise<Delivery | undefined> {
    // Get the source delivery
    const sourceDelivery = await this.getDelivery(sourceDeliveryId);
    if (!sourceDelivery || !sourceDelivery.batchId) return undefined;

    // Get the next sequence number for the new delivery
    const sequence = await this.getNextDeliverySequence(sourceDelivery.batchId);
    const year = new Date().getFullYear();
    const deliveryIdentifier = `DEL-${year}-${sequence.toString().padStart(6, '0')}`;

    // Create a new delivery with the same address info
    const newDelivery = await db.insert(deliveries).values({
      batchId: sourceDelivery.batchId,
      deliveryIdentifier,
      addressText: sourceDelivery.addressText,
      streetAddress: sourceDelivery.streetAddress,
      city: sourceDelivery.city,
      state: sourceDelivery.state,
      zipCode: sourceDelivery.zipCode,
      normalizedAddressHash: sourceDelivery.normalizedAddressHash,
      customerName: sourceDelivery.customerName,
      customerPhone: sourceDelivery.customerPhone,
      lat: sourceDelivery.lat,
      lng: sourceDelivery.lng,
      status: sourceDelivery.status,
    }).returning();

    if (!newDelivery[0]) return undefined;

    // Move the specified prescriptions to the new delivery
    for (const prescriptionId of prescriptionIds) {
      await this.movePrescriptionToDelivery(prescriptionId, newDelivery[0].id);
    }

    return newDelivery[0];
  }

  async mergeDeliveries(targetDeliveryId: number, sourceDeliveryIds: number[]): Promise<Delivery | undefined> {
    // Get target delivery
    const targetDelivery = await this.getDelivery(targetDeliveryId);
    if (!targetDelivery) return undefined;

    // Move all prescriptions from source deliveries to target
    for (const sourceId of sourceDeliveryIds) {
      const sourcePrescriptions = await this.getPrescriptionsByDelivery(sourceId);
      for (const prescription of sourcePrescriptions) {
        await this.movePrescriptionToDelivery(prescription.id, targetDeliveryId);
      }
      // Delete the source delivery after moving prescriptions
      await this.deleteDelivery(sourceId);
    }

    return targetDelivery;
  }
}

export const storage = new DatabaseStorage();
