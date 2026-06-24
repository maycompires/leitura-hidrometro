import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { listThreads, createThread } from "@/lib/chat.functions";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/chat/")({
  component: ChatIndex,
});

function ChatIndex() {
  const navigate = useNavigate();
  const list = useServerFn(listThreads);
  const create = useServerFn(createThread);

  useEffect(() => {
    let done = false;
    (async () => {
      try {
        const threads = await list();
        if (done) return;
        if (threads.length > 0) {
          navigate({ to: "/chat/$threadId", params: { threadId: threads[0].id }, replace: true });
        } else {
          const t = await create({ data: {} });
          if (done) return;
          navigate({ to: "/chat/$threadId", params: { threadId: t.id }, replace: true });
        }
      } catch (e) {
        console.error(e);
      }
    })();
    return () => {
      done = true;
    };
  }, [list, create, navigate]);

  return (
    <div className="flex items-center justify-center min-h-[40vh] text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin mr-2" /> Abrindo chat...
    </div>
  );
}
