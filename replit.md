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
- **Maps**: Leaflet with OpenStreetMap tiles
- **Geocoding**: OpenStreetMap Nominatim API
- **Styling**: Tailwind CSS + shadcn/ui components

### Key Features
1. **CSV Upload**: Drag-and-drop CSV file upload with automatic address geocoding
2. **Route Optimization**: Nearest-neighbor algorithm with 2-opt improvement
3. **Interactive Maps**: Leaflet maps showing routes, stops, and driver locations
4. **Driver Mobile App**: PWA for iOS/Android with navigation and delivery tracking
5. **Real-time Updates**: WebSocket-based live updates between dispatcher and drivers

### Directory Structure
```
├── client/                 # Frontend React application
│   ├── src/
│   │   ├── components/     # React components
│   │   │   ├── Dashboard.tsx       # Main dispatcher dashboard
│   │   │   ├── BatchUpload.tsx     # CSV upload component
│   │   │   ├── RouteOptimizer.tsx  # Route optimization UI
│   │   │   ├── RouteMap.tsx        # Interactive map view
│   │   │   ├── DriverManager.tsx   # Driver management
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
- `POST /api/routes/:routeId/stops/:stopId/complete` - Mark stop as completed

### Database Schema
- **users**: System users (dispatchers)
- **drivers**: Delivery drivers
- **delivery_batches**: Uploaded CSV batches
- **deliveries**: Individual delivery addresses
- **routes**: Optimized routes
- **route_stops**: Stops within a route
- **driver_locations**: Driver GPS history

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
address,customer_name,customer_phone,notes
123 Main St, New York, NY,John Doe,555-0101,Leave at door
456 Oak Ave, Brooklyn, NY,Jane Smith,555-0102,Ring bell twice
```

## Recent Changes
- Initial MVP implementation (2024-11-28)
- Added secure password hashing with bcrypt
- Implemented route optimization with nearest-neighbor + 2-opt
- Added real-time WebSocket communication
- Created mobile-friendly driver PWA

## User Preferences
- Dark theme UI preferred
- Mobile-first approach for driver app
