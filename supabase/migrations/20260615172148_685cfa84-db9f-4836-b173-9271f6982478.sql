
CREATE POLICY "Authenticated can view hidrometros photos"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'hidrometros');
CREATE POLICY "Authenticated can upload hidrometros photos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'hidrometros' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can delete own hidrometros photos"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'hidrometros' AND auth.uid()::text = (storage.foldername(name))[1]);
