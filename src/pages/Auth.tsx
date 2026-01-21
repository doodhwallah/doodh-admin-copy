import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Droplets, Phone, Loader2 } from "lucide-react";
import { z } from "zod";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { sanitizeError } from "@/lib/errors";

const loginSchema = z.object({
  phone: z.string()
    .min(10, "Phone number must be at least 10 digits")
    .max(15, "Phone number too long")
    .regex(/^[0-9]+$/, "Phone number must contain only digits"),
  pin: z.string().length(6, "PIN must be exactly 6 digits"),
});

const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000;
const ATTEMPT_DEBOUNCE_MS = 1000;

interface AttemptState {
  count: number;
  lockedUntil: number | null;
}

function getAttemptState(): AttemptState {
  try {
    const stored = sessionStorage.getItem("auth_attempts");
    if (stored) {
      const state = JSON.parse(stored) as AttemptState;
      if (state.lockedUntil && Date.now() > state.lockedUntil) {
        sessionStorage.removeItem("auth_attempts");
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
    sessionStorage.setItem("auth_attempts", JSON.stringify(state));
  } catch {
    // Ignore storage errors
  }
}

export default function Auth() {
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [attemptState, setAttemptStateLocal] = useState<AttemptState>(getAttemptState);
  const lastAttemptRef = useRef<number>(0);
  const navigate = useNavigate();
  const { toast } = useToast();

  const isLockedOut = attemptState.lockedUntil !== null && Date.now() < attemptState.lockedUntil;
  const remainingLockoutSeconds = isLockedOut 
    ? Math.ceil((attemptState.lockedUntil! - Date.now()) / 1000) 
    : 0;

  useEffect(() => {
    if (!isLockedOut) return;
    const timer = setInterval(() => {
      const state = getAttemptState();
      setAttemptStateLocal(state);
    }, 1000);
    return () => clearInterval(timer);
  }, [isLockedOut]);

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
    sessionStorage.removeItem("auth_attempts");
    setAttemptStateLocal({ count: 0, lockedUntil: null });
  }, []);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session) {
        navigate('/dashboard');
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        navigate('/dashboard');
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  // Format phone to create a unique email-like identifier
  const phoneToEmail = (phoneNumber: string) => {
    const cleanPhone = phoneNumber.replace(/[^0-9]/g, '');
    return `${cleanPhone}@doodhwallah.app`;
  };

  const handleBootstrap = async () => {
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    
    if (cleanPhone !== '7897716792' || pin !== '101101') {
      toast({
        title: "Invalid credentials",
        description: "Only the designated admin can bootstrap the account.",
        variant: "destructive",
      });
      return;
    }

    setBootstrapping(true);

    try {
      const response = await supabase.functions.invoke('bootstrap-admin', {
        body: { phone: cleanPhone, pin }
      });

      if (response.error) {
        toast({
          title: "Bootstrap failed",
          description: response.error.message || "Could not create admin account.",
          variant: "destructive",
        });
        setBootstrapping(false);
        return;
      }

      toast({
        title: "Admin account ready",
        description: "You can now sign in with your credentials.",
      });

      // Now try to login
      setBootstrapping(false);
      await handleLogin();
    } catch (err) {
      toast({
        title: "Bootstrap failed",
        description: "Could not create admin account. Please try again.",
        variant: "destructive",
      });
      setBootstrapping(false);
    }
  };

  const handleLogin = async () => {
    if (isLockedOut) {
      toast({
        title: "Account temporarily locked",
        description: `Too many failed attempts. Please try again in ${Math.ceil(remainingLockoutSeconds / 60)} minutes.`,
        variant: "destructive",
      });
      return;
    }

    const now = Date.now();
    if (now - lastAttemptRef.current < ATTEMPT_DEBOUNCE_MS) {
      return;
    }
    lastAttemptRef.current = now;

    const cleanPhone = phone.replace(/[^0-9]/g, '');

    try {
      loginSchema.parse({ phone: cleanPhone, pin });
    } catch (err) {
      if (err instanceof z.ZodError) {
        const newErrors: Record<string, string> = {};
        err.errors.forEach((e) => {
          if (e.path[0]) newErrors[e.path[0] as string] = e.message;
        });
        setErrors(newErrors);
        return;
      }
    }

    setLoading(true);

    const email = phoneToEmail(cleanPhone);
    
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password: pin,
    });

    setLoading(false);

    if (error) {
      const newState = recordFailedAttempt();
      
      if (newState.lockedUntil) {
        toast({
          title: "Account temporarily locked",
          description: "Too many failed attempts. Please try again in 15 minutes.",
          variant: "destructive",
        });
      } else if (cleanPhone === '7897716792' && pin === '101101') {
        toast({
          title: "Account not found",
          description: "Click 'Setup Admin Account' to create your admin account.",
        });
      } else {
        const attemptsRemaining = MAX_ATTEMPTS - newState.count;
        toast({
          title: "Login failed",
          description: `${sanitizeError(error, "Invalid mobile number or PIN.")}${attemptsRemaining > 0 ? ` ${attemptsRemaining} attempts remaining.` : ''}`,
          variant: "destructive",
        });
      }
    } else {
      resetAttempts();
      toast({
        title: "Welcome back!",
        description: "Successfully logged in.",
      });
      navigate('/dashboard');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    await handleLogin();
  };

  const cleanPhone = phone.replace(/[^0-9]/g, '');
  const isAdminCredentials = cleanPhone === '7897716792' && pin === '101101';

  return (
    <div className="flex min-h-screen">
      {/* Left side - Branding */}
      <div className="hidden w-1/2 gradient-hero lg:flex lg:flex-col lg:items-center lg:justify-center lg:p-12">
        <div className="max-w-md text-center animate-fade-in">
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-sidebar-primary shadow-glow">
            <Droplets className="h-10 w-10 text-sidebar-primary-foreground" />
          </div>
          <h1 className="mb-4 text-4xl font-bold text-sidebar-foreground">
            Doodh Wallah
          </h1>
          <p className="text-lg text-sidebar-foreground/80">
            Complete Dairy Management Solution
          </p>
          <div className="mt-8 grid grid-cols-2 gap-4 text-left">
            {[
              "Cattle Management",
              "Milk Production Tracking",
              "Customer Billing",
              "Delivery Routes",
              "Health Records",
              "Financial Reports",
            ].map((feature) => (
              <div key={feature} className="flex items-center gap-2 text-sm text-sidebar-foreground/70">
                <div className="h-1.5 w-1.5 rounded-full bg-sidebar-primary" />
                {feature}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right side - Login form only */}
      <div className="flex w-full items-center justify-center bg-background p-6 lg:w-1/2">
        <Card className="w-full max-w-md border-border/50 shadow-lg animate-slide-up">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary lg:hidden">
              <Droplets className="h-6 w-6 text-primary-foreground" />
            </div>
            <CardTitle className="text-2xl font-bold">Welcome</CardTitle>
            <CardDescription>
              Sign in with your mobile number & PIN
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="login-phone">Mobile Number</Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="login-phone"
                    type="tel"
                    placeholder="Enter mobile number"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/[^0-9]/g, ''))}
                    className="pl-10"
                    maxLength={15}
                  />
                </div>
                {errors.phone && (
                  <p className="text-xs text-destructive">{errors.phone}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="login-pin">6-Digit PIN</Label>
                <div className="flex justify-center">
                  <InputOTP 
                    maxLength={6} 
                    value={pin} 
                    onChange={setPin}
                  >
                    <InputOTPGroup>
                      <InputOTPSlot index={0} />
                      <InputOTPSlot index={1} />
                      <InputOTPSlot index={2} />
                      <InputOTPSlot index={3} />
                      <InputOTPSlot index={4} />
                      <InputOTPSlot index={5} />
                    </InputOTPGroup>
                  </InputOTP>
                </div>
                {errors.pin && (
                  <p className="text-xs text-destructive text-center">{errors.pin}</p>
                )}
              </div>
              
              <Button type="submit" className="w-full" disabled={loading || bootstrapping || isLockedOut}>
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Signing in...
                  </>
                ) : isLockedOut ? (
                  `Locked (${Math.ceil(remainingLockoutSeconds / 60)}m)`
                ) : (
                  "Sign In"
                )}
              </Button>

              {isAdminCredentials && (
                <Button 
                  type="button" 
                  variant="outline" 
                  className="w-full" 
                  disabled={loading || bootstrapping}
                  onClick={handleBootstrap}
                >
                  {bootstrapping ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Setting up...
                    </>
                  ) : (
                    "Setup Admin Account"
                  )}
                </Button>
              )}
              
              <p className="text-xs text-center text-muted-foreground mt-4">
                Contact your administrator for account access
              </p>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
