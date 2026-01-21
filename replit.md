# Doodh Wallah - Dairy Management Solution

## Overview
Doodh Wallah is a complete dairy management solution built with React, TypeScript, and Vite. It provides features for:
- Cattle Management
- Milk Production Tracking
- Customer Billing
- Delivery Routes
- Health Records
- Financial Reports

## Tech Stack
- **Frontend**: React 18 with TypeScript
- **Build Tool**: Vite
- **UI Components**: Radix UI + Tailwind CSS + shadcn/ui
- **Backend**: Supabase (external service)
- **State Management**: TanStack Query

## Project Structure
```
src/
  hooks/       - Custom React hooks for data fetching and automation
  lib/         - Utility functions and Supabase helpers
  components/  - UI components (shadcn/ui based)
public/        - Static assets
supabase/      - Supabase configuration
```

## Development
- **Port**: 5000
- **Command**: `npm run dev`

## Environment Variables
The project uses Supabase for backend services:
- `VITE_SUPABASE_PROJECT_ID` - Supabase project ID
- `VITE_SUPABASE_PUBLISHABLE_KEY` - Supabase anon key
- `VITE_SUPABASE_URL` - Supabase API URL

## Deployment
Static build deployed to `dist/` directory.
- Build command: `npm run build`
