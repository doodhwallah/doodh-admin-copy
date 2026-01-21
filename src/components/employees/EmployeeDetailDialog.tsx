import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  User, Phone, MapPin, Calendar, DollarSign, 
  Clock, CheckCircle, XCircle, AlertCircle,
  Briefcase, TrendingUp, CreditCard
} from "lucide-react";
import { format, parseISO, differenceInDays } from "date-fns";
import { devError } from "@/lib/utils";

interface Employee {
  id: string;
  name: string;
  phone: string | null;
  role: string;
  salary: number | null;
  joining_date: string | null;
  is_active: boolean;
  address: string | null;
}

interface Attendance {
  id: string;
  employee_id: string;
  attendance_date: string;
  check_in: string | null;
  check_out: string | null;
  status: string;
  notes: string | null;
}

interface PayrollRecord {
  id: string;
  employee_id: string;
  pay_period_start: string;
  pay_period_end: string;
  base_salary: number;
  overtime_hours: number;
  bonus: number;
  deductions: number;
  net_salary: number;
  payment_status: string;
  payment_date: string | null;
  payment_mode: string | null;
  notes: string | null;
  created_at: string;
}

interface EmployeeShift {
  id: string;
  shift_id: string;
  effective_from: string;
  effective_to: string | null;
  shift?: {
    name: string;
    start_time: string;
    end_time: string;
  };
}

interface EmployeeDetailDialogProps {
  employee: Employee | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const roleLabels: Record<string, string> = {
  super_admin: "Super Admin",
  manager: "Manager",
  accountant: "Accountant",
  delivery_staff: "Delivery Staff",
  farm_worker: "Farm Worker",
  vet_staff: "Vet Staff",
  auditor: "Auditor",
};

export function EmployeeDetailDialog({ employee, open, onOpenChange }: EmployeeDetailDialogProps) {
  const [loading, setLoading] = useState(true);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [payroll, setPayroll] = useState<PayrollRecord[]>([]);
  const [shifts, setShifts] = useState<EmployeeShift[]>([]);

  useEffect(() => {
    if (employee && open) {
      fetchEmployeeData();
    }
  }, [employee, open]);

  const fetchEmployeeData = async () => {
    if (!employee) return;
    
    setLoading(true);
    try {
      const [attRes, payRes, shiftRes] = await Promise.all([
        supabase
          .from("attendance")
          .select("*")
          .eq("employee_id", employee.id)
          .order("attendance_date", { ascending: false }),
        supabase
          .from("payroll_records")
          .select("*")
          .eq("employee_id", employee.id)
          .order("pay_period_end", { ascending: false }),
        supabase
          .from("employee_shifts")
          .select("*, shifts(name, start_time, end_time)")
          .eq("employee_id", employee.id)
          .order("effective_from", { ascending: false }),
      ]);

      if (attRes.data) setAttendance(attRes.data);
      if (payRes.data) setPayroll(payRes.data);
      if (shiftRes.data) {
        const formattedShifts = shiftRes.data.map((s: any) => ({
          ...s,
          shift: s.shifts
        }));
        setShifts(formattedShifts);
      }
    } catch (error) {
      devError("Error fetching employee data:", error);
    } finally {
      setLoading(false);
    }
  };

  if (!employee) return null;

  // Calculate stats
  const presentDays = attendance.filter(a => a.status === "present").length;
  const absentDays = attendance.filter(a => a.status === "absent").length;
  const halfDays = attendance.filter(a => a.status === "half_day").length;
  const totalWorkDays = attendance.length;
  const attendanceRate = totalWorkDays > 0 ? ((presentDays + halfDays * 0.5) / totalWorkDays * 100).toFixed(1) : 0;

  const totalPaid = payroll.filter(p => p.payment_status === "paid").reduce((sum, p) => sum + p.net_salary, 0);
  const totalPending = payroll.filter(p => p.payment_status === "pending").reduce((sum, p) => sum + p.net_salary, 0);
  const totalBonus = payroll.reduce((sum, p) => sum + (p.bonus || 0), 0);
  const totalDeductions = payroll.reduce((sum, p) => sum + (p.deductions || 0), 0);

  const tenure = employee.joining_date 
    ? differenceInDays(new Date(), parseISO(employee.joining_date))
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            {employee.name}
            <Badge variant={employee.is_active ? "default" : "secondary"} className="ml-2">
              {employee.is_active ? "Active" : "Inactive"}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-24" />
              ))}
            </div>
            <Skeleton className="h-[300px]" />
          </div>
        ) : (
          <ScrollArea className="h-[calc(90vh-120px)] pr-4">
            {/* Employee Info */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <Card>
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 text-muted-foreground mb-1">
                    <Briefcase className="h-4 w-4" />
                    <span className="text-xs">Role</span>
                  </div>
                  <p className="font-semibold">{roleLabels[employee.role] || employee.role}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 text-muted-foreground mb-1">
                    <Phone className="h-4 w-4" />
                    <span className="text-xs">Phone</span>
                  </div>
                  <p className="font-semibold">{employee.phone || "Not provided"}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 text-muted-foreground mb-1">
                    <DollarSign className="h-4 w-4" />
                    <span className="text-xs">Salary</span>
                  </div>
                  <p className="font-semibold">
                    {employee.salary ? `₹${employee.salary.toLocaleString()}/mo` : "Not set"}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 text-muted-foreground mb-1">
                    <Calendar className="h-4 w-4" />
                    <span className="text-xs">Tenure</span>
                  </div>
                  <p className="font-semibold">
                    {tenure !== null ? `${Math.floor(tenure / 365)}y ${Math.floor((tenure % 365) / 30)}m` : "N/A"}
                  </p>
                </CardContent>
              </Card>
            </div>

            {employee.address && (
              <Card className="mb-6">
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 text-muted-foreground mb-1">
                    <MapPin className="h-4 w-4" />
                    <span className="text-xs">Address</span>
                  </div>
                  <p className="text-sm">{employee.address}</p>
                </CardContent>
              </Card>
            )}

            {/* Stats Summary */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <Card className="bg-green-50 dark:bg-green-950/20">
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 text-green-600 mb-1">
                    <TrendingUp className="h-4 w-4" />
                    <span className="text-xs">Attendance Rate</span>
                  </div>
                  <p className="font-bold text-xl text-green-700 dark:text-green-400">{attendanceRate}%</p>
                  <p className="text-xs text-muted-foreground">{presentDays} present of {totalWorkDays}</p>
                </CardContent>
              </Card>
              <Card className="bg-blue-50 dark:bg-blue-950/20">
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 text-blue-600 mb-1">
                    <CreditCard className="h-4 w-4" />
                    <span className="text-xs">Total Paid</span>
                  </div>
                  <p className="font-bold text-xl text-blue-700 dark:text-blue-400">₹{totalPaid.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">{payroll.filter(p => p.payment_status === "paid").length} payments</p>
                </CardContent>
              </Card>
              <Card className="bg-amber-50 dark:bg-amber-950/20">
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 text-amber-600 mb-1">
                    <Clock className="h-4 w-4" />
                    <span className="text-xs">Pending</span>
                  </div>
                  <p className="font-bold text-xl text-amber-700 dark:text-amber-400">₹{totalPending.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">{payroll.filter(p => p.payment_status === "pending").length} records</p>
                </CardContent>
              </Card>
              <Card className="bg-purple-50 dark:bg-purple-950/20">
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 text-purple-600 mb-1">
                    <DollarSign className="h-4 w-4" />
                    <span className="text-xs">Bonus vs Deductions</span>
                  </div>
                  <p className="font-bold text-xl text-purple-700 dark:text-purple-400">
                    +₹{totalBonus.toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground">-₹{totalDeductions.toLocaleString()} deducted</p>
                </CardContent>
              </Card>
            </div>

            <Tabs defaultValue="attendance" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="attendance">
                  Attendance ({attendance.length})
                </TabsTrigger>
                <TabsTrigger value="payroll">
                  Payroll ({payroll.length})
                </TabsTrigger>
                <TabsTrigger value="shifts">
                  Shifts ({shifts.length})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="attendance" className="mt-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center justify-between">
                      <span>Attendance History</span>
                      <div className="flex gap-2 text-xs">
                        <Badge variant="default" className="font-normal">
                          <CheckCircle className="h-3 w-3 mr-1" /> {presentDays}
                        </Badge>
                        <Badge variant="destructive" className="font-normal">
                          <XCircle className="h-3 w-3 mr-1" /> {absentDays}
                        </Badge>
                        <Badge variant="secondary" className="font-normal">
                          <AlertCircle className="h-3 w-3 mr-1" /> {halfDays}
                        </Badge>
                      </div>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-[250px]">
                      <div className="space-y-2">
                        {attendance.length === 0 ? (
                          <p className="text-center text-muted-foreground py-8">No attendance records</p>
                        ) : (
                          attendance.map((record) => (
                            <div 
                              key={record.id} 
                              className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                            >
                              <div className="flex items-center gap-3">
                                <div className={`w-2 h-2 rounded-full ${
                                  record.status === "present" ? "bg-green-500" :
                                  record.status === "absent" ? "bg-red-500" : "bg-amber-500"
                                }`} />
                                <div>
                                  <p className="font-medium">
                                    {format(parseISO(record.attendance_date), "EEE, dd MMM yyyy")}
                                  </p>
                                  {record.notes && (
                                    <p className="text-xs text-muted-foreground">{record.notes}</p>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-4 text-sm">
                                <div className="text-right">
                                  {record.check_in && (
                                    <span className="text-muted-foreground">In: {record.check_in}</span>
                                  )}
                                  {record.check_out && (
                                    <span className="text-muted-foreground ml-2">Out: {record.check_out}</span>
                                  )}
                                </div>
                                <Badge variant={
                                  record.status === "present" ? "default" :
                                  record.status === "absent" ? "destructive" : "secondary"
                                }>
                                  {record.status}
                                </Badge>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="payroll" className="mt-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Payment History</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-[250px]">
                      <div className="space-y-2">
                        {payroll.length === 0 ? (
                          <p className="text-center text-muted-foreground py-8">No payroll records</p>
                        ) : (
                          payroll.map((record) => (
                            <div 
                              key={record.id} 
                              className="p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                            >
                              <div className="flex items-center justify-between mb-2">
                                <div>
                                  <p className="font-medium">
                                    {format(parseISO(record.pay_period_start), "dd MMM")} - {format(parseISO(record.pay_period_end), "dd MMM yyyy")}
                                  </p>
                                  {record.payment_date && (
                                    <p className="text-xs text-muted-foreground">
                                      Paid on {format(parseISO(record.payment_date), "dd MMM yyyy")}
                                      {record.payment_mode && ` via ${record.payment_mode}`}
                                    </p>
                                  )}
                                </div>
                                <Badge variant={record.payment_status === "paid" ? "default" : "secondary"}>
                                  {record.payment_status}
                                </Badge>
                              </div>
                              <div className="grid grid-cols-4 gap-2 text-xs">
                                <div>
                                  <span className="text-muted-foreground">Base</span>
                                  <p className="font-medium">₹{record.base_salary.toLocaleString()}</p>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Bonus</span>
                                  <p className="font-medium text-green-600">+₹{record.bonus.toLocaleString()}</p>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Deductions</span>
                                  <p className="font-medium text-red-600">-₹{record.deductions.toLocaleString()}</p>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Net Pay</span>
                                  <p className="font-semibold text-primary">₹{record.net_salary.toLocaleString()}</p>
                                </div>
                              </div>
                              {record.notes && (
                                <p className="text-xs text-muted-foreground mt-2 pt-2 border-t">{record.notes}</p>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="shifts" className="mt-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Shift Assignments</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-[250px]">
                      <div className="space-y-2">
                        {shifts.length === 0 ? (
                          <p className="text-center text-muted-foreground py-8">No shift assignments</p>
                        ) : (
                          shifts.map((record) => (
                            <div 
                              key={record.id} 
                              className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                            >
                              <div>
                                <p className="font-medium">{record.shift?.name || "Unknown Shift"}</p>
                                <p className="text-xs text-muted-foreground">
                                  {record.shift?.start_time} - {record.shift?.end_time}
                                </p>
                              </div>
                              <div className="text-right text-sm">
                                <p>From: {format(parseISO(record.effective_from), "dd MMM yyyy")}</p>
                                {record.effective_to && (
                                  <p className="text-muted-foreground">
                                    To: {format(parseISO(record.effective_to), "dd MMM yyyy")}
                                  </p>
                                )}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}
