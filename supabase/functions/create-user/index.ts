import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
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
      return corsJsonResponse(req, { error: 'Only super admin can create users' }, 403)
    }

    const { phone, pin, fullName, role } = await req.json()

    if (!phone || !pin || !fullName || !role) {
      return corsJsonResponse(req, { error: 'Missing required fields: phone, pin, fullName, role' }, 400)
    }

    if (!/^\d{6}$/.test(pin)) {
      return corsJsonResponse(req, { error: 'PIN must be exactly 6 digits' }, 400)
    }

    const validRoles = ['super_admin', 'manager', 'accountant', 'delivery_staff', 'farm_worker', 'vet_staff', 'auditor']
    if (!validRoles.includes(role)) {
      return corsJsonResponse(req, { error: 'Invalid role' }, 400)
    }

    const { data: existingProfile } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('phone', phone)
      .single()

    if (existingProfile) {
      return corsJsonResponse(req, { error: 'A user with this phone number already exists' }, 400)
    }

    const email = `${phone}@doodhwallah.app`
    const { data: authData, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: pin,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        phone: phone
      }
    })

    if (createError) {
      return corsJsonResponse(req, { error: createError.message }, 400)
    }

    const userId = authData.user.id

    const { error: profileError } = await supabaseAdmin.rpc('update_user_profile_with_pin', {
      _user_id: userId,
      _full_name: fullName,
      _phone: phone,
      _role: role,
      _pin: pin
    })

    if (profileError) {
      await supabaseAdmin
        .from('profiles')
        .update({
          full_name: fullName,
          phone: phone,
          role: role
        })
        .eq('id', userId)
    }

    await supabaseAdmin
      .from('user_roles')
      .update({ role: role })
      .eq('user_id', userId)

    return corsJsonResponse(req, { 
      success: true, 
      message: 'User created successfully',
      userId: userId
    })
  } catch (error) {
    return corsJsonResponse(req, { error: 'Internal server error' }, 500)
  }
})
