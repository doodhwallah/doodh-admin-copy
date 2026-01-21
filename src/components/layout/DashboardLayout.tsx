import { useState, useEffect } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { AppSidebar } from "./AppSidebar";
import { supabase } from "@/integrations/supabase/client";
import { User, Session } from "@supabase/supabase-js";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useUserRole, rolePermissions } from "@/hooks/useUserRole";

const routePermissions: Record<string, string[]> = {
  "/dashboard": [],
  "/cattle": ["main", "cattle", "production", "health", "inventory"],
  "/production": ["main", "cattle", "production", "health", "inventory"],
  "/products": ["main", "management"],
  "/customers": ["main", "management", "deliveries", "customers", "bottles"],
  "/deliveries": ["main", "management", "deliveries", "customers", "bottles"],
  "/billing": ["main", "management", "billing", "expenses", "reports"],
  "/bottles": ["main", "management", "deliveries", "customers", "bottles"],
  "/health": ["main", "cattle", "production", "health", "inventory"],
  "/inventory": ["main", "cattle", "production", "health", "inventory"],
  "/expenses": ["main", "management", "billing", "expenses", "reports"],
  "/reports": ["main", "management", "billing", "expenses", "reports"],
  "/settings": ["main", "management", "settings"],
  "/users": ["main", "management", "settings"],
  "/employees": ["main", "management", "settings"],
  "/breeding": ["main", "cattle", "health"],
  "/equipment": ["main", "management"],
  "/routes": ["main", "management", "deliveries"],
  "/price-rules": ["main", "management", "billing"],
  "/audit-logs": ["main", "management", "reports"],
  "/notifications": [],
};

function canAccessRoute(role: string | null, pathname: string): boolean {
  if (!role) return false;
  
  const permissions = rolePermissions[role as keyof typeof rolePermissions];
  if (!permissions) return false;
  if (permissions.canAccessAll) return true;
  
  const routePath = "/" + pathname.split("/")[1];
  const requiredSections = routePermissions[routePath];
  
  if (!requiredSections || requiredSections.length === 0) return true;
  
  return requiredSections.some(section => permissions.navSections.includes(section));
}

export function DashboardLayout() {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const { role, loading: roleLoading } = useUserRole();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);

        if (event === 'SIGNED_OUT') {
          navigate('/auth');
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);

      if (!session) {
        navigate('/auth');
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  useEffect(() => {
    if (!roleLoading && user) {
      if (!role || !canAccessRoute(role, location.pathname)) {
        if (location.pathname !== '/dashboard') {
          toast({
            title: "Access Denied",
            description: "You don't have permission to access this page.",
            variant: "destructive",
          });
          navigate('/dashboard');
        }
      }
    }
  }, [role, roleLoading, location.pathname, navigate, toast, user]);

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast({
        title: "Error signing out",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Signed out successfully",
        description: "See you next time!",
      });
      navigate('/auth');
    }
  };

  if (loading || roleLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <AppSidebar onLogout={handleLogout} />
      <main className={cn(
        "min-h-screen transition-all duration-300",
        "ml-[260px]" // Adjust based on sidebar width
      )}>
        <div className="container py-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
