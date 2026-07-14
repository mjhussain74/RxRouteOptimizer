---
name: Neon HTTP N+1 query crash
description: drizzle-orm/neon-http crashes with null.map when too many concurrent queries are fired via Promise.all
---

## Rule
Do NOT use `drizzle-orm/neon-http` with the `neon()` HTTP client. It crashes with `TypeError: Cannot read properties of null (reading 'map')` in `processQueryResult` even for single bulk `inArray` queries — the HTTP driver is unreliable for server-side use.

**Why:** The Neon serverless HTTP driver (`drizzle-orm/neon-http`) is designed for edge/serverless environments. On a persistent Node.js server it can return null responses for valid queries, crashing Drizzle internally. Switching to `drizzle-orm/neon-serverless` with a WebSocket `Pool` resolves this completely.

**Fix applied (use this pattern):**
```typescript
import { drizzle } from "drizzle-orm/neon-serverless";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
neonConfig.webSocketConstructor = ws;
const pool = new Pool({ connectionString: process.env.DATABASE_URL! });
export const db = drizzle(pool);
```

The `ws` package is already installed. All files importing `db` from `storage.ts` (including `uploadQueue.ts`) benefit automatically — no other changes needed.

Also added bulk methods to `storage.ts` for efficient batch data fetching: `getDeliveriesByIds`, `getPrescriptionsByDeliveryIds`, `getDeliveryProofsByStopIds`, `getRouteStopsByDeliveryIds`, `getRoutesByIds`, `getDriversByIds`.
