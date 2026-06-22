DROP POLICY IF EXISTS "shared_reports_select_public" ON public.shared_reports;
CREATE POLICY "shared_reports_select_owner" ON public.shared_reports FOR SELECT TO authenticated USING (auth.uid() = criado_por);

CREATE POLICY "Users can update own hidrometros photos" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'hidrometros' AND (auth.uid())::text = (storage.foldername(name))[1]) WITH CHECK (bucket_id = 'hidrometros' AND (auth.uid())::text = (storage.foldername(name))[1]);