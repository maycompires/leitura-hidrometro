
-- Enum for blocks
CREATE TYPE public.bloco_type AS ENUM ('A', 'B', 'C', 'D');

-- Profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome_completo TEXT NOT NULL DEFAULT '',
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Profiles are viewable by authenticated users"
  ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

-- Readings table
CREATE TABLE public.readings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bloco public.bloco_type NOT NULL,
  data_hora TIMESTAMPTZ NOT NULL DEFAULT now(),
  leitura_atual NUMERIC(12,3) NOT NULL,
  leitura_anterior NUMERIC(12,3) NOT NULL DEFAULT 0,
  consumo_m3 NUMERIC(12,3) NOT NULL DEFAULT 0,
  foto_url TEXT,
  observacoes TEXT,
  usuario_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_readings_bloco_data ON public.readings(bloco, data_hora DESC);
CREATE INDEX idx_readings_usuario ON public.readings(usuario_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.readings TO authenticated;
GRANT ALL ON public.readings TO service_role;
ALTER TABLE public.readings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view all readings"
  ON public.readings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert readings as themselves"
  ON public.readings FOR INSERT TO authenticated WITH CHECK (auth.uid() = usuario_id);
CREATE POLICY "Users can update their own readings"
  ON public.readings FOR UPDATE TO authenticated USING (auth.uid() = usuario_id) WITH CHECK (auth.uid() = usuario_id);
CREATE POLICY "Users can delete their own readings"
  ON public.readings FOR DELETE TO authenticated USING (auth.uid() = usuario_id);

-- Updated at trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_readings_updated_at
  BEFORE UPDATE ON public.readings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, nome_completo, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nome_completo', NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.email
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Auto-compute consumo and fetch previous reading
CREATE OR REPLACE FUNCTION public.set_reading_previous_and_consumo()
RETURNS TRIGGER AS $$
DECLARE
  prev NUMERIC(12,3);
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT leitura_atual INTO prev
    FROM public.readings
    WHERE bloco = NEW.bloco AND data_hora < NEW.data_hora
    ORDER BY data_hora DESC
    LIMIT 1;
    NEW.leitura_anterior := COALESCE(prev, 0);
    IF prev IS NULL THEN
      NEW.consumo_m3 := 0;
    ELSE
      NEW.consumo_m3 := NEW.leitura_atual - prev;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    NEW.consumo_m3 := NEW.leitura_atual - NEW.leitura_anterior;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER trg_readings_compute
  BEFORE INSERT OR UPDATE ON public.readings
  FOR EACH ROW EXECUTE FUNCTION public.set_reading_previous_and_consumo();
