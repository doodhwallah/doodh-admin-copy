import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7"
import { getCorsHeaders, handleCorsOptions, corsJsonResponse } from "../_shared/cors.ts"

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCorsOptions(req)
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return corsJsonResponse(req, { error: 'Missing authorization header' }, 401)
    }

    const token = authHeader.replace('Bearer ', '')
    
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } }
    })

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser()
    
    if (userError || !user) {
      return corsJsonResponse(req, { error: 'Invalid authentication' }, 401)
    }

    const { currentPin, newPin } = await req.json()

    if (!currentPin || !newPin) {
      return corsJsonResponse(req, { error: 'Missing required fields: currentPin, newPin' }, 400)
    }

    if (!/^\d{6}$/.test(newPin)) {
      return corsJsonResponse(req, { error: 'New PIN must be exactly 6 digits' }, 400)
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('phone')
      .eq('id', user.id)
      .single()

    if (profileError || !profile?.phone) {
      return corsJsonResponse(req, { error: 'User profile not found' }, 400)
    }

    const { data: verifiedUserId, error: verifyError } = await supabaseAdmin.rpc('verify_pin', {
      _phone: profile.phone,
      _pin: currentPin
    })

    if (verifyError) {
      return corsJsonResponse(req, { error: 'Failed to verify current PIN' }, 500)
    }

    if (!verifiedUserId) {
      return corsJsonResponse(req, { error: 'Current PIN is incorrect' }, 400)
    }

    const { error: updatePinError } = await supabaseAdmin.rpc('update_pin_only', {
      _user_id: user.id,
      _pin: newPin
    })

    if (updatePinError) {
      return corsJsonResponse(req, { error: 'Failed to update PIN in database' }, 500)
    }

    await supabaseAdmin.auth.admin.updateUserById(user.id, {
      password: newPin
    })

    return corsJsonResponse(req, { success: true, message: 'PIN updated successfully' })
  } catch (error) {
    return corsJsonResponse(req, { error: 'Internal server error' }, 500)
  }
})
