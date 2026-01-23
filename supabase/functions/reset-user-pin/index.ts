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

    const { data: { user: requestingUser }, error: userError } = await supabaseClient.auth.getUser()
    if (userError || !requestingUser) {
      return corsJsonResponse(req, { error: 'Invalid authentication' }, 401)
    }

    const { data: roleData, error: roleError } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', requestingUser.id)
      .single()

    if (roleError || roleData?.role !== 'super_admin') {
      return corsJsonResponse(req, { error: 'Only super admin can reset user PINs' }, 403)
    }

    const { userId, newPin } = await req.json()

    if (!userId || !newPin) {
      return corsJsonResponse(req, { error: 'Missing required fields: userId, newPin' }, 400)
    }

    if (!/^\d{6}$/.test(newPin)) {
      return corsJsonResponse(req, { error: 'PIN must be exactly 6 digits' }, 400)
    }

    const { data: targetProfile } = await supabaseAdmin
      .from('profiles')
      .select('full_name, phone')
      .eq('id', userId)
      .single()

    if (!targetProfile) {
      return corsJsonResponse(req, { error: 'User not found' }, 404)
    }

    const { error: updatePinError } = await supabaseAdmin.rpc('update_pin_only', {
      _user_id: userId,
      _pin: newPin
    })

    if (updatePinError) {
      return corsJsonResponse(req, { error: 'Failed to reset PIN' }, 500)
    }

    await supabaseAdmin.auth.admin.updateUserById(userId, {
      password: newPin
    })

    return corsJsonResponse(req, { 
      success: true, 
      message: `PIN reset successfully for ${targetProfile.full_name}` 
    })
  } catch (error) {
    return corsJsonResponse(req, { error: 'Internal server error' }, 500)
  }
})
