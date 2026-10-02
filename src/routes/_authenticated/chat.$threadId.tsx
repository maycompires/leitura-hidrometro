import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Database, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
} from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Tool, ToolContent, ToolHeader, ToolInput, ToolOutput } from "@/components/ai-elements/tool";
import gota from "@/assets/gota.png";

export const Route = createFileRoute("/_authenticated/chat/$threadId")({
  head: () => ({
    meta: [
      { title: "Conversa com a assistente | Terra do Sol" },
      { name: "description", content: "Pergunte sobre leituras, médias e dicas de economia de água." },
      { property: "og:title", content: "Conversa com a assistente | Terra do Sol" },
      { property: "og:description", content: "Pergunte sobre leituras, médias e dicas de economia de água." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ChatPage,
});

const SUGESTOES = [
  "Qual bloco consumiu mais este mês?",
  "Qual a média diária do Bloco C?",
  "Houve algum consumo fora do normal na última semana?",
  "Dicas para economizar água nas áreas comuns",
];

function ChatPage() {
  const { threadId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const threads = useQuery({
    queryKey: ["chat_threads"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chat_threads")
        .select("id, title, updated_at")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const history = useQuery({
    queryKey: ["chat_messages", threadId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chat_messages")
        .select("id, role, parts, created_at")
        .eq("thread_id", threadId)
        .order("created_at");
      if (error) throw error;
      return (data ?? []).map((r) => {
        const p = r.parts as unknown as { id?: string; parts?: UIMessage["parts"] } | UIMessage["parts"];
        const parts = Array.isArray(p) ? p : (p.parts ?? []);
        const id = Array.isArray(p) ? r.id : (p.id ?? r.id);
        return { id, role: r.role as UIMessage["role"], parts } as UIMessage;
      });
    },
    staleTime: Infinity,
  });

  async function novaConversa() {
    const { data: u } = await supabase.auth.getUser();
    const { data, error } = await supabase.from("chat_threads").insert({ user_id: u.user!.id }).select("id").single();
    if (error || !data) return toast.error("Não foi possível criar a conversa.");
    await qc.invalidateQueries({ queryKey: ["chat_threads"] });
    navigate({ to: "/chat/$threadId", params: { threadId: data.id } });
  }

  async function apagar(id: string) {
    setConfirmDelete(null);
    const { error } = await supabase.from("chat_threads").delete().eq("id", id);
    if (error) return toast.error("Não foi possível apagar a conversa.");
    toast.success("Conversa apagada.");
    await qc.invalidateQueries({ queryKey: ["chat_threads"] });
    if (id === threadId) navigate({ to: "/chat" });
  }

  const threadAtual = threads.data?.find((t) => t.id === threadId);

  const content = (
    <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-[240px_minmax(0,1fr)]">
      <aside className="min-w-0 space-y-2">
        <Button onClick={novaConversa} className="w-full" size="sm">
          <Plus className="h-4 w-4" /> Nova conversa
        </Button>
        <div className="flex gap-2 overflow-x-auto md:flex-col md:overflow-visible">
          {threads.data?.map((t) => (
            <div
              key={t.id}
              className={cn(
                "group flex shrink-0 items-center gap-1 rounded-lg border px-2 py-1.5 text-sm md:shrink",
                t.id === threadId ? "border-primary bg-primary-soft text-primary" : "border-border text-muted-foreground",
              )}
            >
              <Link to="/chat/$threadId" params={{ threadId: t.id }} className="flex min-w-0 flex-1 items-center gap-2">
                <MessageSquare className="h-3.5 w-3.5 shrink-0" />
                <span className="max-w-[160px] truncate">{t.title}</span>
              </Link>
              <button
                onClick={() => setConfirmDelete(t.id)}
                aria-label="Apagar conversa"
                className="rounded p-1 hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      </aside>

      {history.isLoading ? (
        <div className="p-8 text-center"><Shimmer>Carregando...</Shimmer></div>
      ) : (
        <ChatWindow
          key={threadId}
          threadId={threadId}
          title={threadAtual?.title ?? "Conversa"}
          initial={history.data ?? []}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["chat_threads"] });
          }}
          onApagar={() => setConfirmDelete(threadId)}
        />
      )}
    </div>
  );

  return (
    <>
      {content}
      <AlertDialog open={confirmDelete !== null} onOpenChange={(open) => !open && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar conversa?</AlertDialogTitle>
            <AlertDialogDescription>
              Essa ação exclui a conversa e todas as mensagens dela. Não é possível desfazer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmDelete && apagar(confirmDelete)}>Apagar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function ChatWindow({
  threadId,
  initial,
  onSaved,
  title,
  onApagar,
}: {
  threadId: string;
  initial: UIMessage[];
  onSaved: () => void;
  title: string;
  onApagar: () => void;
}) {
  const [input, setInput] = useState("");
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        body: { threadId },
        headers: async (): Promise<Record<string, string>> => {
          const { data } = await supabase.auth.getSession();
          const t = data.session?.access_token;
          return t ? { Authorization: `Bearer ${t}` } : {};
        },
      }),
    [threadId],
  );
  const { messages, sendMessage, status, stop } = useChat({
    id: threadId,
    messages: initial,
    transport,
    onError: (e) => toast.error(e.message?.includes("{") ? safeMsg(e.message) : e.message || "Erro de conexão."),
    onFinish: () => setTimeout(onSaved, 800),
  });
  const busy = status === "submitted" || status === "streaming";

  useEffect(() => {
    if (!busy) document.querySelector<HTMLTextAreaElement>("[data-chat-input]")?.focus();
  }, [busy]);

  const send = (text: string) => {
    if (!text.trim() || busy) return;
    sendMessage({ text });
    setInput("");
  };

  return (
    <div className="flex h-[calc(100dvh-13rem)] min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-card md:h-[calc(100dvh-10rem)]">
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2">
        <h2 className="min-w-0 truncate text-sm font-medium text-foreground">{title}</h2>
        <button
          onClick={onApagar}
          aria-label="Apagar conversa"
          className="shrink-0 rounded p-1.5 text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      <Conversation className="flex-1">
        <ConversationContent>
          {messages.length === 0 ? (
            <ConversationEmptyState>
              <img src={gota} alt="Gota" className="h-16 w-16" />
              <h2 className="text-lg font-semibold text-foreground">Olá! Eu sou a Gota.</h2>
              <p className="text-sm text-muted-foreground">Pergunte sobre as leituras dos blocos ou peça dicas de economia.</p>
              <div className="mt-3 flex flex-wrap justify-center gap-2">
                {SUGESTOES.map((s) => (
                  <Button key={s} variant="outline" size="sm" className="h-auto max-w-full whitespace-normal py-1.5 text-left" onClick={() => send(s)}>
                    {s}
                  </Button>
                ))}
              </div>
            </ConversationEmptyState>
          ) : (
            messages.map((m) => (
              <Message from={m.role} key={m.id}>
                <MessageContent
                  className={cn(m.role === "user" && "bg-primary text-primary-foreground", m.role === "assistant" && "bg-transparent")}
                >
                  {m.parts.map((p, i) => {
                    if (p.type === "text")
                      return m.role === "assistant" ? (
                        <MessageResponse key={i}>{p.text}</MessageResponse>
                      ) : (
                        <p key={i} className="whitespace-pre-wrap">{p.text}</p>
                      );
                    if (p.type === "reasoning" && p.text)
                      return (
                        <p key={i} className="border-l-2 border-border pl-2 text-xs italic text-muted-foreground">
                          {p.text}
                        </p>
                      );
                    if (p.type.startsWith("tool-")) {
                      const tp = p as Parameters<typeof ToolHeader>[0] & { input?: unknown; output?: unknown; errorText?: string };
                      return (
                        <Tool key={i} defaultOpen={false}>
                          <ToolHeader type={tp.type as never} state={tp.state} title="Consultando leituras" />
                          <ToolContent>
                            <ToolInput input={tp.input} />
                            <ToolOutput output={<CompactOutput output={tp.output} />} errorText={tp.errorText} />
                          </ToolContent>
                        </Tool>
                      );
                    }
                    return null;
                  })}
                </MessageContent>
              </Message>
            ))
          )}
          {status === "submitted" && (
            <div className="flex items-center gap-2">
              <img src={gota} alt="" className="h-6 w-6" />
              <Shimmer>Pensando...</Shimmer>
            </div>
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>
      <div className="border-t border-border p-3">
        <PromptInput onSubmit={({ text }) => send(text)}>
          <PromptInputTextarea
            data-chat-input
            autoFocus
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Pergunte sobre o consumo de água..."
          />
          <PromptInputFooter className="justify-end">
            <PromptInputSubmit status={status} onStop={stop} disabled={!busy && !input.trim()} />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  );
}

function safeMsg(raw: string) {
  try {
    return JSON.parse(raw).error ?? "Erro ao responder.";
  } catch {
    return "Erro ao responder.";
  }
}

function CompactOutput({ output }: { output: unknown }) {
  const o = output as { resumo?: Record<string, { leituras: number; total_m3: number }> } | undefined;
  if (!o?.resumo) return null;
  return (
    <div className="flex flex-wrap gap-2 p-2 text-xs">
      <Database className="h-3.5 w-3.5" />
      {Object.entries(o.resumo).map(([b, r]) => (
        <span key={b} className="rounded bg-muted px-2 py-0.5">
          Bloco {b}: {r.leituras} leituras
        </span>
      ))}
    </div>
  );
}
