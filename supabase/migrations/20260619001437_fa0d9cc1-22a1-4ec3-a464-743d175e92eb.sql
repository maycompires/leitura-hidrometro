-- 1) Remove email from profiles (duplicates auth.users and was readable by all authenticated users)
ALTER TABLE public.profiles DROP COLUMN IF EXISTS email;

-- Update signup trigger so it no longer references the dropped column
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, nome_completo)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nome_completo', NEW.raw_user_meta_data->>'full_name', NEW.email)
  );
  RETURN NEW;
END;
$function$;

-- 2) Tighten storage SELECT policy on hidrometros: only the uploader can read their photos
DROP POLICY IF EXISTS "Authenticated can view hidrometros photos" ON storage.objects;

CREATE POLICY "Users can view own hidrometros photos"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'hidrometros'
  AND (auth.uid())::text = (storage.foldername(name))[1]
);
