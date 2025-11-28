import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { eq, and, desc } from "drizzle-orm";
import bcrypt from "bcrypt";
import {
  users, drivers, deliveryBatches, deliveries, routes, routeStops, driverLocations,
  type User, type InsertUser,
  type Driver, type InsertDriver,
  type DeliveryBatch, type InsertDeliveryBatch,
  type Delivery, type InsertDelivery,
  type Route, type InsertRoute,
  type RouteStop, type InsertRouteStop,
  type DriverLocation
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
  createDelivery(delivery: InsertDelivery): Promise<Delivery>;
  updateDeliveryCoordinates(id: number, lat: number, lng: number): Promise<Delivery | undefined>;
  updateDeliveryStatus(id: number, status: string): Promise<Delivery | undefined>;
  
  getRoutes(): Promise<Route[]>;
  getRoute(id: number): Promise<Route | undefined>;
  getRoutesByDriver(driverId: number): Promise<Route[]>;
  createRoute(route: InsertRoute): Promise<Route>;
  updateRoute(id: number, data: Partial<InsertRoute>): Promise<Route | undefined>;
  assignRouteToDriver(routeId: number, driverId: number): Promise<Route | undefined>;
  dispatchRoute(routeId: number): Promise<Route | undefined>;
  
  getRouteStops(routeId: number): Promise<RouteStop[]>;
  createRouteStop(stop: InsertRouteStop): Promise<RouteStop>;
  updateRouteStopStatus(id: number, status: string): Promise<RouteStop | undefined>;
  completeRouteStop(id: number): Promise<RouteStop | undefined>;
  
  recordDriverLocation(driverId: number, lat: number, lng: number): Promise<DriverLocation>;
}

export type SafeUser = Omit<User, 'password'>;

export class DatabaseStorage implements IStorage {
  async getUser(id: number): Promise<User | undefined> {
    const result = await db.select({
      id: users.id,
      username: users.username,
      role: users.role,
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

  async createDelivery(delivery: InsertDelivery): Promise<Delivery> {
    const result = await db.insert(deliveries).values(delivery).returning();
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

  async getRouteStops(routeId: number): Promise<RouteStop[]> {
    return db.select().from(routeStops)
      .where(eq(routeStops.routeId, routeId))
      .orderBy(routeStops.sequence);
  }

  async createRouteStop(stop: InsertRouteStop): Promise<RouteStop> {
    const result = await db.insert(routeStops).values(stop).returning();
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

  async recordDriverLocation(driverId: number, lat: number, lng: number): Promise<DriverLocation> {
    const result = await db.insert(driverLocations).values({
      driverId,
      lat,
      lng,
    }).returning();
    
    await this.updateDriverLocation(driverId, lat, lng);
    
    return result[0];
  }
}

export const storage = new DatabaseStorage();
