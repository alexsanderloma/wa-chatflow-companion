import { createFileRoute, redirect } from "@tanstack/react-router";
import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { brand, supportWhatsappUrl } from "@/config/brand";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
import {
  Zap,
  Play,
  Check,
  MessageSquareText,
  Bot,
  KanbanSquare,
  Users,
  PauseCircle,
  LineChart,
  Star,
  ArrowRight,
  Plus,
  Minus,
  Sparkles,
  Sun,
  Moon,
} from "lucide-react";


export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: `${brand.name} — IA atende seu WhatsApp 24h e organiza o CRM sozinha` },
      {
        name: "description",
        content:
          "Conecte seu número de WhatsApp em 2 minutos. A IA da FLOWA responde, qualifica e move cada lead no funil automaticamente. 3 dias grátis para testar.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:title", content: `${brand.name} — WhatsApp + IA + CRM no automático` },
      {
        property: "og:description",
        content: "Sua IA atende o WhatsApp 24h e organiza o CRM sozinha.",
      },
    ],
  }),
  component: Landing,
});

function Landing() {
  async function cta(path: "/entrar" | "/login" | "/demo/dashboard" | "#planos", plano: string = "pro") {
    if (path === "#planos") {
      const el = document.getElementById("planos");
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    if (path === "/login") {
      window.location.href = "/entrar";
      return;
    }
    if (path === "/entrar") {
      try {
        const { data } = await supabase.auth.getUser();
        if (data.user) {
          window.location.href = `/app/checkout?plano=${plano}`;
          return;
        }
      } catch {}
      window.location.href = `/entrar?modo=signup&plano=${plano}`;
      return;
    }
    window.location.href = path;
  }

  useScrollReveal();
  const { isDark, toggle } = useTheme();

  return (
    <div
      className={`lp-root ${isDark ? "is-dark" : "is-light"} min-h-screen w-full antialiased overflow-x-hidden`}
      style={{ fontFamily: "'Montserrat', system-ui, sans-serif" }}
    >
      <div className="relative z-10">
        <Header onCta={cta} isDark={isDark} onToggleTheme={toggle} />
        <Hero onCta={cta} />
        <Stats />
        <Pain />
        <HowItWorks />
        <Features />
        <Pricing onCta={cta} />
        <Testimonials />
        <Faq />
        <FinalCta onCta={cta} />
        <Footer />
      </div>


    </div>
  );
}

/* ===================== HEADER ===================== */
function Header({
  onCta,
  isDark,
  onToggleTheme,
}: {
  onCta: (p: "/entrar" | "/login" | "/demo/dashboard" | "#planos", plano?: string) => void;
  isDark: boolean;
  onToggleTheme: () => void;
}) {
  return (
    <header className="lp-header sticky top-0 z-50 backdrop-blur-xl">
      <div className="lp-header-inner mx-auto px-4 sm:px-5 md:px-8 flex items-center justify-between gap-3">
        <a href="/" className="flex items-center gap-2.5">
          <BrandMark className="size-9" />
          <span className="font-brand text-[1.1rem] md:text-[1.2rem] leading-none">
            {brand.name}
          </span>
        </a>
        <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-foreground">
          <a href="#como" className="hover:text-foreground transition">Como funciona</a>
          <a href="#recursos" className="hover:text-foreground transition">Recursos</a>
          <a href="#planos" className="hover:text-foreground transition">Planos</a>
          <a href="#faq" className="hover:text-foreground transition">Dúvidas</a>
        </nav>
        <div className="flex items-center gap-2">
          <Button variant="ghost"
            type="button"
            onClick={onToggleTheme}
            aria-label="Alternar tema"
            title={isDark ? "Tema claro" : "Tema escuro"}
            className="size-10 grid place-items-center rounded-lg glass text-foreground/80 hover:text-foreground transition"
          >
            {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </Button>
          <Button variant="ghost" onClick={() => onCta("/login")} className="text-[15px] font-semibold px-4 py-2.5 rounded-lg text-foreground/80 hover:text-foreground">
            Entrar
          </Button>
          <Button variant="outline" onClick={() => onCta("/entrar")} className="hidden md:inline-flex text-sm font-semibold px-5 py-3 rounded-sm">
            Criar conta
          </Button>
          <Button
            onClick={() => onCta("#planos")}
            className="lp-header-primary text-sm font-semibold px-6 py-3 rounded-sm"
          >
            Ver planos
          </Button>
        </div>
      </div>
    </header>
  );
}


/* ===================== HERO ===================== */
function Hero({ onCta }: { onCta: (p: "/entrar" | "/login" | "/demo/dashboard" | "#planos", plano?: string) => void }) {
  return (
    <section className="lp-hero px-5 md:px-8">
      <div className="lp-hero-grid mx-auto">
        <div className="lp-hero-copy">
          <div className="editorial-eyebrow"><span /> WhatsApp · Inteligência artificial · CRM</div>
          <h1 className="lp-wordmark font-display">{brand.name}</h1>
          <h2 className="lp-offer font-display">IA que atende seu<br className="hidden sm:block" /> WhatsApp <span className="text-brand">24/7</span><br /> + CRM Kanban.</h2>
          <p className="lp-hero-description">Conecte seu número, treine o agente em uma tela e veja cada lead ser respondido na hora, qualificado e movido no funil — sem você levantar o dedo.</p>
          <div className="lp-hero-actions flex flex-wrap gap-3">
            <Button onClick={() => onCta("#planos")} className="rounded-sm px-6 h-12 font-semibold">Começar 3 dias grátis <ArrowRight className="size-4" /></Button>
            <Button variant="outline" onClick={() => onCta("/demo/dashboard")} className="rounded-sm px-5 h-12"><Play className="size-3.5" /> Ver demonstração</Button>
          </div>
          <ul className="lp-hero-checks mt-5 flex flex-wrap gap-x-5 gap-y-2 text-[11px] text-muted-foreground">
            <li className="flex items-center gap-1.5"><Check className="size-3 text-brand" /> 3 dias grátis</li>
            <li className="flex items-center gap-1.5"><Check className="size-3 text-brand" /> Conecta em 2 minutos</li>
            <li className="flex items-center gap-1.5"><Check className="size-3 text-brand" /> Cancele quando quiser</li>
          </ul>
        </div>
        <div className="lp-phone-stage"><PhoneMock /></div>
      </div>
    </section>
  );
}

function PhoneMock() {
  return (
    <div className="phone-composition relative">

      {/* phone */}
      <div
        className="premium-phone relative rounded-[2.5rem] p-2.5"
        style={{ background: "var(--lp-phone-shell)", border: "1px solid var(--lp-phone-shell-bd)" }}
      >
        <div
          className="relative w-full h-full rounded-[2rem] overflow-hidden flex flex-col"
          style={{ background: "var(--lp-phone-screen)" }}
        >
          {/* status bar */}
          <div className="flex items-center justify-between px-5 pt-3 pb-2 text-[10px] text-foreground/60">
            <span>9:41</span>
            <span>●●● 5G</span>
          </div>
          {/* chat header */}
          <div className="flex items-center gap-3 px-4 py-3" style={{ background: "var(--lp-chat-header-bg)", borderBottom: "1px solid var(--lp-chat-header-bd)" }}>
            <BrandMark className="size-9" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold truncate">{brand.name} • IA</div>
              <div className="text-[10px] text-success flex items-center gap-1.5">
                <span className="size-1.5 rounded-full bg-success" /> online agora
              </div>
            </div>
          </div>
          {/* messages */}
          <div className="flex-1 px-3 py-4 space-y-3 overflow-hidden">
            <Bubble side="left" delay="0s">Oi! Vi o anúncio do site. Vocês ainda têm vaga pra essa semana?</Bubble>
            <Bubble side="right" delay=".4s">Oi Marina, tudo bem? 👋 Temos sim! Pra qual serviço você tá pensando?</Bubble>
            <Bubble side="left" delay=".8s">Quero fazer design de sobrancelha + cílios</Bubble>
            <Bubble side="right" delay="1.2s">
              Perfeito 🤌 Tenho quinta 15h ou sexta 10h. Qual prefere?
            </Bubble>
            <div className="flex items-center gap-2 text-[10px] text-foreground/50 pl-2 reveal" style={{ animationDelay: "1.6s" }}>
              <Sparkles className="size-3 text-brand" />
              respondido pela IA em 3s
            </div>
          </div>
          {/* input */}
          <div className="px-3 py-3 flex items-center gap-2" style={{ background: "var(--lp-chat-header-bg)" }}>
            <div className="flex-1 h-9 rounded-full px-4 text-xs text-foreground/40 grid place-items-start content-center" style={{ background: "var(--lp-input-pill)" }}>
              Mensagem
            </div>
            <div className="size-9 rounded-full grid place-items-center" style={{ background: "var(--brand)" }}>
              <ArrowRight className="size-4 text-primary-foreground" />
            </div>
          </div>
        </div>
      </div>


      {/* floating CRM card — escondido em telas muito pequenas pra não estourar */}
      <div className="hidden sm:block absolute -left-14 bottom-16 glass-strong rounded-lg p-3.5 w-[220px] shadow-2xl " style={{ animationDelay: "1.5s" }}>
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-foreground/50 font-semibold">
          <KanbanSquare className="size-3 text-brand" />
          CRM atualizado
        </div>
        <div className="mt-2 flex items-center gap-2.5">
          <div className="size-9 rounded-full grid place-items-center font-bold text-primary-foreground" style={{ background: "var(--brand)" }}>M</div>
          <div className="min-w-0">
            <div className="text-sm font-semibold truncate">Marina</div>
            <div className="text-[11px] text-foreground/55 truncate">8 pessoas → Negociando</div>
          </div>
        </div>
        <div className="mt-3 h-1.5 rounded-full bg-foreground/10 overflow-hidden">
          <div className="h-full w-2/3" style={{ background: "var(--brand)" }} />
        </div>
      </div>

      {/* floating badge top */}
      <div className="hidden sm:flex absolute -right-3 top-16 glass-strong rounded-lg px-3 py-2 items-center gap-2 shadow-2xl " style={{ animationDelay: "3s" }}>
        <span className="size-2 rounded-full bg-success dot-pulse relative" />
        <span className="text-xs font-medium">Lead respondido</span>
      </div>
    </div>
  );
}

function Bubble({ children, side, delay }: { children: React.ReactNode; side: "left" | "right"; delay: string }) {
  const isRight = side === "right";
  return (
    <div
      className={`reveal flex ${isRight ? "justify-end" : "justify-start"}`}
      style={{ transitionDelay: delay, animationDelay: delay }}
      data-reveal
    >
      <div
        className={`max-w-[78%] px-3 py-2 text-[13px] leading-snug rounded-lg ${isRight ? "rounded-br-sm text-primary-foreground" : "rounded-bl-sm"}`}
        style={
          isRight
            ? { background: "var(--brand)", boxShadow: "var(--shadow-glow)" }
            : { background: "var(--lp-bubble-left-bg)", border: "1px solid var(--lp-bubble-left-bd)", color: "var(--lp-bubble-left-fg)" }
        }
      >

        {children}
      </div>
    </div>
  );
}

/* ===================== STATS ===================== */
function Stats() {
  const items = [
    { n: "3s", l: "tempo de resposta" },
    { n: "24/7", l: "no ar" },
    { n: "+38%", l: "conversão" },
    { n: "0", l: "lead esquecido" },
  ];
  return (
    <section className="lp-data-band px-5 md:px-8">
      <div className="mx-auto max-w-6xl lp-stats grid grid-cols-2 md:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-border/10 reveal" data-reveal>
        {items.map((it) => (
          <div key={it.l} className="px-6 py-6 text-left">
            <div className="font-display text-3xl md:text-4xl text-grad">{it.n}</div>
            <div className="text-[11px] uppercase tracking-[0.18em] text-foreground/55 mt-2 font-semibold">{it.l}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ===================== PAIN ===================== */
function Pain() {
  return (
    <section className="px-5 md:px-8 py-16 md:py-20">
      <div className="mx-auto max-w-3xl text-center reveal" data-reveal>
        <h2 className="font-display text-4xl md:text-5xl leading-[1.02] tracking-normal">
          Lead que espera, lead que <span className="text-grad">compra do concorrente</span>.
        </h2>
        <p className="mt-6 text-lg md:text-xl text-foreground/65 leading-relaxed">
          A primeira empresa a responder vende. Sempre. Enquanto você está dirigindo, atendendo na loja
          ou dormindo, os leads do anúncio que você pagou estão sumindo na fila. A FLOWA responde
          em segundos, qualifica e já te entrega o lead pronto pra fechar.
        </p>
      </div>
    </section>
  );
}

/* ===================== HOW IT WORKS ===================== */
function HowItWorks() {
  const steps = [
    {
      n: "01",
      t: "Conecte o WhatsApp",
      d: "Escaneia o QR Code uma vez e pronto. Funciona com o número que você já usa.",
      icon: <MessageSquareText className="size-5" />,
    },
    {
      n: "02",
      t: "Treine sua IA",
      d: "Uma tela com a personalidade da empresa, produtos, regras. Salvou? Já tá atendendo.",
      icon: <Bot className="size-5" />,
    },
    {
      n: "03",
      t: "A IA atende e organiza o CRM",
      d: "Responde no automático, qualifica, e move o card no kanban — você só fecha.",
      icon: <KanbanSquare className="size-5" />,
    },
  ];
  return (
    <section id="como" className="px-5 md:px-8 py-16 md:py-20">
      <div className="mx-auto max-w-6xl">
        <SectionTitle eyebrow="Como funciona" title={<>Em 3 passos. <span className="text-grad">Sério.</span></>} />
        <div className="mt-12 grid md:grid-cols-3 gap-5">
          {steps.map((s) => (
            <div key={s.n} className="editorial-step relative reveal" data-reveal>
              <div className="font-display text-5xl text-foreground/10 absolute right-5 top-4">{s.n}</div>
              <div className="size-9 rounded-lg grid place-items-center" style={{ background: "var(--brand-soft)", color: "var(--brand)" }}>
                {s.icon}
              </div>
              <h3 className="font-display text-xl mt-4">{s.t}</h3>
              <p className="text-foreground/65 text-sm mt-2 leading-relaxed">{s.d}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ===================== FEATURES ===================== */
function Features() {
  const items = [
    { t: "Inbox unificado", d: "Todas as conversas em um só lugar, com histórico completo por contato.", icon: <MessageSquareText className="size-5" /> },
    { t: "IA que responde como você", d: "Treinada com o tom da sua empresa. Faz uma pergunta por vez, não soa robô.", icon: <Bot className="size-5" /> },
    { t: "CRM kanban automático", d: "A IA classifica e move: Conversas, Negociando, Ganho, Perda. Sem digitar.", icon: <KanbanSquare className="size-5" /> },
    { t: "Multi-atendente", d: "Convide seu time. Cada um vê o que importa, com papéis e permissões.", icon: <Users className="size-5" /> },
    { t: "Pausa por palavra", d: "Digitou /pausar? A IA cala a boca e você assume aquele contato.", icon: <PauseCircle className="size-5" /> },
    { t: "Relatórios que mostram o dinheiro", d: "Tempo de resposta, conversão, taxa de ganho. Decisão em segundos.", icon: <LineChart className="size-5" /> },
  ];
  return (
    <section id="recursos" className="px-5 md:px-8 py-16 md:py-20">
      <div className="mx-auto max-w-6xl">
        <SectionTitle eyebrow="Recursos" title={<>Tudo que você precisa pra <span className="text-grad">parar de perder venda</span>.</>} />
        <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {items.map((it) => (
            <div key={it.t} className="editorial-feature reveal" data-reveal>
              <div className="size-9 rounded-lg grid place-items-center" style={{ background: "var(--brand-soft)", color: "var(--brand)" }}>
                {it.icon}
              </div>
              <h3 className="font-display text-lg mt-4">{it.t}</h3>
              <p className="text-foreground/65 text-sm mt-2 leading-relaxed">{it.d}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ===================== PRICING ===================== */
function Pricing({ onCta }: { onCta: (p: "/entrar" | "/login" | "/demo/dashboard" | "#planos", plano?: string) => void }) {
  const plans = [
    {
      slug: "starter",
      n: "Starter",
      p: "R$ 97",
      d: "Pra autônomo testando a operação.",
      f: [
        "1 número de WhatsApp",
        "1 usuário",
        "1.000 conversas/mês",
        "1.000 contatos",
        "CRM Kanban + IA Gemini",
        "Suporte por email",
      ],
      cta: "Começar 3 dias grátis",
    },
    {
      slug: "pro",
      n: "Pro",
      p: "R$ 197",
      d: "Pra time que já vende todo dia. O mais escolhido.",
      f: [
        "1 número de WhatsApp",
        "5 usuários no painel",
        "5.000 conversas/mês",
        "5.000 contatos",
        "IA Gemini + GPT + Claude",
        "Google Agenda + Relatórios",
        "Suporte prioritário",
      ],
      highlight: true,
      cta: "Quero o Pro",
    },
    {
      slug: "business",
      n: "Business",
      p: "R$ 497",
      d: "Pra operação alta performance e múltiplas equipes.",
      f: [
        "1 número de WhatsApp",
        "20 usuários no painel",
        "20.000 conversas/mês",
        "25.000 contatos",
        "API + Webhooks",
        "Onboarding 1:1 + Gerente dedicado",
        "SLA 99,9% + Suporte 24/7",
      ],
      cta: "Falar com vendas",
    },
  ];
  return (
    <section id="planos" className="px-5 md:px-8 py-16 md:py-20">
      <div className="mx-auto max-w-6xl">
        <SectionTitle eyebrow="Planos" title={<>Quanto mais <span className="text-grad">cresce</span>, mais <span className="text-grad">economiza</span>.</>} />
        <p className="text-center text-foreground/55 max-w-2xl mx-auto mt-4 text-[15px]">Só o Starter tem 3 dias grátis. Pro e Business são ativados depois do pagamento.</p>
        <div className="mt-12 grid md:grid-cols-3 gap-5 items-stretch">
          {plans.map((pl) => (
            <div
              key={pl.n}
              className={`relative rounded-lg p-7 flex flex-col reveal ${pl.highlight ? "glass-strong" : "glass"}`}
              data-reveal
              style={pl.highlight ? { boxShadow: "var(--shadow-glow)" } : undefined}
            >
              {pl.highlight && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 text-[10px] uppercase font-bold tracking-wider px-3 py-1 rounded-full text-primary-foreground whitespace-nowrap" style={{ background: "var(--brand)" }}>
                  Mais popular · 5× mais conversas
                </div>
              )}
              <div className="text-sm text-foreground/60 font-semibold uppercase tracking-wider">{pl.n}</div>
              <div className="font-display text-4xl mt-2">
                {pl.p}
                <span className="text-base text-foreground/50 font-normal">/mês</span>
              </div>
              <p className="text-sm text-foreground/60 mt-2 min-h-[40px]">{pl.d}</p>
              <ul className="mt-6 space-y-2.5 text-sm flex-1">
                {pl.f.map((x) => (
                  <li key={x} className="flex gap-2.5">
                    <span className="mt-0.5 size-4 rounded-full grid place-items-center shrink-0" style={{ background: "var(--brand-soft)" }}>
                      <Check className="size-2.5 text-brand" strokeWidth={3} />
                    </span>
                    <span className="text-foreground/80">{x}</span>
                  </li>
                ))}
              </ul>
              <Button variant="ghost"
                onClick={() => onCta("/entrar", pl.slug)}
                className={`mt-7 w-full px-4 py-3 rounded-lg font-semibold transition ${
                  pl.highlight ? "text-primary-foreground btn-glow" : "glass-strong text-foreground hover:bg-foreground/10"
                }`}
                style={pl.highlight ? { background: "var(--brand)" } : undefined}
              >
                {pl.cta}
              </Button>
            </div>
          ))}
        </div>
        <p className="mt-5 text-center text-xs text-foreground/40">O trial de 3 dias é só no Starter. Pro e Business são ativados após o pagamento.</p>
      </div>
    </section>
  );
}

/* ===================== TESTIMONIALS ===================== */
function Testimonials() {
  const items = [
    {
      n: "Camila — Studio de Estética",
      t: "Eu atendia entre clientes e perdia muita agenda. Agora a IA marca sozinha. Faturei 32% a mais no segundo mês.",
    },
    {
      n: "Rafael — Loja de Suplementos",
      t: "A galera me chamava no WhatsApp 1h da manhã. Hoje todo mundo é respondido na hora. CRM organizado sem eu tocar.",
    },
    {
      n: "Marina — Agência de Marketing",
      t: "Tirei o lead frio do operacional do time. A IA filtra e só passa quem é quente. Salvou minha sanidade.",
    },
  ];
  return (
    <section className="px-5 md:px-8 py-16 md:py-20">
      <div className="mx-auto max-w-6xl">
        <SectionTitle eyebrow="Quem usa" title={<>Times que pararam de perder venda <span className="text-grad">no 'oi, sumiu'</span>.</>} />
        <div className="mt-12 grid md:grid-cols-3 gap-5">
          {items.map((it) => (
            <div key={it.n} className="editorial-quote reveal" data-reveal>
              <div className="flex gap-1 text-brand">
                {Array.from({ length: 5 }).map((_, i) => <Star key={i} className="size-4 fill-current" />)}
              </div>
              <p className="text-foreground/85 mt-4 leading-relaxed text-[15px]">"{it.t}"</p>
              <div className="mt-5 text-sm text-foreground/55">{it.n}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ===================== FAQ ===================== */
function Faq() {
  const items = [
    {
      q: "Preciso saber programar?",
      a: "Não. Você conecta o WhatsApp por QR Code, preenche uma tela contando sobre sua empresa, e a IA já tá atendendo. Quem sabe usar WhatsApp consegue.",
    },
    {
      q: "Funciona com vários atendentes?",
      a: "Funciona. Você convida sua equipe, cada um com seu acesso. A IA atende o que dá pra atender; o que precisa de humano, o time assume.",
    },
    {
      q: "A IA responde igual um robô?",
      a: "Não. Ela é treinada pra falar como gente — mensagens curtas, uma pergunta por vez, no tom da sua empresa. Em testes cegos, cliente nem percebe.",
    },
    {
      q: "Meu número fica seguro?",
      a: "Sim. Cada empresa tem ambiente isolado, dados criptografados e você é dono da conversa. Você pode desconectar a qualquer momento.",
    },
  ];
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section id="faq" className="px-5 md:px-8 py-16 md:py-20">
      <div className="mx-auto max-w-3xl">
        <SectionTitle eyebrow="Dúvidas" title={<>Antes de você perguntar.</>} />
        <div className="mt-10 space-y-3">
          {items.map((it, i) => {
            const isOpen = open === i;
            return (
              <div key={it.q} className="editorial-faq overflow-hidden reveal" data-reveal>
                <Button variant="ghost" onClick={() => setOpen(isOpen ? null : i)} className="w-full px-5 py-4 flex items-center justify-between gap-4 text-left">
                  <span className="font-semibold">{it.q}</span>
                  <span className="size-7 grid place-items-center rounded-full shrink-0" style={{ background: "var(--brand-soft)", color: "var(--brand)" }}>
                    {isOpen ? <Minus className="size-4" /> : <Plus className="size-4" />}
                  </span>
                </Button>
                {isOpen && <div className="px-5 pb-5 text-foreground/70 text-sm leading-relaxed">{it.a}</div>}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ===================== FINAL CTA ===================== */
function FinalCta({ onCta }: { onCta: (p: "/entrar" | "/login" | "/demo/dashboard" | "#planos", plano?: string) => void }) {
  return (
    <section className="px-4 sm:px-5 md:px-8 py-20 md:py-28">
      <div
        className="mx-auto max-w-6xl lp-final p-8 sm:p-12 md:p-20 text-center relative overflow-hidden reveal"
        data-reveal
        style={{
          background: "var(--lp-final-bg)",
          border: "1px solid var(--lp-final-bd)",
          boxShadow: "var(--lp-final-shadow)",
        }}
      >


        <div className="relative">
          <h2 className="font-display text-4xl sm:text-3xl md:text-5xl leading-[0.98] tracking-normal">
            Pare de perder venda no <span className="text-grad">"oi, sumiu"</span>.
          </h2>
          <p className="mt-6 text-foreground/70 max-w-xl mx-auto text-lg sm:text-xl">
            3 dias grátis pra ver a IA atendendo seu WhatsApp e fechando lead sozinha. Cancele antes e não paga nada.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row flex-wrap justify-center gap-3">
            <Button variant="ghost"
              onClick={() => onCta("/entrar")}
              className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-lg text-primary-foreground font-bold text-base sm:text-lg btn-glow"
              style={{ background: "var(--brand)" }}
            >
              Começar agora, de graça <ArrowRight className="size-5" />
            </Button>
            <Button variant="ghost" onClick={() => onCta("/demo/dashboard")} className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-lg glass-strong text-foreground hover:bg-foreground/10 text-base sm:text-lg font-medium">
              <Play className="size-4" /> Ver demonstração
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ===================== FOOTER ===================== */
function Footer() {
  return (
    <footer className="px-5 md:px-8 pt-16 md:pt-20 pb-10 border-t border-border/5">
      <div className="mx-auto max-w-6xl">
        <div className="grid gap-10 md:gap-8 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <div className="flex items-center gap-3">
              <BrandMark className="size-9" />
              <span className="font-brand text-[1.4rem] leading-none">{brand.name}</span>
            </div>
            <p className="mt-4 text-sm text-foreground/55 leading-relaxed max-w-xs">
              IA que atende seu WhatsApp 24h, qualifica e organiza o CRM sozinha. Você só fecha.
            </p>
          </div>
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-foreground/45 font-bold">Produto</div>
            <ul className="mt-4 space-y-2.5 text-sm text-foreground/65">
              <li><a href="#recursos" className="hover:text-foreground">Recursos</a></li>
              <li><a href="#como" className="hover:text-foreground">Como funciona</a></li>
              <li><a href="#planos" className="hover:text-foreground">Planos</a></li>
              <li><a href="/demo/dashboard" className="hover:text-foreground">Demonstração</a></li>
            </ul>
          </div>
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-foreground/45 font-bold">Empresa</div>
            <ul className="mt-4 space-y-2.5 text-sm text-foreground/65">
              <li><a href="#faq" className="hover:text-foreground">Dúvidas</a></li>
              <li><a href={supportWhatsappUrl} className="hover:text-foreground">Contato</a></li>
              <li><a href={supportWhatsappUrl} className="hover:text-foreground">Suporte</a></li>
            </ul>
          </div>
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-foreground/45 font-bold">Legal</div>
            <ul className="mt-4 space-y-2.5 text-sm text-foreground/65">
              <li><a href="/termos" className="hover:text-foreground">Termos</a></li>
              <li><a href="/privacidade" className="hover:text-foreground">Privacidade</a></li>
              <li><a href="/reembolso" className="hover:text-foreground">Reembolso</a></li>
            </ul>
          </div>
        </div>
        <div className="mt-12 pt-6 border-t border-border/10 flex flex-col md:flex-row gap-3 items-center justify-between text-xs text-foreground/40">
          <span>© {new Date().getFullYear()} {brand.name}. Todos os direitos reservados.</span>
          <span>Feito no Brasil com ☕ e WhatsApp.</span>
        </div>
      </div>
    </footer>
  );
}

/* ===================== HELPERS ===================== */
function SectionTitle({ eyebrow, title }: { eyebrow: string; title: React.ReactNode; center?: boolean }) {
  // Padronizado: sempre centralizado, maior, com eyebrow em destaque.
  return (
    <div className="section-heading reveal text-left" data-reveal>
      <div className="inline-flex items-center justify-center gap-3 text-[11px] uppercase tracking-[0.28em] text-brand font-bold">
        <span className="h-px w-10 bg-brand/60" />
        {eyebrow}
        <span className="h-px w-10 bg-brand/60" />
      </div>
      <h2 className="font-display text-3xl md:text-4xl font-medium leading-tight tracking-normal mt-4 max-w-3xl">
        {title}
      </h2>
    </div>
  );
}

function useScrollReveal() {
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            (e.target as HTMLElement).classList.add("in");
            io.unobserve(e.target);
          }
        }
      },
      { threshold: 0.08, rootMargin: "0px 0px -10% 0px" },
    );
    // single pass — todos os elementos já estão no markup ao montar
    document.querySelectorAll<HTMLElement>("[data-reveal]").forEach((el) => {
      el.classList.add("reveal");
      io.observe(el);
    });
    return () => io.disconnect();
  }, []);
}

function useTheme() {
  const [isDark, setIsDark] = useState<boolean>(() => {
    if (typeof document === "undefined") return false;
    return document.documentElement.classList.contains("dark");
  });
  useEffect(() => {
    setIsDark(document.documentElement.classList.contains("dark"));
  }, []);
  function toggle() {
    const next = !isDark;
    setIsDark(next);
    const root = document.documentElement;
    if (next) root.classList.add("dark");
    else root.classList.remove("dark");
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {}
  }
  return { isDark, toggle };
}

export const _unused = redirect;

