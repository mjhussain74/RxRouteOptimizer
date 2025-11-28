import { pgTable, text, serial, integer, boolean, timestamp, real, json } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  role: text("role").notNull().default("dispatcher"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const drivers = pgTable("drivers", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  name: text("name").notNull(),
  phone: text("phone"),
  status: text("status").notNull().default("available"),
  currentLat: real("current_lat"),
  currentLng: real("current_lng"),
  lastLocationUpdate: timestamp("last_location_update"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const deliveryBatches = pgTable("delivery_batches", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  uploadedBy: integer("uploaded_by").references(() => users.id),
  status: text("status").notNull().default("pending"),
  totalDeliveries: integer("total_deliveries").default(0),
  scheduledAt: timestamp("scheduled_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const deliveries = pgTable("deliveries", {
  id: serial("id").primaryKey(),
  batchId: integer("batch_id").references(() => deliveryBatches.id),
  addressText: text("address_text").notNull(),
  lat: real("lat"),
  lng: real("lng"),
  customerName: text("customer_name"),
  customerPhone: text("customer_phone"),
  notes: text("notes"),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const routes = pgTable("routes", {
  id: serial("id").primaryKey(),
  batchId: integer("batch_id").references(() => deliveryBatches.id),
  driverId: integer("driver_id").references(() => drivers.id),
  name: text("name").notNull(),
  status: text("status").notNull().default("pending"),
  startLat: real("start_lat"),
  startLng: real("start_lng"),
  startAddress: text("start_address"),
  estimatedDuration: integer("estimated_duration"),
  estimatedDistance: real("estimated_distance"),
  polyline: text("polyline"),
  optimizedOrder: json("optimized_order").$type<number[]>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  dispatchedAt: timestamp("dispatched_at"),
  completedAt: timestamp("completed_at"),
});

export const routeStops = pgTable("route_stops", {
  id: serial("id").primaryKey(),
  routeId: integer("route_id").references(() => routes.id),
  deliveryId: integer("delivery_id").references(() => deliveries.id),
  sequence: integer("sequence").notNull(),
  status: text("status").notNull().default("pending"),
  eta: timestamp("eta"),
  actualArrival: timestamp("actual_arrival"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const driverLocations = pgTable("driver_locations", {
  id: serial("id").primaryKey(),
  driverId: integer("driver_id").references(() => drivers.id),
  lat: real("lat").notNull(),
  lng: real("lng").notNull(),
  recordedAt: timestamp("recorded_at").defaultNow().notNull(),
});

export const usersRelations = relations(users, ({ many }) => ({
  batches: many(deliveryBatches),
}));

export const driversRelations = relations(drivers, ({ one, many }) => ({
  user: one(users, { fields: [drivers.userId], references: [users.id] }),
  routes: many(routes),
  locations: many(driverLocations),
}));

export const deliveryBatchesRelations = relations(deliveryBatches, ({ one, many }) => ({
  uploadedByUser: one(users, { fields: [deliveryBatches.uploadedBy], references: [users.id] }),
  deliveries: many(deliveries),
  routes: many(routes),
}));

export const deliveriesRelations = relations(deliveries, ({ one, many }) => ({
  batch: one(deliveryBatches, { fields: [deliveries.batchId], references: [deliveryBatches.id] }),
  routeStops: many(routeStops),
}));

export const routesRelations = relations(routes, ({ one, many }) => ({
  batch: one(deliveryBatches, { fields: [routes.batchId], references: [deliveryBatches.id] }),
  driver: one(drivers, { fields: [routes.driverId], references: [drivers.id] }),
  stops: many(routeStops),
}));

export const routeStopsRelations = relations(routeStops, ({ one }) => ({
  route: one(routes, { fields: [routeStops.routeId], references: [routes.id] }),
  delivery: one(deliveries, { fields: [routeStops.deliveryId], references: [deliveries.id] }),
}));

export const driverLocationsRelations = relations(driverLocations, ({ one }) => ({
  driver: one(drivers, { fields: [driverLocations.driverId], references: [drivers.id] }),
}));

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
  role: true,
});

export const insertDriverSchema = createInsertSchema(drivers).omit({
  id: true,
  createdAt: true,
});

export const insertDeliveryBatchSchema = createInsertSchema(deliveryBatches).omit({
  id: true,
  createdAt: true,
});

export const insertDeliverySchema = createInsertSchema(deliveries).omit({
  id: true,
  createdAt: true,
});

export const insertRouteSchema = createInsertSchema(routes).omit({
  id: true,
  createdAt: true,
});

export const insertRouteStopSchema = createInsertSchema(routeStops).omit({
  id: true,
  createdAt: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type InsertDriver = z.infer<typeof insertDriverSchema>;
export type Driver = typeof drivers.$inferSelect;
export type InsertDeliveryBatch = z.infer<typeof insertDeliveryBatchSchema>;
export type DeliveryBatch = typeof deliveryBatches.$inferSelect;
export type InsertDelivery = z.infer<typeof insertDeliverySchema>;
export type Delivery = typeof deliveries.$inferSelect;
export type InsertRoute = z.infer<typeof insertRouteSchema>;
export type Route = typeof routes.$inferSelect;
export type InsertRouteStop = z.infer<typeof insertRouteStopSchema>;
export type RouteStop = typeof routeStops.$inferSelect;
export type DriverLocation = typeof driverLocations.$inferSelect;
