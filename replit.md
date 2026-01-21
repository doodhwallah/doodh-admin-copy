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

## Automated Expense Tracking (Jan 2026)
- Feed/Inventory purchases automatically create expense entries in the Expenses table
- Works when:
  - Adding a **new inventory item** with initial stock and cost per unit
  - Adding stock to an **existing item** that has cost per unit set
- Implementation in `src/hooks/useInventoryData.ts` using `logFeedPurchase` from `useExpenseAutomation`
- Duplicate prevention via reference-based checking

## Security Improvements (Jan 2026)
- **Ledger Race Conditions**: Fixed with per-customer mutex locking in `useLedgerAutomation.ts`
- **Auth Rate Limiting**: 5 attempts max, 15-minute lockout, 1s debounce in `Auth.tsx`
- **Role-Based Route Protection**: Route access checks in `DashboardLayout.tsx` using `useUserRole` hook
- **Pagination**: Added to Customers page (50 items/page with search)
- **Console Logging**: Replaced all `console.log/error/warn` with `devLog/devError/devWarn` utilities (dev-only)
- **Error Boundary**: App wrapped with ErrorBoundary component for crash prevention
- **Error Sanitization**: Sensitive error details filtered via `sanitizeError` utility

## Development
- **Port**: 5000
- **Command**: `npm run dev`

## Environment Variables
The project uses Supabase for backend services:
- `VITE_SUPABASE_PROJECT_ID` - Supabase project ID
- `VITE_SUPABASE_PUBLISHABLE_KEY` - Supabase anon key
- `VITE_SUPABASE_URL` - Supabase API URL

## Mobile & TWA Optimization (Jan 2026)
The app is now fully responsive and optimized for both web and Android TWA:

### PWA Configuration
- `public/manifest.json` - App manifest with theme colors, display mode, and icons
- `public/sw.js` - Service worker for offline capability
- Icons in `public/icons/` - SVG app icons (generate PNGs for Play Store)

### Responsive Navigation
- **Desktop**: Fixed sidebar (`AppSidebar.tsx`) with collapsible toggle
- **Mobile**: Bottom navigation bar + hamburger drawer menu (`MobileNav.tsx`)
- Both use shared config from `src/config/navigation.ts` with role-based filtering

### Mobile-Friendly Features
- Touch targets minimum 44px for accessibility
- Safe area handling for notched devices (env() insets)
- Disabled tap highlights and pull-to-refresh
- Input font-size 16px to prevent iOS zoom
- Responsive breakpoints with `useIsMobile` hook

### Key Files
- `src/hooks/useMediaQuery.ts` - Screen size detection hooks
- `src/config/navigation.ts` - Shared navigation config with role permissions
- `src/index.css` - Mobile & TWA specific CSS utilities

### For Production TWA
1. Generate PNG icons (192x192, 512x512) from the SVG templates
2. Build the app: `npm run build`
3. Use the `dist/` folder with Android Studio's TWA builder

## Supabase Keep-Alive (Jan 2026)
GitHub Actions workflow runs daily to prevent Supabase from pausing after 7 days of inactivity.

**File**: `.github/workflows/supabase-keepalive.yml`
**Schedule**: Daily at 6:00 AM UTC
**Type**: Read-only RPC function call (no storage consumed)

### Database Setup
The migration `supabase/migrations/20260121170000_add_ping_function.sql` creates a `ping()` function:
- Returns "pong" when called
- Granted to both `anon` and `authenticated` roles
- Uses `STABLE` (read-only, no side effects)

### Required GitHub Secrets
Add these secrets to your GitHub repository (Settings → Secrets → Actions):
1. `SUPABASE_URL` - Your Supabase project URL (e.g., `https://xxx.supabase.co`)
2. `SUPABASE_ANON_KEY` - Your Supabase anon/public key

### Manual Trigger
You can also manually run the workflow from GitHub Actions → Supabase Keep Alive → Run workflow

## Deployment
Static build deployed to `dist/` directory.
- Build command: `npm run build`
