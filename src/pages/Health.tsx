import { useState } from "react";
import { useHealthData, HealthRecordWithCattle, HealthFormData } from "@/hooks/useHealthData";
import { HealthPageSkeleton } from "@/components/common/PageSkeletons";
import { PageHeader } from "@/components/common/PageHeader";
import { DataTable } from "@/components/common/DataTable";
import { DataFilters, TimeRange, SortOption } from "@/components/common/DataFilters";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Stethoscope, Loader2, Syringe, Pill, Activity, Calendar } from "lucide-react";
import { format, addDays, isBefore } from "date-fns";
import { cn } from "@/lib/utils";

const recordTypeIcons: Record<string, React.ReactNode> = {
  vaccination: <Syringe className="h-4 w-4" />,
  treatment: <Pill className="h-4 w-4" />,
  checkup: <Activity className="h-4 w-4" />,
  disease: <Stethoscope className="h-4 w-4" />,
};

const recordTypeColors: Record<string, string> = {
  vaccination: "bg-info/10 text-info border-info/20",
  treatment: "bg-warning/10 text-warning border-warning/20",
  checkup: "bg-success/10 text-success border-success/20",
  disease: "bg-destructive/10 text-destructive border-destructive/20",
};

const emptyFormData: HealthFormData = {
  cattle_id: "",
  record_date: format(new Date(), "yyyy-MM-dd"),
  record_type: "vaccination",
  title: "",
  description: "",
  vet_name: "",
  cost: "",
  next_due_date: "",
};

const healthSortOptions: SortOption[] = [
  { value: "record_date", label: "Date" },
  { value: "record_type", label: "Type" },
  { value: "cost", label: "Cost" },
];

export default function HealthPage() {
  const [timeRange, setTimeRange] = useState<TimeRange>("3m");
  const [sortBy, setSortBy] = useState("record_date");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const { records, cattle, isLoading, createRecord, isCreating } = useHealthData({ timeRange, sortBy, sortDirection });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [typeFilter, setTypeFilter] = useState("all");
  const [formData, setFormData] = useState<HealthFormData>(emptyFormData);

  if (isLoading) {
    return <HealthPageSkeleton />;
  }

  const handleSave = () => {
    if (!formData.cattle_id || !formData.title) return;
    createRecord({ formData, cattleList: cattle }, {
      onSuccess: () => {
        setDialogOpen(false);
        setFormData(emptyFormData);
      },
    });
  };

  const upcomingReminders = records.filter(
    (r) => r.next_due_date && isBefore(new Date(r.next_due_date), addDays(new Date(), 7))
  );

  const filteredRecords = typeFilter === "all" ? records : records.filter((r) => r.record_type === typeFilter);

  const columns = [
    {
      key: "record_date",
      header: "Date",
      render: (item: HealthRecordWithCattle) => (
        <span className="font-medium">{format(new Date(item.record_date), "dd MMM yyyy")}</span>
      ),
    },
    {
      key: "cattle",
      header: "Cattle",
      render: (item: HealthRecordWithCattle) => (
        <span className="font-medium text-primary">
          {item.cattle?.tag_number} {item.cattle?.name && `(${item.cattle.name})`}
        </span>
      ),
    },
    {
      key: "record_type",
      header: "Type",
      render: (item: HealthRecordWithCattle) => (
        <Badge variant="outline" className={cn("capitalize gap-1", recordTypeColors[item.record_type])}>
          {recordTypeIcons[item.record_type]}
          {item.record_type}
        </Badge>
      ),
    },
    { key: "title", header: "Title", render: (item: HealthRecordWithCattle) => item.title },
    { key: "vet_name", header: "Vet", render: (item: HealthRecordWithCattle) => item.vet_name || "-" },
    { key: "cost", header: "Cost", render: (item: HealthRecordWithCattle) => item.cost ? `₹${Number(item.cost).toLocaleString()}` : "-" },
    {
      key: "next_due_date",
      header: "Next Due",
      render: (item: HealthRecordWithCattle) => {
        if (!item.next_due_date) return "-";
        const isOverdue = isBefore(new Date(item.next_due_date), new Date());
        return <span className={cn(isOverdue && "text-destructive font-medium")}>{format(new Date(item.next_due_date), "dd MMM yyyy")}</span>;
      },
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Health Records" description="Track vaccinations, treatments, and health checkups" icon={Stethoscope} action={{ label: "Add Record", onClick: () => setDialogOpen(true) }} />

      <div className="grid gap-4 sm:grid-cols-4">
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold">{records.length}</div><p className="text-sm text-muted-foreground">Total Records</p></CardContent></Card>
        <Card className="border-info/30"><CardContent className="pt-6"><div className="text-2xl font-bold text-info">{records.filter(r => r.record_type === "vaccination").length}</div><p className="text-sm text-muted-foreground">Vaccinations</p></CardContent></Card>
        <Card className="border-warning/30"><CardContent className="pt-6"><div className="text-2xl font-bold text-warning">{records.filter(r => r.record_type === "treatment").length}</div><p className="text-sm text-muted-foreground">Treatments</p></CardContent></Card>
        <Card className="border-destructive/30"><CardContent className="pt-6"><div className="text-2xl font-bold text-destructive">{upcomingReminders.length}</div><p className="text-sm text-muted-foreground">Due This Week</p></CardContent></Card>
      </div>

      {upcomingReminders.length > 0 && (
        <Card className="border-warning/30 bg-warning/5">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-3"><Calendar className="h-5 w-5 text-warning" /><h3 className="font-semibold">Upcoming Reminders</h3></div>
            <div className="space-y-2">
              {upcomingReminders.slice(0, 5).map((r) => (
                <div key={r.id} className="flex items-center justify-between text-sm">
                  <span><span className="font-medium">{r.cattle?.tag_number}</span> - {r.title}</span>
                  <Badge variant="outline" className="text-warning border-warning/30">{format(new Date(r.next_due_date!), "dd MMM")}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={typeFilter} onValueChange={setTypeFilter}>
          <TabsList><TabsTrigger value="all">All</TabsTrigger><TabsTrigger value="vaccination">Vaccinations</TabsTrigger><TabsTrigger value="treatment">Treatments</TabsTrigger><TabsTrigger value="checkup">Checkups</TabsTrigger><TabsTrigger value="disease">Diseases</TabsTrigger></TabsList>
        </Tabs>
        <DataFilters
          timeRange={timeRange}
          onTimeRangeChange={setTimeRange}
          sortBy={sortBy}
          sortOptions={healthSortOptions}
          onSortChange={setSortBy}
          sortDirection={sortDirection}
          onSortDirectionChange={setSortDirection}
        />
      </div>

      <DataTable data={filteredRecords} columns={columns} loading={isLoading} searchPlaceholder="Search by cattle, title..." emptyMessage="No health records found" />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Add Health Record</DialogTitle><DialogDescription>Record vaccination, treatment, or health checkup</DialogDescription></DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2"><Label>Cattle *</Label><Select value={formData.cattle_id} onValueChange={(v) => setFormData({ ...formData, cattle_id: v })}><SelectTrigger><SelectValue placeholder="Select cattle" /></SelectTrigger><SelectContent>{cattle.map((c) => (<SelectItem key={c.id} value={c.id}>{c.tag_number} {c.name && `(${c.name})`}</SelectItem>))}</SelectContent></Select></div>
              <div className="space-y-2"><Label>Record Type</Label><Select value={formData.record_type} onValueChange={(v) => setFormData({ ...formData, record_type: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="vaccination">Vaccination</SelectItem><SelectItem value="treatment">Treatment</SelectItem><SelectItem value="checkup">Checkup</SelectItem><SelectItem value="disease">Disease</SelectItem></SelectContent></Select></div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2"><Label>Date</Label><Input type="date" value={formData.record_date} onChange={(e) => setFormData({ ...formData, record_date: e.target.value })} /></div>
              <div className="space-y-2"><Label>Title *</Label><Input value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} placeholder="e.g., FMD Vaccination" /></div>
            </div>
            <div className="space-y-2"><Label>Description</Label><Textarea value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} placeholder="Details..." rows={2} /></div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2"><Label>Vet Name</Label><Input value={formData.vet_name} onChange={(e) => setFormData({ ...formData, vet_name: e.target.value })} placeholder="Dr. Name" /></div>
              <div className="space-y-2"><Label>Cost (₹)</Label><Input type="number" value={formData.cost} onChange={(e) => setFormData({ ...formData, cost: e.target.value })} placeholder="0" /></div>
              <div className="space-y-2"><Label>Next Due Date</Label><Input type="date" value={formData.next_due_date} onChange={(e) => setFormData({ ...formData, next_due_date: e.target.value })} /></div>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={isCreating}>{isCreating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Add Record</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
