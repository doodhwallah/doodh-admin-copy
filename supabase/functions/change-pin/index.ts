import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

    // Get the JWT token from Authorization header
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const token = authHeader.replace('Bearer ', '')
    
    // Create client with user's token in headers (same pattern as other working functions)
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } }
    })

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser()
    
    if (userError || !user) {
      console.error('Auth error:', userError)
      return new Response(
        JSON.stringify({ error: 'Invalid authentication' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Parse request body
    const { currentPin, newPin } = await req.json()

    if (!currentPin || !newPin) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: currentPin, newPin' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Validate new PIN format
    if (!/^\d{6}$/.test(newPin)) {
      return new Response(
        JSON.stringify({ error: 'New PIN must be exactly 6 digits' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get user profile
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('phone')
      .eq('id', user.id)
      .single()

    if (profileError || !profile?.phone) {
      console.error('Profile error:', profileError)
      return new Response(
        JSON.stringify({ error: 'User profile not found' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Verify the current PIN
    const { data: verifiedUserId, error: verifyError } = await supabaseAdmin.rpc('verify_pin', {
      _phone: profile.phone,
      _pin: currentPin
    })

    if (verifyError) {
      console.error('Verify PIN error:', verifyError)
      return new Response(
        JSON.stringify({ error: 'Failed to verify current PIN' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!verifiedUserId) {
      return new Response(
        JSON.stringify({ error: 'Current PIN is incorrect' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Update the PIN hash in profiles table
    const { error: updatePinError } = await supabaseAdmin.rpc('update_pin_only', {
      _user_id: user.id,
      _pin: newPin
    })

    if (updatePinError) {
      console.error('Update PIN error:', updatePinError)
      return new Response(
        JSON.stringify({ error: 'Failed to update PIN in database' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Also update the auth password
    const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
      password: newPin
    })

    if (authError) {
      console.error('Auth update error:', authError)
    }

    console.log(`PIN updated successfully for user ${user.id}`)

    return new Response(
      JSON.stringify({ success: true, message: 'PIN updated successfully' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Unexpected error in change-pin function:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
