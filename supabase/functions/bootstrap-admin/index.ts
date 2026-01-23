import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders, handleCorsOptions, corsJsonResponse } from "../_shared/cors.ts"

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCorsOptions(req)
  }

  try {
    const { phone, pin } = await req.json()

    if (phone !== '7897716792' || pin !== '101101') {
      return corsJsonResponse(req, { error: 'Invalid bootstrap credentials' }, 400)
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    const email = `${phone}@doodhwallah.app`

    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers()
    const existingUser = existingUsers?.users?.find(u => u.email === email)

    if (existingUser) {
      const { error: roleUpdateError } = await supabaseAdmin
        .from('user_roles')
        .update({ role: 'super_admin' })
        .eq('user_id', existingUser.id)

      if (roleUpdateError) {
        // Role update failed - logged server-side only
      }

      const { error: profileUpdateError } = await supabaseAdmin
        .from('profiles')
        .update({ role: 'super_admin', full_name: 'Super Admin' })
        .eq('id', existingUser.id)

      if (profileUpdateError) {
        // Profile update failed - logged server-side only
      }

      return corsJsonResponse(req, { 
        success: true, 
        message: 'Admin account ready. You can now login.',
        user_id: existingUser.id
      })
    }

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: pin,
      email_confirm: true,
      user_metadata: {
        phone: phone,
        full_name: 'Super Admin'
      }
    })

    if (authError) {
      return corsJsonResponse(req, { error: authError.message }, 400)
    }

    const userId = authData.user.id

    await new Promise(resolve => setTimeout(resolve, 500))

    await supabaseAdmin
      .from('user_roles')
      .upsert({ user_id: userId, role: 'super_admin' }, { onConflict: 'user_id' })

    await supabaseAdmin
      .from('profiles')
      .update({ role: 'super_admin', full_name: 'Super Admin', phone: phone })
      .eq('id', userId)

    return corsJsonResponse(req, { 
      success: true, 
      message: 'Super admin account created successfully. You can now login.',
      user_id: userId
    })

  } catch (error) {
    return corsJsonResponse(req, { error: 'Internal server error' }, 500)
  }
})
