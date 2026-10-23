import { createFileRoute, redirect, useNavigate, Link, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  MessageSquareText,
  Sparkles,
  Loader2,
  Bot,
  KanbanSquare,
  ShieldCheck,
  Zap,
  ArrowLeft,
  CheckCircle2,
} from "lucide-react";
import { BrandTerrain } from "@/components/brand-terrain";
import { BrandMark } from "@/components/brand-mark";
import { brand } from "@/config/brand";
import { resolveAuthMode, validateSignup, PASSWORD_MIN, type AuthMode } from "@/lib/auth-mode";
import { withTimeout, isAuthConnectionError, AUTH_CONNECTION_MESSAGE, resolvePostAuthDestination } from "@/lib/auth-timeout";

type Search = { modo?: "login" | "signup"; plano?: string };

export const Route = createFileRoute("/entrar")({
  ssr: false,
  head: () => ({ meta: [
    { title: `${brand.name} — Acesso` },
    { name: "description", content: "Acesse sua conta FLOWA para atender WhatsApp com IA 24/7 e organizar seu CRM Kanban." },
    { property: "og:title", content: `${brand.name} — Acesso` },
    { property: "og:description", content: "Acesse sua conta FLOWA para atender WhatsApp com IA 24/7 e organizar seu CRM Kanban." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  validateSearch: (s: Record<string, unknown>): Search => ({
    modo: resolveAuthMode(s.modo),
    plano: typeof s.plano === "string" ? s.plano : undefined,
  }),
  beforeLoad: async ({ search }) => {
    const result = await withTimeout(supabase.auth.getUser()).catch(() => null);
    if (result?.data.user) {
      const dest = search.plano ? `/app/checkout?plano=${encodeURIComponent(search.plano)}` : "/app/dashboard";
      throw redirect({ href: dest });
    }
  },
  component: EntrarPage,
});

const PLAN_LABEL: Record<string, { nome: string; preco: string }> = {
  starter: { nome: "Starter", preco: "R$ 97/mês" },
  pro: { nome: "Pro", preco: "R$ 197/mês" },
  business: { nome: "Business", preco: "R$ 497/mês" },
};

const emailSchema = z.string().email("E-mail inválido");

function EntrarPage() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/entrar" }) as Search;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const mode: AuthMode = resolveAuthMode(search.modo);
  const needsPassword = mode === "login";
  function switchMode(m: AuthMode) {
    setPassword(""); setConfirm(""); setSentTo(null);
    navigate({ to: "/entrar", search: { modo: m, plano: search.plano } as any, replace: true });
  }
  const [loading, setLoading] = useState(false);

  const planInfo = search.plano ? PLAN_LABEL[search.plano] : null;

  async function routeAfterAuth(userId: string) {
    const href = await resolvePostAuthDestination(search.plano, {
      isSuperAdmin: async () => {
        const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", userId);
        if (error) throw error;
        return !!data?.some((r) => r.role === "super_admin");
      },
      hasCompany: async () => {
        const { data, error } = await supabase.from("company_user").select("company_id").eq("user_id", userId).eq("ativo", true).limit(1);
        if (error) throw error;
        return !!data?.length;
      },
    });
    navigate({ href, replace: true });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const v = emailSchema.safeParse(email);
    if (!v.success) return toast.error(v.error.issues[0].message);
    setLoading(true);
    try {
      if (needsPassword) {
        const { data, error } = await withTimeout(supabase.auth.signInWithPassword({ email, password }));
        if (error) {
          if (isAuthConnectionError(error)) return toast.error(AUTH_CONNECTION_MESSAGE);
          const m = (error.message || "").toLowerCase();
          if (m.includes("confirm")) return toast.error("Confirme seu e-mail pelo link que enviamos antes de entrar.");
          return toast.error("E-mail ou senha incorretos. Tente novamente ou recupere sua senha.");
        }
        if (!data.user) return toast.error("Não foi possível confirmar seu login. Tente novamente.");
        toast.success("Bem-vindo de volta!");
        await routeAfterAuth(data.user.id);
        return;
      }

      const invalid = validateSignup(email, password, confirm);
      if (invalid) return toast.error(invalid);
      const { data: signUpData, error: signUpErr } = await withTimeout(supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { emailRedirectTo: window.location.origin + (search.plano ? `/app/checkout?plano=${encodeURIComponent(search.plano)}` : "/app/checkout") },
      }));
      if (signUpErr) {
        if (isAuthConnectionError(signUpErr)) return toast.error(AUTH_CONNECTION_MESSAGE);
        const msg = (signUpErr.message || "").toLowerCase();
        if (msg.includes("already") || msg.includes("registered") || msg.includes("exists")) {
          toast.message("Não foi possível criar a conta com este e-mail.", { description: "Se você já tem conta, entre ou recupere sua senha." });
          return;
        }
        if (msg.includes("signup") && (msg.includes("disabled") || msg.includes("not allowed"))) {
          toast.error("Cadastros novos estão desativados no momento.");
          return;
        }
        if (msg.includes("weak") || msg.includes("pwned") || msg.includes("password")) {
          toast.error("Senha recusada. Escolha uma senha mais forte e diferente de senhas comuns.");
          return;
        }
        return toast.error("Não foi possível criar a conta. Tente novamente.");
      }
      if (signUpData.session && signUpData.user) {
        toast.success("Conta criada!");
        await routeAfterAuth(signUpData.user.id);
        return;
      }
      // Sem sessão: confirmação por e-mail pendente (ou e-mail já cadastrado — resposta neutra).
      setSentTo(email.trim());
    } catch (err) {
      if (isAuthConnectionError(err)) toast.error(AUTH_CONNECTION_MESSAGE);
      else toast.error("Não foi possível confirmar seu acesso agora. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-root min-h-screen w-full relative overflow-hidden bg-background text-foreground">
      <div className="relative z-10 min-h-screen grid lg:grid-cols-[1fr_1fr]">
        {/* LEFT — brand pane (hidden on mobile) */}
        <aside className="auth-brand-pane hidden lg:flex flex-col justify-between p-10 xl:p-14 border-r border-border bg-background">
          <div className="flex items-center gap-3">
            <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="size-4" />
              voltar ao site
            </Link>
          </div>

          <BrandTerrain />
          <div className="auth-brand-content space-y-7 max-w-lg">
            <div className="flex items-center gap-3">
              <BrandMark className="size-12" />
              <div>
                <div className="font-display font-medium text-xl text-foreground leading-none">{brand.name}</div>
                <div className="text-[12px] text-muted-foreground mt-1">{brand.tagline}</div>
              </div>
            </div>

            <h1 className="font-display text-4xl xl:text-[44px] font-normal leading-[1.18]">
              Relacionamentos<br />que viram<br /><span className="text-brand">resultado.</span>
            </h1>

            <p className="text-[15px] text-muted-foreground leading-relaxed">
              IA no WhatsApp 24/7, CRM Kanban e toda a jornada do seu cliente em um só lugar.
            </p>

            <div className="grid gap-3">
              <Feature icon={<Bot className="size-4" />} title="IA treinada no seu negócio" desc="Responde no seu tom, sem parecer robô." />
              <Feature icon={<KanbanSquare className="size-4" />} title="CRM Kanban inteligente" desc="Cada lead se move sozinho pelo funil." />
              <Feature icon={<Zap className="size-4" />} title="Pronto em 2 minutos" desc="Escaneou o QR, já está atendendo." />
            </div>

            <div className="flex items-center gap-4 pt-2 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5"><ShieldCheck className="size-3.5 text-[color:var(--brand)]" /> LGPD-friendly</span>
              <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="size-3.5 text-[color:var(--brand)]" /> Sem cartão p/ testar</span>
              <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="size-3.5 text-[color:var(--brand)]" /> Cancele quando quiser</span>
            </div>
          </div>

          <div className="text-[12px] text-muted-foreground">
            © {new Date().getFullYear()} {brand.name}. Todos os direitos reservados.
          </div>
        </aside>

        {/* RIGHT — form */}
        <main className="auth-form-pane flex flex-col items-center justify-center px-5 py-10 sm:px-10">
          {/* Mobile brand header */}
          <div className="lg:hidden w-full max-w-md mb-6 flex items-center justify-between">
            <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
              <ArrowLeft className="size-4" /> voltar
            </Link>
            <div className="flex items-center gap-2">
              <BrandMark className="size-9" />
              <div className="font-display font-bold text-[15px] text-gradient-brand">{brand.name}</div>
            </div>
          </div>

          <div className="w-full max-w-md">
            <div className="auth-form-card relative p-6 sm:p-9">
              <div className="relative">
                {planInfo && (
                  <div className="mb-5 rounded-lg border border-[color:var(--brand)]/30 bg-[color:var(--brand-soft)] p-4">
                    <div className="flex items-center gap-2 text-[11px] uppercase font-bold tracking-[0.14em] text-[color:var(--brand-text)]">
                      <Sparkles className="size-3.5" /> Plano escolhido
                    </div>
                    <div className="mt-1 flex items-baseline justify-between">
                      <div className="font-display text-lg font-bold">{planInfo.nome}</div>
                      <div className="text-sm font-semibold">{planInfo.preco}</div>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">3 dias grátis • cancele antes e não paga nada</div>
                  </div>
                )}

                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-sm bg-[color:var(--brand-soft)] border border-[color:var(--brand)]/20 text-[11px] font-semibold text-[color:var(--brand-text)] mb-3">
                  <span className="size-1.5 rounded-full bg-[color:var(--brand)] dot-pulse" />
                  {needsPassword ? "Acesso à conta" : "Nova conta"}
                </div>

                <h1 className="font-display text-[24px] sm:text-[26px] font-medium leading-tight ">
                  {needsPassword ? "Entrar na sua conta" : "Criar sua conta"}
                </h1>
                <p className="text-sm text-muted-foreground mt-1.5 mb-6">
                  {needsPassword
                    ? "Informe seu e-mail e senha para continuar."
                    : "Cadastre seu e-mail e escolha uma senha. Depois você escolhe o plano."}
                </p>

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="email">E-mail</Label>
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      autoFocus
                      placeholder="voce@empresa.com"
                      className="h-11"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="pwd">Senha</Label>
                      {needsPassword && (
                        <Link to="/esqueci-senha" className="text-[11.5px] font-medium text-muted-foreground hover:text-[color:var(--brand-text)] transition-colors">
                          Esqueci minha senha
                        </Link>
                      )}
                    </div>
                    <Input id="pwd" type="password" autoComplete={needsPassword ? "current-password" : "new-password"} value={password} onChange={(e) => setPassword(e.target.value)} required className="h-11" />
                    {!needsPassword && <p className="text-[11.5px] text-muted-foreground">Mínimo de {PASSWORD_MIN} caracteres, com letras e números.</p>}
                  </div>

                  {!needsPassword && (
                    <div className="space-y-1.5">
                      <Label htmlFor="pwd2">Confirmar senha</Label>
                      <Input id="pwd2" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required className="h-11" />
                    </div>
                  )}

                  <Button
                    type="submit"
                    disabled={loading}
                    size="lg"
                    className="w-full h-12 bg-gradient-brand text-primary-foreground hover:opacity-95 font-semibold text-[14.5px] "
                  >
                    {loading && <Loader2 className="size-4 mr-2 animate-spin" />}
                    {needsPassword ? "Entrar" : "Criar conta"}
                  </Button>

                  {!needsPassword && (
                    <p className="text-[11.5px] text-muted-foreground text-center pt-1 leading-relaxed">
                      Sem cartão para começar os <span className="font-semibold text-foreground">3 dias grátis</span>. Cancele quando quiser.
                    </p>
                  )}
                  <p className="text-[13px] text-muted-foreground text-center">
                    {needsPassword ? "Ainda não tem conta? " : "Já tem conta? "}
                    <button type="button" onClick={() => switchMode(needsPassword ? "signup" : "login")} className="font-semibold text-[color:var(--brand-text)] underline-offset-2 hover:underline">
                      {needsPassword ? "Criar conta" : "Entrar"}
                    </button>
                  </p>
                </form>
                {sentTo && (
                  <div role="status" className="mt-5 rounded-lg border border-border p-4 text-sm">
                    <div className="font-semibold">Verifique seu e-mail</div>
                    <p className="text-muted-foreground mt-1">Se {sentTo} puder ser cadastrado, enviamos um link de confirmação. Depois de confirmar, você segue para {planInfo ? "o pagamento do plano escolhido" : "a escolha do plano"}. Já tem conta? Entre com sua senha.</p>
                  </div>
                )}
              </div>
            </div>

            <p className="text-[11.5px] text-muted-foreground text-center mt-5">
              Ao continuar, você concorda com nossos{" "}
              <Link to="/termos" className="underline underline-offset-2 hover:text-foreground">Termos</Link>{" "}
              e{" "}
              <Link to="/privacidade" className="underline underline-offset-2 hover:text-foreground">Política de privacidade</Link>.
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}

function Feature({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="auth-feature flex items-start gap-3 py-4">
      <div className="size-9 rounded-lg grid place-items-center bg-[color:var(--brand-soft)] text-[color:var(--brand-text)] shrink-0 ring-1 ring-[color:var(--brand)]/15">
        {icon}
      </div>
      <div className="min-w-0">
        <div className="font-semibold text-[13.5px] leading-tight">{title}</div>
        <div className="text-[12px] text-muted-foreground mt-0.5">{desc}</div>
      </div>
    </div>
  );
}
