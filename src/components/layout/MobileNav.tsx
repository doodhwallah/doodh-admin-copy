import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useUserRole } from "@/hooks/useUserRole";
import {
  Droplets,
  Menu,
  Settings,
  LogOut,
  MoreHorizontal,
  UserCircle,
  Shield,
} from "lucide-react";
import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { ThemeToggle } from "@/components/common/ThemeToggle";
import { getFilteredNavItems, bottomNavItems, roleSections, roleLabels, NavItem } from "@/config/navigation";

interface MobileNavProps {
  onLogout: () => void;
}

export function MobileNav({ onLogout }: MobileNavProps) {
  const location = useLocation();
  const { role, loading, userName } = useUserRole();
  const [sheetOpen, setSheetOpen] = useState(false);

  const canAccessSettings = role === "super_admin" || role === "manager";
  
  const visibleNavItems = getFilteredNavItems(role);
  
  const allowedSections = role ? roleSections[role] || [] : [];
  const visibleBottomNavItems = bottomNavItems.filter(item => 
    allowedSections.includes(item.section)
  );

  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-50 flex h-14 items-center justify-between border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 px-4 safe-area-top">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
            <Droplets className="h-4 w-4 text-primary-foreground" />
          </div>
          <span className="font-semibold text-sm">Doodh Wallah</span>
        </div>
        
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="h-9 w-9">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-[280px] p-0 safe-area-right">
            <SheetHeader className="p-4 border-b">
              <SheetTitle className="text-left">Menu</SheetTitle>
            </SheetHeader>
            <ScrollArea className="h-[calc(100vh-200px)]">
              {loading ? (
                <div className="space-y-2 p-3">
                  {[1, 2, 3, 4, 5].map(i => (
                    <Skeleton key={i} className="h-11 w-full" />
                  ))}
                </div>
              ) : (
                <nav className="flex flex-col gap-1 p-3">
                  {visibleNavItems.map((item) => {
                    const isActive = location.pathname === item.href;
                    return (
                      <Link
                        key={item.href}
                        to={item.href}
                        onClick={() => setSheetOpen(false)}
                        className={cn(
                          "flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium transition-colors touch-target",
                          isActive
                            ? "bg-primary text-primary-foreground"
                            : "hover:bg-muted"
                        )}
                      >
                        <item.icon className="h-5 w-5 shrink-0" />
                        <span>{item.title}</span>
                      </Link>
                    );
                  })}
                </nav>
              )}
            </ScrollArea>
            <div className="absolute bottom-0 left-0 right-0 border-t bg-background p-3 safe-area-bottom">
              <ThemeToggle collapsed={false} />
              
              {canAccessSettings && (
                <Link
                  to="/settings"
                  onClick={() => setSheetOpen(false)}
                  className="flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium hover:bg-muted touch-target"
                >
                  <Settings className="h-5 w-5" />
                  <span>Settings</span>
                </Link>
              )}
              <Button
                variant="ghost"
                onClick={() => {
                  setSheetOpen(false);
                  onLogout();
                }}
                className="w-full justify-start gap-3 px-3 py-3 text-sm font-medium text-destructive hover:bg-destructive/10 touch-target"
              >
                <LogOut className="h-5 w-5" />
                <span>Logout</span>
              </Button>
              
              <Separator className="my-2" />
              
              <div className="flex items-center gap-3 px-3 py-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
                  <UserCircle className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="flex flex-col overflow-hidden">
                  <span className="truncate text-xs font-medium">
                    {userName || "User"}
                  </span>
                  <span className="truncate text-[10px] text-muted-foreground flex items-center gap-1">
                    <Shield className="h-2.5 w-2.5" />
                    {role ? roleLabels[role] || role : "Loading..."}
                  </span>
                </div>
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </header>

      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 safe-area-bottom">
        <div className="flex h-16 items-center justify-around px-2">
          {visibleBottomNavItems.slice(0, 4).map((item) => {
            const isActive = location.pathname === item.href;
            
            return (
              <Link
                key={item.href}
                to={item.href}
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5 px-3 py-2 rounded-lg transition-colors touch-target min-w-[64px]",
                  isActive
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <item.icon className={cn("h-5 w-5", isActive && "text-primary")} />
                <span className={cn("text-[10px] font-medium", isActive && "text-primary")}>{item.title}</span>
              </Link>
            );
          })}
          
          <button
            onClick={() => setSheetOpen(true)}
            className={cn(
              "flex flex-col items-center justify-center gap-0.5 px-3 py-2 rounded-lg transition-colors touch-target min-w-[64px]",
              "text-muted-foreground hover:text-foreground"
            )}
          >
            <MoreHorizontal className="h-5 w-5" />
            <span className="text-[10px] font-medium">More</span>
          </button>
        </div>
      </nav>
    </>
  );
}
