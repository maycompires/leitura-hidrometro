import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, TrendingUp, Clock, AlertCircle, Check, CheckCheck } from "lucide-react";
import { fetchAlerts, markAlertRead, resolveAlert, type AlertRow } from "@/lib/alerts.functions";
import { useAuth } from "@/hooks/useAuth";
import { formatDistanceToNow, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/alertas")({
  component: AlertasPage,
});

const tipoLabel: Record<AlertRow["tipo"], string> = {
  consumo_alto: "Consumo alto",
  possivel_vazamento: "Possível vazamento",
  leitura_atrasada: "Leitura atrasada",
  leitura_suspeita: "Leitura suspeita",
};

const iconFor: Record<AlertRow["tipo"], typeof AlertTriangle> = {
  consumo_alto: TrendingUp,
  possivel_vazamento: AlertCircle,
  leitura_atrasada: Clock,
  leitura_suspeita: AlertTriangle,
};

function AlertasPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const fetchFn = useServerFn(fetchAlerts);
  const markFn = useServerFn(markAlertRead);
  const resolveFn = useServerFn(resolveAlert);
  const [filterBloco, setFilterBloco] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("ativos");

  const { data: alerts = [], isLoading } = useQuery({ queryKey: ["alerts"], queryFn: () => fetchFn() });

  const mark = useMutation({
    mutationFn: (id: string) => markFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["alerts"] }),
  });
  const resolve = useMutation({
    mutationFn: (id: string) => resolveFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["alerts"] }),
  });

  const filtered = alerts.filter((a) => {
    if (filterBloco !== "all" && a.bloco !== filterBloco) return false;
    const isRead = (a.lido_por ?? []).includes(user?.id ?? "");
    if (filterStatus === "ativos" && a.resolvido) return false;
    if (filterStatus === "nao_lidos" && (a.resolvido || isRead)) return false;
    if (filterStatus === "resolvidos" && !a.resolvido) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Alertas</h1>
        <p className="text-sm text-muted-foreground">Detecção automática de anomalias de consumo</p>
      </div>

      <Card className="p-4 shadow-soft">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground">Bloco</label>
            <Select value={filterBloco} onValueChange={setFilterBloco}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {["A","B","C","D"].map((b) => <SelectItem key={b} value={b}>Bloco {b}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Status</label>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ativos">Ativos</SelectItem>
                <SelectItem value="nao_lidos">Não lidos</SelectItem>
                <SelectItem value="resolvidos">Resolvidos</SelectItem>
                <SelectItem value="all">Todos</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      {isLoading ? (
        <Card className="p-8 text-center text-muted-foreground shadow-soft">Carregando…</Card>
      ) : filtered.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground shadow-soft">Nenhum alerta nesse filtro</Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((a) => {
            const Icon = iconFor[a.tipo] ?? AlertTriangle;
            const isRead = (a.lido_por ?? []).includes(user?.id ?? "");
            return (
              <Card key={a.id} className={cn("p-4 shadow-soft flex gap-3", !isRead && !a.resolvido && "border-l-4 border-l-primary")}>
                <Icon className={cn("h-5 w-5 mt-0.5 shrink-0", a.severidade === "critico" ? "text-destructive" : "text-amber-500")} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="secondary">Bloco {a.bloco}</Badge>
                    <Badge variant="outline">{tipoLabel[a.tipo]}</Badge>
                    {a.resolvido && <Badge className="bg-success/20 text-success">Resolvido</Badge>}
                  </div>
                  <p className="text-sm mt-2">{a.mensagem}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {format(new Date(a.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })} · {formatDistanceToNow(new Date(a.created_at), { addSuffix: true, locale: ptBR })}
                  </p>
                </div>
                <div className="flex flex-col gap-1">
                  {!isRead && !a.resolvido && (
                    <Button size="sm" variant="ghost" onClick={() => mark.mutate(a.id)} title="Marcar como lido">
                      <Check className="h-4 w-4" />
                    </Button>
                  )}
                  {!a.resolvido && (
                    <Button size="sm" variant="ghost" onClick={() => resolve.mutate(a.id)} title="Marcar como resolvido">
                      <CheckCheck className="h-4 w-4 text-success" />
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
