import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAutoAttendance } from "@/hooks/useAutoAttendance";
import { useExpenseAutomation } from "@/hooks/useExpenseAutomation";
import { PageHeader } from "@/components/common/PageHeader";
import { DataTable } from "@/components/common/DataTable";
import { EmployeeDetailDialog } from "@/components/employees/EmployeeDetailDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { devError } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Plus, Calendar, DollarSign, Clock, Users, CheckCircle, XCircle, Loader2, Eye } from "lucide-react";
import { format } from "date-fns";

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
  employee?: Employee;
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
  employee?: Employee;
}

interface Shift {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
  is_active: boolean;
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

export default function EmployeesPage() {
  const { toast } = useToast();
  
  // Auto-create today's attendance for all active employees (present by default)
  useAutoAttendance();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [payroll, setPayroll] = useState<PayrollRecord[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [attendanceDialogOpen, setAttendanceDialogOpen] = useState(false);
  const [payrollDialogOpen, setPayrollDialogOpen] = useState(false);
  const [selectedEmployeeDetail, setSelectedEmployeeDetail] = useState<Employee | null>(null);
  const [employeeDetailOpen, setEmployeeDetailOpen] = useState(false);
  
  // Form states
  const [selectedEmployee, setSelectedEmployee] = useState("");
  const [attendanceDate, setAttendanceDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [attendanceStatus, setAttendanceStatus] = useState("present");
  
  const [payPeriodStart, setPayPeriodStart] = useState("");
  const [payPeriodEnd, setPayPeriodEnd] = useState("");
  const [baseSalary, setBaseSalary] = useState("");
  const [overtimeHours, setOvertimeHours] = useState("0");
  const [bonus, setBonus] = useState("0");
  const [deductions, setDeductions] = useState("0");

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [empRes, attRes, payRes, shiftRes] = await Promise.all([
        supabase.from("employees").select("*").order("name"),
        supabase.from("attendance").select("*").order("attendance_date", { ascending: false }).limit(100),
        supabase.from("payroll_records").select("*").order("created_at", { ascending: false }).limit(50),
        supabase.from("shifts").select("*").order("start_time"),
      ]);

      if (empRes.data) setEmployees(empRes.data);
      if (attRes.data) setAttendance(attRes.data);
      if (payRes.data) setPayroll(payRes.data);
      if (shiftRes.data) setShifts(shiftRes.data);
    } catch (error) {
      devError("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleMarkAttendance = async () => {
    if (!selectedEmployee || !attendanceDate) {
      toast({ title: "Error", description: "Please select employee and date", variant: "destructive" });
      return;
    }

    // Use upsert to update existing record or create new one
    // This allows changing status from default "present" to absent/half_day etc.
    const { error } = await supabase.from("attendance").upsert(
      {
        employee_id: selectedEmployee,
        attendance_date: attendanceDate,
        check_in: checkIn || null,
        check_out: checkOut || null,
        status: attendanceStatus,
      },
      { 
        onConflict: 'employee_id,attendance_date',
        ignoreDuplicates: false 
      }
    );

    if (error) {
      // If upsert fails due to no unique constraint, try delete + insert
      if (error.code === '42P10') {
        const { error: deleteError } = await supabase
          .from("attendance")
          .delete()
          .eq("employee_id", selectedEmployee)
          .eq("attendance_date", attendanceDate);
        
        if (!deleteError) {
          const { error: insertError } = await supabase.from("attendance").insert({
            employee_id: selectedEmployee,
            attendance_date: attendanceDate,
            check_in: checkIn || null,
            check_out: checkOut || null,
            status: attendanceStatus,
          });
          
          if (insertError) {
            toast({ title: "Error", description: insertError.message, variant: "destructive" });
            return;
          }
        }
      } else {
        toast({ title: "Error", description: error.message, variant: "destructive" });
        return;
      }
    }
    
    toast({ title: "Success", description: "Attendance updated successfully" });
    setAttendanceDialogOpen(false);
    resetAttendanceForm();
    fetchData();
  };

  const handleCreatePayroll = async () => {
    if (!selectedEmployee || !payPeriodStart || !payPeriodEnd || !baseSalary) {
      toast({ title: "Error", description: "Please fill all required fields", variant: "destructive" });
      return;
    }

    const netSalary = parseFloat(baseSalary) + parseFloat(bonus || "0") - parseFloat(deductions || "0");

    const { error } = await supabase.from("payroll_records").insert({
      employee_id: selectedEmployee,
      pay_period_start: payPeriodStart,
      pay_period_end: payPeriodEnd,
      base_salary: parseFloat(baseSalary),
      overtime_hours: parseFloat(overtimeHours || "0"),
      bonus: parseFloat(bonus || "0"),
      deductions: parseFloat(deductions || "0"),
      net_salary: netSalary,
    });

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Success", description: "Payroll record created" });
      setPayrollDialogOpen(false);
      resetPayrollForm();
      fetchData();
    }
  };

  const { logSalaryExpense } = useExpenseAutomation();

  const getEmployeeName = (empId: string) => {
    return employees.find(e => e.id === empId)?.name || "Unknown";
  };

  const handleMarkPaid = async (id: string) => {
    // Get payroll record details first
    const payrollRecord = payroll.find(p => p.id === id);
    if (!payrollRecord) {
      toast({ title: "Error", description: "Payroll record not found", variant: "destructive" });
      return;
    }

    const { error } = await supabase.from("payroll_records").update({
      payment_status: "paid",
      payment_date: format(new Date(), "yyyy-MM-dd"),
    }).eq("id", id);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      // Auto-create expense entry for salary payment
      const employeeName = getEmployeeName(payrollRecord.employee_id);
      await logSalaryExpense(
        employeeName,
        payrollRecord.net_salary,
        payrollRecord.pay_period_start,
        payrollRecord.pay_period_end,
        id
      );

      toast({ title: "Success", description: "Payment marked as paid & expense recorded" });
      fetchData();
    }
  };

  const resetAttendanceForm = () => {
    setSelectedEmployee("");
    setAttendanceDate(format(new Date(), "yyyy-MM-dd"));
    setCheckIn("");
    setCheckOut("");
    setAttendanceStatus("present");
  };

  const resetPayrollForm = () => {
    setSelectedEmployee("");
    setPayPeriodStart("");
    setPayPeriodEnd("");
    setBaseSalary("");
    setOvertimeHours("0");
    setBonus("0");
    setDeductions("0");
  };

  const attendanceColumns = [
    { key: "attendance_date" as const, header: "Date", render: (row: Attendance) => format(new Date(row.attendance_date), "dd MMM yyyy") },
    { key: "employee_id" as const, header: "Employee", render: (row: Attendance) => getEmployeeName(row.employee_id) },
    { key: "check_in" as const, header: "Check In", render: (row: Attendance) => row.check_in || "-" },
    { key: "check_out" as const, header: "Check Out", render: (row: Attendance) => row.check_out || "-" },
    { 
      key: "status" as const, 
      header: "Status", 
      render: (row: Attendance) => (
        <Badge variant={row.status === "present" ? "default" : row.status === "absent" ? "destructive" : "secondary"}>
          {row.status}
        </Badge>
      )
    },
  ];

  const payrollColumns = [
    { key: "employee_id" as const, header: "Employee", render: (row: PayrollRecord) => getEmployeeName(row.employee_id) },
    { key: "pay_period_start" as const, header: "Period", render: (row: PayrollRecord) => `${format(new Date(row.pay_period_start), "dd MMM")} - ${format(new Date(row.pay_period_end), "dd MMM yyyy")}` },
    { key: "base_salary" as const, header: "Base", render: (row: PayrollRecord) => `₹${row.base_salary.toLocaleString()}` },
    { key: "bonus" as const, header: "Bonus", render: (row: PayrollRecord) => `₹${row.bonus.toLocaleString()}` },
    { key: "deductions" as const, header: "Deductions", render: (row: PayrollRecord) => `₹${row.deductions.toLocaleString()}` },
    { key: "net_salary" as const, header: "Net Pay", render: (row: PayrollRecord) => <span className="font-semibold">₹{row.net_salary.toLocaleString()}</span> },
    { 
      key: "payment_status" as const, 
      header: "Status", 
      render: (row: PayrollRecord) => (
        <div className="flex items-center gap-2">
          <Badge variant={row.payment_status === "paid" ? "default" : "secondary"}>
            {row.payment_status}
          </Badge>
          {row.payment_status === "pending" && (
            <Button size="sm" variant="outline" onClick={() => handleMarkPaid(row.id)}>
              Mark Paid
            </Button>
          )}
        </div>
      )
    },
  ];

  const shiftColumns = [
    { key: "name" as const, header: "Shift Name" },
    { key: "start_time" as const, header: "Start Time" },
    { key: "end_time" as const, header: "End Time" },
    { 
      key: "is_active" as const, 
      header: "Status", 
      render: (row: Shift) => (
        <Badge variant={row.is_active ? "default" : "secondary"}>
          {row.is_active ? "Active" : "Inactive"}
        </Badge>
      )
    },
  ];

  const handleViewEmployee = (employee: Employee) => {
    setSelectedEmployeeDetail(employee);
    setEmployeeDetailOpen(true);
  };

  const employeeColumns = [
    { 
      key: "name" as const, 
      header: "Name", 
      render: (row: Employee) => (
        <button 
          onClick={() => handleViewEmployee(row)}
          className="text-primary hover:underline font-medium flex items-center gap-1"
        >
          {row.name}
          <Eye className="h-3 w-3 opacity-50" />
        </button>
      )
    },
    { key: "phone" as const, header: "Phone", render: (row: Employee) => row.phone || "-" },
    { key: "role" as const, header: "Role", render: (row: Employee) => roleLabels[row.role] || row.role },
    { key: "salary" as const, header: "Salary", render: (row: Employee) => row.salary ? `₹${row.salary.toLocaleString()}` : "-" },
    { 
      key: "is_active" as const, 
      header: "Status", 
      render: (row: Employee) => (
        <Badge variant={row.is_active ? "default" : "secondary"}>
          {row.is_active ? "Active" : "Inactive"}
        </Badge>
      )
    },
  ];

  // Stats
  const totalEmployees = employees.length;
  const activeEmployees = employees.filter(e => e.is_active).length;
  const todayAttendance = attendance.filter(a => a.attendance_date === format(new Date(), "yyyy-MM-dd")).length;
  const pendingPayroll = payroll.filter(p => p.payment_status === "pending").reduce((sum, p) => sum + p.net_salary, 0);

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
        title="Employee Management"
        description="Manage employees, attendance, payroll, and shifts"
      />

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Employees</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalEmployees}</div>
            <p className="text-xs text-muted-foreground">{activeEmployees} active</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Today's Attendance</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{todayAttendance}</div>
            <p className="text-xs text-muted-foreground">of {activeEmployees} employees</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Pending Payroll</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">₹{pendingPayroll.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">{payroll.filter(p => p.payment_status === "pending").length} records</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Active Shifts</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{shifts.filter(s => s.is_active).length}</div>
            <p className="text-xs text-muted-foreground">shift schedules</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="employees" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="employees">Employees</TabsTrigger>
          <TabsTrigger value="attendance">Attendance</TabsTrigger>
          <TabsTrigger value="payroll">Payroll</TabsTrigger>
          <TabsTrigger value="shifts">Shifts</TabsTrigger>
        </TabsList>

        <TabsContent value="employees" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>All Employees</CardTitle>
              <CardDescription>View and manage all employees</CardDescription>
            </CardHeader>
            <CardContent>
              <DataTable data={employees} columns={employeeColumns} searchable searchPlaceholder="Search employees..." />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="attendance" className="space-y-4">
          <div className="flex justify-end">
            <Dialog open={attendanceDialogOpen} onOpenChange={setAttendanceDialogOpen}>
              <DialogTrigger asChild>
                <Button><Plus className="mr-2 h-4 w-4" /> Mark Attendance</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Mark Attendance</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Employee</Label>
                    <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
                      <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                      <SelectContent>
                        {employees.filter(e => e.is_active).map(emp => (
                          <SelectItem key={emp.id} value={emp.id}>{emp.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Date</Label>
                    <Input type="date" value={attendanceDate} onChange={e => setAttendanceDate(e.target.value)} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Check In</Label>
                      <Input type="time" value={checkIn} onChange={e => setCheckIn(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>Check Out</Label>
                      <Input type="time" value={checkOut} onChange={e => setCheckOut(e.target.value)} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Status</Label>
                    <Select value={attendanceStatus} onValueChange={setAttendanceStatus}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="present">Present</SelectItem>
                        <SelectItem value="absent">Absent</SelectItem>
                        <SelectItem value="half_day">Half Day</SelectItem>
                        <SelectItem value="leave">Leave</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button className="w-full" onClick={handleMarkAttendance}>Save Attendance</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Attendance Records</CardTitle>
              <CardDescription>Track daily attendance</CardDescription>
            </CardHeader>
            <CardContent>
              <DataTable data={attendance} columns={attendanceColumns} searchable searchPlaceholder="Search..." />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payroll" className="space-y-4">
          <div className="flex justify-end">
            <Dialog open={payrollDialogOpen} onOpenChange={setPayrollDialogOpen}>
              <DialogTrigger asChild>
                <Button><Plus className="mr-2 h-4 w-4" /> Create Payroll</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create Payroll Record</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Employee</Label>
                    <Select value={selectedEmployee} onValueChange={(val) => {
                      setSelectedEmployee(val);
                      const emp = employees.find(e => e.id === val);
                      if (emp?.salary) setBaseSalary(emp.salary.toString());
                    }}>
                      <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                      <SelectContent>
                        {employees.filter(e => e.is_active).map(emp => (
                          <SelectItem key={emp.id} value={emp.id}>{emp.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Period Start</Label>
                      <Input type="date" value={payPeriodStart} onChange={e => setPayPeriodStart(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>Period End</Label>
                      <Input type="date" value={payPeriodEnd} onChange={e => setPayPeriodEnd(e.target.value)} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Base Salary (₹)</Label>
                    <Input type="number" value={baseSalary} onChange={e => setBaseSalary(e.target.value)} />
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label>Overtime Hrs</Label>
                      <Input type="number" value={overtimeHours} onChange={e => setOvertimeHours(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>Bonus (₹)</Label>
                      <Input type="number" value={bonus} onChange={e => setBonus(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>Deductions (₹)</Label>
                      <Input type="number" value={deductions} onChange={e => setDeductions(e.target.value)} />
                    </div>
                  </div>
                  <div className="rounded-lg bg-muted p-3">
                    <p className="text-sm text-muted-foreground">Net Salary</p>
                    <p className="text-xl font-bold">
                      ₹{(parseFloat(baseSalary || "0") + parseFloat(bonus || "0") - parseFloat(deductions || "0")).toLocaleString()}
                    </p>
                  </div>
                  <Button className="w-full" onClick={handleCreatePayroll}>Create Payroll Record</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Payroll Records</CardTitle>
              <CardDescription>Manage salary payments</CardDescription>
            </CardHeader>
            <CardContent>
              <DataTable data={payroll} columns={payrollColumns} searchable searchPlaceholder="Search..." />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="shifts" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Shift Schedules</CardTitle>
              <CardDescription>Available work shifts</CardDescription>
            </CardHeader>
            <CardContent>
              <DataTable data={shifts} columns={shiftColumns} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Employee Detail Dialog */}
      <EmployeeDetailDialog
        employee={selectedEmployeeDetail}
        open={employeeDetailOpen}
        onOpenChange={setEmployeeDetailOpen}
      />
    </div>
  );
}
