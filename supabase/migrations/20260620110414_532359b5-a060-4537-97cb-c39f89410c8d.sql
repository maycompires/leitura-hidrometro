
-- Replace overly-permissive alerts UPDATE policy
DROP POLICY IF EXISTS "alerts_update_auth" ON public.alerts;
CREATE POLICY "alerts_update_auth" ON public.alerts FOR UPDATE TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- Restrict EXECUTE on the security-definer trigger function (only owner/triggers use it)
REVOKE EXECUTE ON FUNCTION public.check_reading_alerts() FROM PUBLIC, anon, authenticated;
