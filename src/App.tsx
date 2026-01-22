import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { CustomerLayout } from "@/components/customer/CustomerLayout";
import { CustomerAuthProvider } from "@/hooks/useCustomerAuth";

// Lazy load pages for faster initial load
const Auth = lazy(() => import("./pages/Auth"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const CattlePage = lazy(() => import("./pages/Cattle"));
const ProductionPage = lazy(() => import("./pages/Production"));
const ProductsPage = lazy(() => import("./pages/Products"));
const CustomersPage = lazy(() => import("./pages/Customers"));
const DeliveriesPage = lazy(() => import("./pages/Deliveries"));
const BillingPage = lazy(() => import("./pages/Billing"));
const BottlesPage = lazy(() => import("./pages/Bottles"));
const HealthPage = lazy(() => import("./pages/Health"));
const InventoryPage = lazy(() => import("./pages/Inventory"));
const ExpensesPage = lazy(() => import("./pages/Expenses"));
const ReportsPage = lazy(() => import("./pages/Reports"));
const SettingsPage = lazy(() => import("./pages/Settings"));
const UserManagement = lazy(() => import("./pages/UserManagement"));
const EmployeesPage = lazy(() => import("./pages/Employees"));
const BreedingPage = lazy(() => import("./pages/Breeding"));
const EquipmentPage = lazy(() => import("./pages/Equipment"));
const RoutesPage = lazy(() => import("./pages/Routes"));
const PriceRulesPage = lazy(() => import("./pages/PriceRules"));
const AuditLogsPage = lazy(() => import("./pages/AuditLogs"));
const NotificationsPage = lazy(() => import("./pages/Notifications"));
const NotFound = lazy(() => import("./pages/NotFound"));
// Customer App Pages
const CustomerAuth = lazy(() => import("./pages/customer/CustomerAuth"));
const CustomerDashboard = lazy(() => import("./pages/customer/CustomerDashboard"));
const CustomerSubscription = lazy(() => import("./pages/customer/CustomerSubscription"));
const CustomerProducts = lazy(() => import("./pages/customer/CustomerProducts"));
const CustomerDeliveries = lazy(() => import("./pages/customer/CustomerDeliveries"));
const CustomerBilling = lazy(() => import("./pages/customer/CustomerBilling"));
const CustomerProfile = lazy(() => import("./pages/customer/CustomerProfile"));

// Loading fallback component
const PageLoader = () => (
  <div className="flex items-center justify-center min-h-screen">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
  </div>
);

// Optimized query client with caching
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // Data fresh for 5 minutes
      gcTime: 1000 * 60 * 30, // Cache for 30 minutes
      refetchOnWindowFocus: false, // Don't refetch on tab focus
      retry: 1, // Only retry once on failure
    },
  },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/auth" element={<Auth />} />
            
            {/* Staff Dashboard Routes */}
            <Route element={<DashboardLayout />}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/cattle" element={<CattlePage />} />
              <Route path="/production" element={<ProductionPage />} />
              <Route path="/products" element={<ProductsPage />} />
              <Route path="/customers" element={<CustomersPage />} />
              <Route path="/deliveries" element={<DeliveriesPage />} />
              <Route path="/billing" element={<BillingPage />} />
              <Route path="/bottles" element={<BottlesPage />} />
              <Route path="/health" element={<HealthPage />} />
              <Route path="/inventory" element={<InventoryPage />} />
              <Route path="/expenses" element={<ExpensesPage />} />
              <Route path="/reports" element={<ReportsPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/users" element={<UserManagement />} />
              <Route path="/employees" element={<EmployeesPage />} />
              <Route path="/breeding" element={<BreedingPage />} />
              <Route path="/equipment" element={<EquipmentPage />} />
              <Route path="/routes" element={<RoutesPage />} />
              <Route path="/price-rules" element={<PriceRulesPage />} />
              <Route path="/audit-logs" element={<AuditLogsPage />} />
              <Route path="/notifications" element={<NotificationsPage />} />
            </Route>

            {/* Customer App Routes */}
            <Route path="/customer/auth" element={<CustomerAuthProvider><CustomerAuth /></CustomerAuthProvider>} />
            <Route element={<CustomerAuthProvider><CustomerLayout /></CustomerAuthProvider>}>
              <Route path="/customer/dashboard" element={<CustomerDashboard />} />
              <Route path="/customer/subscription" element={<CustomerSubscription />} />
              <Route path="/customer/products" element={<CustomerProducts />} />
              <Route path="/customer/deliveries" element={<CustomerDeliveries />} />
              <Route path="/customer/billing" element={<CustomerBilling />} />
              <Route path="/customer/profile" element={<CustomerProfile />} />
            </Route>

            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
