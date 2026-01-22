import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Milk, Phone, Lock, ArrowRight, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

const authSchema = z.object({
  phone: z.string().min(10, 'Enter a valid 10-digit mobile number').max(10, 'Enter a valid 10-digit mobile number'),
  pin: z.string().length(6, 'PIN must be 6 digits'),
});

type AuthFormData = z.infer<typeof authSchema>;

const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000;

interface AttemptState {
  count: number;
  lockedUntil: number | null;
}

function getAttemptState(): AttemptState {
  try {
    const stored = sessionStorage.getItem("customer_auth_attempts");
    if (stored) {
      const state = JSON.parse(stored) as AttemptState;
      if (state.lockedUntil && Date.now() > state.lockedUntil) {
        sessionStorage.removeItem("customer_auth_attempts");
        return { count: 0, lockedUntil: null };
      }
      return state;
    }
  } catch {
    // Ignore storage errors
  }
  return { count: 0, lockedUntil: null };
}

function setAttemptState(state: AttemptState): void {
  try {
    sessionStorage.setItem("customer_auth_attempts", JSON.stringify(state));
  } catch {
    // Ignore storage errors
  }
}

export default function CustomerAuth() {
  const [loading, setLoading] = useState(false);
  const [pendingApproval, setPendingApproval] = useState(false);
  const [attemptStateLocal, setAttemptStateLocal] = useState<AttemptState>(getAttemptState);
  const navigate = useNavigate();
  const { toast } = useToast();

  const loginForm = useForm<AuthFormData>({
    resolver: zodResolver(authSchema),
    defaultValues: { phone: '', pin: '' },
  });

  const registerForm = useForm<AuthFormData>({
    resolver: zodResolver(authSchema),
    defaultValues: { phone: '', pin: '' },
  });

  const recordFailedAttempt = useCallback(() => {
    const current = getAttemptState();
    const newCount = current.count + 1;
    const newState: AttemptState = {
      count: newCount,
      lockedUntil: newCount >= MAX_ATTEMPTS ? Date.now() + LOCKOUT_DURATION_MS : null,
    };
    setAttemptState(newState);
    setAttemptStateLocal(newState);
    return newState;
  }, []);

  const resetAttempts = useCallback(() => {
    sessionStorage.removeItem("customer_auth_attempts");
    setAttemptStateLocal({ count: 0, lockedUntil: null });
  }, []);

  const handleLogin = async (values: AuthFormData) => {
    // Check for lockout
    const currentAttempts = getAttemptState();
    if (currentAttempts.lockedUntil && Date.now() < currentAttempts.lockedUntil) {
      const remainingMins = Math.ceil((currentAttempts.lockedUntil - Date.now()) / 60000);
      toast({
        title: "Account Temporarily Locked",
        description: `Too many failed attempts. Try again in ${remainingMins} minute(s).`,
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    setPendingApproval(false);

    try {
      const { data, error } = await supabase.functions.invoke('customer-auth', {
        body: { action: 'login', phone: values.phone, pin: values.pin }
      });

      if (error) throw error;

      if (!data.success) {
        if (data.pending) {
          setPendingApproval(true);
          toast({
            title: "Account Pending Approval",
            description: "Your account is awaiting admin approval. Please try again later.",
            variant: "default",
          });
        } else {
          const newState = recordFailedAttempt();
          const remaining = MAX_ATTEMPTS - newState.count;
          toast({
            title: "Login Failed",
            description: remaining > 0 
              ? `Invalid credentials. ${remaining} attempt(s) remaining.`
              : "Account locked for 15 minutes due to too many failed attempts.",
            variant: "destructive",
          });
        }
        return;
      }

      if (data.session) {
        resetAttempts();
        await supabase.auth.setSession({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token
        });
        
        toast({
          title: "Welcome!",
          description: "Logged in successfully",
        });
        
        navigate('/customer/dashboard');
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Something went wrong",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (values: AuthFormData) => {
    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('customer-auth', {
        body: { action: 'register', phone: values.phone, pin: values.pin }
      });

      if (error) throw error;

      if (!data.success) {
        toast({
          title: "Registration Failed",
          description: data.error || "Could not create account",
          variant: "destructive",
        });
        return;
      }

      if (data.approved) {
        toast({
          title: "Account Created!",
          description: "Your account has been approved. Please login to continue.",
        });
        // Switch to login tab
      } else {
        setPendingApproval(true);
        toast({
          title: "Registration Submitted",
          description: "Your account is pending admin approval. We'll notify you once approved.",
        });
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Something went wrong",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/10 via-background to-primary/5 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-center gap-3 py-8">
        <div className="bg-primary rounded-full p-3">
          <Milk className="h-8 w-8 text-primary-foreground" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Doodh Wallah</h1>
          <p className="text-sm text-muted-foreground">Customer Portal</p>
        </div>
      </div>

      {/* Auth Card */}
      <div className="flex-1 flex items-start justify-center px-4 pb-8">
        <Card className="w-full max-w-md shadow-xl">
          <CardHeader className="text-center">
            <CardTitle>Welcome</CardTitle>
            <CardDescription>
              Login or create an account to manage your milk subscription
            </CardDescription>
          </CardHeader>
          <CardContent>
            {pendingApproval ? (
              <div className="text-center py-8">
                <div className="bg-amber-100 dark:bg-amber-900/30 rounded-full p-4 w-fit mx-auto mb-4">
                  <UserPlus className="h-8 w-8 text-amber-600" />
                </div>
                <h3 className="text-lg font-semibold mb-2">Pending Approval</h3>
                <p className="text-muted-foreground mb-4">
                  Your account registration is being reviewed. You'll be able to login once approved by our team.
                </p>
                <Button variant="outline" onClick={() => setPendingApproval(false)}>
                  Try Again
                </Button>
              </div>
            ) : (
              <Tabs defaultValue="login" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="login">Login</TabsTrigger>
                  <TabsTrigger value="register">Register</TabsTrigger>
                </TabsList>

                <TabsContent value="login" className="mt-6">
                  <Form {...loginForm}>
                    <form onSubmit={loginForm.handleSubmit(handleLogin)} className="space-y-4">
                      <FormField
                        control={loginForm.control}
                        name="phone"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Mobile Number</FormLabel>
                            <FormControl>
                              <div className="relative">
                                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                  {...field}
                                  type="tel"
                                  inputMode="numeric"
                                  placeholder="Enter 10-digit mobile"
                                  className="pl-10"
                                  maxLength={10}
                                />
                              </div>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={loginForm.control}
                        name="pin"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>6-Digit PIN</FormLabel>
                            <FormControl>
                              <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                  {...field}
                                  type="password"
                                  inputMode="numeric"
                                  placeholder="••••••"
                                  className="pl-10 tracking-widest"
                                  maxLength={6}
                                />
                              </div>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <Button type="submit" className="w-full" disabled={loading}>
                        {loading ? 'Logging in...' : 'Login'}
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Button>
                    </form>
                  </Form>
                </TabsContent>

                <TabsContent value="register" className="mt-6">
                  <Form {...registerForm}>
                    <form onSubmit={registerForm.handleSubmit(handleRegister)} className="space-y-4">
                      <FormField
                        control={registerForm.control}
                        name="phone"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Mobile Number</FormLabel>
                            <FormControl>
                              <div className="relative">
                                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                  {...field}
                                  type="tel"
                                  inputMode="numeric"
                                  placeholder="Enter 10-digit mobile"
                                  className="pl-10"
                                  maxLength={10}
                                />
                              </div>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={registerForm.control}
                        name="pin"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Create 6-Digit PIN</FormLabel>
                            <FormControl>
                              <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                  {...field}
                                  type="password"
                                  inputMode="numeric"
                                  placeholder="••••••"
                                  className="pl-10 tracking-widest"
                                  maxLength={6}
                                />
                              </div>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <p className="text-xs text-muted-foreground">
                        If you're an existing customer, your account will be auto-approved. New customers require admin approval.
                      </p>

                      <Button type="submit" className="w-full" disabled={loading}>
                        {loading ? 'Creating Account...' : 'Create Account'}
                        <UserPlus className="ml-2 h-4 w-4" />
                      </Button>
                    </form>
                  </Form>
                </TabsContent>
              </Tabs>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Footer */}
      <div className="text-center py-4 text-sm text-muted-foreground">
        <p>Need help? Contact us at support@doodhwallah.app</p>
      </div>
    </div>
  );
}
