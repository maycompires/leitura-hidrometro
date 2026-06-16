import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Outlet, createRootRouteWithContext, HeadContent, Scripts } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Toaster } from "@/components/ui/sonner";

import appCss from "../styles.css?url";
import { AuthProvider } from "@/hooks/useAuth";
import { ThemeProvider } from "@/hooks/useTheme";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: "Terra do Sol — Controle de Água" },
      { name: "description", content: "Aplicativo para controle diário de leitura dos hidrômetros do Condomínio Residencial Terra do Sol." },
      { name: "theme-color", content: "#0EA5E9" },
      { property: "og:title", content: "Terra do Sol — Controle de Água" },
      { name: "twitter:title", content: "Terra do Sol — Controle de Água" },
      { property: "og:description", content: "Aplicativo para controle diário de leitura dos hidrômetros do Condomínio Residencial Terra do Sol." },
      { name: "twitter:description", content: "Aplicativo para controle diário de leitura dos hidrômetros do Condomínio Residencial Terra do Sol." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/5f3253af-5b64-44ef-b4a9-a2236012914f/id-preview-b9f6236c--8a5cdf61-a2cb-4b07-8958-ea92050946a1.lovable.app-1781608432202.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/5f3253af-5b64-44ef-b4a9-a2236012914f/id-preview-b9f6236c--8a5cdf61-a2cb-4b07-8958-ea92050946a1.lovable.app-1781608432202.png" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: () => (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-foreground">404</h1>
        <p className="mt-2 text-muted-foreground">Página não encontrada</p>
        <a href="/" className="mt-6 inline-block rounded-lg bg-primary px-4 py-2 text-primary-foreground">Voltar ao início</a>
      </div>
    </div>
  ),
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <head><HeadContent /></head>
      <body>{children}<Scripts /></body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <Outlet />
          <Toaster position="top-center" richColors />
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
