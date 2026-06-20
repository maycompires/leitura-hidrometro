
-- ============ alerts ============
CREATE TABLE public.alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bloco text NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('consumo_alto','possivel_vazamento','leitura_atrasada','leitura_suspeita')),
  severidade text NOT NULL DEFAULT 'aviso' CHECK (severidade IN ('info','aviso','critico')),
  mensagem text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  reading_id uuid REFERENCES public.readings(id) ON DELETE CASCADE,
  lido_por uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
  resolvido boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, UPDATE ON public.alerts TO authenticated;
GRANT ALL ON public.alerts TO service_role;

ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "alerts_select_auth" ON public.alerts FOR SELECT TO authenticated USING (true);
CREATE POLICY "alerts_update_auth" ON public.alerts FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX alerts_created_at_idx ON public.alerts (created_at DESC);
CREATE INDEX alerts_bloco_idx ON public.alerts (bloco);

-- ============ user_preferences ============
CREATE TABLE public.user_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  consumo_threshold_pct numeric NOT NULL DEFAULT 50,
  dias_sem_leitura int NOT NULL DEFAULT 7,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_preferences TO authenticated;
GRANT ALL ON public.user_preferences TO service_role;

ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "prefs_select_self" ON public.user_preferences FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "prefs_insert_self" ON public.user_preferences FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "prefs_update_self" ON public.user_preferences FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER user_preferences_updated_at BEFORE UPDATE ON public.user_preferences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ shared_reports ============
CREATE TABLE public.shared_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL UNIQUE,
  criado_por uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  period text NOT NULL,
  blocos text[] NOT NULL DEFAULT ARRAY['A','B','C','D'],
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.shared_reports TO anon;
GRANT SELECT, INSERT, DELETE ON public.shared_reports TO authenticated;
GRANT ALL ON public.shared_reports TO service_role;

ALTER TABLE public.shared_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "shared_reports_select_public" ON public.shared_reports FOR SELECT TO anon, authenticated USING (expires_at > now());
CREATE POLICY "shared_reports_insert_self" ON public.shared_reports FOR INSERT TO authenticated WITH CHECK (auth.uid() = criado_por);
CREATE POLICY "shared_reports_delete_self" ON public.shared_reports FOR DELETE TO authenticated USING (auth.uid() = criado_por);

CREATE INDEX shared_reports_token_idx ON public.shared_reports (token);

-- Também precisamos permitir leitura pública das readings via token? Não — vamos fazer pela server function pública usando service_role só para ler dados agregados.

-- ============ Trigger de alertas em readings ============
CREATE OR REPLACE FUNCTION public.check_reading_alerts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  media numeric;
  threshold_pct numeric := 50; -- default
  divisor numeric := CASE WHEN NEW.bloco = 'B' THEN 100 ELSE 1000 END;
BEGIN
  -- Leitura suspeita: atual menor que anterior
  IF NEW.leitura_anterior IS NOT NULL AND NEW.leitura_atual < NEW.leitura_anterior THEN
    INSERT INTO public.alerts (bloco, tipo, severidade, mensagem, reading_id, metadata)
    VALUES (
      NEW.bloco,
      'leitura_suspeita',
      'aviso',
      'Leitura registrada no Bloco ' || NEW.bloco || ' é menor que a anterior.',
      NEW.id,
      jsonb_build_object('leitura_atual', NEW.leitura_atual, 'leitura_anterior', NEW.leitura_anterior)
    );
  END IF;

  -- Consumo acima da média móvel (últimos 7 dias, excluindo a atual)
  SELECT AVG(consumo_m3) INTO media
  FROM public.readings
  WHERE bloco = NEW.bloco
    AND id <> NEW.id
    AND consumo_m3 > 0
    AND data_hora >= NEW.data_hora - INTERVAL '7 days'
    AND data_hora < NEW.data_hora;

  IF media IS NOT NULL AND media > 0 AND NEW.consumo_m3 > media * (1 + threshold_pct / 100.0) THEN
    INSERT INTO public.alerts (bloco, tipo, severidade, mensagem, reading_id, metadata)
    VALUES (
      NEW.bloco,
      'consumo_alto',
      'aviso',
      'Consumo do Bloco ' || NEW.bloco || ' está ' ||
        ROUND(((NEW.consumo_m3 - media) / media) * 100)::text || '% acima da média dos últimos 7 dias.',
      NEW.id,
      jsonb_build_object('consumo_m3', NEW.consumo_m3, 'media_7d', media, 'threshold_pct', threshold_pct)
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER readings_check_alerts AFTER INSERT OR UPDATE ON public.readings
  FOR EACH ROW EXECUTE FUNCTION public.check_reading_alerts();
