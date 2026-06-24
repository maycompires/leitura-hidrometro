import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  listThreads,
  createThread,
  deleteThread,
  getThreadMessages,
} from "@/lib/chat.functions";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Trash2, Send, MessageCircle, Loader2, Wrench } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/chat/$threadId")({
  component: ChatPage,
});

function ChatPage() {
  const { threadId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const threadsQ = useQuery({ queryKey: ["chat-threads"], queryFn: () => listThreads() });
  const messagesQ = useQuery({
    queryKey: ["chat-messages", threadId],
    queryFn: () => getThreadMessages({ data: { threadId } }),
  });

  const initialMessages = useMemo<UIMessage[]>(
    () =>
      (messagesQ.data ?? []).map((m) => ({
        id: m.id,
        role: m.role,
        parts: m.parts as UIMessage["parts"],
      })),
    [messagesQ.data],
  );

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        fetch: async (url, init) => {
          const { data } = await supabase.auth.getSession();
          const token = data.session?.access_token;
          const headers = new Headers(init?.headers);
          if (token) headers.set("Authorization", `Bearer ${token}`);
          // Inject threadId into body
          const bodyStr = typeof init?.body === "string" ? init.body : "{}";
          const body = JSON.parse(bodyStr);
          body.threadId = threadId;
          return fetch(url, { ...init, headers, body: JSON.stringify(body) });
        },
      }),
    [threadId],
  );

  const { messages, sendMessage, status, error, setMessages } = useChat({
    id: threadId,
    transport,
  });

  // Hydrate when loaded
  useEffect(() => {
    if (messagesQ.data) {
      setMessages(initialMessages);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId, messagesQ.data]);

  useEffect(() => {
    if (error) toast.error(error.message || "Erro ao conversar com a IA");
  }, [error]);

  const [input, setInput] = useState("");
  const taRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, status]);

  useEffect(() => {
    taRef.current?.focus();
  }, [threadId, status]);

  const isLoading = status === "submitted" || status === "streaming";

  const newThread = useMutation({
    mutationFn: () => createThread({ data: {} }),
    onSuccess: (t) => {
      qc.invalidateQueries({ queryKey: ["chat-threads"] });
      if (t) navigate({ to: "/chat/$threadId", params: { threadId: t.id } });
    },
  });

  const removeThread = useMutation({
    mutationFn: (id: string) => deleteThread({ data: { id } }),
    onSuccess: async (_d, id) => {
      const threads = await qc.fetchQuery({ queryKey: ["chat-threads"], queryFn: () => listThreads() });
      if (id === threadId) {
        if (threads.length > 0) {
          navigate({ to: "/chat/$threadId", params: { threadId: threads[0].id } });
        } else {
          const t = await createThread({ data: {} });
          if (t) navigate({ to: "/chat/$threadId", params: { threadId: t.id } });
        }
      }
      qc.invalidateQueries({ queryKey: ["chat-threads"] });
    },
  });

  const handleSubmit = async () => {
    const text = input.trim();
    if (!text || isLoading) return;
    setInput("");
    await sendMessage({ text });
    qc.invalidateQueries({ queryKey: ["chat-threads"] });
  };

  return (
    <AppShell>
      <div className="grid gap-4 md:grid-cols-[260px_1fr]">
        {/* Sidebar */}
        <Card className="p-3 hidden md:flex md:flex-col h-[calc(100vh-9rem)]">
          <Button
            onClick={() => newThread.mutate()}
            disabled={newThread.isPending}
            className="w-full"
            size="sm"
          >
            <Plus className="h-4 w-4 mr-1" /> Nova conversa
          </Button>
          <ScrollArea className="mt-3 flex-1 -mx-1 px-1">
            <div className="space-y-1">
              {(threadsQ.data ?? []).map((t) => (
                <div
                  key={t.id}
                  className={cn(
                    "group flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm",
                    t.id === threadId ? "bg-primary-soft text-primary" : "hover:bg-muted",
                  )}
                >
                  <Link
                    to="/chat/$threadId"
                    params={{ threadId: t.id }}
                    className="flex-1 truncate text-left"
                  >
                    {t.title}
                  </Link>
                  <button
                    onClick={() => {
                      if (confirm("Excluir esta conversa?")) removeThread.mutate(t.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                    aria-label="Excluir"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </ScrollArea>
        </Card>

        {/* Chat */}
        <Card className="flex flex-col h-[calc(100vh-9rem)] overflow-hidden">
          <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
            <div className="flex items-center gap-2">
              <MessageCircle className="h-4 w-4 text-primary" />
              <span className="font-semibold text-sm">Assistente Terra do Sol</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="md:hidden"
              onClick={() => newThread.mutate()}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          <ScrollArea className="flex-1 px-4 py-4">
            <div className="space-y-4 max-w-3xl mx-auto">
              {messages.length === 0 && !messagesQ.isLoading && (
                <div className="text-center py-10 text-muted-foreground text-sm">
                  <MessageCircle className="h-10 w-10 mx-auto mb-3 opacity-50" />
                  <p className="font-medium text-foreground mb-1">Como posso ajudar?</p>
                  <p>Pergunte sobre leituras, consumo, médias ou tendências dos blocos.</p>
                  <div className="mt-4 flex flex-wrap gap-2 justify-center text-xs">
                    {[
                      "Qual o consumo dos últimos 7 dias?",
                      "Compare o consumo dos blocos no mês",
                      "Há alertas recentes?",
                    ].map((s) => (
                      <button
                        key={s}
                        onClick={() => setInput(s)}
                        className="rounded-full border border-border px-3 py-1 hover:bg-muted"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {messages.map((m) => (
                <MessageView key={m.id} message={m} />
              ))}
              {status === "submitted" && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Pensando...
                </div>
              )}
              <div ref={endRef} />
            </div>
          </ScrollArea>

          <div className="border-t border-border/60 p-3">
            <div className="max-w-3xl mx-auto flex gap-2 items-end">
              <Textarea
                ref={taRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit();
                  }
                }}
                placeholder="Escreva sua pergunta..."
                rows={1}
                className="resize-none min-h-[44px] max-h-40"
                disabled={isLoading}
              />
              <Button onClick={handleSubmit} disabled={isLoading || !input.trim()} size="icon">
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}

function MessageView({ message }: { message: UIMessage }) {
  const isUser = message.role === "user";
  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm",
          isUser ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
        )}
      >
        {message.parts.map((part, i) => {
          if (part.type === "text") {
            return (
              <div key={i} className="prose prose-sm dark:prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                <ReactMarkdown>{part.text}</ReactMarkdown>
              </div>
            );
          }
          if (part.type?.startsWith("tool-")) {
            const p = part as unknown as {
              type: string;
              state?: string;
              input?: unknown;
              output?: unknown;
            };
            const name = part.type.replace(/^tool-/, "");
            return (
              <details
                key={i}
                className="mt-2 rounded-md border border-border/60 bg-background/40 px-2 py-1 text-xs"
              >
                <summary className="cursor-pointer flex items-center gap-1 text-muted-foreground">
                  <Wrench className="h-3 w-3" /> Ferramenta: {name}
                  {p.state && <span className="ml-1 opacity-70">({p.state})</span>}
                </summary>
                <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-words text-[11px]">
                  {JSON.stringify({ input: p.input, output: p.output }, null, 2)}
                </pre>
              </details>
            );
          }
          return null;
        })}
      </div>
    </div>
  );
}
