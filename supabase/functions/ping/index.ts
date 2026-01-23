import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { getCorsHeaders, handleCorsOptions, corsJsonResponse } from "../_shared/cors.ts"

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCorsOptions(req)
  }

  try {
    const vercelUrl = Deno.env.get('VERCEL_WEBSITE_URL')
    
    if (!vercelUrl) {
      return corsJsonResponse(req, { 
        success: true, 
        message: 'Ping received (no Vercel URL configured)',
        timestamp: new Date().toISOString()
      })
    }

    const response = await fetch(vercelUrl, {
      method: 'GET',
      headers: { 'User-Agent': 'DoodhWallah-KeepAlive/1.0' }
    })

    return corsJsonResponse(req, { 
      success: true,
      message: 'Keep-alive ping successful',
      vercel_status: response.status,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    return corsJsonResponse(req, { 
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, 500)
  }
})
