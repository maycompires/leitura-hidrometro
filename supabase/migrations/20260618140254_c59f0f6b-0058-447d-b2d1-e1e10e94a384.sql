
-- 1) Atualizar função/trigger para usar divisor por bloco (B=100, demais=1000)
CREATE OR REPLACE FUNCTION public.set_reading_previous_and_consumo()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  prev NUMERIC(12,3);
  divisor NUMERIC := CASE WHEN NEW.bloco = 'B' THEN 100 ELSE 1000 END;
BEGIN
  SELECT leitura_atual INTO prev
  FROM public.readings
  WHERE bloco = NEW.bloco
    AND data_hora < NEW.data_hora
    AND (NEW.id IS NULL OR id <> NEW.id)
  ORDER BY data_hora DESC
  LIMIT 1;

  NEW.leitura_anterior := COALESCE(prev, 0);

  IF prev IS NULL THEN
    NEW.consumo_m3 := 0;
  ELSE
    NEW.consumo_m3 := (NEW.leitura_atual - prev) / divisor;
  END IF;

  RETURN NEW;
END;
$function$;

-- Garantir que o trigger exista (caso ausente)
DROP TRIGGER IF EXISTS trg_set_reading_previous_and_consumo ON public.readings;
CREATE TRIGGER trg_set_reading_previous_and_consumo
BEFORE INSERT OR UPDATE ON public.readings
FOR EACH ROW EXECUTE FUNCTION public.set_reading_previous_and_consumo();

-- 2) Recalcular todas as leituras existentes (dispara o trigger UPDATE)
UPDATE public.readings SET leitura_atual = leitura_atual;
