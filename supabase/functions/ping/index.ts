import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const vercelUrl = Deno.env.get('VERCEL_WEBSITE_URL')
    
    if (!vercelUrl) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Ping received (no Vercel URL configured)',
          timestamp: new Date().toISOString()
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        }
      )
    }

    const response = await fetch(vercelUrl, {
      method: 'GET',
      headers: { 'User-Agent': 'DoodhWallah-KeepAlive/1.0' }
    })

    return new Response(
      JSON.stringify({ 
        success: true,
        message: 'Keep-alive ping successful',
        vercel_status: response.status,
        timestamp: new Date().toISOString()
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    )
  }
})
