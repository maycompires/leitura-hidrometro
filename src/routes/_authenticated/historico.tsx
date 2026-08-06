import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Pencil, Trash2, ImageIcon, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { BLOCOS, fetchProfiles, fetchReadings, signedPhotoUrl, type Bloco, type Reading } from "@/lib/api";
import { fmtLeitura, fmtConsumo, litersDigits } from "@/lib/utils";

const PERIODOS = [
  { value: "tudo", label: "Tudo" },
  { value: "hoje", label: "Hoje" },
  { value: "semana", label: "Semana" },
  { value: "mes", label: "Mês" },
  { value: "ano", label: "Ano" },
];

function toISODate(d: Date) {
  return d.toISOString().split("T")[0];
}

function getPeriodDates(periodo: string) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (periodo) {
    case "hoje": {
      const s = toISODate(today);
      return { from: s, to: s };
    }
    case "semana": {
      const start = new Date(today);
      start.setDate(today.getDate() - today.getDay());
      const end = new Date(today);
      end.setDate(start.getDate() + 6);
      return { from: toISODate(start), to: toISODate(end) };
    }
    case "mes": {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      return { from: toISODate(start), to: toISODate(today) };
    }
    case "ano": {
      const start = new Date(today.getFullYear(), 0, 1);
      return { from: toISODate(start), to: toISODate(today) };
    }
    default:
      return { from: "", to: "" };
  }
}


export const Route = createFileRoute("/_authenticated/historico")({
  component: HistoricoPage,
});

function HistoricoPage() {
  const qc = useQueryClient();
  const [bloco, setBloco] = useState<"all" | Bloco>("all");
  const [usuario, setUsuario] = useState<string>("all");
  const [periodo, setPeriodo] = useState<string>("tudo");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [editing, setEditing] = useState<Reading | null>(null);
  const [editValor, setEditValor] = useState("");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  useEffect(() => {
    const { from: f, to: t } = getPeriodDates(periodo);
    setFrom(f);
    setTo(t);
  }, [periodo]);

  const { data: readings = [], isLoading } = useQuery({
    queryKey: ["readings"],
    queryFn: () => fetchReadings(),
  });
  const { data: profiles = [] } = useQuery({ queryKey: ["profiles"], queryFn: fetchProfiles });

  const profileMap = useMemo(() => Object.fromEntries(profiles.map((p) => [p.id, p.nome_completo || "Usuário"])), [profiles]);

  const filtered = readings.filter((r) => {
    if (bloco !== "all" && r.bloco !== bloco) return false;
    if (usuario !== "all" && r.usuario_id !== usuario) return false;
    if (from && new Date(r.data_hora) < new Date(from)) return false;
    if (to && new Date(r.data_hora) > new Date(to + "T23:59:59")) return false;
    return true;
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("readings").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Leitura excluída");
      qc.invalidateQueries({ queryKey: ["readings"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const update = useMutation({
    mutationFn: async () => {
      if (!editing) return;
      const num = Number(editValor.replace(",", "."));
      if (!Number.isFinite(num)) throw new Error("Valor inválido");
      const { error } = await supabase.from("readings").update({ leitura_atual: num }).eq("id", editing.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Leitura atualizada");
      qc.invalidateQueries({ queryKey: ["readings"] });
      setEditing(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const showPhoto = async (path: string) => {
    try {
      const url = await signedPhotoUrl(path);
      setPhotoUrl(url);
    } catch (e: any) {
      toast.error("Não foi possível abrir a foto");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Histórico</h1>
        <p className="text-sm text-muted-foreground">Todas as leituras registradas no condomínio</p>
      </div>

      <Card className="p-4 shadow-soft">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Bloco</Label>
            <Select value={bloco} onValueChange={(v) => setBloco(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {BLOCOS.map((b) => <SelectItem key={b} value={b}>Bloco {b}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Usuário</Label>
            <Select value={usuario} onValueChange={setUsuario}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {profiles.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome_completo || "Usuário"}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">De</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Até</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
      </Card>

      {isLoading ? (
        <Card className="p-8 text-center text-muted-foreground shadow-soft">Carregando…</Card>
      ) : filtered.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground shadow-soft">Nenhuma leitura encontrada</Card>
      ) : (
        BLOCOS.filter((b) => filtered.some((r) => r.bloco === b)).map((b) => {
          const rows = filtered.filter((r) => r.bloco === b);
          return (
            <Card key={b} className="shadow-soft overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
                <h2 className="font-semibold flex items-center gap-2">
                  <span className="rounded-md bg-primary-soft text-primary px-2 py-0.5 text-xs">Bloco {b}</span>
                </h2>
                <span className="text-xs text-muted-foreground">{rows.length} leitura{rows.length === 1 ? "" : "s"}</span>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead className="text-right">Atual</TableHead>
                      <TableHead className="text-right">Anterior</TableHead>
                      <TableHead className="text-right">Consumo</TableHead>
                      <TableHead>Usuário</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="whitespace-nowrap text-sm">{new Date(r.data_hora).toLocaleString("pt-BR")}</TableCell>
                        <TableCell className="text-right tabular-nums whitespace-nowrap">{fmtLeitura(r.leitura_atual, r.bloco)}</TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground whitespace-nowrap">{fmtLeitura(r.leitura_anterior, r.bloco)}</TableCell>
                        <TableCell className="text-right tabular-nums font-medium whitespace-nowrap">{fmtConsumo(r.consumo_m3, r.bloco)}</TableCell>
                        <TableCell className="text-sm">{profileMap[r.usuario_id] ?? "—"}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            {r.foto_url && (
                              <Button variant="ghost" size="icon" onClick={() => showPhoto(r.foto_url!)}>
                                <ImageIcon className="h-4 w-4" />
                              </Button>
                            )}
                            <Button variant="ghost" size="icon" onClick={() => { setEditing(r); setEditValor(String(r.leitura_atual)); }}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => confirm("Excluir esta leitura?") && del.mutate(r.id)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Card>
          );
        })
      )}


      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar leitura — Bloco {editing?.bloco}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Label>Leitura do hidrômetro (número completo)</Label>
            <Input inputMode="numeric" value={editValor} onChange={(e) => setEditValor(e.target.value)} />
            {editing && (
              <p className="text-xs text-muted-foreground">
                Últimos {litersDigits(editing.bloco)} dígitos = litros; anteriores = m³.
              </p>
            )}
            <Button className="w-full" onClick={() => update.mutate()} disabled={update.isPending}>
              {update.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Salvar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!photoUrl} onOpenChange={(o) => !o && setPhotoUrl(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Foto do hidrômetro</DialogTitle></DialogHeader>
          {photoUrl && <img src={photoUrl} alt="Hidrômetro" className="w-full rounded-lg" />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
