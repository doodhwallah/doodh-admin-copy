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
      return corsJsonResponse(req, { error: 'Only super admin can update user status' }, 403)
    }

    const { userId, isActive } = await req.json()

    if (!userId || typeof isActive !== 'boolean') {
      return corsJsonResponse(req, { error: 'Missing required fields: userId, isActive' }, 400)
    }

    if (userId === requestingUser.id) {
      return corsJsonResponse(req, { error: 'Cannot deactivate your own account' }, 400)
    }

    const { error: updateError } = await supabaseAdmin
      .from('profiles')
      .update({ is_active: isActive })
      .eq('id', userId)

    if (updateError) {
      return corsJsonResponse(req, { error: 'Failed to update user status' }, 500)
    }

    return corsJsonResponse(req, { success: true, message: `User ${isActive ? 'activated' : 'deactivated'} successfully` })
  } catch (error) {
    return corsJsonResponse(req, { error: 'Internal server error' }, 500)
  }
})
