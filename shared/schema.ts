import {
  pgTable,
  text,
  serial,
  integer,
  boolean,
  timestamp,
  real,
  json,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  role: text("role").notNull().default("dispatcher"),
  pharmacyId: integer("pharmacy_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const pharmacies = pgTable("pharmacies", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  address: text("address"),
  phone: text("phone"),
  email: text("email"),
  lat: real("lat"),
  lng: real("lng"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const deliveryZones = pgTable("delivery_zones", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  centerLat: real("center_lat").notNull(),
  centerLng: real("center_lng").notNull(),
  radiusMeters: real("radius_meters").notNull(),
  color: text("color").default("#3B82F6"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const driverZones = pgTable("driver_zones", {
  id: serial("id").primaryKey(),
  driverId: integer("driver_id")
    .references(() => drivers.id)
    .notNull(),
  zoneId: integer("zone_id")
    .references(() => deliveryZones.id)
    .notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const drivers = pgTable("drivers", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  name: text("name").notNull(),
  phone: text("phone"),
  username: text("username").unique(), // For driver login
  password: text("password"), // Hashed password for driver login
  status: text("status").notNull().default("available"),
  currentLat: real("current_lat"),
  currentLng: real("current_lng"),
  lastLocationUpdate: timestamp("last_location_update"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const deliveryBatches = pgTable("delivery_batches", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  pharmacyId: integer("pharmacy_id").references(() => pharmacies.id),
  uploadedBy: integer("uploaded_by").references(() => users.id),
  status: text("status").notNull().default("pending"),
  totalDeliveries: integer("total_deliveries").default(0),
  sourceType: text("source_type").default("manual"),
  scheduledAt: timestamp("scheduled_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const deliveries = pgTable("deliveries", {
  id: serial("id").primaryKey(),
  deliveryIdentifier: text("delivery_identifier"), // DELYYYYNNNNNN format
  batchId: integer("batch_id").references(() => deliveryBatches.id),
  pharmacyId: integer("pharmacy_id").references(() => pharmacies.id),
  zoneId: integer("zone_id").references(() => deliveryZones.id),
  // Full address text for display
  addressText: text("address_text").notNull(),
  // Normalized address components for grouping
  streetAddress: text("street_address"),
  city: text("city"),
  state: text("state"),
  zipCode: text("zip_code"),
  normalizedAddressHash: text("normalized_address_hash"), // SHA256 for fast matching
  lat: real("lat"),
  lng: real("lng"),
  customerName: text("customer_name"), // Primary patient name (first in group)
  customerPhone: text("customer_phone"),
  rxNumber: text("rx_number"), // Deprecated - kept for backward compatibility
  notes: text("notes"),
  priority: text("priority").default("normal"),
  status: text("status").notNull().default("pending"),
  prescriptionCount: integer("prescription_count").default(1), // Number of Rx in this delivery
  ocrImageUrl: text("ocr_image_url"),
  ocrConfidence: real("ocr_confidence"),
  ocrVerified: boolean("ocr_verified").default(false),
  scannedBarcode: text("scanned_barcode"),
  routingEligible: boolean("routing_eligible").notNull().default(false), // true after RX barcode scan in Order Management
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// New prescriptions table - stores individual Rx records linked to deliveries
export const prescriptions = pgTable("prescriptions", {
  id: serial("id").primaryKey(),
  deliveryId: integer("delivery_id")
    .references(() => deliveries.id)
    .notNull(),
  batchId: integer("batch_id").references(() => deliveryBatches.id),
  rxNumber: text("rx_number").notNull(),
  patientName: text("patient_name"),
  patientPhone: text("patient_phone"),
  notes: text("notes"),
  entryMethod: text("entry_method").default("upload"), // upload, scan, manual
  scannedAt: timestamp("scanned_at"),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const routes = pgTable("routes", {
  id: serial("id").primaryKey(),
  batchId: integer("batch_id").references(() => deliveryBatches.id),
  driverId: integer("driver_id").references(() => drivers.id),
  zoneId: integer("zone_id").references(() => deliveryZones.id),
  name: text("name").notNull(),
  status: text("status").notNull().default("pending"),
  startLat: real("start_lat"),
  startLng: real("start_lng"),
  startAddress: text("start_address"),
  estimatedDuration: integer("estimated_duration"),
  estimatedDistance: real("estimated_distance"),
  polyline: text("polyline"),
  optimizedOrder: json("optimized_order").$type<number[]>(),
  allPackagesScanned: boolean("all_packages_scanned").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  dispatchedAt: timestamp("dispatched_at"),
  activatedAt: timestamp("activated_at"),
  completedAt: timestamp("completed_at"),
});

export const routeStops = pgTable("route_stops", {
  id: serial("id").primaryKey(),
  routeId: integer("route_id").references(() => routes.id),
  deliveryId: integer("delivery_id").references(() => deliveries.id),
  sequence: integer("sequence").notNull(),
  status: text("status").notNull().default("pending"),
  priority: text("priority").default("normal"),
  eta: timestamp("eta"),
  actualArrival: timestamp("actual_arrival"),
  notes: text("notes"),
  packageScanned: boolean("package_scanned").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const driverLocations = pgTable("driver_locations", {
  id: serial("id").primaryKey(),
  driverId: integer("driver_id").references(() => drivers.id),
  lat: real("lat").notNull(),
  lng: real("lng").notNull(),
  recordedAt: timestamp("recorded_at").defaultNow().notNull(),
});

export const deliveryProofs = pgTable("delivery_proofs", {
  id: serial("id").primaryKey(),
  stopId: integer("stop_id").references(() => routeStops.id),
  deliveryId: integer("delivery_id").references(() => deliveries.id),
  signature: text("signature"), // Base64 (deprecated, kept for migration)
  signatureUrl: text("signature_url"), // Object storage URL
  picture: text("picture"), // Base64 (deprecated, kept for migration)
  pictureUrl: text("picture_url"), // Object storage URL
  notes: text("notes"),
  barcode: text("barcode"),
  driverId: integer("driver_id").references(() => drivers.id),
  localProofId: text("local_proof_id"), // Client-side IndexedDB proof ID for syncing
  uploadStatus: text("upload_status").default("pending"), // pending, uploading, completed, failed, partial
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const uploadQueue = pgTable("upload_queue", {
  id: serial("id").primaryKey(),
  proofId: integer("proof_id").references(() => deliveryProofs.id),
  type: text("type").notNull(), // signature, picture
  data: text("data").notNull(), // Base64 data
  status: text("status").notNull().default("pending"), // pending, processing, completed, failed
  retryCount: integer("retry_count").default(0),
  maxRetries: integer("max_retries").default(3),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  processedAt: timestamp("processed_at"),
});

export const ocrLogs = pgTable("ocr_logs", {
  id: serial("id").primaryKey(),
  deliveryId: integer("delivery_id").references(() => deliveries.id),
  imageUrl: text("image_url"),
  extractedData: json("extracted_data"),
  confidence: real("confidence"),
  errorReason: text("error_reason"),
  deviceId: text("device_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const pharmaciesRelations = relations(pharmacies, ({ many }) => ({
  users: many(users),
  batches: many(deliveryBatches),
  deliveries: many(deliveries),
}));

export const deliveryZonesRelations = relations(deliveryZones, ({ many }) => ({
  driverZones: many(driverZones),
  routes: many(routes),
}));

export const driverZonesRelations = relations(driverZones, ({ one }) => ({
  driver: one(drivers, {
    fields: [driverZones.driverId],
    references: [drivers.id],
  }),
  zone: one(deliveryZones, {
    fields: [driverZones.zoneId],
    references: [deliveryZones.id],
  }),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  pharmacy: one(pharmacies, {
    fields: [users.pharmacyId],
    references: [pharmacies.id],
  }),
  batches: many(deliveryBatches),
}));

export const driversRelations = relations(drivers, ({ one, many }) => ({
  user: one(users, { fields: [drivers.userId], references: [users.id] }),
  routes: many(routes),
  locations: many(driverLocations),
  zones: many(driverZones),
  proofs: many(deliveryProofs),
}));

export const deliveryBatchesRelations = relations(
  deliveryBatches,
  ({ one, many }) => ({
    pharmacy: one(pharmacies, {
      fields: [deliveryBatches.pharmacyId],
      references: [pharmacies.id],
    }),
    uploadedByUser: one(users, {
      fields: [deliveryBatches.uploadedBy],
      references: [users.id],
    }),
    deliveries: many(deliveries),
    routes: many(routes),
  }),
);

export const deliveriesRelations = relations(deliveries, ({ one, many }) => ({
  batch: one(deliveryBatches, {
    fields: [deliveries.batchId],
    references: [deliveryBatches.id],
  }),
  pharmacy: one(pharmacies, {
    fields: [deliveries.pharmacyId],
    references: [pharmacies.id],
  }),
  zone: one(deliveryZones, {
    fields: [deliveries.zoneId],
    references: [deliveryZones.id],
  }),
  prescriptions: many(prescriptions),
  routeStops: many(routeStops),
  ocrLogs: many(ocrLogs),
}));

export const prescriptionsRelations = relations(prescriptions, ({ one }) => ({
  delivery: one(deliveries, {
    fields: [prescriptions.deliveryId],
    references: [deliveries.id],
  }),
  batch: one(deliveryBatches, {
    fields: [prescriptions.batchId],
    references: [deliveryBatches.id],
  }),
  createdByUser: one(users, {
    fields: [prescriptions.createdBy],
    references: [users.id],
  }),
}));

export const routesRelations = relations(routes, ({ one, many }) => ({
  batch: one(deliveryBatches, {
    fields: [routes.batchId],
    references: [deliveryBatches.id],
  }),
  driver: one(drivers, { fields: [routes.driverId], references: [drivers.id] }),
  zone: one(deliveryZones, {
    fields: [routes.zoneId],
    references: [deliveryZones.id],
  }),
  stops: many(routeStops),
}));

export const routeStopsRelations = relations(routeStops, ({ one, many }) => ({
  route: one(routes, { fields: [routeStops.routeId], references: [routes.id] }),
  delivery: one(deliveries, {
    fields: [routeStops.deliveryId],
    references: [deliveries.id],
  }),
  proofs: many(deliveryProofs),
}));

export const driverLocationsRelations = relations(
  driverLocations,
  ({ one }) => ({
    driver: one(drivers, {
      fields: [driverLocations.driverId],
      references: [drivers.id],
    }),
  }),
);

export const deliveryProofsRelations = relations(deliveryProofs, ({ one }) => ({
  stop: one(routeStops, {
    fields: [deliveryProofs.stopId],
    references: [routeStops.id],
  }),
  driver: one(drivers, {
    fields: [deliveryProofs.driverId],
    references: [drivers.id],
  }),
}));

export const ocrLogsRelations = relations(ocrLogs, ({ one }) => ({
  delivery: one(deliveries, {
    fields: [ocrLogs.deliveryId],
    references: [deliveries.id],
  }),
}));

export const uploadQueueRelations = relations(uploadQueue, ({ one }) => ({
  proof: one(deliveryProofs, {
    fields: [uploadQueue.proofId],
    references: [deliveryProofs.id],
  }),
}));

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
  role: true,
  pharmacyId: true,
});

export const insertPharmacySchema = createInsertSchema(pharmacies).omit({
  id: true,
  createdAt: true,
});

export const insertDeliveryZoneSchema = createInsertSchema(deliveryZones).omit({
  id: true,
  createdAt: true,
});

export const insertDriverZoneSchema = createInsertSchema(driverZones).omit({
  id: true,
  createdAt: true,
});

export const insertDriverSchema = createInsertSchema(drivers).omit({
  id: true,
  createdAt: true,
});

export const insertDeliveryBatchSchema = createInsertSchema(
  deliveryBatches,
).omit({
  id: true,
  createdAt: true,
});

export const insertDeliverySchema = createInsertSchema(deliveries).omit({
  id: true,
  createdAt: true,
});

export const insertRouteSchema = createInsertSchema(routes)
  .omit({
    id: true,
    createdAt: true,
  })
  .extend({
    optimizedOrder: z.array(z.number()).nullable().optional(),
  });

export const insertRouteStopSchema = createInsertSchema(routeStops).omit({
  id: true,
  createdAt: true,
});

export const insertDeliveryProofSchema = createInsertSchema(
  deliveryProofs,
).omit({
  id: true,
  createdAt: true,
});

export const insertOcrLogSchema = createInsertSchema(ocrLogs).omit({
  id: true,
  createdAt: true,
});

export const insertPrescriptionSchema = createInsertSchema(prescriptions).omit({
  id: true,
  createdAt: true,
});

export const insertUploadQueueSchema = createInsertSchema(uploadQueue).omit({
  id: true,
  createdAt: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type InsertPharmacy = z.infer<typeof insertPharmacySchema>;
export type Pharmacy = typeof pharmacies.$inferSelect;
export type InsertDeliveryZone = z.infer<typeof insertDeliveryZoneSchema>;
export type DeliveryZone = typeof deliveryZones.$inferSelect;
export type InsertDriverZone = z.infer<typeof insertDriverZoneSchema>;
export type DriverZone = typeof driverZones.$inferSelect;
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
export type InsertDeliveryProof = z.infer<typeof insertDeliveryProofSchema>;
export type DeliveryProof = typeof deliveryProofs.$inferSelect;
export type InsertOcrLog = z.infer<typeof insertOcrLogSchema>;
export type OcrLog = typeof ocrLogs.$inferSelect;
export type InsertPrescription = z.infer<typeof insertPrescriptionSchema>;
export type Prescription = typeof prescriptions.$inferSelect;
export type InsertUploadQueue = z.infer<typeof insertUploadQueueSchema>;
export type UploadQueue = typeof uploadQueue.$inferSelect;

// Delivery ID counter table for atomic sequence generation
export const deliveryIdCounters = pgTable("delivery_id_counters", {
  year: integer("year").primaryKey(),
  lastValue: integer("last_value").notNull().default(0),
});

export type DeliveryIdCounter = typeof deliveryIdCounters.$inferSelect;
