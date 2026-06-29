---
name: Neon HTTP N+1 query crash
description: drizzle-orm/neon-http crashes with null.map when too many concurrent queries are fired via Promise.all
---

## Rule
Never use `Promise.all(items.map(async item => db.select()...))` with large arrays against the `neon-http` driver. It fires hundreds of concurrent HTTP requests which causes Neon to return null, crashing Drizzle's `processQueryResult` with `TypeError: Cannot read properties of null (reading 'map')`.

**Why:** The Neon serverless HTTP driver (`drizzle-orm/neon-http` + `@neondatabase/serverless`) is stateless — each query is a separate HTTP call. Under high concurrency (300+ simultaneous calls), Neon returns null responses instead of throwing, and Drizzle's `processQueryResult` doesn't guard against null.

**How to apply:** Whenever enriching a list of rows with related data, use bulk `inArray` queries then assemble in memory:
1. Collect all IDs from the primary result set
2. Fire 1 bulk query per related table using `inArray(table.foreignKey, ids)`
3. Build `Map` lookups and assemble the enriched objects synchronously

The bulk methods added to `storage.ts` for this pattern: `getDeliveriesByIds`, `getPrescriptionsByDeliveryIds`, `getDeliveryProofsByStopIds`, `getRouteStopsByDeliveryIds`, `getRoutesByIds`, `getDriversByIds`.
