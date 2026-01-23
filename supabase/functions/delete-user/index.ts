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

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return corsJsonResponse(req, { error: 'No authorization header' }, 401)
    }

    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
    })

    const { data: { user: requestingUser }, error: userError } = await supabaseClient.auth.getUser()
    
    if (userError || !requestingUser) {
      return corsJsonResponse(req, { error: 'Unauthorized' }, 401)
    }

    const { data: roleData, error: roleError } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', requestingUser.id)
      .single()

    if (roleError || roleData?.role !== 'super_admin') {
      return corsJsonResponse(req, { error: 'Only super_admin can delete users' }, 403)
    }

    const { userId } = await req.json()

    if (!userId) {
      return corsJsonResponse(req, { error: 'User ID is required' }, 400)
    }

    if (userId === requestingUser.id) {
      return corsJsonResponse(req, { error: 'Cannot delete your own account' }, 400)
    }

    const { data: targetRoleData } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .single()

    if (targetRoleData?.role === 'super_admin') {
      return corsJsonResponse(req, { error: 'Cannot delete super_admin accounts' }, 403)
    }

    const { data: targetProfile } = await supabaseAdmin
      .from('profiles')
      .select('full_name, phone')
      .eq('id', userId)
      .single()

    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId)

    if (deleteError) {
      return corsJsonResponse(req, { error: 'Failed to delete user' }, 500)
    }

    await supabaseAdmin
      .from('activity_logs')
      .insert({
        user_id: requestingUser.id,
        action: 'user_deleted',
        entity_type: 'user',
        entity_id: userId,
        details: {
          deleted_user_name: targetProfile?.full_name,
          deleted_user_phone: targetProfile?.phone,
          deleted_by: requestingUser.email,
        },
      })

    return corsJsonResponse(req, { 
      success: true, 
      message: `User ${targetProfile?.full_name || 'unknown'} has been permanently deleted` 
    })

  } catch (error) {
    return corsJsonResponse(req, { error: 'Internal server error' }, 500)
  }
})
