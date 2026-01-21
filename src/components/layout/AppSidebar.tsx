import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useUserRole } from "@/hooks/useUserRole";
import {
  Droplets,
  Settings,
  ChevronLeft,
  ChevronRight,
  LogOut,
  UserCircle,
  Shield,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { ThemeToggle } from "@/components/common/ThemeToggle";
import { allNavItems, roleSections, roleLabels, NavItem } from "@/config/navigation";

interface AppSidebarProps {
  onLogout: () => void;
}

export function AppSidebar({ onLogout }: AppSidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const { role, loading, userName } = useUserRole();

  // Get sections this role can access
  const allowedSections = role ? roleSections[role] || [] : [];
  
  // Filter nav items based on role
  const visibleNavItems = allNavItems.filter(item => 
    allowedSections.includes(item.section)
  );

  // Split into main and management sections for display
  const mainItems = visibleNavItems.filter(item => 
    ["main", "cattle", "production", "customers", "deliveries", "billing"].includes(item.section)
  );
  const managementItems = visibleNavItems.filter(item => 
    ["bottles", "health", "inventory", "expenses", "reports", "users", "employees", "notifications", "audit"].includes(item.section)
  );

  const NavLink = ({ item }: { item: NavItem }) => {
    const isActive = location.pathname === item.href;
    
    return (
      <Link
        to={item.href}
        className={cn(
          "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
          "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
          isActive
            ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
            : "text-sidebar-foreground/80",
          collapsed && "justify-center px-2"
        )}
      >
        <item.icon className={cn("h-5 w-5 shrink-0", isActive && "text-sidebar-primary-foreground")} />
        {!collapsed && (
          <span className="truncate">{item.title}</span>
        )}
        {!collapsed && item.badge && (
          <span className="ml-auto flex h-5 w-5 items-center justify-center rounded-full bg-sidebar-primary text-[10px] font-semibold text-sidebar-primary-foreground">
            {item.badge}
          </span>
        )}
      </Link>
    );
  };

  const canAccessSettings = role === "super_admin" || role === "manager";

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 z-40 flex h-screen flex-col border-r border-sidebar-border bg-sidebar transition-all duration-300",
        collapsed ? "w-[70px]" : "w-[260px]"
      )}
    >
      {/* Header */}
      <div className="flex h-16 items-center justify-between border-b border-sidebar-border px-4">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sidebar-primary">
              <Droplets className="h-5 w-5 text-sidebar-primary-foreground" />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-bold text-sidebar-foreground">Doodh Wallah</span>
              <span className="text-[10px] text-sidebar-foreground/60">Dairy Management</span>
            </div>
          </div>
        )}
        {collapsed && (
          <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-lg bg-sidebar-primary">
            <Droplets className="h-5 w-5 text-sidebar-primary-foreground" />
          </div>
        )}
      </div>

      {/* Navigation */}
      <ScrollArea className="flex-1 px-3 py-4">
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map(i => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : (
          <>
            <nav className="flex flex-col gap-1">
              {mainItems.map((item) => (
                <NavLink key={item.href} item={item} />
              ))}
            </nav>

            {managementItems.length > 0 && (
              <>
                <Separator className="my-4 bg-sidebar-border" />

                {!collapsed && (
                  <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/50">
                    Management
                  </p>
                )}
                
                <nav className="flex flex-col gap-1">
                  {managementItems.map((item) => (
                    <NavLink key={item.href} item={item} />
                  ))}
                </nav>
              </>
            )}
          </>
        )}
      </ScrollArea>

      {/* Footer */}
      <div className="border-t border-sidebar-border p-3">
        {/* Theme Toggle */}
        <ThemeToggle collapsed={collapsed} />

        {canAccessSettings && (
          <Link
            to="/settings"
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
              "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              location.pathname === "/settings" && "bg-sidebar-accent text-sidebar-accent-foreground",
              collapsed && "justify-center px-2"
            )}
          >
            <Settings className="h-5 w-5 shrink-0" />
            {!collapsed && <span>Settings</span>}
          </Link>
        )}

        <Button
          variant="ghost"
          onClick={onLogout}
          className={cn(
            "mt-1 w-full justify-start gap-3 px-3 py-2.5 text-sm font-medium",
            "text-sidebar-foreground/80 hover:bg-destructive/10 hover:text-destructive",
            collapsed && "justify-center px-2"
          )}
        >
          <LogOut className="h-5 w-5 shrink-0" />
          {!collapsed && <span>Logout</span>}
        </Button>

        <Separator className="my-3 bg-sidebar-border" />

        <div className={cn("flex items-center gap-3 px-3", collapsed && "justify-center px-0")}>
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-sidebar-accent">
            <UserCircle className="h-5 w-5 text-sidebar-accent-foreground" />
          </div>
          {!collapsed && (
            <div className="flex flex-col overflow-hidden">
              <span className="truncate text-xs font-medium text-sidebar-foreground">
                {userName || "User"}
              </span>
              <span className="truncate text-[10px] text-sidebar-foreground/50 flex items-center gap-1">
                <Shield className="h-2.5 w-2.5" />
                {role ? roleLabels[role] || role : "Loading..."}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Collapse Button */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3 top-20 flex h-6 w-6 items-center justify-center rounded-full border border-sidebar-border bg-sidebar text-sidebar-foreground shadow-sm transition-colors hover:bg-sidebar-accent"
      >
        {collapsed ? (
          <ChevronRight className="h-3 w-3" />
        ) : (
          <ChevronLeft className="h-3 w-3" />
        )}
      </button>
    </aside>
  );
}
