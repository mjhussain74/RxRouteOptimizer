# Route Optimizer - Delivery Management System

## Overview
A web-based route optimization application designed to streamline delivery operations for pharmacies. It processes delivery addresses from CSV files, generates optimized routes, and provides a Progressive Web App (PWA) for drivers on both iOS and Android. The system aims to enhance efficiency, reduce delivery times, and improve overall delivery management with features like real-time tracking, geo-fencing, and comprehensive reporting.

## User Preferences
- Dark theme UI preferred
- Mobile-first approach for driver app

## System Architecture

### Tech Stack
- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui
- **Backend**: Express.js, Socket.IO
- **Database**: PostgreSQL with Drizzle ORM
- **Object Storage**: Replit Object Storage
- **Maps**: Leaflet with OpenStreetMap
- **Geocoding**: Google Maps Geocoding API
- **Route Optimization**: Google Routes API

### Core Features
- **Order Management**: CSV/Excel upload with OCR scanning (Tesseract.js) and editable order tables. Includes support for urgent priority stops that reorder routes.
- **Route Optimization**: Utilizes Google Routes API for waypoint optimization. Prevents duplicate deliveries in active routes.
- **Interactive Mapping**: Leaflet maps display routes, stops, and real-time driver locations.
- **Driver Mobile App (PWA)**: Supports navigation, barcode scanning for package verification, and delivery tracking. Features local-first proof storage with background sync.
- **Real-time Communication**: WebSocket-based updates between dispatchers and drivers.
- **Multi-Pharmacy & Geo-fencing**: Supports multiple pharmacies with geo-fenced delivery zones and driver assignments.
- **Reporting**: Generates PDF/CSV delivery reports (jsPDF).
- **Security & Access Control**: Role-based authentication (admin, pharmacy_admin, dispatcher) with HIPAA compliance measures, session management, and rate limiting.
- **Object Storage**: Integrated for delivery proof images (signatures, photos) with background upload queues.

### System Design
- **Modular Structure**: Divided into `client/`, `server/`, and `shared/` directories.
- **Database Schema**: Comprehensive schema including users, pharmacies, drivers, delivery batches, deliveries, zones, routes, and audit logs.
- **API Endpoints**: RESTful API for managing drivers, batches, routes, zones, and delivery proofs.
- **PWA Development**: Mobile-first design for the driver application, enabling offline capabilities and background synchronization.

## External Dependencies
- Google Maps Geocoding API
- Google Routes API
- Replit Object Storage
- Tesseract.js (for OCR scanning)
- Socket.IO (for WebSocket communication)
- Leaflet (for mapping)
- OpenStreetMap (map tiles)
- jsPDF (for PDF report generation)