import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import {
  eq,
  and,
  or,
  desc,
  inArray,
  notInArray,
  isNotNull,
  isNull,
  ne,
  sql as drizzleSql,
  like,
} from "drizzle-orm";
import bcrypt from "bcrypt";
import {
  users,
  drivers,
  deliveryBatches,
  deliveries,
  routes,
  routeStops,
  driverLocations,
  deliveryProofs,
  pharmacies,
  deliveryZones,
  driverZones,
  ocrLogs,
  prescriptions,
  deliveryIdCounters,
  deliveryOrders,
  deliveryOrderUploads,
  billingTiers,
  invoices,
  invoiceItems,
  type User,
  type InsertUser,
  type Driver,
  type InsertDriver,
  type DeliveryBatch,
  type InsertDeliveryBatch,
  type Delivery,
  type InsertDelivery,
  type Route,
  type InsertRoute,
  type RouteStop,
  type InsertRouteStop,
  type DriverLocation,
  type Pharmacy,
  type InsertPharmacy,
  type DeliveryZone,
  type InsertDeliveryZone,
  type DriverZone,
  type InsertDriverZone,
  type DeliveryProof,
  type InsertDeliveryProof,
  type OcrLog,
  type InsertOcrLog,
  type Prescription,
  type InsertPrescription,
  type DeliveryOrder,
  type InsertDeliveryOrder,
  type DeliveryOrderUpload,
  type InsertDeliveryOrderUpload,
  type InsertBillingTier,
  type InsertInvoice,
  type InsertInvoiceItem,
} from "@shared/schema";

const sql = neon(process.env.DATABASE_URL!);
export const db = drizzle(sql);

const SALT_ROUNDS = 10;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  getPharmacies(): Promise<Pharmacy[]>;
  getPharmacy(id: number): Promise<Pharmacy | undefined>;
  createPharmacy(pharmacy: InsertPharmacy): Promise<Pharmacy>;
  updatePharmacy(
    id: number,
    data: Partial<InsertPharmacy>,
  ): Promise<Pharmacy | undefined>;

  getDeliveryZones(): Promise<DeliveryZone[]>;
  getDeliveryZone(id: number): Promise<DeliveryZone | undefined>;
  createDeliveryZone(zone: InsertDeliveryZone): Promise<DeliveryZone>;
  updateDeliveryZone(
    id: number,
    data: Partial<InsertDeliveryZone>,
  ): Promise<DeliveryZone | undefined>;
  deleteDeliveryZone(id: number): Promise<boolean>;

  getDriverZones(driverId: number): Promise<DriverZone[]>;
  assignDriverToZone(driverId: number, zoneId: number): Promise<DriverZone>;
  removeDriverFromZone(driverId: number, zoneId: number): Promise<boolean>;

  getDrivers(): Promise<Driver[]>;
  getDriver(id: number): Promise<Driver | undefined>;
  createDriver(driver: InsertDriver): Promise<Driver>;
  updateDriverLocation(
    id: number,
    lat: number,
    lng: number,
  ): Promise<Driver | undefined>;
  updateDriverStatus(id: number, status: string): Promise<Driver | undefined>;

  getBatches(): Promise<DeliveryBatch[]>;
  getBatch(id: number): Promise<DeliveryBatch | undefined>;
  createBatch(batch: InsertDeliveryBatch): Promise<DeliveryBatch>;
  updateBatchStatus(
    id: number,
    status: string,
  ): Promise<DeliveryBatch | undefined>;

  getDeliveriesByBatch(batchId: number): Promise<Delivery[]>;
  getActiveDeliveries(): Promise<Delivery[]>;
  getActiveDeliveriesByZone(zoneId: number): Promise<Delivery[]>;
  getDelivery(id: number): Promise<Delivery | undefined>;
  createDelivery(delivery: InsertDelivery): Promise<Delivery>;
  updateDelivery(
    id: number,
    data: Partial<InsertDelivery>,
  ): Promise<Delivery | undefined>;
  updateDeliveryCoordinates(
    id: number,
    lat: number,
    lng: number,
  ): Promise<Delivery | undefined>;
  updateDeliveryStatus(
    id: number,
    status: string,
  ): Promise<Delivery | undefined>;
  deleteDelivery(id: number): Promise<boolean>;

  getRoutes(): Promise<Route[]>;
  getRoute(id: number): Promise<Route | undefined>;
  getRoutesByDriver(driverId: number): Promise<Route[]>;
  createRoute(route: InsertRoute): Promise<Route>;
  updateRoute(
    id: number,
    data: Partial<InsertRoute>,
  ): Promise<Route | undefined>;
  assignRouteToDriver(
    routeId: number,
    driverId: number,
  ): Promise<Route | undefined>;
  dispatchRoute(routeId: number): Promise<Route | undefined>;
  activateRoute(routeId: number): Promise<Route | undefined>;

  getRouteStops(routeId: number): Promise<RouteStop[]>;
  getRouteStop(id: number): Promise<RouteStop | undefined>;
  createRouteStop(stop: InsertRouteStop): Promise<RouteStop>;
  updateRouteStop(
    id: number,
    data: Partial<InsertRouteStop>,
  ): Promise<RouteStop | undefined>;
  updateRouteStopStatus(
    id: number,
    status: string,
  ): Promise<RouteStop | undefined>;
  completeRouteStop(id: number): Promise<RouteStop | undefined>;
  markPackageScanned(id: number): Promise<RouteStop | undefined>;

  recordDriverLocation(
    driverId: number,
    lat: number,
    lng: number,
  ): Promise<DriverLocation>;

  createDeliveryProof(data: InsertDeliveryProof): Promise<DeliveryProof>;
  getDeliveryProof(stopId: number): Promise<DeliveryProof | undefined>;
  getProofByLocalId(localProofId: string): Promise<DeliveryProof | undefined>;
  updateDeliveryProof(
    id: number,
    data: {
      signature?: string | null;
      picture?: string | null;
      signatureUrl?: string | null;
      pictureUrl?: string | null;
      notes?: string | null;
      barcode?: string | null;
      uploadStatus?: string | null;
    },
  ): Promise<DeliveryProof | undefined>;
  getDeliveryProofById(id: number): Promise<DeliveryProof | undefined>;

  createOcrLog(log: InsertOcrLog): Promise<OcrLog>;
  getOcrLogs(deliveryId: number): Promise<OcrLog[]>;

  // Prescription methods
  getPrescriptionsByDelivery(deliveryId: number): Promise<Prescription[]>;
  getPrescriptionsByBatch(batchId: number): Promise<Prescription[]>;
  getPrescription(id: number): Promise<Prescription | undefined>;
  getPrescriptionByRxNumber(
    rxNumber: string,
    batchId: number,
  ): Promise<Prescription | undefined>;
  createPrescription(prescription: InsertPrescription): Promise<Prescription>;
  updatePrescription(
    id: number,
    data: Partial<InsertPrescription>,
  ): Promise<Prescription | undefined>;
  deletePrescription(id: number): Promise<boolean>;

  getDeliveryIdsInActiveRoutes(deliveryIds: number[]): Promise<number[]>;
  cancelRoute(routeId: number): Promise<Route | undefined>;
  deleteRouteStop(stopId: number): Promise<boolean>;
  resequenceRouteStops(routeId: number): Promise<void>;

  // Delivery Orders methods
  getDeliveryOrdersByPharmacy(pharmacyId: number): Promise<DeliveryOrder[]>;
  getDeliveryOrdersByBatch(batchId: number): Promise<DeliveryOrder[]>;
  getDeliveryOrder(id: number): Promise<DeliveryOrder | undefined>;
  findDeliveryOrderByRx(
    pharmacyId: number,
    rxNumber: string,
  ): Promise<DeliveryOrder | undefined>;
  upsertDeliveryOrder(
    data: InsertDeliveryOrder,
    batchId: number,
    fileName?: string,
  ): Promise<{ order: DeliveryOrder; isNew: boolean }>;
  updateDeliveryOrderStatus(
    id: number,
    status: string,
  ): Promise<DeliveryOrder | undefined>;
  cancelDeliveryOrdersByBatch(batchId: number): Promise<void>;
  updateDeliveryOrderDeliveryIdentifier(
    id: number,
    deliveryIdentifier: string,
  ): Promise<DeliveryOrder | undefined>;
  getOrCreateDeliveryIdentifierForAddress(
    order: DeliveryOrder,
  ): Promise<string>;
  getDeliveryOrderUploads(orderId: number): Promise<DeliveryOrderUpload[]>;
  getRouteEligibleOrders(pharmacyId: number): Promise<DeliveryOrder[]>;
  getAllDeliveryOrders(): Promise<DeliveryOrder[]>;

  // Delivery matching methods
  findDeliveryByNormalizedAddress(
    batchId: number,
    normalizedHash: string,
  ): Promise<Delivery | undefined>;
  findActiveDeliveryByNormalizedAddress(
    batchId: number,
    normalizedHash: string,
  ): Promise<Delivery | undefined>;
  getNextDeliverySequence(): Promise<number>;
  generateUniqueDeliveryIdentifier(): Promise<string>;

  // Split/merge delivery methods
  movePrescriptionToDelivery(
    prescriptionId: number,
    targetDeliveryId: number,
  ): Promise<Prescription | undefined>;
  splitDelivery(
    sourceDeliveryId: number,
    prescriptionIds: number[],
  ): Promise<Delivery | undefined>;
  mergeDeliveries(
    targetDeliveryId: number,
    sourceDeliveryIds: number[],
  ): Promise<Delivery | undefined>;
}

export type SafeUser = Omit<User, "password">;

export class DatabaseStorage implements IStorage {
  async getUser(id: number): Promise<User | undefined> {
    const result = await db
      .select({
        id: users.id,
        username: users.username,
        role: users.role,
        pharmacyId: users.pharmacyId,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.id, id));
    if (!result[0]) return undefined;
    return { ...result[0], password: "" } as User;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const result = await db
      .select({
        id: users.id,
        username: users.username,
        role: users.role,
        pharmacyId: users.pharmacyId,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.username, username));
    if (!result[0]) return undefined;
    return { ...result[0], password: "" } as User;
  }

  async createUser(user: InsertUser): Promise<User> {
    const hashedPassword = await hashPassword(user.password);
    const result = await db
      .insert(users)
      .values({
        ...user,
        password: hashedPassword,
      })
      .returning({
        id: users.id,
        username: users.username,
        role: users.role,
        pharmacyId: users.pharmacyId,
        createdAt: users.createdAt,
      });
    return { ...result[0], password: "" } as User;
  }

  async validateUserPassword(
    username: string,
    password: string,
  ): Promise<SafeUser | null> {
    // Case-insensitive username lookup
    const result = await db
      .select()
      .from(users)
      .where(drizzleSql`LOWER(${users.username}) = LOWER(${username})`);
    if (!result[0]) return null;

    const isValid = await verifyPassword(password, result[0].password);
    if (!isValid) return null;

    const { password: _, ...safeUser } = result[0];
    return safeUser;
  }

  async validateDriverPassword(
    username: string,
    password: string,
  ): Promise<Driver | null> {
    // Case-insensitive username lookup
    const result = await db
      .select()
      .from(drivers)
      .where(drizzleSql`LOWER(${drivers.username}) = LOWER(${username})`);
    if (!result[0] || !result[0].password) return null;

    const isValid = await verifyPassword(password, result[0].password);
    if (!isValid) return null;

    const { password: _, ...safeDriver } = result[0];
    return safeDriver as Driver;
  }

  async setDriverCredentials(
    driverId: number,
    username: string,
    password: string,
  ): Promise<Driver | undefined> {
    const hashedPassword = await hashPassword(password);
    const result = await db
      .update(drivers)
      .set({ username, password: hashedPassword })
      .where(eq(drivers.id, driverId))
      .returning();
    return result[0];
  }

  async getUsers(): Promise<SafeUser[]> {
    const result = await db
      .select({
        id: users.id,
        username: users.username,
        role: users.role,
        pharmacyId: users.pharmacyId,
        createdAt: users.createdAt,
      })
      .from(users)
      .orderBy(desc(users.createdAt));
    return result as SafeUser[];
  }

  async updateUser(
    id: number,
    data: { role?: string; pharmacyId?: number | null },
  ): Promise<SafeUser | undefined> {
    const result = await db
      .update(users)
      .set(data)
      .where(eq(users.id, id))
      .returning({
        id: users.id,
        username: users.username,
        role: users.role,
        pharmacyId: users.pharmacyId,
        createdAt: users.createdAt,
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
    const result = await db
      .select()
      .from(pharmacies)
      .where(eq(pharmacies.id, id));
    return result[0];
  }

  async createPharmacy(pharmacy: InsertPharmacy): Promise<Pharmacy> {
    const result = await db.insert(pharmacies).values(pharmacy).returning();
    return result[0];
  }

  async updatePharmacy(
    id: number,
    data: Partial<InsertPharmacy>,
  ): Promise<Pharmacy | undefined> {
    const result = await db
      .update(pharmacies)
      .set(data)
      .where(eq(pharmacies.id, id))
      .returning();
    return result[0];
  }

  async getDeliveryZones(): Promise<DeliveryZone[]> {
    return db
      .select()
      .from(deliveryZones)
      .orderBy(desc(deliveryZones.createdAt));
  }

  async getDeliveryZone(id: number): Promise<DeliveryZone | undefined> {
    const result = await db
      .select()
      .from(deliveryZones)
      .where(eq(deliveryZones.id, id));
    return result[0];
  }

  async createDeliveryZone(zone: InsertDeliveryZone): Promise<DeliveryZone> {
    const result = await db.insert(deliveryZones).values(zone).returning();
    return result[0];
  }

  async updateDeliveryZone(
    id: number,
    data: Partial<InsertDeliveryZone>,
  ): Promise<DeliveryZone | undefined> {
    const result = await db
      .update(deliveryZones)
      .set(data)
      .where(eq(deliveryZones.id, id))
      .returning();
    return result[0];
  }

  async deleteDeliveryZone(id: number): Promise<boolean> {
    await db.delete(driverZones).where(eq(driverZones.zoneId, id));
    const result = await db
      .delete(deliveryZones)
      .where(eq(deliveryZones.id, id))
      .returning();
    return result.length > 0;
  }

  async getDriverZones(driverId: number): Promise<DriverZone[]> {
    return db
      .select()
      .from(driverZones)
      .where(eq(driverZones.driverId, driverId));
  }

  async assignDriverToZone(
    driverId: number,
    zoneId: number,
  ): Promise<DriverZone> {
    const result = await db
      .insert(driverZones)
      .values({ driverId, zoneId })
      .returning();
    return result[0];
  }

  async removeDriverFromZone(
    driverId: number,
    zoneId: number,
  ): Promise<boolean> {
    const result = await db
      .delete(driverZones)
      .where(
        and(eq(driverZones.driverId, driverId), eq(driverZones.zoneId, zoneId)),
      )
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

  async updateDriverLocation(
    id: number,
    lat: number,
    lng: number,
  ): Promise<Driver | undefined> {
    const result = await db
      .update(drivers)
      .set({ currentLat: lat, currentLng: lng, lastLocationUpdate: new Date() })
      .where(eq(drivers.id, id))
      .returning();
    return result[0];
  }

  async updateDriverStatus(
    id: number,
    status: string,
  ): Promise<Driver | undefined> {
    const result = await db
      .update(drivers)
      .set({ status })
      .where(eq(drivers.id, id))
      .returning();
    return result[0];
  }

  async getBatches(): Promise<DeliveryBatch[]> {
    return db
      .select()
      .from(deliveryBatches)
      .orderBy(desc(deliveryBatches.createdAt));
  }

  async getBatchesByPharmacy(pharmacyId: number): Promise<DeliveryBatch[]> {
    return db
      .select()
      .from(deliveryBatches)
      .where(eq(deliveryBatches.pharmacyId, pharmacyId))
      .orderBy(desc(deliveryBatches.createdAt));
  }

  async getBatch(id: number): Promise<DeliveryBatch | undefined> {
    const result = await db
      .select()
      .from(deliveryBatches)
      .where(eq(deliveryBatches.id, id));
    return result[0];
  }

  async createBatch(batch: InsertDeliveryBatch): Promise<DeliveryBatch> {
    const result = await db.insert(deliveryBatches).values(batch).returning();
    return result[0];
  }

  async updateBatchStatus(
    id: number,
    status: string,
  ): Promise<DeliveryBatch | undefined> {
    const result = await db
      .update(deliveryBatches)
      .set({ status })
      .where(eq(deliveryBatches.id, id))
      .returning();
    return result[0];
  }

  async getDeliveriesByBatch(batchId: number): Promise<Delivery[]> {
    return db.select().from(deliveries).where(eq(deliveries.batchId, batchId));
  }

  async getActiveDeliveries(): Promise<Delivery[]> {
    return db
      .select()
      .from(deliveries)
      .where(
        and(
          eq(deliveries.routingEligible, true),
          notInArray(deliveries.status, ["complete", "cancelled"]),
          isNotNull(deliveries.lat),
          isNotNull(deliveries.lng),
        ),
      );
  }

  async getActiveDeliveriesByPharmacy(pharmacyId: number): Promise<Delivery[]> {
    // Get batch IDs for this pharmacy
    const pharmacyBatches = await this.getBatchesByPharmacy(pharmacyId);
    const batchIds = pharmacyBatches.map((b) => b.id);

    if (batchIds.length === 0) {
      return [];
    }

    return db
      .select()
      .from(deliveries)
      .where(
        and(
          eq(deliveries.routingEligible, true),
          inArray(deliveries.batchId, batchIds),
          notInArray(deliveries.status, ["complete", "cancelled"]),
          isNotNull(deliveries.lat),
          isNotNull(deliveries.lng),
        ),
      );
  }

  async getRoutesByPharmacy(pharmacyId: number): Promise<Route[]> {
    // Get batch IDs for this pharmacy
    const pharmacyBatches = await this.getBatchesByPharmacy(pharmacyId);
    const batchIds = pharmacyBatches.map((b) => b.id);

    if (batchIds.length === 0) {
      return [];
    }

    return db
      .select()
      .from(routes)
      .where(inArray(routes.batchId, batchIds))
      .orderBy(desc(routes.createdAt));
  }

  async getDeliveriesByPharmacy(pharmacyId: number): Promise<Delivery[]> {
    // Get batch IDs for this pharmacy
    const pharmacyBatches = await this.getBatchesByPharmacy(pharmacyId);
    const batchIds = pharmacyBatches.map((b) => b.id);

    if (batchIds.length === 0) {
      return [];
    }

    return db
      .select()
      .from(deliveries)
      .where(inArray(deliveries.batchId, batchIds))
      .orderBy(desc(deliveries.createdAt));
  }

  async getRouteStopByDeliveryId(
    deliveryId: number,
  ): Promise<RouteStop | undefined> {
    const result = await db
      .select()
      .from(routeStops)
      .where(eq(routeStops.deliveryId, deliveryId))
      .limit(1);
    return result[0];
  }

  async getActiveDeliveriesByZone(zoneId: number): Promise<Delivery[]> {
    // Get the zone to find its center and radius
    const zone = await this.getDeliveryZone(zoneId);
    if (!zone) {
      return [];
    }

    // Get all active deliveries with coordinates and routing eligible
    const allActiveDeliveries = await db
      .select()
      .from(deliveries)
      .where(
        and(
          eq(deliveries.routingEligible, true),
          notInArray(deliveries.status, ["complete", "cancelled"]),
          isNotNull(deliveries.lat),
          isNotNull(deliveries.lng),
        ),
      );

    // Filter deliveries within the zone's radius using Haversine formula
    const centerLat = Number(zone.centerLat);
    const centerLng = Number(zone.centerLng);
    const radiusMeters = zone.radiusMeters;

    return allActiveDeliveries.filter((delivery) => {
      if (!delivery.lat || !delivery.lng) return false;

      const deliveryLat = Number(delivery.lat);
      const deliveryLng = Number(delivery.lng);

      // Haversine formula to calculate distance
      const R = 6371000; // Earth's radius in meters
      const dLat = ((deliveryLat - centerLat) * Math.PI) / 180;
      const dLng = ((deliveryLng - centerLng) * Math.PI) / 180;
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((centerLat * Math.PI) / 180) *
          Math.cos((deliveryLat * Math.PI) / 180) *
          Math.sin(dLng / 2) *
          Math.sin(dLng / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      const distance = R * c;

      return distance <= radiusMeters;
    });
  }

  async getDelivery(id: number): Promise<Delivery | undefined> {
    const result = await db
      .select()
      .from(deliveries)
      .where(eq(deliveries.id, id));
    return result[0];
  }

  async getDeliveries(): Promise<Delivery[]> {
    return db.select().from(deliveries).orderBy(desc(deliveries.createdAt));
  }

  async createDelivery(delivery: InsertDelivery): Promise<Delivery> {
    const result = await db.insert(deliveries).values(delivery).returning();
    return result[0];
  }

  async updateDelivery(
    id: number,
    data: Partial<InsertDelivery>,
  ): Promise<Delivery | undefined> {
    const result = await db
      .update(deliveries)
      .set(data)
      .where(eq(deliveries.id, id))
      .returning();
    return result[0];
  }

  async updateDeliveryCoordinates(
    id: number,
    lat: number,
    lng: number,
  ): Promise<Delivery | undefined> {
    const result = await db
      .update(deliveries)
      .set({ lat, lng })
      .where(eq(deliveries.id, id))
      .returning();
    return result[0];
  }

  async updateDeliveryStatus(
    id: number,
    status: string,
  ): Promise<Delivery | undefined> {
    const result = await db
      .update(deliveries)
      .set({ status })
      .where(eq(deliveries.id, id))
      .returning();
    return result[0];
  }

  async deleteDelivery(id: number): Promise<boolean> {
    // Delete associated prescriptions first (foreign key constraint)
    await db.delete(prescriptions).where(eq(prescriptions.deliveryId, id));

    // Now delete the delivery
    const result = await db
      .delete(deliveries)
      .where(eq(deliveries.id, id))
      .returning();
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
    return db
      .select()
      .from(routes)
      .where(eq(routes.driverId, driverId))
      .orderBy(desc(routes.createdAt));
  }

  async createRoute(route: InsertRoute): Promise<Route> {
    const result = await db.insert(routes).values(route).returning();
    return result[0];
  }

  async updateRoute(
    id: number,
    data: Partial<InsertRoute>,
  ): Promise<Route | undefined> {
    const result = await db
      .update(routes)
      .set(data)
      .where(eq(routes.id, id))
      .returning();

    if (result[0] && (data as any).status === "complete") {
      await db
        .update(deliveryOrders)
        .set({ deliveryStatus: "DELIVERED" })
        .where(
          and(
            eq(deliveryOrders.routeId, id),
            eq(deliveryOrders.deliveryStatus, "ROUTED"),
          ),
        );
    }

    return result[0];
  }

  async assignRouteToDriver(
    routeId: number,
    driverId: number,
  ): Promise<Route | undefined> {
    const result = await db
      .update(routes)
      .set({ driverId, status: "assigned" })
      .where(eq(routes.id, routeId))
      .returning();
    return result[0];
  }

  async dispatchRoute(routeId: number): Promise<Route | undefined> {
    const result = await db
      .update(routes)
      .set({ status: "dispatched", dispatchedAt: new Date() })
      .where(eq(routes.id, routeId))
      .returning();
    return result[0];
  }

  async activateRoute(routeId: number): Promise<Route | undefined> {
    const result = await db
      .update(routes)
      .set({ status: "active", activatedAt: new Date() })
      .where(eq(routes.id, routeId))
      .returning();
    return result[0];
  }

  async getRouteStops(routeId: number): Promise<RouteStop[]> {
    return db
      .select()
      .from(routeStops)
      .where(eq(routeStops.routeId, routeId))
      .orderBy(routeStops.sequence);
  }

  async getRouteStop(id: number): Promise<RouteStop | undefined> {
    const result = await db
      .select()
      .from(routeStops)
      .where(eq(routeStops.id, id));
    return result[0];
  }

  async createRouteStop(stop: InsertRouteStop): Promise<RouteStop> {
    const result = await db.insert(routeStops).values(stop).returning();
    return result[0];
  }

  async updateRouteStop(
    id: number,
    data: Partial<InsertRouteStop>,
  ): Promise<RouteStop | undefined> {
    const result = await db
      .update(routeStops)
      .set(data)
      .where(eq(routeStops.id, id))
      .returning();
    return result[0];
  }

  async updateRouteStopStatus(
    id: number,
    status: string,
  ): Promise<RouteStop | undefined> {
    const result = await db
      .update(routeStops)
      .set({ status })
      .where(eq(routeStops.id, id))
      .returning();
    return result[0];
  }

  async completeRouteStop(id: number): Promise<RouteStop | undefined> {
    const result = await db
      .update(routeStops)
      .set({ status: "completed", actualArrival: new Date() })
      .where(eq(routeStops.id, id))
      .returning();

    // Also mark the delivery as complete so it's removed from open orders
    if (result[0]?.deliveryId) {
      await db
        .update(deliveries)
        .set({ status: "complete" })
        .where(eq(deliveries.id, result[0].deliveryId));
    }

    return result[0];
  }

  async markPackageScanned(id: number): Promise<RouteStop | undefined> {
    const result = await db
      .update(routeStops)
      .set({ packageScanned: true })
      .where(eq(routeStops.id, id))
      .returning();
    return result[0];
  }

  async recordDriverLocation(
    driverId: number,
    lat: number,
    lng: number,
  ): Promise<DriverLocation> {
    const result = await db
      .insert(driverLocations)
      .values({
        driverId,
        lat,
        lng,
      })
      .returning();

    await this.updateDriverLocation(driverId, lat, lng);

    return result[0];
  }

  async createDeliveryProof(data: InsertDeliveryProof): Promise<DeliveryProof> {
    const result = await db.insert(deliveryProofs).values(data).returning();
    return result[0];
  }

  async getDeliveryProof(stopId: number): Promise<DeliveryProof | undefined> {
    const result = await db
      .select()
      .from(deliveryProofs)
      .where(eq(deliveryProofs.stopId, stopId));
    return result[0];
  }

  async getProofByLocalId(
    localProofId: string,
  ): Promise<DeliveryProof | undefined> {
    const result = await db
      .select()
      .from(deliveryProofs)
      .where(eq(deliveryProofs.localProofId, localProofId));
    return result[0];
  }

  async updateDeliveryProof(
    id: number,
    data: {
      signature?: string | null;
      picture?: string | null;
      signatureUrl?: string | null;
      pictureUrl?: string | null;
      notes?: string | null;
      barcode?: string | null;
      uploadStatus?: string | null;
    },
  ): Promise<DeliveryProof | undefined> {
    const updateData: Record<string, any> = {};
    if (data.signature !== undefined) updateData.signature = data.signature;
    if (data.picture !== undefined) updateData.picture = data.picture;
    if (data.signatureUrl !== undefined)
      updateData.signatureUrl = data.signatureUrl;
    if (data.pictureUrl !== undefined) updateData.pictureUrl = data.pictureUrl;
    if (data.notes !== undefined) updateData.notes = data.notes;
    if (data.barcode !== undefined) updateData.barcode = data.barcode;
    if (data.uploadStatus !== undefined)
      updateData.uploadStatus = data.uploadStatus;

    if (Object.keys(updateData).length === 0) {
      return this.getDeliveryProofById(id);
    }

    const result = await db
      .update(deliveryProofs)
      .set(updateData)
      .where(eq(deliveryProofs.id, id))
      .returning();
    return result[0];
  }

  async getDeliveryProofById(id: number): Promise<DeliveryProof | undefined> {
    const result = await db
      .select()
      .from(deliveryProofs)
      .where(eq(deliveryProofs.id, id));
    return result[0];
  }

  async createOcrLog(log: InsertOcrLog): Promise<OcrLog> {
    const result = await db.insert(ocrLogs).values(log).returning();
    return result[0];
  }

  async getOcrLogs(deliveryId: number): Promise<OcrLog[]> {
    return db
      .select()
      .from(ocrLogs)
      .where(eq(ocrLogs.deliveryId, deliveryId))
      .orderBy(desc(ocrLogs.createdAt));
  }

  // Prescription methods
  async getPrescriptionsByDelivery(
    deliveryId: number,
  ): Promise<Prescription[]> {
    return db
      .select()
      .from(prescriptions)
      .where(eq(prescriptions.deliveryId, deliveryId))
      .orderBy(desc(prescriptions.createdAt));
  }

  async getPrescriptionsByBatch(batchId: number): Promise<Prescription[]> {
    return db
      .select()
      .from(prescriptions)
      .where(eq(prescriptions.batchId, batchId))
      .orderBy(desc(prescriptions.createdAt));
  }

  async getPrescription(id: number): Promise<Prescription | undefined> {
    const result = await db
      .select()
      .from(prescriptions)
      .where(eq(prescriptions.id, id));
    return result[0];
  }

  async getPrescriptionByRxNumber(
    rxNumber: string,
    batchId: number,
  ): Promise<Prescription | undefined> {
    const result = await db
      .select()
      .from(prescriptions)
      .where(
        and(
          eq(prescriptions.rxNumber, rxNumber),
          eq(prescriptions.batchId, batchId),
        ),
      );
    return result[0];
  }

  async createPrescription(
    prescription: InsertPrescription,
  ): Promise<Prescription> {
    const result = await db
      .insert(prescriptions)
      .values(prescription)
      .returning();
    return result[0];
  }

  async updatePrescription(
    id: number,
    data: Partial<InsertPrescription>,
  ): Promise<Prescription | undefined> {
    const result = await db
      .update(prescriptions)
      .set(data)
      .where(eq(prescriptions.id, id))
      .returning();
    return result[0];
  }

  async deletePrescription(id: number): Promise<boolean> {
    const result = await db
      .delete(prescriptions)
      .where(eq(prescriptions.id, id))
      .returning();
    return result.length > 0;
  }

  // Delivery matching methods
  async findDeliveryByNormalizedAddress(
    batchId: number,
    normalizedHash: string,
  ): Promise<Delivery | undefined> {
    const result = await db
      .select()
      .from(deliveries)
      .where(
        and(
          eq(deliveries.batchId, batchId),
          eq(deliveries.normalizedAddressHash, normalizedHash),
        ),
      );
    return result[0];
  }

  // Find active (non-completed, non-cancelled) delivery by normalized address - for consolidation
  async findActiveDeliveryByNormalizedAddress(
    batchId: number,
    normalizedHash: string,
  ): Promise<Delivery | undefined> {
    const result = await db
      .select()
      .from(deliveries)
      .where(
        and(
          eq(deliveries.batchId, batchId),
          eq(deliveries.normalizedAddressHash, normalizedHash),
          notInArray(deliveries.status, ["complete", "completed", "cancelled"]),
        ),
      );
    return result[0];
  }

  async getNextDeliverySequence(): Promise<number> {
    // Use atomic INSERT ... ON CONFLICT ... RETURNING pattern to get the next sequence number.
    // This prevents race conditions when multiple concurrent requests try to get the next ID.
    const year = new Date().getFullYear();

    // Atomically increment and return the counter for this year using raw SQL
    // INSERT a row with last_value=1 if year doesn't exist, otherwise increment last_value
    const result = await db.execute(
      drizzleSql`INSERT INTO delivery_id_counters (year, last_value) 
                 VALUES (${year}, 1) 
                 ON CONFLICT (year) 
                 DO UPDATE SET last_value = delivery_id_counters.last_value + 1 
                 RETURNING last_value`,
    );

    // Extract the returned value from the result
    const rows = result.rows as Array<{ last_value: number }>;
    if (rows && rows.length > 0) {
      return rows[0].last_value;
    }

    // Fallback: should never reach here, but query existing max as backup
    const fallback = await db
      .select({ deliveryIdentifier: deliveries.deliveryIdentifier })
      .from(deliveries)
      .where(like(deliveries.deliveryIdentifier, `DEL${year}%`))
      .orderBy(desc(deliveries.deliveryIdentifier))
      .limit(1);

    if (fallback.length === 0 || !fallback[0].deliveryIdentifier) {
      return 1;
    }

    const currentId = fallback[0].deliveryIdentifier;
    const sequenceStr = currentId.substring(7);
    return (parseInt(sequenceStr, 10) || 0) + 1;
  }

  async generateUniqueDeliveryIdentifier(): Promise<string> {
    // Generate a unique delivery identifier using atomic counter.
    const year = new Date().getFullYear();
    const sequence = await this.getNextDeliverySequence();
    return `DEL${year}${sequence.toString().padStart(6, "0")}`;
  }

  async getDeliveryIdsInActiveRoutes(deliveryIds: number[]): Promise<number[]> {
    if (deliveryIds.length === 0) return [];
    const result = await db
      .select({ deliveryId: routeStops.deliveryId })
      .from(routeStops)
      .innerJoin(routes, eq(routeStops.routeId, routes.id))
      .where(
        and(
          inArray(routeStops.deliveryId, deliveryIds),
          drizzleSql`${routes.status} != 'cancelled'`,
          drizzleSql`${routeStops.status} NOT IN ('cancelled', 'completed')`,
        ),
      );
    return result
      .map((r) => r.deliveryId)
      .filter((id): id is number => id !== null);
  }

  async cancelRoute(routeId: number): Promise<Route | undefined> {
    const updatedRoute = await db
      .update(routes)
      .set({ status: "cancelled" })
      .where(eq(routes.id, routeId))
      .returning();
    if (!updatedRoute[0]) return undefined;

    const stops = await this.getRouteStops(routeId);
    for (const stop of stops) {
      if (stop.status !== "completed" && stop.status !== "cancelled") {
        await db
          .update(routeStops)
          .set({ status: "cancelled" })
          .where(eq(routeStops.id, stop.id));
        if (stop.deliveryId) {
          await db
            .update(deliveries)
            .set({ status: "geocoded" })
            .where(eq(deliveries.id, stop.deliveryId));
        }
      }
    }

    await db
      .update(deliveryOrders)
      .set({ deliveryStatus: "CANCELLED" })
      .where(
        and(
          eq(deliveryOrders.routeId, routeId),
          notInArray(deliveryOrders.deliveryStatus, ["DELIVERED", "CANCELLED"]),
        ),
      );

    return updatedRoute[0];
  }

  // Split/merge delivery methods
  async movePrescriptionToDelivery(
    prescriptionId: number,
    targetDeliveryId: number,
  ): Promise<Prescription | undefined> {
    const result = await db
      .update(prescriptions)
      .set({ deliveryId: targetDeliveryId })
      .where(eq(prescriptions.id, prescriptionId))
      .returning();
    return result[0];
  }

  async splitDelivery(
    sourceDeliveryId: number,
    prescriptionIds: number[],
  ): Promise<Delivery | undefined> {
    // Get the source delivery
    const sourceDelivery = await this.getDelivery(sourceDeliveryId);
    if (!sourceDelivery || !sourceDelivery.batchId) return undefined;

    // Generate globally unique delivery identifier
    const deliveryIdentifier = await this.generateUniqueDeliveryIdentifier();

    // Create a new delivery with the same address info
    const newDelivery = await db
      .insert(deliveries)
      .values({
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
      })
      .returning();

    if (!newDelivery[0]) return undefined;

    // Move the specified prescriptions to the new delivery
    for (const prescriptionId of prescriptionIds) {
      await this.movePrescriptionToDelivery(prescriptionId, newDelivery[0].id);
    }

    return newDelivery[0];
  }

  async mergeDeliveries(
    targetDeliveryId: number,
    sourceDeliveryIds: number[],
  ): Promise<Delivery | undefined> {
    // Get target delivery
    const targetDelivery = await this.getDelivery(targetDeliveryId);
    if (!targetDelivery) return undefined;

    // Move all prescriptions from source deliveries to target
    for (const sourceId of sourceDeliveryIds) {
      const sourcePrescriptions =
        await this.getPrescriptionsByDelivery(sourceId);
      for (const prescription of sourcePrescriptions) {
        await this.movePrescriptionToDelivery(
          prescription.id,
          targetDeliveryId,
        );
      }
      // Delete the source delivery after moving prescriptions
      await this.deleteDelivery(sourceId);
    }

    return targetDelivery;
  }

  // Delivery Orders implementation
  async getDeliveryOrdersByPharmacy(
    pharmacyId: number,
  ): Promise<DeliveryOrder[]> {
    return db
      .select({ deliveryOrder: deliveryOrders })
      .from(deliveryOrders)
      .leftJoin(deliveryBatches, eq(deliveryOrders.batchId, deliveryBatches.id))
      .where(
        and(
          eq(deliveryOrders.pharmacyId, pharmacyId),
          notInArray(deliveryOrders.deliveryStatus, ["CANCELLED", "DELIVERED", "ROUTED"]),
          or(
            isNull(deliveryOrders.batchId),
            notInArray(deliveryBatches.status, ["cancelled", "complete"]),
          ),
        ),
      )
      .orderBy(desc(deliveryOrders.lastSeenAt))
      .then((rows) => rows.map((r) => r.deliveryOrder));
  }

  async getDeliveryOrdersByBatch(batchId: number): Promise<DeliveryOrder[]> {
    const uploads = await db
      .select({ deliveryOrderId: deliveryOrderUploads.deliveryOrderId })
      .from(deliveryOrderUploads)
      .where(eq(deliveryOrderUploads.batchId, batchId));

    if (uploads.length === 0) return [];

    const orderIds = uploads.map((u) => u.deliveryOrderId);
    return db
      .select()
      .from(deliveryOrders)
      .where(
        and(
          inArray(deliveryOrders.id, orderIds),
          notInArray(deliveryOrders.deliveryStatus, ["CANCELLED", "DELIVERED", "ROUTED"]),
        ),
      )
      .orderBy(desc(deliveryOrders.lastSeenAt));
  }

  async getDeliveryOrdersByRoute(routeId: number): Promise<DeliveryOrder[]> {
    return db
      .select()
      .from(deliveryOrders)
      .where(eq(deliveryOrders.routeId, routeId));
  }

  async getDeliveryOrder(id: number): Promise<DeliveryOrder | undefined> {
    const result = await db
      .select()
      .from(deliveryOrders)
      .where(eq(deliveryOrders.id, id));
    return result[0];
  }

  async reactivateDeliveryOrder(
    id: number,
  ): Promise<DeliveryOrder | undefined> {
    const result = await db
      .update(deliveryOrders)
      .set({
        deliveryStatus: "ROUTE_ELIGIBLE",
        routeId: null,
        batchId: null,
        scannedAt: new Date(),
        lastSeenAt: new Date(),
      })
      .where(eq(deliveryOrders.id, id))
      .returning();
    return result[0];
  }

  async findDeliveryOrderByRx(
    pharmacyId: number,
    rxNumber: string,
  ): Promise<DeliveryOrder | undefined> {
    const result = await db
      .select()
      .from(deliveryOrders)
      .where(
        and(
          eq(deliveryOrders.pharmacyId, pharmacyId),
          eq(deliveryOrders.rxNumber, rxNumber),
        ),
      );
    return result[0];
  }

  async upsertDeliveryOrder(
    data: InsertDeliveryOrder,
    batchId: number | null,
    fileName?: string,
  ): Promise<{ order: DeliveryOrder; isNew: boolean }> {
    const existing = await this.findDeliveryOrderByRx(
      data.pharmacyId,
      data.rxNumber,
    );

    if (existing) {
      const isReactivating =
        existing.deliveryStatus === "CANCELLED" ||
        existing.deliveryStatus === "DELIVERED";
      const updateFields: any = {
        lastSeenAt: new Date(),
        uploadCount: (existing.uploadCount || 1) + 1,
        addressText: data.addressText || existing.addressText,
        streetAddress: data.streetAddress || existing.streetAddress,
        city: data.city || existing.city,
        state: data.state || existing.state,
        zipCode: data.zipCode || existing.zipCode,
        normalizedAddressHash:
          data.normalizedAddressHash || existing.normalizedAddressHash,
        lat: data.lat ?? existing.lat,
        lng: data.lng ?? existing.lng,
        customerName: data.customerName || existing.customerName,
        customerPhone: data.customerPhone || existing.customerPhone,
        notes: data.notes || existing.notes,
        fillDate: data.fillDate || existing.fillDate,
        batchId: batchId || existing.batchId,
      };
      if (isReactivating && data.deliveryStatus) {
        updateFields.deliveryStatus = data.deliveryStatus;
        updateFields.routeId = null;
      }
      const updated = await db
        .update(deliveryOrders)
        .set(updateFields)
        .where(eq(deliveryOrders.id, existing.id))
        .returning();

      if (batchId) {
        await db.insert(deliveryOrderUploads).values({
          deliveryOrderId: existing.id,
          batchId,
          fileName: fileName || null,
          seenAt: new Date(),
        });
      }

      return { order: updated[0], isNew: false };
    } else {
      const created = await db
        .insert(deliveryOrders)
        .values({
          ...data,
          batchId: batchId || null,
          lastSeenAt: new Date(),
          uploadCount: 1,
        })
        .returning();

      if (batchId) {
        await db.insert(deliveryOrderUploads).values({
          deliveryOrderId: created[0].id,
          batchId,
          fileName: fileName || null,
          seenAt: new Date(),
        });
      }

      return { order: created[0], isNew: true };
    }
  }

  async updateDeliveryOrderStatus(
    id: number,
    status: string,
  ): Promise<DeliveryOrder | undefined> {
    if (status === "ROUTE_ELIGIBLE") {
      const order = await this.getDeliveryOrder(id);
      if (!order) return undefined;

      if (order.deliveryStatus === "CANCELLED") {
        console.log(
          `⚠️ Refusing to set ROUTE_ELIGIBLE on cancelled order ${id}`,
        );
        return undefined;
      }

      if (order.batchId) {
        const batch = await this.getBatch(order.batchId);
        if (batch && batch.status === "cancelled") {
          console.log(
            `⚠️ Refusing to set ROUTE_ELIGIBLE on order ${id} — batch ${order.batchId} is cancelled`,
          );
          return undefined;
        }
      }

      const updates: any = {
        deliveryStatus: status,
        scannedAt: new Date(),
      };
      if (!order.deliveryIdentifier) {
        updates.deliveryIdentifier =
          await this.getOrCreateDeliveryIdentifierForAddress(order);
      }
      const result = await db
        .update(deliveryOrders)
        .set(updates)
        .where(eq(deliveryOrders.id, id))
        .returning();
      return result[0];
    }

    const result = await db
      .update(deliveryOrders)
      .set({ deliveryStatus: status })
      .where(eq(deliveryOrders.id, id))
      .returning();
    return result[0];
  }

  async cancelDeliveryOrdersByBatch(batchId: number): Promise<void> {
    await db
      .update(deliveryOrders)
      .set({ deliveryStatus: "CANCELLED" })
      .where(
        and(
          eq(deliveryOrders.batchId, batchId),
          notInArray(deliveryOrders.deliveryStatus, ["DELIVERED", "CANCELLED"]),
        ),
      );

    const uploads = await db
      .select({ deliveryOrderId: deliveryOrderUploads.deliveryOrderId })
      .from(deliveryOrderUploads)
      .where(eq(deliveryOrderUploads.batchId, batchId));

    if (uploads.length > 0) {
      const orderIds = uploads.map((u) => u.deliveryOrderId);
      await db
        .update(deliveryOrders)
        .set({ deliveryStatus: "CANCELLED" })
        .where(
          and(
            inArray(deliveryOrders.id, orderIds),
            notInArray(deliveryOrders.deliveryStatus, [
              "DELIVERED",
              "CANCELLED",
              "ROUTED",
            ]),
          ),
        );
    }
  }

  async getOrCreateDeliveryIdentifierForAddress(
    order: DeliveryOrder,
  ): Promise<string> {
    if (order.normalizedAddressHash) {
      const existing = await db
        .select()
        .from(deliveryOrders)
        .where(
          and(
            eq(deliveryOrders.pharmacyId, order.pharmacyId),
            eq(
              deliveryOrders.normalizedAddressHash,
              order.normalizedAddressHash,
            ),
            isNotNull(deliveryOrders.deliveryIdentifier),
            inArray(deliveryOrders.deliveryStatus, [
              "ROUTE_ELIGIBLE",
              "ROUTED",
              "DELIVERED",
            ]),
          ),
        )
        .limit(1);
      if (existing.length > 0 && existing[0].deliveryIdentifier) {
        return existing[0].deliveryIdentifier;
      }
    }
    return this.generateUniqueDeliveryIdentifier();
  }

  async updateDeliveryOrderDeliveryIdentifier(
    id: number,
    deliveryIdentifier: string,
  ): Promise<DeliveryOrder | undefined> {
    const result = await db
      .update(deliveryOrders)
      .set({ deliveryIdentifier })
      .where(eq(deliveryOrders.id, id))
      .returning();
    return result[0];
  }

  async updateDeliveryOrderRoute(
    id: number,
    routeId: number,
  ): Promise<DeliveryOrder | undefined> {
    const result = await db
      .update(deliveryOrders)
      .set({ routeId })
      .where(eq(deliveryOrders.id, id))
      .returning();
    return result[0];
  }

  async getDeliveryOrderUploads(
    orderId: number,
  ): Promise<DeliveryOrderUpload[]> {
    return db
      .select()
      .from(deliveryOrderUploads)
      .where(eq(deliveryOrderUploads.deliveryOrderId, orderId))
      .orderBy(desc(deliveryOrderUploads.seenAt));
  }

  async getRouteEligibleOrders(pharmacyId: number): Promise<DeliveryOrder[]> {
    return db
      .select({ deliveryOrder: deliveryOrders })
      .from(deliveryOrders)
      .leftJoin(deliveryBatches, eq(deliveryOrders.batchId, deliveryBatches.id))
      .where(
        and(
          eq(deliveryOrders.pharmacyId, pharmacyId),
          eq(deliveryOrders.deliveryStatus, "ROUTE_ELIGIBLE"),
          or(
            isNull(deliveryOrders.batchId),
            notInArray(deliveryBatches.status, ["cancelled", "complete"]),
          ),
        ),
      )
      .orderBy(desc(deliveryOrders.lastSeenAt))
      .then((rows) => rows.map((r) => r.deliveryOrder));
  }

  async getAllDeliveryOrders(): Promise<DeliveryOrder[]> {
    return db
      .select({ deliveryOrder: deliveryOrders })
      .from(deliveryOrders)
      .leftJoin(deliveryBatches, eq(deliveryOrders.batchId, deliveryBatches.id))
      .where(
        and(
          notInArray(deliveryOrders.deliveryStatus, ["CANCELLED", "DELIVERED", "ROUTED"]),
          or(
            isNull(deliveryOrders.batchId),
            notInArray(deliveryBatches.status, ["cancelled", "complete"]),
          ),
        ),
      )
      .orderBy(desc(deliveryOrders.lastSeenAt))
      .then((rows) => rows.map((r) => r.deliveryOrder));
  }

  async deleteRouteStop(stopId: number): Promise<boolean> {
    const stop = await this.getRouteStop(stopId);
    if (!stop) return false;

    if (stop.deliveryId) {
      await db
        .update(deliveries)
        .set({ status: "geocoded" })
        .where(eq(deliveries.id, stop.deliveryId));
    }

    await db.delete(routeStops).where(eq(routeStops.id, stopId));
    return true;
  }

  async resequenceRouteStops(routeId: number): Promise<void> {
    const stops = await this.getRouteStops(routeId);
    const activeStops = stops.filter((s) => s.status !== "cancelled");
    for (let i = 0; i < activeStops.length; i++) {
      await db
        .update(routeStops)
        .set({ sequence: i + 1 })
        .where(eq(routeStops.id, activeStops[i].id));
    }
  }
  
  // ============================================================
  // ADD TO: server/storage.ts
  // ============================================================
  // ============================================================

  // ── Billing Tiers ─────────────────────────────────────────────────────────────

  async getBillingTiers() {
    return db.select().from(billingTiers).orderBy(billingTiers.minMiles);
  }

  async updateBillingTiers(tiers: InsertBillingTier[]) {
    return db.transaction(async (tx) => {
      await tx.delete(billingTiers);
      if (tiers.length > 0) {
        await tx.insert(billingTiers).values(tiers);
      }
      return tx.select().from(billingTiers).orderBy(billingTiers.minMiles);
    });
  }

  // ── Invoices ──────────────────────────────────────────────────────────────────

  async getInvoices(pharmacyId?: number) {
    if (pharmacyId) {
      return db
        .select()
        .from(invoices)
        .where(eq(invoices.pharmacyId, pharmacyId))
        .orderBy(desc(invoices.generatedAt));
    }
    return db.select().from(invoices).orderBy(desc(invoices.generatedAt));
  }

  async getInvoiceByRouteId(routeId: number) {
    const rows = await db
      .select()
      .from(invoices)
      .where(eq(invoices.routeId, routeId))
      .limit(1);
    return rows[0] ?? null;
  }

  async getInvoiceWithItems(invoiceId: number) {
    const rows = await db
      .select()
      .from(invoices)
      .where(eq(invoices.id, invoiceId))
      .limit(1);
    if (!rows[0]) return null;
    const items = await db
      .select()
      .from(invoiceItems)
      .where(eq(invoiceItems.invoiceId, invoiceId));
    return { ...rows[0], lineItems: items };
  }

  async createInvoiceWithItems(
    invoiceData: InsertInvoice,
    items: Omit<InsertInvoiceItem, "invoiceId">[],
  ) {
    return db.transaction(async (tx) => {
      const [invoice] = await tx
        .insert(invoices)
        .values(invoiceData)
        .returning();
      if (items.length > 0) {
        await tx
          .insert(invoiceItems)
          .values(items.map((item) => ({ ...item, invoiceId: invoice.id })));
      }
      const lineItems = await tx
        .select()
        .from(invoiceItems)
        .where(eq(invoiceItems.invoiceId, invoice.id));
      return { ...invoice, lineItems };
    });
  }

  async updateInvoiceStatus(invoiceId: number, status: string) {
    const [updated] = await db
      .update(invoices)
      .set({ status })
      .where(eq(invoices.id, invoiceId))
      .returning();
    return updated ?? null;
  }
}

export const storage = new DatabaseStorage();
