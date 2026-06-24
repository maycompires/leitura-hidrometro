import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listThreads,
  createThread,
  deleteThread,
  loadThread,
  renameThread,
} from "@/lib/chat.functions";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputFooter,
  PromptInputSubmit,
  type PromptInputMessage,
} from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";
import {
  Tool,
  ToolHeader,
  ToolContent,
  ToolInput,
  ToolOutput,
  type ToolPart,
} from "@/components/ai-elements/tool";
import { Droplet, Plus, Trash2, ArrowLeft, Loader2, MessageSquare, Pencil } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/chat/$threadId")({
  component: ChatPage,
});

function ChatPage() {
  const { threadId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const list = useServerFn(listThreads);
  const create = useServerFn(createThread);
  const remove = useServerFn(deleteThread);
  const load = useServerFn(loadThread);
  const rename = useServerFn(renameThread);

  const { data: threads = [] } = useQuery({
    queryKey: ["chat-threads"],
    queryFn: () => list(),
  });

  const { data: loaded, isLoading } = useQuery({
    queryKey: ["chat-thread", threadId],
    queryFn: () => load({ data: { id: threadId } }),
  });

  const initialMessages: UIMessage[] = useMemo(
    () =>
      (loaded?.messages ?? []).map((m) => ({
        id: m.id,
        role: m.role,
        parts: JSON.parse(m.partsJson),
      })) as UIMessage[],
    [loaded],
  );

  return (
    <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] gap-4 h-[calc(100vh-7rem)]">
      <ThreadSidebar
        threads={threads}
        activeId={threadId}
        onNew={async () => {
          const t = await create({ data: {} });
          await qc.invalidateQueries({ queryKey: ["chat-threads"] });
          navigate({ to: "/chat/$threadId", params: { threadId: t.id } });
        }}
        onDelete={async (id) => {
          await remove({ data: { id } });
          await qc.invalidateQueries({ queryKey: ["chat-threads"] });
          if (id === threadId) navigate({ to: "/chat" });
        }}
        onRename={async (id, title) => {
          await rename({ data: { id, title } });
          await qc.invalidateQueries({ queryKey: ["chat-threads"] });
        }}
      />

      {isLoading ? (
        <div className="flex items-center justify-center text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando conversa...
        </div>
      ) : (
        <ChatWindow
          key={threadId}
          threadId={threadId}
          initialMessages={initialMessages}
          title={loaded?.thread?.title ?? "Conversa"}
        />
      )}
    </div>
  );
}

function ThreadSidebar({
  threads,
  activeId,
  onNew,
  onDelete,
  onRename,
}: {
  threads: Array<{ id: string; title: string; updated_at: string }>;
  activeId: string;
  onNew: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  return (
    <Card className="p-3 flex flex-col gap-2 shadow-soft md:h-full">
      <div className="flex items-center justify-between gap-2">
        <Link to="/relatorios" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          <ArrowLeft className="h-3 w-3" /> Relatórios
        </Link>
        <Button size="sm" onClick={onNew}>
          <Plus className="h-4 w-4 mr-1" /> Nova
        </Button>
      </div>
      <div className="flex-1 overflow-auto -mx-1 px-1 space-y-1">
        {threads.length === 0 && (
          <p className="text-xs text-muted-foreground p-2">Nenhuma conversa ainda.</p>
        )}
        {threads.map((t) => {
          const active = t.id === activeId;
          const isEditing = editingId === t.id;
          return (
            <div
              key={t.id}
              className={cn(
                "group flex items-center gap-1 rounded-md px-2 py-1.5 text-sm",
                active ? "bg-primary-soft text-primary" : "hover:bg-muted",
              )}
            >
              {isEditing ? (
                <form
                  className="flex-1 flex gap-1"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (editValue.trim()) onRename(t.id, editValue.trim());
                    setEditingId(null);
                  }}
                >
                  <Input
                    autoFocus
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onBlur={() => setEditingId(null)}
                    className="h-7 text-xs"
                  />
                </form>
              ) : (
                <Link
                  to="/chat/$threadId"
                  params={{ threadId: t.id }}
                  className="flex-1 truncate inline-flex items-center gap-2"
                >
                  <MessageSquare className="h-3.5 w-3.5 shrink-0 opacity-70" />
                  <span className="truncate">{t.title}</span>
                </Link>
              )}
              {!isEditing && (
                <div className="opacity-0 group-hover:opacity-100 flex">
                  <button
                    type="button"
                    aria-label="Renomear"
                    className="p-1 text-muted-foreground hover:text-foreground"
                    onClick={() => {
                      setEditingId(t.id);
                      setEditValue(t.title);
                    }}
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    aria-label="Excluir"
                    className="p-1 text-muted-foreground hover:text-destructive"
                    onClick={() => {
                      if (confirm("Excluir esta conversa?")) onDelete(t.id);
                    }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function ChatWindow({
  threadId,
  initialMessages,
  title,
}: {
  threadId: string;
  initialMessages: UIMessage[];
  title: string;
}) {
  const navigate = useNavigate();
  const triggeredExport = useRef(false);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        prepareSendMessagesRequest: async ({ messages, body }) => {
          const { data } = await supabase.auth.getSession();
          const token = data.session?.access_token;
          const headers: Record<string, string> = {};
          if (token) headers.Authorization = `Bearer ${token}`;
          return {
            body: { messages, threadId, ...body },
            headers,
          };
        },
      }),
    [threadId],
  );


  const { messages, sendMessage, status, error } = useChat({
    id: threadId,
    messages: initialMessages,
    transport,
    onError: (e) => toast.error(e.message ?? "Erro no chat"),
  });

  // Detecta chamada da ferramenta exportar_relatorio_pdf
  useEffect(() => {
    if (triggeredExport.current) return;
    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
    if (!lastAssistant) return;
    const tool = lastAssistant.parts.find((p) => {
      const tp = p as { type: string; state?: string };
      return (
        (tp.type === "tool-exportar_relatorio_pdf" || tp.type === "dynamic-tool") &&
        tp.state === "output-available"
      );
    });

    if (tool) {
      triggeredExport.current = true;
      try {
        sessionStorage.setItem("autoExportPDF", "1");
      } catch {}
      toast.success("Gerando relatório em PDF...");
      setTimeout(() => navigate({ to: "/relatorios" }), 600);
    }
  }, [messages, navigate]);

  const isLoading = status === "submitted" || status === "streaming";

  return (
    <Card className="flex flex-col shadow-soft overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border/60">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-hero text-primary-foreground">
          <Droplet className="h-4 w-4" />
        </span>
        <div className="leading-tight">
          <p className="text-sm font-medium">{title}</p>
          <p className="text-[11px] text-muted-foreground">Assistente de consumo de água</p>
        </div>
      </div>

      <Conversation className="flex-1">
        <ConversationContent>
          {messages.length === 0 && (
            <ConversationEmptyState
              icon={<Droplet className="h-6 w-6 text-primary" />}
              title="Pergunte sobre o consumo"
              description='Ex.: "Qual bloco consumiu mais essa semana?" ou "Gera um relatório em PDF".'
            />
          )}
          {messages.map((m) => (
            <Message key={m.id} from={m.role}>
              <MessageContent>
                {m.parts.map((part, i) => {
                  if (part.type === "text") {
                    return m.role === "assistant" ? (
                      <MessageResponse key={i}>{part.text}</MessageResponse>
                    ) : (
                      <span key={i} className="whitespace-pre-wrap">
                        {part.text}
                      </span>
                    );
                  }
                  if (
                    part.type === "tool-exportar_relatorio_pdf" ||
                    part.type === "dynamic-tool"
                  ) {
                    const tp = part as unknown as ToolPart;
                    return (
                      <Tool key={i} defaultOpen={false}>
                        <ToolHeader
                          type={tp.type}
                          state={tp.state}
                          toolName={
                            tp.type === "dynamic-tool"
                              ? ((part as { toolName?: string }).toolName ?? "tool")
                              : tp.type.replace(/^tool-/, "")
                          }
                        />

                        <ToolContent>
                          {tp.input != null && <ToolInput input={tp.input} />}
                          {(tp.state === "output-available" ||
                            tp.state === "output-error") && (
                            <ToolOutput
                              output={
                                "output" in tp && tp.output != null
                                  ? JSON.stringify(tp.output)
                                  : null
                              }
                              errorText={"errorText" in tp ? tp.errorText : undefined}
                            />
                          )}
                        </ToolContent>
                      </Tool>
                    );
                  }
                  return null;
                })}
              </MessageContent>
            </Message>
          ))}
          {status === "submitted" && (
            <Message from="assistant">
              <MessageContent>
                <Shimmer>Pensando...</Shimmer>
              </MessageContent>
            </Message>
          )}
          {error && (
            <p className="text-xs text-destructive px-2">Erro: {error.message}</p>
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="p-3 border-t border-border/60">
        <PromptInput
          onSubmit={async (msg: PromptInputMessage) => {
            const text = msg.text?.trim();
            if (!text || isLoading) return;
            await sendMessage({ text });
          }}
        >
          <PromptInputTextarea placeholder="Pergunte ou peça um relatório..." />
          <PromptInputFooter className="justify-end">
            <PromptInputSubmit status={status} disabled={isLoading} />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </Card>
  );
}
