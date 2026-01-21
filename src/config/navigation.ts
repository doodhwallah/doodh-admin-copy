import {
  LayoutDashboard,
  Beef,
  Droplets,
  Users,
  Truck,
  Receipt,
  Package,
  Stethoscope,
  Wheat,
  Wallet,
  BarChart3,
  Milk,
  UsersRound,
  Baby,
  Wrench,
  MapPin,
  DollarSign,
  Activity,
  Bell,
} from "lucide-react";

export interface NavItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  section: string;
  badge?: number;
}

export const allNavItems: NavItem[] = [
  { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard, section: "main" },
  { title: "Cattle", href: "/cattle", icon: Beef, section: "cattle" },
  { title: "Milk Production", href: "/production", icon: Droplets, section: "production" },
  { title: "Products", href: "/products", icon: Milk, section: "main" },
  { title: "Customers", href: "/customers", icon: Users, section: "customers" },
  { title: "Deliveries", href: "/deliveries", icon: Truck, section: "deliveries" },
  { title: "Routes", href: "/routes", icon: MapPin, section: "deliveries" },
  { title: "Billing", href: "/billing", icon: Receipt, section: "billing" },
  { title: "Bottles", href: "/bottles", icon: Package, section: "bottles" },
  { title: "Health Records", href: "/health", icon: Stethoscope, section: "health" },
  { title: "Breeding", href: "/breeding", icon: Baby, section: "health" },
  { title: "Feed & Inventory", href: "/inventory", icon: Wheat, section: "inventory" },
  { title: "Equipment", href: "/equipment", icon: Wrench, section: "inventory" },
  { title: "Expenses", href: "/expenses", icon: Wallet, section: "expenses" },
  { title: "Price Rules", href: "/price-rules", icon: DollarSign, section: "billing" },
  { title: "Reports", href: "/reports", icon: BarChart3, section: "reports" },
  { title: "Employees", href: "/employees", icon: UsersRound, section: "employees" },
  { title: "User Management", href: "/users", icon: UsersRound, section: "users" },
  { title: "Notifications", href: "/notifications", icon: Bell, section: "notifications" },
  { title: "Audit Logs", href: "/audit-logs", icon: Activity, section: "audit" },
];

export const roleSections: Record<string, string[]> = {
  super_admin: ["main", "cattle", "production", "customers", "deliveries", "billing", "bottles", "health", "inventory", "expenses", "reports", "settings", "users", "employees", "notifications", "audit"],
  manager: ["main", "cattle", "production", "customers", "deliveries", "billing", "bottles", "health", "inventory", "expenses", "reports", "settings", "employees", "notifications"],
  accountant: ["main", "billing", "expenses", "reports", "customers", "employees"],
  delivery_staff: ["main", "deliveries", "customers", "bottles"],
  farm_worker: ["main", "cattle", "production", "health", "inventory"],
  vet_staff: ["main", "cattle", "health"],
  auditor: ["main", "billing", "expenses", "reports", "audit"],
};

export const roleLabels: Record<string, string> = {
  super_admin: "Super Admin",
  manager: "Manager",
  accountant: "Accountant",
  delivery_staff: "Delivery Staff",
  farm_worker: "Farm Worker",
  vet_staff: "Vet Staff",
  auditor: "Auditor",
};

export function getFilteredNavItems(role: string | null): NavItem[] {
  if (!role) return [];
  const allowedSections = roleSections[role] || [];
  return allNavItems.filter(item => allowedSections.includes(item.section));
}

export const bottomNavItems: NavItem[] = [
  { title: "Home", href: "/dashboard", icon: LayoutDashboard, section: "main" },
  { title: "Cattle", href: "/cattle", icon: Beef, section: "cattle" },
  { title: "Production", href: "/production", icon: Droplets, section: "production" },
  { title: "Customers", href: "/customers", icon: Users, section: "customers" },
];
