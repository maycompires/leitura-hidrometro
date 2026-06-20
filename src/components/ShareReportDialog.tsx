import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Share2, Copy, Mail, MessageCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { createShareLink } from "@/lib/sharing.functions";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

type Period = "day" | "week" | "month" | "year";

export function ShareReportDialog({ period }: { period: Period }) {
  const createFn = useServerFn(createShareLink);
  const [open, setOpen] = useState(false);
  const [blocos, setBlocos] = useState<("A" | "B" | "C" | "D")[]>(["A", "B", "C", "D"]);
  const [validity, setValidity] = useState("7");
  const [link, setLink] = useState<string | null>(null);
  const [expires, setExpires] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: async () => {
      const res = await createFn({ data: { period, blocos, validity_days: Number(validity) } });
      const url = `${window.location.origin}/r/${res.token}`;
      setLink(url);
      setExpires(res.expires_at);
      return url;
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleBloco = (b: "A" | "B" | "C" | "D") => {
    setBlocos((prev) => (prev.includes(b) ? prev.filter((x) => x !== b) : [...prev, b]));
  };

  const message = link
    ? `Relatório de consumo do Condomínio Terra do Sol (válido até ${expires ? format(new Date(expires), "dd/MM/yyyy HH:mm", { locale: ptBR }) : ""}): ${link}`
    : "";

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setLink(null); setExpires(null); } }}>
      <DialogTrigger asChild>
        <Button variant="outline"><Share2 className="mr-2 h-4 w-4" />Compartilhar</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Compartilhar relatório</DialogTitle></DialogHeader>

        {!link ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Blocos incluídos</Label>
              <div className="flex gap-4">
                {(["A", "B", "C", "D"] as const).map((b) => (
                  <label key={b} className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox checked={blocos.includes(b)} onCheckedChange={() => toggleBloco(b)} />
                    Bloco {b}
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Validade do link</Label>
              <Select value={validity} onValueChange={setValidity}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">24 horas</SelectItem>
                  <SelectItem value="7">7 dias</SelectItem>
                  <SelectItem value="30">30 dias</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <p className="text-xs text-muted-foreground">
              Qualquer pessoa com o link poderá ver o relatório (somente leitura) referente ao período <strong>{period}</strong>.
            </p>

            <Button className="w-full" onClick={() => create.mutate()} disabled={create.isPending || blocos.length === 0}>
              {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Gerar link
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-lg bg-muted p-3 text-xs break-all font-mono">{link}</div>
            {expires && (
              <p className="text-xs text-muted-foreground">
                Válido até {format(new Date(expires), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
              </p>
            )}
            <div className="grid grid-cols-3 gap-2">
              <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(link); toast.success("Link copiado"); }}>
                <Copy className="mr-1 h-4 w-4" />Copiar
              </Button>
              <Button variant="outline" size="sm" asChild>
                <a href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer">
                  <MessageCircle className="mr-1 h-4 w-4" />WhatsApp
                </a>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <a href={`mailto:?subject=${encodeURIComponent("Relatório de consumo — Terra do Sol")}&body=${encodeURIComponent(message)}`}>
                  <Mail className="mr-1 h-4 w-4" />Email
                </a>
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
