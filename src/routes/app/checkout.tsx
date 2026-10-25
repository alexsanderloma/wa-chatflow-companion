import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { brand, supportWhatsappUrl } from "@/config/brand";
import {
  Loader2, ShieldCheck, ArrowLeft, Check, TrendingUp, Crown, Smartphone,
  Users, MessageSquare, Headphones, Calendar, BarChart3, Webhook, Zap, ExternalLink, Sparkles, Lock,
} from "lucide-react";
import { createCheckoutCompany, startAsaasCheckout } from "@/lib/checkout.functions";
import { useServerFn } from "@tanstack/react-start";
import { trialDaysLeft } from "@/lib/tenant";
import { checkoutRedirect, CHECKOUT_SUPPORT_MESSAGE, CHECKOUT_CURRENT_STATUSES } from "@/lib/checkout-policy";

type Search = { plano?: string; mode?: string };

type Plano = {
  id: string;
  slug: string;
  nome: string;
  descricao: string | null;
  preco_cents: number;
  trial_days: number;
  checkout_url: string | null;
  destaque: boolean;
  limite_mensagens: number;
  limite_instancias: number;
  limite_usuarios: number;
  limite_contatos: number;
  features: string[];
};

export const Route = createFileRoute("/app/checkout")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    plano: typeof s.plano === "string" ? s.plano : undefined,
    mode: typeof s.mode === "string" ? s.mode : undefined,
  }),
  head: () => ({ meta: [{ title: `${brand.name} — Escolha e troca de plano` },
    { name: "description", content: "Compare planos FLOWA e gerencie seu pagamento com segurança." },
    { property: "og:title", content: `${brand.name} — Escolha e troca de plano` },
    { property: "og:description", content: "Escolha de planos e orientação segura para alterações de assinatura FLOWA." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: CheckoutPage,
});

function formatBRL(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function defaultCompanyName(email?: string | null) {
  const local = email?.split("@")[0]?.replace(/[._-]+/g, " ").trim();
  return local ? `Empresa de ${local}` : "Minha empresa";
}

const FEATURE_ICONS: Record<string, React.ReactNode> = {
  "número de WhatsApp": <Smartphone className="size-4" />,
  "usuários": <Users className="size-4" />,
  "conversas": <MessageSquare className="size-4" />,
  "contatos": <Users className="size-4" />,
  "CRM": <BarChart3 className="size-4" />,
  "IA": <Zap className="size-4" />,
  "Google Agenda": <Calendar className="size-4" />,
  "Relatórios": <BarChart3 className="size-4" />,
  "Suporte": <Headphones className="size-4" />,
  "API": <Webhook className="size-4" />,
  "Webhooks": <Webhook className="size-4" />,
  "Onboarding": <Crown className="size-4" />,
  "Gerente": <Crown className="size-4" />,
  "SLA": <ShieldCheck className="size-4" />,
};
function featureIcon(text: string) {
  for (const key of Object.keys(FEATURE_ICONS)) {
    if (text.toLowerCase().includes(key.toLowerCase())) return FEATURE_ICONS[key];
  }
  return <Check className="size-4" />;
}
function normalizeFeatureText(text: string) {
  return /n[úu]meros? de whatsapp/i.test(text) ? "1 número de WhatsApp" : text;
}

function CheckoutPage() {
  const ctx = Route.useRouteContext();
  const navigate = useNavigate();
  const search = Route.useSearch();
  const upgradeMode = search.mode === "upgrade";
  const createCompany = useServerFn(createCheckoutCompany);
  const startCheckout = useServerFn(startAsaasCheckout);

  const [plans, setPlans] = useState<Plano[]>([]);
  const [selected, setSelected] = useState<string | null>(search.plano ?? null);
  const [creating, setCreating] = useState(false);
  const [paying, setPaying] = useState(false);
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null);
  const [waiting, setWaiting] = useState(false);
  const [supportMessage, setSupportMessage] = useState<string | null>(null);
  const [currentPlan, setCurrentPlan] = useState<{ nome: string; slug: string } | null>(null);
  const [currentPlanError, setCurrentPlanError] = useState(false);
  const [plansError, setPlansError] = useState(false);

  // Modo: "trial" (sem empresa, oferecer teste grátis) vs "paywall" (empresa existe mas precisa pagar)
  const hasCompany = !!ctx.company;
  const trialActive =
    !!ctx.company && ctx.company.status_cobranca === "trial" && trialDaysLeft(ctx.company.trial_ate) > 0;
  const paywallMode = hasCompany && !trialActive && ctx.company?.status_cobranca !== "ativo";

  // Empresa ativa ou em trial ainda válido → não deveria estar aqui
  useEffect(() => {
    const target = checkoutRedirect(ctx.company, search.mode);
    if (target) navigate({ to: target, replace: true });
  }, [ctx.company, navigate, trialActive, search.mode]);

  useEffect(() => {
    if (!upgradeMode || !ctx.company) return;
    let live = true;
    supabase.from("subscription").select("plan:plan(nome,slug)")
      .eq("company_id", ctx.company.id).in("status", CHECKOUT_CURRENT_STATUSES).maybeSingle()
      .then(({ data, error }) => { if (live) { setCurrentPlan(data?.plan ?? null); setCurrentPlanError(!!error); } });
    return () => { live = false; };
  }, [upgradeMode, ctx.company?.id]);

  useEffect(() => {
    supabase.from("plan").select("*").eq("ativo", true).order("ordem").then(({ data, error }) => {
      setPlansError(!!error || !data?.length);
      if (data?.length) {
        const list = data as Plano[];
        setPlans(list);
        // Padrão: Starter (único com trial grátis). Nunca pré-selecionar o plano em destaque.
        const initial =
          search.plano ||
          ctx.company?.selected_plan_slug ||
          list.find((p) => p.slug === "starter")?.slug ||
          list[0].slug;
        if (!selected || !list.find((p) => p.slug === selected)) setSelected(initial);
      }
    });
  }, []);

  // Polling em modo paywall: assim que webhook ativar, libera
  useEffect(() => {
    if (!waiting || !ctx.company) return;
    const id = ctx.company.id;
    const interval = setInterval(async () => {
      const { data: comp } = await supabase
        .from("company")
        .select("id, status_cobranca, onboarding_completed")
        .eq("id", id)
        .maybeSingle();
      if (comp?.status_cobranca === "ativo") {
        clearInterval(interval);
        toast.success("Pagamento confirmado! Liberando seu acesso…");
        setTimeout(() => {
          window.location.href = comp.onboarding_completed ? "/app/dashboard" : "/app/onboarding";
        }, 800);
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [waiting, ctx.company]);

  const plano = useMemo(() => plans.find((p) => p.slug === selected), [plans, selected]);

  async function iniciarTrial() {
    if (!plano) return toast.error("Selecione um plano.");
    setCreating(true);
    try {
      const r = await createCompany({ data: { nome: defaultCompanyName(ctx.user.email), plano_slug: plano.slug } });
      if (r.hasTrial) {
        toast.success(`Teste grátis de ${plano.trial_days} dias iniciado!`);
        window.location.href = "/app/onboarding";
        return;
      }
      // Plano sem trial: cria a empresa e já abre o pagamento (acesso só após pagar).
      const res = await startCheckout({ data: { plano_slug: plano.slug } });
      if (res.kind === "support") { setSupportMessage(res.message); return; }
      setPaymentUrl(res.paymentUrl);
      window.open(res.paymentUrl, "_blank", "noopener,noreferrer");
      setWaiting(true);
    } catch (e: any) {
      toast.error(e.message || "Falha ao iniciar");
    } finally {
      setCreating(false);
    }
  }

  async function pagarAgora() {
    if (!plano) return toast.error("Selecione um plano.");
    setPaying(true);
    try {
      const res = await startCheckout({ data: { plano_slug: plano.slug, mode: upgradeMode ? "upgrade" : undefined } });
      if (res.kind === "support") { setSupportMessage(res.message); return; }
      setPaymentUrl(res.paymentUrl);
      window.open(res.paymentUrl, "_blank", "noopener,noreferrer");
      setWaiting(true);
    } catch (e: any) {
      const message = "Não foi possível iniciar o pagamento com segurança. Confira com o suporte antes de tentar outra cobrança.";
      setSupportMessage(message);
      toast.error(message);
    } finally {
      setPaying(false);
    }
  }

  const headerBadge = upgradeMode ? { icon: <CreditCardBadge />, text: "Troca de plano" } : paywallMode
    ? { icon: <Lock className="size-3.5 mr-1.5" />, text: "Seu período de teste terminou" }
    : { icon: <Sparkles className="size-3.5 mr-1.5" />, text: `${plans[0]?.trial_days ?? 3} dias grátis sem cartão` };
  const headerTitle = upgradeMode ? "Escolha seu próximo plano" : paywallMode
    ? "Ative seu plano para continuar"
    : "Comece grátis em segundos";
  const headerSubtitle = upgradeMode ? "Seu plano e seu acesso permanecem como estão enquanto você compara as opções." : paywallMode
    ? "Seus dados ficam aqui esperando. Assim que o pagamento for confirmado, seu acesso é liberado automaticamente."
    : "Escolha um plano para começar. Você não precisa pagar agora — só vai cobrar no final do período de teste, se quiser continuar.";

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-4 py-8 md:py-12">
        <Button variant="ghost"
          onClick={async () => { if (upgradeMode && ctx.company) { await navigate({ to: ctx.company.onboarding_completed ? "/app/configuracoes" : "/app/onboarding" }); return; } await supabase.auth.signOut(); window.location.href = "/"; }}
          className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 mb-6"
        >
          <ArrowLeft className="size-3.5" /> {upgradeMode ? "Voltar" : "Sair"}
        </Button>

        <div className="text-center max-w-2xl mx-auto mb-10 md:mb-14">
          <Badge variant="secondary" className="mb-4 px-3 py-1 text-xs font-semibold uppercase tracking-wider">
            {headerBadge.icon}
            {headerBadge.text}
          </Badge>
          <h1 className="font-display text-3xl md:text-5xl font-bold tracking-tight">
            {headerTitle}
          </h1>
          <p className="text-muted-foreground mt-3 text-base md:text-lg">
            {headerSubtitle}
          </p>
        </div>

        {upgradeMode && <section className="border-y py-4 mb-8 space-y-2">
          <p>Plano atual: <strong>{currentPlanError ? "Não foi possível confirmar o plano atual" : currentPlan?.nome ?? plans.find((p) => p.slug === ctx.company?.selected_plan_slug)?.nome ?? "Nenhuma assinatura operacional vinculada"}</strong></p>
          <p>Plano escolhido: <strong>{plano?.nome ?? "Selecione um plano"}</strong></p>
          {trialActive && <p className="text-muted-foreground text-sm">Seu teste continua até {ctx.company ? new Date(ctx.company.trial_ate).toLocaleDateString("pt-BR") : ""}. A escolha não inicia nem renova o teste.</p>}
        </section>}
        {plansError ? <p role="alert" className="text-destructive">Não foi possível carregar os planos. Tente novamente mais tarde.</p> : plans.length === 0 ? (
          <div className="grid place-items-center py-20"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <>
            <div className="grid md:grid-cols-3 gap-4 lg:gap-6 items-stretch mb-10 md:mb-14">
              {plans.map((p) => {
                const isSelected = selected === p.slug;
                return (
                  <Card
                    key={p.id}
                    className={`relative flex flex-col p-6 md:p-7 transition-all duration-200 ${
                      isSelected ? "ring-2 ring-primary ring-offset-2 ring-offset-background shadow-xl" : "hover:shadow-md"
                    } ${p.destaque ? "md:-my-4 md:py-10 border-primary/30 bg-gradient-to-b from-primary/5 to-background" : ""}`}
                  >
                    {p.destaque && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                        <Badge className="bg-primary text-primary-foreground hover:bg-primary px-3 py-1 text-[10px] uppercase tracking-wider font-bold shadow-sm">
                          <TrendingUp className="size-3 mr-1" /> Mais popular
                        </Badge>
                      </div>
                    )}
                    <div className="mb-5">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{p.nome}</span>
                        {isSelected && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-primary">
                            <Check className="size-3" /> Selecionado
                          </span>
                        )}
                      </div>
                      <div className="flex items-baseline gap-1">
                        <span className="font-display text-4xl font-bold">{formatBRL(p.preco_cents)}</span>
                        <span className="text-muted-foreground text-sm">/mês</span>
                      </div>
                      <p className="text-sm text-muted-foreground mt-2 min-h-[2.5rem]">{p.descricao}</p>
                      {!paywallMode && !upgradeMode && (
                        <p className="text-[11px] text-primary font-semibold mt-1">
                          {p.trial_days > 0 ? `${p.trial_days} dias grátis — sem cartão` : "Ativo após o pagamento"}
                        </p>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2 mb-5">
                      <Limit label="WhatsApp" v={1} />
                      <Limit label="Usuários" v={p.limite_usuarios} />
                      <Limit label="Conversas/mês" v={p.limite_mensagens} />
                      <Limit label="Contatos" v={p.limite_contatos} />
                    </div>
                    <ul className="space-y-2.5 text-sm flex-1 mb-6">
                      {(p.features || []).map((f) => normalizeFeatureText(f)).map((f) => (
                        <li key={f} className="flex items-start gap-2.5">
                          <span className="mt-0.5 size-5 rounded-full bg-primary/10 text-primary grid place-items-center shrink-0">
                            {featureIcon(f)}
                          </span>
                          <span className="text-foreground/90">{f}</span>
                        </li>
                      ))}
                    </ul>
                    <Button
                      onClick={() => setSelected(p.slug)}
                      variant={isSelected ? "default" : "outline"}
                      size="lg"
                      className="w-full font-semibold"
                    >
                      {isSelected ? (<><Check className="size-4 mr-1.5" /> Plano escolhido</>) : "Escolher este plano"}
                    </Button>
                  </Card>
                );
              })}
            </div>

            <div className="max-w-2xl mx-auto">
              <div className="border-t pt-6 md:pt-8 text-center">
                {supportMessage && <p role="status" className="border border-primary/30 rounded-md p-4 mb-4 text-sm">{supportMessage}</p>}
                {upgradeMode ? <div className="space-y-4">
                  <h2 className="font-display text-xl font-bold">Solicitar alteração de plano</h2>
                  <p className="text-sm text-muted-foreground">{CHECKOUT_SUPPORT_MESSAGE}</p>
                  <Button asChild disabled={!plano}><a href={`${supportWhatsappUrl}?text=${encodeURIComponent(`Olá! Quero alterar o plano da minha empresa ${ctx.company?.nome ?? ""} para ${plano?.nome ?? ""}. Por favor, confiram também a cobrança externa existente.`)}`} target="_blank" rel="noreferrer">Falar com o suporte <ExternalLink className="size-4" /></a></Button>
                  <p className="text-xs text-muted-foreground">Nenhum pagamento será aberto nesta tela. A solicitação ao suporte não confirma o upgrade.</p>
                </div> : waiting ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-center gap-3 p-4 rounded-lg bg-primary/5 border border-primary/20 text-sm">
                      <Loader2 className="size-4 animate-spin text-primary" />
                      <span>Aguardando confirmação do pagamento…</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      A página de pagamento abriu em outra aba. Depois que o pagamento for aprovado, seu acesso é liberado aqui automaticamente
                      (pode levar alguns segundos).
                    </p>
                    {paymentUrl && (
                      <a
                        href={paymentUrl}
                        target="_blank" rel="noreferrer"
                        className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                      >
                        Reabrir página de pagamento <ExternalLink className="size-3" />
                      </a>
                    )}
                  </div>
                ) : paywallMode ? (
                  <>
                    <div className="flex items-center justify-center gap-2 mb-3">
                      <Lock className="size-5 text-primary" />
                      <h2 className="font-display text-xl font-bold">Assine para liberar seu acesso</h2>
                    </div>
                    <p className="text-sm text-muted-foreground mb-5">
                      Plano selecionado: <span className="font-semibold text-foreground">{plano?.nome}</span> —{" "}
                      {formatBRL(plano?.preco_cents ?? 0)}/mês. Pagamento por cartão, Pix ou boleto via Asaas.
                    </p>
                    <Button
                      onClick={pagarAgora}
                      disabled={!plano || paying}
                      size="lg"
                      className="w-full md:w-auto font-semibold"
                    >
                      {paying ? <Loader2 className="size-4 mr-2 animate-spin" /> : <ExternalLink className="size-4 mr-2" />}
                      Assinar {plano?.nome} agora
                    </Button>
                  </>
                ) : (
                  <>
                    <div className="flex items-center justify-center gap-2 mb-3">
                      <Sparkles className="size-5 text-primary" />
                      <h2 className="font-display text-xl font-bold">Pronto pra começar?</h2>
                    </div>
                    <p className="text-sm text-muted-foreground mb-5">
                      Plano escolhido: <span className="font-semibold text-foreground">{plano?.nome}</span>.{" "}
                      {(plano?.trial_days ?? 0) > 0 ? (
                        <>Você ganha <b>{plano?.trial_days} dias grátis</b> pra explorar tudo, sem precisar de cartão. Cobramos só se você decidir continuar.</>
                      ) : (
                        <>Este plano é ativado <b>somente após o pagamento</b>. Ao continuar, abriremos a página de pagamento seguro.</>
                      )}
                    </p>
                    <Button
                      onClick={iniciarTrial}
                      disabled={!plano || creating}
                      size="lg"
                      className="w-full md:w-auto font-semibold"
                    >
                      {creating ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Sparkles className="size-4 mr-2" />}
                      {(plano?.trial_days ?? 0) > 0 ? `Começar ${plano?.trial_days} dias grátis` : "Continuar para pagamento"}
                    </Button>
                  </>
                )}
                {!upgradeMode && <div className="mt-5 flex items-center justify-center gap-2 text-xs text-muted-foreground">
                  <ShieldCheck className="size-3.5" /> Pagamento seguro processado pelo Asaas.
                </div>}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Limit({ label, v }: { label: string; v: number }) {
  return (
    <div className="bg-muted/50 rounded-lg px-2.5 py-1.5 flex items-center justify-between text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold">{v.toLocaleString("pt-BR")}</span>
    </div>
  );
}

function CreditCardBadge() { return <ShieldCheck className="size-3.5 mr-1.5" />; }
