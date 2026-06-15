import { supabase } from "@/integrations/supabase/client";

export type Bloco = "A" | "B" | "C" | "D";
export const BLOCOS: Bloco[] = ["A", "B", "C", "D"];

export type Reading = {
  id: string;
  bloco: Bloco;
  data_hora: string;
  leitura_atual: number;
  leitura_anterior: number;
  consumo_m3: number;
  foto_url: string | null;
  observacoes: string | null;
  usuario_id: string;
  created_at: string;
};

export type Profile = { id: string; nome_completo: string; email: string | null };

export async function fetchReadings(filters?: { bloco?: Bloco; usuarioId?: string; from?: string; to?: string }) {
  let q = supabase.from("readings").select("*").order("data_hora", { ascending: false });
  if (filters?.bloco) q = q.eq("bloco", filters.bloco);
  if (filters?.usuarioId) q = q.eq("usuario_id", filters.usuarioId);
  if (filters?.from) q = q.gte("data_hora", filters.from);
  if (filters?.to) q = q.lte("data_hora", filters.to);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as Reading[];
}

export async function fetchLastReadingByBloco(bloco: Bloco) {
  const { data, error } = await supabase
    .from("readings")
    .select("*")
    .eq("bloco", bloco)
    .order("data_hora", { ascending: false })
    .limit(2);
  if (error) throw error;
  return (data ?? []) as Reading[];
}

export async function fetchProfiles() {
  const { data, error } = await supabase.from("profiles").select("id, nome_completo, email");
  if (error) throw error;
  return (data ?? []) as Profile[];
}

export async function uploadHidrometroPhoto(userId: string, bloco: Bloco, file: Blob) {
  const ext = (file.type.split("/")[1] || "jpg").replace("jpeg", "jpg");
  const path = `${userId}/${bloco}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from("hidrometros").upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw error;
  return path;
}

export async function signedPhotoUrl(path: string, expiresIn = 3600) {
  const { data, error } = await supabase.storage.from("hidrometros").createSignedUrl(path, expiresIn);
  if (error) throw error;
  return data.signedUrl;
}
