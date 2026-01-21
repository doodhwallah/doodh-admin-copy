-- Create a public ping function for keep-alive checks
-- This function is read-only and consumes no storage

CREATE OR REPLACE FUNCTION public.ping()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT 'pong'::TEXT;
$$;

-- Grant execute permission to anon and authenticated roles
GRANT EXECUTE ON FUNCTION public.ping() TO anon;
GRANT EXECUTE ON FUNCTION public.ping() TO authenticated;

COMMENT ON FUNCTION public.ping() IS 'Keep-alive ping function for preventing database pause';
