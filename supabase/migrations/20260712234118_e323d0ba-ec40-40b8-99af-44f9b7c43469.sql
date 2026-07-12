
DROP POLICY IF EXISTS alerts_update_auth ON public.alerts;

CREATE OR REPLACE FUNCTION public.alerts_prevent_sensitive_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.bloco IS DISTINCT FROM OLD.bloco
     OR NEW.tipo IS DISTINCT FROM OLD.tipo
     OR NEW.severidade IS DISTINCT FROM OLD.severidade
     OR NEW.mensagem IS DISTINCT FROM OLD.mensagem
     OR NEW.reading_id IS DISTINCT FROM OLD.reading_id
     OR NEW.metadata IS DISTINCT FROM OLD.metadata
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Only lido_por and resolvido may be updated on alerts';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS alerts_prevent_sensitive_update_trg ON public.alerts;
CREATE TRIGGER alerts_prevent_sensitive_update_trg
BEFORE UPDATE ON public.alerts
FOR EACH ROW EXECUTE FUNCTION public.alerts_prevent_sensitive_update();

CREATE POLICY alerts_update_auth ON public.alerts
FOR UPDATE TO authenticated
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);
