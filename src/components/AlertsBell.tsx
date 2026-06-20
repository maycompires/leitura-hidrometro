import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Bell, AlertTriangle, TrendingUp, Clock, AlertCircle, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { fetchAlerts, markAlertRead, type AlertRow } from "@/lib/alerts.functions";
import { useAuth } from "@/hooks/useAuth";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

const iconFor: Record<AlertRow["tipo"], typeof AlertTriangle> = {
  consumo_alto: TrendingUp,
  possivel_vazamento: AlertCircle,
  leitura_atrasada: Clock,
  leitura_suspeita: AlertTriangle,
};

export function AlertsBell() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const fetchFn = useServerFn(fetchAlerts);
  const markFn = useServerFn(markAlertRead);

  const { data: alerts = [] } = useQuery({
    queryKey: ["alerts"],
    queryFn: () => fetchFn(),
    refetchInterval: 60_000,
  });

  const unread = alerts.filter((a) => !a.resolvido && !(a.lido_por ?? []).includes(user?.id ?? ""));
  const recent = alerts.slice(0, 6);

  const mark = useMutation({
    mutationFn: (id: string) => markFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["alerts"] }),
  });

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Alertas" className="relative">
          <Bell className="h-4 w-4" />
          {unread.length > 0 && (
            <span className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-semibold flex items-center justify-center">
              {unread.length > 9 ? "9+" : unread.length}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="px-3 py-2 border-b flex items-center justify-between">
          <span className="text-sm font-semibold">Alertas</span>
          <span className="text-xs text-muted-foreground">{unread.length} não lido(s)</span>
        </div>
        <div className="max-h-96 overflow-y-auto divide-y">
          {recent.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">Nenhum alerta no momento</p>
          ) : (
            recent.map((a) => {
              const Icon = iconFor[a.tipo] ?? AlertTriangle;
              const isUnread = !a.resolvido && !(a.lido_por ?? []).includes(user?.id ?? "");
              return (
                <div key={a.id} className={cn("p-3 flex gap-2", isUnread && "bg-primary-soft/30")}>
                  <Icon className={cn("h-4 w-4 mt-0.5 shrink-0", a.severidade === "critico" ? "text-destructive" : "text-amber-500")} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium">Bloco {a.bloco}</p>
                    <p className="text-xs text-muted-foreground line-clamp-2">{a.mensagem}</p>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {formatDistanceToNow(new Date(a.created_at), { addSuffix: true, locale: ptBR })}
                    </p>
                  </div>
                  {isUnread && (
                    <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => mark.mutate(a.id)} aria-label="Marcar como lido">
                      <Check className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              );
            })
          )}
        </div>
        <div className="p-2 border-t">
          <Button asChild variant="ghost" size="sm" className="w-full">
            <Link to="/alertas">Ver todos os alertas</Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
