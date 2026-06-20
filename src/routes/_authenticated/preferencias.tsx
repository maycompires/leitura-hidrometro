import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { getMyPreferences, updateMyPreferences } from "@/lib/preferences.functions";

export const Route = createFileRoute("/_authenticated/preferencias")({
  component: PreferenciasPage,
});

function PreferenciasPage() {
  const qc = useQueryClient();
  const getFn = useServerFn(getMyPreferences);
  const setFn = useServerFn(updateMyPreferences);

  const { data } = useQuery({ queryKey: ["preferences"], queryFn: () => getFn() });
  const [threshold, setThreshold] = useState(50);
  const [dias, setDias] = useState(7);

  useEffect(() => {
    if (data) {
      setThreshold(Number(data.consumo_threshold_pct));
      setDias(Number(data.dias_sem_leitura));
    }
  }, [data]);

  const save = useMutation({
    mutationFn: () => setFn({ data: { consumo_threshold_pct: threshold, dias_sem_leitura: dias } }),
    onSuccess: () => {
      toast.success("Preferências salvas");
      qc.invalidateQueries({ queryKey: ["preferences"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Preferências de alertas</h1>
        <p className="text-sm text-muted-foreground">Ajuste os limiares de detecção automática</p>
      </div>

      <Card className="p-5 space-y-4 shadow-soft">
        <div className="space-y-2">
          <Label htmlFor="th">Limiar de consumo alto (% acima da média de 7 dias)</Label>
          <Input id="th" type="number" min={0} max={500} value={threshold}
            onChange={(e) => setThreshold(Number(e.target.value))} />
          <p className="text-xs text-muted-foreground">Padrão: 50%. Alertas são gerados quando uma leitura ultrapassa esse percentual.</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="dias">Dias sem leitura antes de alertar</Label>
          <Input id="dias" type="number" min={1} max={60} value={dias}
            onChange={(e) => setDias(Number(e.target.value))} />
          <p className="text-xs text-muted-foreground">Padrão: 7 dias. Um alerta é gerado se um bloco ficar esse tempo sem leitura.</p>
        </div>

        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Salvar preferências
        </Button>
      </Card>
    </div>
  );
}
