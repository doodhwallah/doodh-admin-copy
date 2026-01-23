// Shared CORS configuration for all Edge Functions
// Reads allowed origins from environment variable ALLOWED_ORIGINS (comma-separated)
// Falls back to allowing all origins in development if not set

export function getCorsHeaders(req: Request): Record<string, string> {
  const allowedOriginsEnv = Deno.env.get('ALLOWED_ORIGINS') || '';
  const allowedOrigins = allowedOriginsEnv 
    ? allowedOriginsEnv.split(',').map(o => o.trim()).filter(Boolean)
    : [];
  
  const origin = req.headers.get('Origin') || '';
  
  // Determine if origin is allowed
  let allowOrigin = '*'; // Default for development if no ALLOWED_ORIGINS set
  
  if (allowedOrigins.length > 0) {
    // Check if origin matches any allowed origin
    if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
      allowOrigin = origin || '*';
    } else {
      // Origin not in allowed list - still respond but with first allowed origin
      // This prevents CORS bypass but may cause browser errors for unauthorized origins
      allowOrigin = allowedOrigins[0];
    }
  }
  
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  };
}

// Helper for OPTIONS preflight requests
export function handleCorsOptions(req: Request): Response {
  return new Response(null, { 
    status: 204,
    headers: getCorsHeaders(req) 
  });
}

// Helper to create JSON response with CORS headers
export function corsJsonResponse(
  req: Request, 
  data: unknown, 
  status: number = 200
): Response {
  return new Response(
    JSON.stringify(data),
    { 
      status, 
      headers: { 
        ...getCorsHeaders(req), 
        'Content-Type': 'application/json' 
      } 
    }
  );
}
