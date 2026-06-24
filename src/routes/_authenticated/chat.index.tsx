import { createFileRoute, redirect } from "@tanstack/react-router";
import { createThread, listThreads } from "@/lib/chat.functions";

export const Route = createFileRoute("/_authenticated/chat/")({
  loader: async () => {
    const threads = await listThreads();
    if (threads.length > 0) {
      throw redirect({ to: "/chat/$threadId", params: { threadId: threads[0].id } });
    }
    const t = await createThread({ data: {} });
    throw redirect({ to: "/chat/$threadId", params: { threadId: t!.id } });
  },
  component: () => null,
});
