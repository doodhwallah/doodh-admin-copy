import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsOptions, corsJsonResponse } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return handleCorsOptions(req);
  }

  const startTime = Date.now();

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    const { data, error } = await supabase
      .from("dairy_settings_public")
      .select("dairy_name")
      .limit(1)
      .maybeSingle();

    const responseTime = Date.now() - startTime;

    if (error) {
      return corsJsonResponse(req, {
        status: "unhealthy",
        database: "disconnected",
        error: error.message,
        response_time_ms: responseTime,
        timestamp: new Date().toISOString(),
      }, 503);
    }

    return corsJsonResponse(req, {
      status: "healthy",
      database: "connected",
      dairy_name: data?.dairy_name || "Unknown",
      response_time_ms: responseTime,
      timestamp: new Date().toISOString(),
    });
  } catch (err: unknown) {
    const responseTime = Date.now() - startTime;
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    return corsJsonResponse(req, {
      status: "error",
      database: "unknown",
      error: errorMessage,
      response_time_ms: responseTime,
      timestamp: new Date().toISOString(),
    }, 500);
  }
});
