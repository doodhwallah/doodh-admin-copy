import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { PageHeader } from "@/components/common/PageHeader";
import { DataTable } from "@/components/common/DataTable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, MapPin, Users, Truck, ArrowUp, ArrowDown, GripVertical, Loader2 } from "lucide-react";
import { devError } from "@/lib/utils";

interface Route {
  id: string;
  name: string;
  area: string | null;
  assigned_staff: string | null;
  sequence_order: number | null;
  is_active: boolean;
}

interface RouteStop {
  id: string;
  route_id: string;
  customer_id: string;
  stop_order: number;
  estimated_arrival_time: string | null;
  notes: string | null;
  customer?: Customer;
}

interface Customer {
  id: string;
  name: string;
  address: string | null;
  area: string | null;
  phone: string | null;
}

interface Employee {
  id: string;
  name: string;
  user_id: string | null;
}

export default function RoutesPage() {
  const { toast } = useToast();
  const [routes, setRoutes] = useState<Route[]>([]);
  const [routeStops, setRouteStops] = useState<RouteStop[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [routeDialogOpen, setRouteDialogOpen] = useState(false);
  const [stopDialogOpen, setStopDialogOpen] = useState(false);
  const [selectedRoute, setSelectedRoute] = useState<Route | null>(null);
  
  // Route form
  const [routeName, setRouteName] = useState("");
  const [routeArea, setRouteArea] = useState("");
  const [assignedStaff, setAssignedStaff] = useState("");
  const [sequenceOrder, setSequenceOrder] = useState("");
  
  // Stop form
  const [stopRouteId, setStopRouteId] = useState("");
  const [stopCustomerId, setStopCustomerId] = useState("");
  const [stopOrder, setStopOrder] = useState("");
  const [estimatedTime, setEstimatedTime] = useState("");

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [routesRes, stopsRes, customersRes, employeesRes] = await Promise.all([
        supabase.from("routes").select("*").order("sequence_order"),
        supabase.from("route_stops").select("*").order("stop_order"),
        supabase.from("customers").select("id, name, address, area, phone").eq("is_active", true),
        supabase.from("employees").select("id, name, user_id").eq("role", "delivery_staff").eq("is_active", true),
      ]);

      if (routesRes.data) setRoutes(routesRes.data);
      if (stopsRes.data) setRouteStops(stopsRes.data);
      if (customersRes.data) setCustomers(customersRes.data);
      if (employeesRes.data) setEmployees(employeesRes.data);
    } catch (error) {
      devError("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateRoute = async () => {
    if (!routeName) {
      toast({ title: "Error", description: "Route name is required", variant: "destructive" });
      return;
    }

    const { error } = await supabase.from("routes").insert({
      name: routeName,
      area: routeArea || null,
      assigned_staff: assignedStaff || null,
      sequence_order: sequenceOrder ? parseInt(sequenceOrder) : null,
    });

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Success", description: "Route created" });
      setRouteDialogOpen(false);
      resetRouteForm();
      fetchData();
    }
  };

  const handleCreateStop = async () => {
    if (!stopRouteId || !stopCustomerId || !stopOrder) {
      toast({ title: "Error", description: "Please fill required fields", variant: "destructive" });
      return;
    }

    const { error } = await supabase.from("route_stops").insert({
      route_id: stopRouteId,
      customer_id: stopCustomerId,
      stop_order: parseInt(stopOrder),
      estimated_arrival_time: estimatedTime || null,
    });

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Success", description: "Stop added to route" });
      setStopDialogOpen(false);
      resetStopForm();
      fetchData();
    }
  };

  const handleMoveStop = async (stopId: string, direction: "up" | "down") => {
    const stop = routeStops.find(s => s.id === stopId);
    if (!stop) return;

    const routeStopsForRoute = routeStops
      .filter(s => s.route_id === stop.route_id)
      .sort((a, b) => a.stop_order - b.stop_order);
    
    const currentIndex = routeStopsForRoute.findIndex(s => s.id === stopId);
    const swapIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;

    if (swapIndex < 0 || swapIndex >= routeStopsForRoute.length) return;

    const swapStop = routeStopsForRoute[swapIndex];

    await Promise.all([
      supabase.from("route_stops").update({ stop_order: swapStop.stop_order }).eq("id", stop.id),
      supabase.from("route_stops").update({ stop_order: stop.stop_order }).eq("id", swapStop.id),
    ]);

    fetchData();
  };

  const handleDeleteStop = async (stopId: string) => {
    const { error } = await supabase.from("route_stops").delete().eq("id", stopId);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Success", description: "Stop removed" });
      fetchData();
    }
  };

  const resetRouteForm = () => {
    setRouteName("");
    setRouteArea("");
    setAssignedStaff("");
    setSequenceOrder("");
  };

  const resetStopForm = () => {
    setStopRouteId("");
    setStopCustomerId("");
    setStopOrder("");
    setEstimatedTime("");
  };

  const getCustomerName = (id: string) => customers.find(c => c.id === id)?.name || "Unknown";
  const getEmployeeName = (id: string | null) => {
    if (!id) return "Unassigned";
    return employees.find(e => e.user_id === id)?.name || "Unknown";
  };

  // Stats
  const totalRoutes = routes.length;
  const activeRoutes = routes.filter(r => r.is_active).length;
  const totalStops = routeStops.length;
  const avgStopsPerRoute = totalRoutes > 0 ? Math.round(totalStops / totalRoutes) : 0;

  const routeColumns = [
    { key: "name" as const, header: "Route Name" },
    { key: "area" as const, header: "Area", render: (row: Route) => row.area || "-" },
    { 
      key: "assigned_staff" as const, 
      header: "Assigned To", 
      render: (row: Route) => getEmployeeName(row.assigned_staff) 
    },
    { 
      key: "sequence_order" as const, 
      header: "Stops", 
      render: (row: Route) => routeStops.filter(s => s.route_id === row.id).length 
    },
    { 
      key: "is_active" as const, 
      header: "Status", 
      render: (row: Route) => (
        <Badge variant={row.is_active ? "default" : "secondary"}>
          {row.is_active ? "Active" : "Inactive"}
        </Badge>
      )
    },
    {
      key: "id" as const,
      header: "Actions",
      render: (row: Route) => (
        <Button variant="outline" size="sm" onClick={() => setSelectedRoute(row)}>
          View Stops
        </Button>
      )
    }
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Route Management"
        description="Optimize delivery routes and assign stops"
      />

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Routes</CardTitle>
            <MapPin className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalRoutes}</div>
            <p className="text-xs text-muted-foreground">{activeRoutes} active</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Stops</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalStops}</div>
            <p className="text-xs text-muted-foreground">delivery points</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Avg Stops/Route</CardTitle>
            <Truck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{avgStopsPerRoute}</div>
            <p className="text-xs text-muted-foreground">stops per route</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Delivery Staff</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{employees.length}</div>
            <p className="text-xs text-muted-foreground">available</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex gap-2 justify-end">
        <Dialog open={routeDialogOpen} onOpenChange={setRouteDialogOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" /> Create Route</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Route</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Route Name *</Label>
                <Input value={routeName} onChange={e => setRouteName(e.target.value)} placeholder="e.g., Morning Route A" />
              </div>
              <div className="space-y-2">
                <Label>Area</Label>
                <Input value={routeArea} onChange={e => setRouteArea(e.target.value)} placeholder="e.g., Sector 5-10" />
              </div>
              <div className="space-y-2">
                <Label>Assign to Staff</Label>
                <Select value={assignedStaff} onValueChange={setAssignedStaff}>
                  <SelectTrigger><SelectValue placeholder="Select staff" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Unassigned</SelectItem>
                    {employees.map(emp => (
                      <SelectItem key={emp.id} value={emp.user_id || emp.id}>{emp.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Sequence Order</Label>
                <Input type="number" value={sequenceOrder} onChange={e => setSequenceOrder(e.target.value)} placeholder="Route priority" />
              </div>
              <Button className="w-full" onClick={handleCreateRoute}>Create Route</Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={stopDialogOpen} onOpenChange={setStopDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="outline"><Plus className="mr-2 h-4 w-4" /> Add Stop</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Stop to Route</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Route *</Label>
                <Select value={stopRouteId} onValueChange={setStopRouteId}>
                  <SelectTrigger><SelectValue placeholder="Select route" /></SelectTrigger>
                  <SelectContent>
                    {routes.filter(r => r.is_active).map(route => (
                      <SelectItem key={route.id} value={route.id}>{route.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Customer *</Label>
                <Select value={stopCustomerId} onValueChange={setStopCustomerId}>
                  <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
                  <SelectContent>
                    {customers.map(customer => (
                      <SelectItem key={customer.id} value={customer.id}>
                        {customer.name} {customer.area && `(${customer.area})`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Stop Order *</Label>
                  <Input type="number" value={stopOrder} onChange={e => setStopOrder(e.target.value)} placeholder="1, 2, 3..." />
                </div>
                <div className="space-y-2">
                  <Label>Est. Arrival Time</Label>
                  <Input type="time" value={estimatedTime} onChange={e => setEstimatedTime(e.target.value)} />
                </div>
              </div>
              <Button className="w-full" onClick={handleCreateStop}>Add Stop</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Routes List */}
        <Card>
          <CardHeader>
            <CardTitle>All Routes</CardTitle>
            <CardDescription>Click "View Stops" to manage route stops</CardDescription>
          </CardHeader>
          <CardContent>
            <DataTable data={routes} columns={routeColumns} searchable searchPlaceholder="Search routes..." />
          </CardContent>
        </Card>

        {/* Route Stops */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              {selectedRoute ? `Stops: ${selectedRoute.name}` : "Select a Route"}
            </CardTitle>
            <CardDescription>
              {selectedRoute ? `${routeStops.filter(s => s.route_id === selectedRoute.id).length} stops` : "Click 'View Stops' on a route"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {selectedRoute ? (
              <div className="space-y-2">
                {routeStops
                  .filter(s => s.route_id === selectedRoute.id)
                  .sort((a, b) => a.stop_order - b.stop_order)
                  .map((stop, index, arr) => {
                    const customer = customers.find(c => c.id === stop.customer_id);
                    return (
                      <div key={stop.id} className="flex items-center gap-3 rounded-lg border p-3">
                        <div className="flex flex-col items-center gap-1">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-6 w-6"
                            disabled={index === 0}
                            onClick={() => handleMoveStop(stop.id, "up")}
                          >
                            <ArrowUp className="h-3 w-3" />
                          </Button>
                          <span className="text-xs font-medium text-muted-foreground">{stop.stop_order}</span>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-6 w-6"
                            disabled={index === arr.length - 1}
                            onClick={() => handleMoveStop(stop.id, "down")}
                          >
                            <ArrowDown className="h-3 w-3" />
                          </Button>
                        </div>
                        <div className="flex-1">
                          <p className="font-medium">{customer?.name || "Unknown"}</p>
                          <p className="text-sm text-muted-foreground">{customer?.address || customer?.area || "-"}</p>
                          {stop.estimated_arrival_time && (
                            <p className="text-xs text-muted-foreground">ETA: {stop.estimated_arrival_time}</p>
                          )}
                        </div>
                        <Button variant="ghost" size="sm" className="text-destructive" onClick={() => handleDeleteStop(stop.id)}>
                          Remove
                        </Button>
                      </div>
                    );
                  })}
                {routeStops.filter(s => s.route_id === selectedRoute.id).length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">No stops added yet</p>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">Select a route to view and manage its stops</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
