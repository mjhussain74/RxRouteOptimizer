# Route Optimizer - Delivery Management System

## Overview
A web-based route optimization application that takes multiple delivery addresses from a CSV file and generates optimized routes. Includes a Progressive Web App (PWA) for drivers that works on iOS and Android.

## Current State
- Fully functional MVP with all core features implemented
- Web dashboard for dispatchers
- Mobile-friendly driver app
- Real-time WebSocket communication

## Architecture

### Tech Stack
- **Frontend**: React 18 + TypeScript + Vite
- **Backend**: Express.js + Socket.IO
- **Database**: PostgreSQL with Drizzle ORM
- **Object Storage**: Replit Object Storage for delivery proof images
- **Maps**: Leaflet with OpenStreetMap tiles
- **Geocoding**: Google Maps Geocoding API
- **Route Optimization**: Google Routes API
- **Styling**: Tailwind CSS + shadcn/ui components

### Key Features
1. **Order Management**: CSV/Excel upload with OCR scanning via Tesseract.js and editable order table
2. **Route Optimization**: Google Routes API with waypoint order optimization
3. **Interactive Maps**: Leaflet maps showing routes, stops, and driver locations
4. **Driver Mobile App**: PWA for iOS/Android with navigation, barcode scanning, and delivery tracking
5. **Real-time Updates**: WebSocket-based live updates between dispatcher and drivers
6. **Multi-Pharmacy Support**: Database schema supports multiple pharmacies with geo-fenced delivery zones
7. **Geo-fenced Zones**: Interactive map for creating circular delivery zones with driver assignments
8. **Package Scanning**: Barcode scanning required before route activation
9. **Urgent Priority**: Mark stops as urgent to automatically reorder routes
10. **Reporting**: PDF/CSV export of delivery reports using jsPDF

### Directory Structure
```
├── client/                 # Frontend React application
│   ├── src/
│   │   ├── components/     # React components
│   │   │   ├── Dashboard.tsx       # Main dispatcher dashboard
│   │   │   ├── BatchUpload.tsx     # CSV upload component
│   │   │   ├── OrderManagement.tsx # CSV/Excel upload with OCR
│   │   │   ├── RouteOptimizer.tsx  # Route optimization UI
│   │   │   ├── RouteMap.tsx        # Interactive map view
│   │   │   ├── ZoneManager.tsx     # Geo-fenced delivery zones
│   │   │   ├── DriverManager.tsx   # Driver management
│   │   │   ├── ReportGenerator.tsx # PDF/CSV report export
│   │   │   └── DriverApp.tsx       # Mobile driver app
│   │   └── lib/            # Utilities and stores
│   └── public/             # Static assets
├── server/                 # Backend Express server
│   ├── index.ts           # Server entry point
│   ├── routes.ts          # API routes and WebSocket handlers
│   └── storage.ts         # Database operations
└── shared/                # Shared types and schemas
    └── schema.ts          # Drizzle database schema
```

### API Endpoints
- `GET /api/drivers` - List all drivers
- `POST /api/drivers` - Create a new driver
- `GET /api/batches` - List all delivery batches
- `POST /api/batches/upload` - Upload CSV with addresses
- `GET /api/routes` - List all routes
- `POST /api/routes/optimize` - Generate optimized route
- `POST /api/routes/:id/assign` - Assign route to driver
- `POST /api/routes/:id/dispatch` - Dispatch route to driver
- `POST /api/routes/:id/activate` - Activate route after scanning all packages
- `POST /api/routes/:routeId/stops/:stopId/complete` - Mark stop as completed
- `POST /api/routes/:routeId/stops/:stopId/scan` - Mark package as scanned
- `POST /api/routes/:routeId/stops/:stopId/urgent` - Mark stop as urgent (reorders route)
- `GET /api/zones` - List all delivery zones
- `POST /api/zones` - Create a delivery zone
- `PUT /api/zones/:id` - Update a delivery zone
- `DELETE /api/zones/:id` - Delete a delivery zone

### Database Schema
- **users**: System users (dispatchers)
- **pharmacies**: Multi-pharmacy support
- **drivers**: Delivery drivers
- **delivery_batches**: Uploaded CSV batches
- **deliveries**: Individual delivery addresses
- **delivery_zones**: Geo-fenced delivery areas
- **driver_zones**: Driver-to-zone assignments
- **routes**: Optimized routes
- **route_stops**: Stops within a route (includes packageScanned, priority fields)
- **driver_locations**: Driver GPS history
- **delivery_proofs**: Proof of delivery records (with signatureUrl, pictureUrl, uploadStatus for object storage)
- **upload_queue**: Background upload job queue for object storage
- **ocr_logs**: OCR scanning history

## Usage

### For Dispatchers
1. Upload a CSV file with delivery addresses
2. Select a batch and set starting location
3. Generate optimized route
4. Assign route to available driver
5. Dispatch route to send to driver's mobile app

### For Drivers
1. Open driver app URL on mobile device
2. Add to home screen for quick access
3. Receive dispatched routes in real-time
4. Use "Navigate" button for turn-by-turn directions
5. Mark deliveries as complete

### CSV Format
```csv
address,customer_name,customer_phone,rx_number,notes
123 Main St, New York, NY,John Doe,555-0101,RX123,Leave at door
456 Oak Ave, Brooklyn, NY,Jane Smith,555-0102,RX456,Ring bell twice
```

## Recent Changes
- Initial MVP implementation (2024-11-28)
- Added secure password hashing with bcrypt
- Integrated Google Maps Geocoding API for address geocoding
- Integrated Google Routes API for advanced route optimization
- Added real-time WebSocket communication
- Created mobile-friendly driver PWA
- Improved password security architecture (passwords never exposed in API)
- Added Rx Number column to CSV upload and delivery tracking
- Multi-pharmacy transformation (2026-01-07):
  - Added OrderManagement with CSV/Excel upload and Tesseract.js OCR scanning
  - Created ZoneManager with interactive Leaflet map for geo-fenced zones
  - Enhanced DriverApp with package scanning for route activation
  - Implemented urgent priority system with automatic route reordering
  - Added ReportGenerator with PDF/CSV export functionality
  - Added new database tables: pharmacies, delivery_zones, driver_zones, ocr_logs
- Delivery-prescription consolidation (2026-01-09):
  - New prescriptions table with one-to-many relationship to deliveries
  - Address normalization with SHA256 hashing for consistent address matching
  - Deliveries now consolidate multiple prescriptions by normalized address
  - Delivery ID generation (DELYYYYNNNNNN format, no hyphens)
  - DriverApp barcode verification supports multiple prescriptions per delivery
  - Enhanced ReportGenerator with delivery-level and prescription-level views
  - Added split/merge delivery functionality for manual override capabilities
- Delivery consolidation improvements (2026-01-11):
  - New deliveries for same address only consolidate with ACTIVE deliveries
  - Completed/cancelled deliveries are not reused for new prescriptions
  - New orders to an already-delivered address get new delivery IDs
  - Direct order selection in Route Optimizer (no barcode scanning required)
- Role-based authentication and multi-tenant dashboards (2026-01-11):
  - Session-based authentication using express-session with server-side sessions
  - Role-based access control: admin (full access) and dispatcher (pharmacy-scoped)
  - Separate AdminDashboard with pharmacy management and user provisioning
  - PharmacyDashboard with pharmacy-scoped views for batches, routes, reports
  - Initial admin setup flow on first launch
  - Protected API endpoints with requireAuth and requireAdmin middleware
  - Comprehensive ownership validation on all data endpoints (batches, deliveries, routes, prescriptions)
  - Driver and zone management restricted to admin role only
  - Ownership checks on route optimization with batch/delivery validation
  - Prescription CRUD endpoints validate delivery ownership
- Object storage with background upload queue (2026-01-21):
  - Replit Object Storage integration for delivery proof images (signatures, photos)
  - Background upload queue with retry logic (max 3 attempts per upload)
  - Non-blocking proof submission - API returns immediately, uploads happen asynchronously
  - Upload status tracking: pending, uploading, completed, failed, partial
  - Graceful fallback to database storage when object storage is unavailable
  - New database tables: upload_queue for job persistence
  - New fields in delivery_proofs: signatureUrl, pictureUrl, uploadStatus
  - Storage endpoint (/api/storage/*) serves files from object storage

## User Preferences
- Dark theme UI preferred
- Mobile-first approach for driver app

## Future Enhancements
1. **Pharmacy-specific filtering**: Add pharmacy selection to batch uploads and route filtering
2. **Advanced OCR**: Integrate paid OCR service like Veryfi for better accuracy
3. **Zone-based route optimization**: Auto-assign deliveries to zones and drivers
