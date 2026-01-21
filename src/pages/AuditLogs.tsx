import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/common/PageHeader";
import { DataTable } from "@/components/common/DataTable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Activity, Eye, Filter, Download, Loader2, User, Clock, FileText } from "lucide-react";
import { format } from "date-fns";
import { devError } from "@/lib/utils";

interface ActivityLog {
  id: string;
  user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: any;
  ip_address: string | null;
  created_at: string;
}

interface Profile {
  id: string;
  full_name: string;
}

const actionColors: Record<string, string> = {
  create: "bg-success",
  update: "bg-info",
  delete: "bg-destructive",
  login: "bg-breeding-pregnancy",
  logout: "bg-status-inactive",
};

const entityLabels: Record<string, string> = {
  cattle: "Cattle",
  customer: "Customer",
  delivery: "Delivery",
  invoice: "Invoice",
  payment: "Payment",
  expense: "Expense",
  user: "User",
  production: "Production",
  health: "Health Record",
};

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLog, setSelectedLog] = useState<ActivityLog | null>(null);
  
  // Filters
  const [entityFilter, setEntityFilter] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [logsRes, profilesRes] = await Promise.all([
        supabase.from("activity_logs").select("*").order("created_at", { ascending: false }).limit(500),
        supabase.from("profiles").select("id, full_name"),
      ]);

      if (logsRes.data) setLogs(logsRes.data);
      if (profilesRes.data) setProfiles(profilesRes.data);
    } catch (error) {
      devError("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  const getUserName = (userId: string | null) => {
    if (!userId) return "System";
    return profiles.find(p => p.id === userId)?.full_name || "Unknown User";
  };

  const filteredLogs = logs.filter(log => {
    if (entityFilter && log.entity_type !== entityFilter) return false;
    if (actionFilter && log.action !== actionFilter) return false;
    if (dateFrom && new Date(log.created_at) < new Date(dateFrom)) return false;
    if (dateTo && new Date(log.created_at) > new Date(dateTo + "T23:59:59")) return false;
    return true;
  });

  // Stats
  const totalLogs = logs.length;
  const todayLogs = logs.filter(l => {
    const logDate = new Date(l.created_at).toDateString();
    return logDate === new Date().toDateString();
  }).length;
  const uniqueUsers = new Set(logs.map(l => l.user_id).filter(Boolean)).size;
  const entityTypes = [...new Set(logs.map(l => l.entity_type))];
  const actionTypes = [...new Set(logs.map(l => l.action))];

  const columns = [
    { 
      key: "created_at" as const, 
      header: "Time", 
      render: (row: ActivityLog) => (
        <div className="text-sm">
          <p>{format(new Date(row.created_at), "dd MMM yyyy")}</p>
          <p className="text-muted-foreground">{format(new Date(row.created_at), "HH:mm:ss")}</p>
        </div>
      )
    },
    { 
      key: "user_id" as const, 
      header: "User", 
      render: (row: ActivityLog) => (
        <div className="flex items-center gap-2">
          <User className="h-4 w-4 text-muted-foreground" />
          <span>{getUserName(row.user_id)}</span>
        </div>
      )
    },
    { 
      key: "action" as const, 
      header: "Action", 
      render: (row: ActivityLog) => (
        <Badge className={`${actionColors[row.action] || "bg-gray-500"} text-white`}>
          {row.action}
        </Badge>
      )
    },
    { 
      key: "entity_type" as const, 
      header: "Entity", 
      render: (row: ActivityLog) => entityLabels[row.entity_type] || row.entity_type 
    },
    { 
      key: "entity_id" as const, 
      header: "Entity ID", 
      render: (row: ActivityLog) => row.entity_id ? (
        <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{row.entity_id.slice(0, 8)}...</code>
      ) : "-"
    },
    { key: "ip_address" as const, header: "IP Address", render: (row: ActivityLog) => row.ip_address || "-" },
    { 
      key: "id" as const, 
      header: "", 
      render: (row: ActivityLog) => (
        <Button variant="ghost" size="sm" onClick={() => setSelectedLog(row)}>
          <Eye className="h-4 w-4" />
        </Button>
      )
    },
  ];

  const handleExport = () => {
    const csv = [
      ["Time", "User", "Action", "Entity Type", "Entity ID", "IP Address", "Details"].join(","),
      ...filteredLogs.map(log => [
        format(new Date(log.created_at), "yyyy-MM-dd HH:mm:ss"),
        getUserName(log.user_id),
        log.action,
        log.entity_type,
        log.entity_id || "",
        log.ip_address || "",
        JSON.stringify(log.details || {}).replace(/,/g, ";"),
      ].join(","))
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-logs-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
  };

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
        title="Audit Trail"
        description="Track all system activities and changes"
      >
        <Button variant="outline" onClick={handleExport}>
          <Download className="mr-2 h-4 w-4" /> Export
        </Button>
      </PageHeader>

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Logs</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalLogs}</div>
            <p className="text-xs text-muted-foreground">activities recorded</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Today's Activity</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{todayLogs}</div>
            <p className="text-xs text-muted-foreground">actions today</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Active Users</CardTitle>
            <User className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{uniqueUsers}</div>
            <p className="text-xs text-muted-foreground">unique users</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Entity Types</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{entityTypes.length}</div>
            <p className="text-xs text-muted-foreground">tracked entities</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-4 w-4" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Entity Type</label>
              <Select value={entityFilter || "all"} onValueChange={(v) => setEntityFilter(v === "all" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="All entities" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Entities</SelectItem>
                  {entityTypes.map(type => (
                    <SelectItem key={type} value={type}>{entityLabels[type] || type}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Action</label>
              <Select value={actionFilter || "all"} onValueChange={(v) => setActionFilter(v === "all" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="All actions" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Actions</SelectItem>
                  {actionTypes.map(action => (
                    <SelectItem key={action} value={action}>{action}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">From Date</label>
              <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">To Date</label>
              <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
            </div>
          </div>
          {(entityFilter || actionFilter || dateFrom || dateTo) && (
            <Button 
              variant="ghost" 
              className="mt-4" 
              onClick={() => {
                setEntityFilter("");
                setActionFilter("");
                setDateFrom("");
                setDateTo("");
              }}
            >
              Clear Filters
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Logs Table */}
      <Card>
        <CardHeader>
          <CardTitle>Activity Logs</CardTitle>
          <CardDescription>
            Showing {filteredLogs.length} of {logs.length} logs
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable data={filteredLogs} columns={columns} itemsPerPage={20} />
        </CardContent>
      </Card>

      {/* Details Dialog */}
      <Dialog open={!!selectedLog} onOpenChange={() => setSelectedLog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Activity Details</DialogTitle>
          </DialogHeader>
          {selectedLog && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Time</p>
                  <p className="font-medium">{format(new Date(selectedLog.created_at), "dd MMM yyyy HH:mm:ss")}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">User</p>
                  <p className="font-medium">{getUserName(selectedLog.user_id)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Action</p>
                  <Badge className={`${actionColors[selectedLog.action] || "bg-gray-500"} text-white`}>
                    {selectedLog.action}
                  </Badge>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Entity Type</p>
                  <p className="font-medium">{entityLabels[selectedLog.entity_type] || selectedLog.entity_type}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Entity ID</p>
                  <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{selectedLog.entity_id || "N/A"}</code>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">IP Address</p>
                  <p className="font-medium">{selectedLog.ip_address || "N/A"}</p>
                </div>
              </div>
              
              {selectedLog.details && Object.keys(selectedLog.details).length > 0 && (
                <div>
                  <p className="text-sm text-muted-foreground mb-2">Details</p>
                  <ScrollArea className="h-48 rounded-md border p-4">
                    <pre className="text-xs">{JSON.stringify(selectedLog.details, null, 2)}</pre>
                  </ScrollArea>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
