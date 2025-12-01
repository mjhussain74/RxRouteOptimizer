# Route Optimization Application - Complete Deployment Guide

## Overview
This is a full-stack delivery route optimization system that uses Google Maps APIs to geocode addresses, optimize routes, and track drivers in real-time via a mobile PWA.

---

## PART 1: PREREQUISITES

### What You Need
1. **Google Cloud Project** with these APIs enabled:
   - Google Maps Geocoding API
   - Google Routes API
   
2. **PostgreSQL Database** (Replit provides this built-in)

3. **Google Maps API Key** with proper permissions

---

## PART 2: SETUP INSTRUCTIONS (For Replit)

### Step 1: Create Google Cloud Project
1. Go to https://console.cloud.google.com/
2. Create a new project (name it "Route Optimizer")
3. Wait for project creation to complete
4. In the search bar at top, search for **"Geocoding API"**
5. Click the result and press **"Enable"**
6. Go back and search for **"Routes API"**
7. Click the result and press **"Enable"**

### Step 2: Create API Key
1. In Google Cloud Console, go to **Credentials** (left sidebar)
2. Click **"+ Create Credentials"** → **"API Key"**
3. Copy the API key (you'll need this next)
4. Click the key to edit it
5. Under "Application restrictions", select **"HTTP referrers"**
6. Add: `*.replit.dev/*`
7. Under "API restrictions", select **"Restrict key"**
8. Select both **"Geocoding API"** and **"Routes API"**
9. Click **Save**

### Step 3: Set Up Environment Variables in Replit
1. In your Replit project, click the **"Secrets"** tool (lock icon)
2. Create these secrets:
   - **GOOGLE_MAPS_API_KEY** = (paste your API key from Step 2)
   - **SESSION_SECRET** = (any random string, like "your-secret-key-12345")

### Step 4: Create Database
The database is automatically created in Replit. The app will set it up on first run.

### Step 5: Start the Application
The workflow "Start Game" runs: `npm run dev`
The app will start on port 5000. Visit your Replit project URL in your browser.

### Step 6: Create Your First User
1. You should see a login page
2. Sign up as a new dispatcher user
3. Use any username and password (they're stored securely with bcrypt hashing)

---

## PART 3: HOW TO USE

### For Dispatchers (Main Dashboard)
1. **Upload CSV** with delivery addresses
   - CSV format:
     ```
     address,customer_name,customer_phone,notes
     123 Main St, New York, NY,John Doe,555-0101,Leave at door
     456 Oak Ave, Brooklyn, NY,Jane Smith,555-0102,Ring bell twice
     ```
   
2. **Set Starting Location**
   - Enter the starting address (e.g., "Distribution Center, NYC")
   - Click "Geocode" to convert to coordinates
   - Name your route

3. **Generate Route**
   - Click "Optimize Route"
   - The app uses Google Routes API with fallback to nearest-neighbor algorithm
   - View the optimized route on the map

4. **Assign to Driver**
   - Select a driver from the dropdown
   - Click "Assign" to assign the route
   - Click "Dispatch" to send to driver's mobile app

### For Drivers (Mobile App)
1. Open the driver app URL (dispatcher shares this)
2. **Add to Home Screen** for quick access
3. View assigned routes in real-time
4. Click "Navigate" for turn-by-turn directions
5. Mark deliveries as complete

---

## PART 4: KEY CODE FILES

### Database Schema (shared/schema.ts)
- Defines all database tables with Drizzle ORM
- Tables: users, drivers, batches, deliveries, routes, stops, locations
- Automatic relationships and type safety

### Backend Routes (server/routes.ts)
Key endpoints:
- `POST /api/batches/upload` - Upload CSV file with auto-geocoding
- `GET /api/geocode?address=...` - Geocode single address using Google Maps
- `POST /api/routes/optimize` - Optimize route with Google Routes API or fallback
- `POST /api/routes/:id/assign` - Assign route to driver
- `POST /api/routes/:id/dispatch` - Dispatch route to driver
- WebSocket events for real-time updates

### Frontend Dashboard (client/src/components/Dashboard.tsx)
Main dispatcher interface:
- Batch upload with progress tracking
- Route optimizer with map preview
- Interactive Leaflet map display
- Driver management and route assignment

### Driver App (client/src/components/DriverApp.tsx)
Mobile-friendly PWA:
- Real-time route tracking
- Turn-by-turn navigation
- Delivery completion marking
- GPS location tracking with WebSocket updates

### Storage Layer (server/storage.ts)
- Database operations using Drizzle ORM
- Secure password hashing with bcrypt
- Password validation without exposing hashes
- All CRUD operations for app entities

---

## PART 5: DEPLOY TO PRODUCTION (Replit)

### Step 1: Build for Production
```bash
npm run build
```

### Step 2: Publish via Replit
1. Click the **"Publish"** button in Replit
2. Choose **"Deploy with Replit"**
3. Your app gets a permanent URL like: `https://your-project.replit.dev/`

### Step 3: Share with Users
- Share the main URL with dispatchers
- Share `?driver=DRIVER_ID` URL with drivers (get ID from driver list)
- On mobile, they can "Add to Home Screen" for PWA experience

---

## PART 6: ENVIRONMENT VARIABLES REFERENCE

Manage these in Replit's Secrets tool:

```
GOOGLE_MAPS_API_KEY   → Your Google Cloud API key (REQUIRED)
SESSION_SECRET        → Random string for session encryption (REQUIRED)
DATABASE_URL          → Auto-set by Replit (PostgreSQL connection)
PGDATABASE           → Auto-set by Replit
PGHOST               → Auto-set by Replit
PGPASSWORD           → Auto-set by Replit
PGPORT               → Auto-set by Replit
PGUSER               → Auto-set by Replit
```

---

## PART 7: TROUBLESHOOTING

### "Google Maps API key not configured"
✓ Check Secrets tab - GOOGLE_MAPS_API_KEY must be set
✓ Restart the app after adding the secret
✓ Verify API key has correct permissions

### Addresses not geocoding
✓ Verify API key has Geocoding API enabled in Google Cloud
✓ Check address format is valid
✓ The app automatically saves partially geocoded batches

### Routes not optimizing
✓ Check at least one address is geocoded
✓ If Google Routes API fails, the app uses nearest-neighbor algorithm
✓ Both work - Google API is just more optimal

### Database errors on startup
✓ Run: `npm run db:push` to sync database schema
✓ If errors persist: `npm run db:push --force` to force sync

### Driver app not receiving updates
✓ Ensure WebSocket connection is open (check browser console F12)
✓ Driver app auto-reconnects on connection loss
✓ Refresh if stuck

### Cannot add driver
✓ Make sure you're logged in as a dispatcher
✓ Create at least one driver before creating routes

---

## PART 8: TECHNOLOGY STACK

**Frontend:**
- React 18 with TypeScript
- Vite (fast development build tool)
- Tailwind CSS for styling
- Leaflet for maps
- React Query for data management
- Socket.IO for real-time updates

**Backend:**
- Express.js with TypeScript
- Socket.IO for WebSocket communication
- Drizzle ORM for database operations
- bcrypt for password hashing
- Multer for file uploads

**Database:**
- PostgreSQL (Neon backend via Replit)
- Drizzle migrations (automatic via npm run db:push)

**External APIs:**
- Google Maps Geocoding API
- Google Routes API
- OpenStreetMap (free map tiles)

---

## PART 9: SECURITY FEATURES

✓ **Password Hashing**: bcrypt with 10 salt rounds
✓ **Password Never Exposed**: Stored hash never returned to API
✓ **Session Management**: Express session with PostgreSQL store
✓ **API Key Protection**: Secrets stored server-side only, never exposed to client
✓ **WebSocket Authentication**: Verified driver assignments
✓ **HTTPS Ready**: Full Replit deployment support with automatic TLS

---

## PART 10: QUICK START CHECKLIST

- [ ] Create Google Cloud Project
- [ ] Enable Geocoding API
- [ ] Enable Routes API
- [ ] Create API Key
- [ ] Add to Replit Secrets (GOOGLE_MAPS_API_KEY)
- [ ] Add to Replit Secrets (SESSION_SECRET)
- [ ] App starts on workflow (npm run dev)
- [ ] Create dispatcher account
- [ ] Create driver(s)
- [ ] Upload test CSV
- [ ] Generate and dispatch route
- [ ] Test driver app on mobile
- [ ] Run `npm run build`
- [ ] Publish via Replit button

---

## PART 11: ARCHITECTURE OVERVIEW

```
┌─────────────────────────────────┐
│   Dispatcher Web Dashboard      │
│   (React + Vite)                │
│   - CSV Upload                  │
│   - Route Optimization          │
│   - Driver Management           │
└──────────────┬──────────────────┘
               │
               ↓
┌──────────────────────────────────────────┐
│   Express.js Backend Server (Port 5000)  │
│   - CSV Upload & Parsing                 │
│   - Google Maps Geocoding                │
│   - Route Optimization (Google + fallback)
│   - WebSocket Real-time Updates          │
│   - Password Hashing & Session Mgmt      │
└──────────────┬──────────────────────────┘
       ┌───────┼────────┐
       ↓       ↓        ↓
    ┌──────┐ ┌──────────────────┐
    │PgSQL │ │ Google Cloud APIs│
    │ DB   │ │ Geocoding & Routes
    └──────┘ └──────────────────┘
       ↑
       │
       ↓
┌────────────────────────────────────────┐
│   Driver Mobile PWA (iOS/Android)      │
│   - Real-time Route Tracking           │
│   - Turn-by-turn Navigation            │
│   - Delivery Completion                │
│   - Add to Home Screen                 │
└────────────────────────────────────────┘
```

---

## PART 12: DATABASE SCHEMA

```sql
users (dispatcher accounts)
├── id: serial (PK)
├── username: unique text
├── password: bcrypt hash (never exposed)
├── role: "dispatcher"
└── created_at: timestamp

drivers
├── id: serial (PK)
├── user_id: foreign key (users)
├── name: text
├── phone: text
├── status: "available"/"busy"/"offline"
├── current_lat/lng: real
└── created_at: timestamp

delivery_batches (CSV uploads)
├── id: serial (PK)
├── name: text
├── uploaded_by: foreign key (users)
├── status: "pending"/"processing"/"ready"
├── total_deliveries: integer
└── created_at: timestamp

deliveries (individual addresses from CSV)
├── id: serial (PK)
├── batch_id: foreign key (delivery_batches)
├── address_text: text
├── lat/lng: real (geocoded)
├── customer_name: text
├── customer_phone: text
├── notes: text
├── status: "pending"/"geocoded"/"delivered"
└── created_at: timestamp

routes (optimized delivery routes)
├── id: serial (PK)
├── batch_id: foreign key (delivery_batches)
├── driver_id: foreign key (drivers)
├── name: text
├── status: "pending"/"assigned"/"active"/"completed"
├── start_lat/lng: real
├── start_address: text
├── estimated_duration: integer (minutes)
├── estimated_distance: real (km)
├── polyline: text (encoded route)
├── optimized_order: json (array of delivery IDs)
├── dispatched_at: timestamp
├── completed_at: timestamp
└── created_at: timestamp

route_stops (individual stops in a route)
├── id: serial (PK)
├── route_id: foreign key (routes)
├── delivery_id: foreign key (deliveries)
├── sequence: integer (order in route)
├── status: "pending"/"active"/"completed"
├── eta: timestamp
├── actual_arrival: timestamp
├── notes: text
└── created_at: timestamp

driver_locations (GPS tracking history)
├── id: serial (PK)
├── driver_id: foreign key (drivers)
├── lat: real
├── lng: real
└── recorded_at: timestamp
```

---

## PART 13: API ENDPOINTS REFERENCE

### Authentication
- `POST /api/login` - Dispatcher login
- `POST /api/register` - Create new dispatcher account

### Batches
- `GET /api/batches` - List all batches
- `GET /api/batches/:id` - Get batch with deliveries
- `POST /api/batches/upload` - Upload CSV (auto-geocodes addresses)

### Geocoding
- `GET /api/geocode?address=...` - Geocode single address

### Routes
- `GET /api/routes` - List all routes
- `POST /api/routes/optimize` - Create optimized route
- `POST /api/routes/:id/assign` - Assign to driver
- `POST /api/routes/:id/dispatch` - Dispatch to driver
- `POST /api/routes/:routeId/stops/:stopId/complete` - Mark stop complete

### Drivers
- `GET /api/drivers` - List all drivers
- `POST /api/drivers` - Create new driver

### WebSocket Events
- `route-dispatched` - New route sent to driver
- `location-update` - Driver location changed
- `stop-completed` - Delivery completed
- `route-completed` - Full route finished

---

## SUPPORT & NEXT STEPS

1. **Read this guide thoroughly** before deployment
2. **Follow the setup instructions step-by-step**
3. **Test locally first** (visit your Replit project)
4. **Deploy via Replit Publish** button
5. **Share URLs with dispatchers and drivers**

**Happy route optimizing!** 🚚📍

---

## Additional Resources

- Google Cloud Console: https://console.cloud.google.com/
- Replit Docs: https://docs.replit.com/
- Express.js Docs: https://expressjs.com/
- React Docs: https://react.dev/
- PostgreSQL Docs: https://www.postgresql.org/docs/
