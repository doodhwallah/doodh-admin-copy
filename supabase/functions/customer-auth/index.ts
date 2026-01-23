import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsOptions, corsJsonResponse } from "../_shared/cors.ts";

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCorsOptions(req);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const { action, phone, pin, currentPin, newPin, customerId } = await req.json();

    switch (action) {
      case 'register': {
        if (!phone || !pin) {
          return corsJsonResponse(req, { success: false, error: 'Phone and PIN are required' }, 400);
        }

        if (!/^\d{6}$/.test(pin)) {
          return corsJsonResponse(req, { success: false, error: 'PIN must be 6 digits' }, 400);
        }

        const { data, error } = await supabaseAdmin.rpc('register_customer_account', {
          _phone: phone,
          _pin: pin
        });

        if (error) {
          return corsJsonResponse(req, { success: false, error: error.message }, 400);
        }

        if (data?.approved) {
          const email = `customer_${phone}@doodhwallah.app`;
          
          const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
            email,
            password: pin,
            email_confirm: true,
            user_metadata: {
              phone,
              customer_id: data.customer_id,
              is_customer: true
            }
          });

          if (authError) {
            await supabaseAdmin.from('customer_accounts').delete().eq('customer_id', data.customer_id);
            return corsJsonResponse(req, { success: false, error: 'Failed to create auth account' }, 500);
          }

          await supabaseAdmin.from('customer_accounts')
            .update({ user_id: authUser.user.id })
            .eq('customer_id', data.customer_id);
        }

        return corsJsonResponse(req, data);
      }

      case 'login': {
        if (!phone || !pin) {
          return corsJsonResponse(req, { success: false, error: 'Phone and PIN are required' }, 400);
        }

        const { data: verifyResult, error: verifyError } = await supabaseAdmin.rpc('verify_customer_pin', {
          _phone: phone,
          _pin: pin
        });

        if (verifyError) {
          return corsJsonResponse(req, { success: false, error: verifyError.message }, 400);
        }

        if (!verifyResult || verifyResult.length === 0) {
          return corsJsonResponse(req, { success: false, error: 'Invalid phone number or PIN' }, 401);
        }

        const account = verifyResult[0];

        if (!account.is_approved) {
          return corsJsonResponse(req, { success: false, error: 'Account pending approval', pending: true }, 403);
        }

        const email = `customer_${phone}@doodhwallah.app`;
        
        const { data: signInData, error: signInError } = await supabaseAdmin.auth.admin.generateLink({
          type: 'magiclink',
          email,
          options: {
            redirectTo: `${req.headers.get('origin')}/customer/dashboard`
          }
        });

        if (signInError) {
          if (signInError.message.includes('User not found')) {
            const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
              email,
              password: pin,
              email_confirm: true,
              user_metadata: {
                phone,
                customer_id: account.customer_id,
                is_customer: true
              }
            });

            if (createError) {
              return corsJsonResponse(req, { success: false, error: 'Authentication failed' }, 500);
            }

            await supabaseAdmin.from('customer_accounts')
              .update({ user_id: newUser.user.id })
              .eq('customer_id', account.customer_id);
          }
        }

        const supabaseClient = createClient(supabaseUrl, supabaseAnonKey);
        const { data: session, error: sessionError } = await supabaseClient.auth.signInWithPassword({
          email,
          password: pin
        });

        if (sessionError) {
          const { data: userData } = await supabaseAdmin.auth.admin.listUsers();
          const existingUser = userData?.users?.find(u => u.email === email);
          
          if (existingUser) {
            await supabaseAdmin.auth.admin.updateUserById(existingUser.id, {
              password: pin,
              email_confirm: true
            });

            const { data: retrySession, error: retryError } = await supabaseClient.auth.signInWithPassword({
              email,
              password: pin
            });

            if (retryError) {
              return corsJsonResponse(req, { success: false, error: 'Authentication failed' }, 500);
            }

            return corsJsonResponse(req, {
              success: true,
              session: retrySession.session,
              customer_id: account.customer_id
            });
          }

          return corsJsonResponse(req, { success: false, error: 'Authentication failed' }, 500);
        }

        return corsJsonResponse(req, {
          success: true,
          session: session.session,
          customer_id: account.customer_id
        });
      }

      case 'change-pin': {
        if (!customerId || !currentPin || !newPin) {
          return corsJsonResponse(req, { success: false, error: 'Customer ID, current PIN, and new PIN are required' }, 400);
        }

        if (!/^\d{6}$/.test(newPin)) {
          return corsJsonResponse(req, { success: false, error: 'New PIN must be 6 digits' }, 400);
        }

        const { data, error } = await supabaseAdmin.rpc('update_customer_pin', {
          _customer_id: customerId,
          _current_pin: currentPin,
          _new_pin: newPin
        });

        if (error) {
          return corsJsonResponse(req, { success: false, error: error.message }, 400);
        }

        const { data: account } = await supabaseAdmin
          .from('customer_accounts')
          .select('user_id, phone')
          .eq('customer_id', customerId)
          .single();

        if (account?.user_id) {
          await supabaseAdmin.auth.admin.updateUserById(account.user_id, {
            password: newPin
          });
        }

        return corsJsonResponse(req, data);
      }

      default:
        return corsJsonResponse(req, { success: false, error: 'Invalid action' }, 400);
    }
  } catch (error) {
    return corsJsonResponse(req, { success: false, error: 'Internal server error' }, 500);
  }
});
