import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Shimmer } from "@/components/ai-elements/shimmer";

export const Route = createFileRoute("/_authenticated/chat/")({
  head: () => ({
    meta: [
      { title: "Assistente | Terra do Sol" },
      { name: "description", content: "Converse com a assistente sobre o consumo de água dos blocos." },
      { property: "og:title", content: "Assistente | Terra do Sol" },
      { property: "og:description", content: "Converse com a assistente sobre o consumo de água dos blocos." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ChatIndex,
});

function ChatIndex() {
  const navigate = useNavigate();
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    (async () => {
      const { data } = await supabase
        .from("chat_threads")
        .select("id")
        .order("updated_at", { ascending: false })
        .limit(1);
      let id = data?.[0]?.id;
      if (!id) {
        const { data: u } = await supabase.auth.getUser();
        const { data: t } = await supabase.from("chat_threads").insert({ user_id: u.user!.id }).select("id").single();
        id = t?.id;
      }
      if (id) navigate({ to: "/chat/$threadId", params: { threadId: id }, replace: true });
    })();
  }, [navigate]);
  return <div className="p-8 text-center"><Shimmer>Abrindo conversa...</Shimmer></div>;
}
