import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { PageHeader } from "@/components/common/PageHeader";
import { DataTable } from "@/components/common/DataTable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { devError } from "@/lib/utils";
import { Plus, MessageSquare, Bell, Send, CheckCircle, XCircle, Clock, Loader2 } from "lucide-react";
import { format } from "date-fns";

interface NotificationTemplate {
  id: string;
  name: string;
  template_type: string;
  channel: string;
  subject: string | null;
  body: string;
  variables: any;
  is_active: boolean;
}

interface NotificationLog {
  id: string;
  template_id: string | null;
  recipient_type: string;
  recipient_id: string;
  recipient_contact: string | null;
  channel: string;
  subject: string | null;
  body: string;
  status: string;
  sent_at: string | null;
  error_message: string | null;
  created_at: string;
}

const channelColors: Record<string, string> = {
  sms: "bg-info",
  whatsapp: "bg-success",
  email: "bg-breeding-pregnancy",
};

const statusColors: Record<string, string> = {
  pending: "bg-warning",
  sent: "bg-success",
  failed: "bg-destructive",
};

const templateTypes = [
  { value: "payment_reminder", label: "Payment Reminder" },
  { value: "delivery_alert", label: "Delivery Alert" },
  { value: "health_alert", label: "Health Alert" },
  { value: "inventory_alert", label: "Inventory Alert" },
  { value: "custom", label: "Custom" },
];

export default function NotificationsPage() {
  const { toast } = useToast();
  const [templates, setTemplates] = useState<NotificationTemplate[]>([]);
  const [logs, setLogs] = useState<NotificationLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  
  // Form states
  const [name, setName] = useState("");
  const [templateType, setTemplateType] = useState("custom");
  const [channel, setChannel] = useState("sms");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [templatesRes, logsRes] = await Promise.all([
        supabase.from("notification_templates").select("*").order("created_at", { ascending: false }),
        supabase.from("notification_logs").select("*").order("created_at", { ascending: false }).limit(200),
      ]);

      if (templatesRes.data) setTemplates(templatesRes.data);
      if (logsRes.data) setLogs(logsRes.data);
    } catch (error) {
      devError("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTemplate = async () => {
    if (!name || !body) {
      toast({ title: "Error", description: "Name and body are required", variant: "destructive" });
      return;
    }

    // Extract variables from body (format: {{variable_name}})
    const variableMatches = body.match(/\{\{(\w+)\}\}/g) || [];
    const variables = variableMatches.map(v => v.replace(/\{\{|\}\}/g, ""));

    const { error } = await supabase.from("notification_templates").insert({
      name,
      template_type: templateType,
      channel,
      subject: subject || null,
      body,
      variables,
    });

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Success", description: "Template created" });
      setTemplateDialogOpen(false);
      resetForm();
      fetchData();
    }
  };

  const handleToggleTemplate = async (id: string, isActive: boolean) => {
    const { error } = await supabase.from("notification_templates").update({ is_active: !isActive }).eq("id", id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      fetchData();
    }
  };

  const handleDeleteTemplate = async (id: string) => {
    const { error } = await supabase.from("notification_templates").delete().eq("id", id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Success", description: "Template deleted" });
      fetchData();
    }
  };

  const resetForm = () => {
    setName("");
    setTemplateType("custom");
    setChannel("sms");
    setSubject("");
    setBody("");
  };

  const getTemplateName = (id: string | null) => {
    if (!id) return "Custom";
    return templates.find(t => t.id === id)?.name || "Unknown";
  };

  // Stats
  const totalTemplates = templates.length;
  const activeTemplates = templates.filter(t => t.is_active).length;
  const totalSent = logs.filter(l => l.status === "sent").length;
  const pendingCount = logs.filter(l => l.status === "pending").length;
  const failedCount = logs.filter(l => l.status === "failed").length;

  const templateColumns = [
    { key: "name" as const, header: "Name" },
    { 
      key: "template_type" as const, 
      header: "Type", 
      render: (row: NotificationTemplate) => templateTypes.find(t => t.value === row.template_type)?.label || row.template_type 
    },
    { 
      key: "channel" as const, 
      header: "Channel", 
      render: (row: NotificationTemplate) => (
        <Badge className={`${channelColors[row.channel]} text-white`}>
          {row.channel.toUpperCase()}
        </Badge>
      )
    },
    { 
      key: "variables" as const, 
      header: "Variables", 
      render: (row: NotificationTemplate) => {
        const vars = row.variables as unknown as string[];
        return vars?.length > 0 ? vars.join(", ") : "-";
      }
    },
    { 
      key: "is_active" as const, 
      header: "Active", 
      render: (row: NotificationTemplate) => (
        <Switch 
          checked={row.is_active} 
          onCheckedChange={() => handleToggleTemplate(row.id, row.is_active)} 
        />
      )
    },
    {
      key: "id" as const,
      header: "",
      render: (row: NotificationTemplate) => (
        <Button variant="ghost" size="sm" className="text-destructive" onClick={() => handleDeleteTemplate(row.id)}>
          Delete
        </Button>
      )
    }
  ];

  const logColumns = [
    { 
      key: "created_at" as const, 
      header: "Time", 
      render: (row: NotificationLog) => format(new Date(row.created_at), "dd MMM HH:mm") 
    },
    { 
      key: "template_id" as const, 
      header: "Template", 
      render: (row: NotificationLog) => getTemplateName(row.template_id) 
    },
    { 
      key: "channel" as const, 
      header: "Channel", 
      render: (row: NotificationLog) => (
        <Badge className={`${channelColors[row.channel]} text-white`}>
          {row.channel.toUpperCase()}
        </Badge>
      )
    },
    { key: "recipient_contact" as const, header: "To", render: (row: NotificationLog) => row.recipient_contact || "-" },
    { 
      key: "status" as const, 
      header: "Status", 
      render: (row: NotificationLog) => (
        <Badge className={`${statusColors[row.status]} text-white`}>
          {row.status}
        </Badge>
      )
    },
    { 
      key: "sent_at" as const, 
      header: "Sent At", 
      render: (row: NotificationLog) => row.sent_at ? format(new Date(row.sent_at), "HH:mm:ss") : "-" 
    },
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
        title="Notifications"
        description="Manage notification templates and view delivery logs"
      />

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Templates</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalTemplates}</div>
            <p className="text-xs text-muted-foreground">{activeTemplates} active</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Sent</CardTitle>
            <CheckCircle className="h-4 w-4 text-success" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-success">{totalSent}</div>
            <p className="text-xs text-muted-foreground">delivered</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Pending</CardTitle>
            <Clock className="h-4 w-4 text-warning" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-warning">{pendingCount}</div>
            <p className="text-xs text-muted-foreground">in queue</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Failed</CardTitle>
            <XCircle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{failedCount}</div>
            <p className="text-xs text-muted-foreground">errors</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
            <Bell className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {logs.length > 0 ? Math.round((totalSent / logs.length) * 100) : 0}%
            </div>
            <p className="text-xs text-muted-foreground">delivery rate</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="templates" className="space-y-4">
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="templates">Templates</TabsTrigger>
            <TabsTrigger value="logs">Delivery Logs</TabsTrigger>
          </TabsList>
          <Dialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="mr-2 h-4 w-4" /> New Template</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Notification Template</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Template Name *</Label>
                  <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g., Monthly Invoice Reminder" />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Type</Label>
                    <Select value={templateType} onValueChange={setTemplateType}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {templateTypes.map(type => (
                          <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Channel</Label>
                    <Select value={channel} onValueChange={setChannel}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sms">SMS</SelectItem>
                        <SelectItem value="whatsapp">WhatsApp</SelectItem>
                        <SelectItem value="email">Email</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {channel === "email" && (
                  <div className="space-y-2">
                    <Label>Subject</Label>
                    <Input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Email subject line" />
                  </div>
                )}

                <div className="space-y-2">
                  <Label>Message Body *</Label>
                  <Textarea 
                    value={body} 
                    onChange={e => setBody(e.target.value)} 
                    placeholder="Use {{variable_name}} for dynamic content. E.g., Dear {{customer_name}}, your payment of ₹{{amount}} is due."
                    rows={4}
                  />
                  <p className="text-xs text-muted-foreground">
                    Variables: Use {"{{variable}}"} syntax. Common: customer_name, amount, due_date, product_name
                  </p>
                </div>

                <Button className="w-full" onClick={handleCreateTemplate}>Create Template</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <TabsContent value="templates">
          <Card>
            <CardHeader>
              <CardTitle>Notification Templates</CardTitle>
              <CardDescription>Create and manage message templates</CardDescription>
            </CardHeader>
            <CardContent>
              <DataTable data={templates} columns={templateColumns} searchable searchPlaceholder="Search templates..." />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="logs">
          <Card>
            <CardHeader>
              <CardTitle>Delivery Logs</CardTitle>
              <CardDescription>Track notification delivery status</CardDescription>
            </CardHeader>
            <CardContent>
              <DataTable data={logs} columns={logColumns} searchable searchPlaceholder="Search logs..." itemsPerPage={20} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Integration Notice */}
      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-4 w-4" />
            SMS/WhatsApp Integration
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            To enable actual SMS and WhatsApp notifications, you'll need to connect a messaging provider 
            (like Twilio, MSG91, or WhatsApp Business API). The notification system is ready to integrate 
            with any provider once configured.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
