import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useRef } from "react";
import { z } from "zod";
import { ArrowLeft, Camera, Upload, Loader2, Sparkles, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { BLOCOS, fetchLastReadingByBloco, uploadHidrometroPhoto, type Bloco } from "@/lib/api";
import { readMeterFromImage } from "@/lib/ocr.functions";
import { fmtLeitura, litersDigits } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/leitura/$bloco")({
  parseParams: (p) => ({ bloco: z.enum(["A", "B", "C", "D"]).parse(p.bloco) as Bloco }),
  component: LeituraPage,
});

function LeituraPage() {
  const { bloco } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();
  const ocr = useServerFn(readMeterFromImage);

  const today = new Date().toISOString().split("T")[0];
  const [valor, setValor] = useState("");
  const [dataLeitura, setDataLeitura] = useState(today);
  const [obs, setObs] = useState("");
  const [photoFile, setPhotoFile] = useState<Blob | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [ocrLoading, setOcrLoading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);

  const { data: lastReadings } = useQuery({
    queryKey: ["readings", "last", bloco],
    queryFn: () => fetchLastReadingByBloco(bloco),
  });
  const ultima = lastReadings?.[0];

  const handleFile = async (file: File) => {
    setPhotoFile(file);
    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUrl = e.target?.result as string;
      setPhotoPreview(dataUrl);
      setOcrLoading(true);
      try {
        const result = await ocr({ data: { imageDataUrl: dataUrl } });
        if (result.value != null) {
          setValor(String(result.value));
          toast.success(`Leitura detectada: ${result.value} m³`);
        } else {
          toast.warning("Não consegui ler a foto. Digite manualmente.");
        }
      } catch (err: any) {
        toast.error(err.message ?? "Falha ao processar imagem");
      } finally {
        setOcrLoading(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const save = useMutation({
    mutationFn: async () => {
      const num = Number(valor.replace(",", "."));
      if (!Number.isFinite(num) || num < 0) throw new Error("Informe um valor numérico válido");
      if (!dataLeitura) throw new Error("Informe a data da leitura");
      if (!user) throw new Error("Sessão expirada");
      if (ultima && num < Number(ultima.leitura_atual)) {
        const ok = window.confirm("A leitura é menor que a anterior. Deseja continuar mesmo assim?");
        if (!ok) throw new Error("Cancelado");
      }
      let foto_url: string | null = null;
      if (photoFile) {
        foto_url = await uploadHidrometroPhoto(user.id, bloco, photoFile);
      }
      const dateTime = new Date(`${dataLeitura}T12:00:00.000Z`).toISOString();
      const { error } = await supabase.from("readings").insert({
        bloco,
        leitura_atual: num,
        observacoes: obs || null,
        foto_url,
        usuario_id: user.id,
        data_hora: dateTime,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Leitura salva!");
      qc.invalidateQueries({ queryKey: ["readings"] });
      navigate({ to: "/dashboard" });
    },
    onError: (e: any) => {
      if (e.message !== "Cancelado") toast.error(e.message ?? "Erro ao salvar");
    },
  });

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/dashboard"><ArrowLeft className="h-5 w-5" /></Link>
        </Button>
        <div>
          <h1 className="text-2xl font-semibold">Nova leitura — Bloco {bloco}</h1>
          {ultima && (
            <p className="text-sm text-muted-foreground">
              Última: <span className="font-medium text-foreground">{fmtLeitura(ultima.leitura_atual, bloco)}</span> em{" "}
              {new Date(ultima.data_hora).toLocaleDateString("pt-BR")}
            </p>
          )}
        </div>
      </div>

      <Card className="p-5 space-y-4 shadow-soft">
        <div>
          <h2 className="text-sm font-medium mb-3 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" /> Capturar com IA
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <input
              ref={cameraInput}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
            <Button variant="outline" onClick={() => cameraInput.current?.click()} disabled={ocrLoading}>
              <Camera className="mr-2 h-4 w-4" /> Foto
            </Button>
            <Button variant="outline" onClick={() => fileInput.current?.click()} disabled={ocrLoading}>
              <Upload className="mr-2 h-4 w-4" /> Galeria
            </Button>
          </div>

          {photoPreview && (
            <div className="mt-4 relative rounded-lg overflow-hidden border border-border">
              <img src={photoPreview} alt="Hidrômetro" className="w-full max-h-64 object-cover" />
              {ocrLoading && (
                <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Loader2 className="h-4 w-4 animate-spin" /> Lendo hidrômetro…
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </Card>

      <Card className="p-5 space-y-4 shadow-soft">
        <div className="space-y-2">
          <Label htmlFor="valor">Leitura do hidrômetro (número completo)</Label>
          <Input
            id="valor"
            inputMode="numeric"
            placeholder="Digite todos os dígitos do hidrômetro"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            className="text-2xl h-14 tabular-nums"
          />
          <p className="text-xs text-muted-foreground">
            No Bloco {bloco}, os últimos <strong>{litersDigits(bloco)}</strong> dígitos representam litros e os
            anteriores m³. Ex.: {bloco === "B" ? "182697 → 1826 m³ 97 L" : "17518615 → 17518 m³ 615 L"}.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="obs">Observações (opcional)</Label>
          <Textarea
            id="obs"
            placeholder="Algo a registrar?"
            value={obs}
            onChange={(e) => setObs(e.target.value)}
            maxLength={500}
          />
        </div>

        <Button
          className="w-full h-12 text-base"
          onClick={() => save.mutate()}
          disabled={save.isPending || !valor}
        >
          {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Salvar leitura
        </Button>
      </Card>

      <div className="flex flex-wrap gap-2">
        {BLOCOS.filter((b) => b !== bloco).map((b) => (
          <Button key={b} variant="ghost" size="sm" asChild>
            <Link to="/leitura/$bloco" params={{ bloco: b }}>
              <ImageIcon className="mr-1 h-3 w-3" /> Bloco {b}
            </Link>
          </Button>
        ))}
      </div>
    </div>
  );
}
