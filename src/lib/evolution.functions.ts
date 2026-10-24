import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getRequest } from "@tanstack/react-start/server";

function deriveInstanceName(companyId: string) {
  return `flowa_${companyId.replace(/-/g, "").slice(0, 16)}`;
}

function buildWebhookUrl(token?: string | null) {
  try {
    const req = getRequest();
    const url = new URL(req.url);
    const tokenQuery = token ? `?t=${encodeURIComponent(token)}` : "";
    return `${url.protocol}//${url.host}/api/public/whatsapp-webhook${tokenQuery}`;
  } catch {
    return "";
  }
}

async function resolveCompanyId(supabase: any, userId: string): Promise<string> {
  const { data, error } = await supabase
    .from("company_user")
    .select("company_id")
    .eq("user_id", userId)
    .eq("ativo", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Você ainda não possui uma empresa. Finalize o onboarding.");
  return data.company_id as string;
}

type ConnectResult = {
  instanceName: string;
  qrBase64: string | null;
  code: string | null;
  pairingCode: string | null;
  state: string | null;
  diagnostic: import("./evolution-flow").DiagnosticCode;
  message: string;
};

export const connectWhatsapp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ConnectResult> => {
    const { supabase, userId } = context;
    const companyId = await resolveCompanyId(supabase, userId);
    const { evoCreateInstance, evoGetQr, evoSetWebhook, evoState, evoRestart, qrFromPayload } = await import("./evolution.server");
    const { EvolutionError, decideConnectAction, diagnosticFromError, isAlreadyExistsMessage, parseEvoState, DIAGNOSTIC_MESSAGES } = await import("./evolution-flow");

    const { data: existing, error: selErr } = await (supabase as any)
      .from("whatsapp_instances")
      .select("instance_name,status,numero,webhook_token")
      .eq("company_id", companyId)
      .maybeSingle();
    if (selErr) throw new Error("Não foi possível ler a conexão atual. Tente novamente.");
    if (!existing) {
      const { assertWithinLimit } = await import("./plan-limits.server");
      await assertWithinLimit(companyId, "instancias");
    }
    const instanceName: string = existing?.instance_name || deriveInstanceName(companyId);
    const webhookToken: string = existing?.webhook_token || crypto.randomUUID();
    const webhookUrl = buildWebhookUrl(webhookToken);
    const fail = (diagnostic: ConnectResult["diagnostic"], state: string | null = null): ConnectResult =>
      ({ instanceName, qrBase64: null, code: null, pairingCode: null, state, diagnostic, message: DIAGNOSTIC_MESSAGES[diagnostic] });

    // 1) Consulta o estado antes de qualquer criação.
    let current: "open" | "connecting" | "close" | null | "missing";
    try {
      current = parseEvoState(await evoState(instanceName));
    } catch (e) {
      if (e instanceof EvolutionError && e.code === "instancia_ausente") current = "missing";
      else { console.warn("[evolution.state]", (e as Error)?.message); return fail(diagnosticFromError(e)); }
    }

    const action = decideConnectAction(current);
    if (action === "already_open") {
      let webhookOk = false;
      if (webhookUrl) {
        try { await evoSetWebhook(instanceName, webhookUrl); webhookOk = true; } catch (e) { console.warn("[evolution.setWebhook]", (e as Error)?.message); }
      }
      await supabase.from("whatsapp_instances").upsert(
        { company_id: companyId, user_id: userId, instance_name: instanceName, status: "connected", webhook_token: webhookToken,
          ...(webhookOk ? { webhook_configured_at: new Date().toISOString() } : {}) } as any,
        { onConflict: "company_id" },
      );
      return { ...fail("conectada", "open") };
    }

    let qr: { qrBase64: string | null; code: string | null; pairingCode: string | null } = { qrBase64: null, code: null, pairingCode: null };
    if (action === "create") {
      try {
        const created: any = await evoCreateInstance(instanceName, webhookUrl || undefined);
        qr = await qrFromPayload(created?.qrcode ?? created);
      } catch (e: any) {
        if (!isAlreadyExistsMessage(String(e?.message || ""))) {
          console.warn("[evolution.create]", e?.message);
          return fail(diagnosticFromError(e));
        }
      }
    }

    // Registra a linha como "connecting" só depois que a instância existe.
    const { error: upErr } = await supabase.from("whatsapp_instances").upsert(
      { company_id: companyId, user_id: userId, instance_name: instanceName, status: "connecting", webhook_token: webhookToken, webhook_configured_at: null } as any,
      { onConflict: "company_id" },
    );
    if (upErr) throw new Error("Não foi possível salvar a conexão. Tente novamente.");

    if (webhookUrl) {
      try { await evoSetWebhook(instanceName, webhookUrl); } catch (e) { console.warn("[evolution.setWebhook]", (e as Error)?.message); }
    }

    // 2) connect para obter QR (somente aqui, nunca no polling).
    let lastErr: unknown = null;
    for (let i = 0; i < 4 && !qr.qrBase64; i++) {
      try {
        qr = await evoGetQr(instanceName);
        if (qr.qrBase64) break;
        if (i === 1) {
          // Instância desconectada travada sem QR: reinicia (não apaga dados).
          try { await evoRestart(instanceName); } catch (e) { console.warn("[evolution.restart]", (e as Error)?.message); }
        }
      } catch (e) { lastErr = e; console.warn("[evolution.connect]", (e as Error)?.message); }
      await new Promise((r) => setTimeout(r, 1000));
    }

    let state: string | null = null;
    try { state = parseEvoState(await evoState(instanceName)); } catch {}
    if (state === "open") return fail("conectada", "open");
    if (!qr.qrBase64) return fail(lastErr ? diagnosticFromError(lastErr) : "qr_indisponivel", state);
    return { instanceName, ...qr, state, diagnostic: "conectando", message: DIAGNOSTIC_MESSAGES.conectando };
  });

export const diagnoseWhatsapp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: m, error } = await supabase
      .from("company_user").select("company_id,role").eq("user_id", userId).eq("ativo", true)
      .order("created_at", { ascending: true }).limit(1).maybeSingle();
    if (error || !m) throw new Error("Empresa não encontrada.");
    if ((m as any).role !== "owner") throw new Error("Apenas o dono da empresa pode executar o diagnóstico.");
    const { evoState } = await import("./evolution.server");
    const { EvolutionError, diagnosticFromError, parseEvoState, DIAGNOSTIC_MESSAGES } = await import("./evolution-flow");
    const { data: row } = await (supabase as any).from("whatsapp_instances").select("instance_name").eq("company_id", (m as any).company_id).maybeSingle();
    const name = row?.instance_name || deriveInstanceName((m as any).company_id);
    let code: import("./evolution-flow").DiagnosticCode;
    try {
      const s = parseEvoState(await evoState(name));
      code = s === "open" ? "conectada" : s === "connecting" ? "conectando" : "desconectada";
    } catch (e) {
      code = e instanceof EvolutionError && e.code === "instancia_ausente" ? "instancia_ausente" : diagnosticFromError(e);
    }
    return { code, message: DIAGNOSTIC_MESSAGES[code] };
  });


export const checkWhatsappStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const companyId = await resolveCompanyId(supabase, userId);
    const { evoState, evoFetchNumberFromInstance, evoSetWebhook } = await import("./evolution.server");

    const { data: row, error: rowError } = await (supabase as any)
      .from("whatsapp_instances")
      .select("instance_name,status,numero,webhook_token,webhook_configured_at")
      .eq("company_id", companyId)
      .maybeSingle();
    if (rowError) throw new Error("Não foi possível consultar a conexão salva.");
    if (!row) return { status: "disconnected", state: null, numero: null, qrBase64: null, code: null };

    let state: string | null = null;
    let stateError = false;
    try {
      const s = await evoState(row.instance_name);
      const { parseEvoState } = await import("./evolution-flow");
      state = parseEvoState(s);
    } catch (e) {
      const { EvolutionError } = await import("./evolution-flow");
      if (e instanceof EvolutionError && e.code === "instancia_ausente") {
        const { error } = await supabase.from("whatsapp_instances").update({ status: "disconnected" }).eq("company_id", companyId);
        if (error) throw new Error("Não foi possível atualizar o estado da conexão.");
        return { status: "disconnected", state: "close", numero: row.numero ?? null, qrBase64: null, code: null };
      }
      stateError = true;
      console.warn("[evolution.state]", e);
    }

    // IMPORTANTE: NUNCA chamar evoGetQr aqui. Chamar /instance/connect em sessão
    // ativa DERRUBA a sessão do WhatsApp pra gerar um QR novo. QR só é buscado
    // explicitamente em connectWhatsapp (botão "Conectar"). Em erro transitório,
    // preservar o último status conhecido pra não causar "flicker" de desconexão.
    if (stateError) {
      return {
        status: row.status || "disconnected",
        state: null,
        numero: row.numero ?? null,
        qrBase64: null,
        code: null,
      };
    }

    const newStatus =
      state === "open" ? "connected" : state === "connecting" ? "connecting" : "disconnected";

    let numero: string | null = row.numero ?? null;
    if (newStatus === "connected" && !numero) {
      try { numero = await evoFetchNumberFromInstance(row.instance_name); } catch {}
    }
    if (newStatus === "connected" && row.webhook_token && !row.webhook_configured_at) {
      const webhookUrl = buildWebhookUrl(row.webhook_token);
      if (webhookUrl) {
        try {
          await evoSetWebhook(row.instance_name, webhookUrl);
          await supabase.from("whatsapp_instances").update({ webhook_configured_at: new Date().toISOString() } as any).eq("company_id", companyId);
        } catch (e) { console.warn("[evolution.setWebhook]", e); }
      }
    }

    if (newStatus !== row.status || (numero && numero !== row.numero)) {
      await supabase
        .from("whatsapp_instances")
        .update({ status: newStatus, ...(numero ? { numero } : {}) })
        .eq("company_id", companyId);
    }

    return { status: newStatus, state, numero, qrBase64: null, code: null };
  });

export const disconnectWhatsapp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const companyId = await resolveCompanyId(supabase, userId);
    const { evoLogout } = await import("./evolution.server");
    const { data: row } = await supabase
      .from("whatsapp_instances")
      .select("instance_name")
      .eq("company_id", companyId)
      .maybeSingle();
    if (row) {
      try { await evoLogout(row.instance_name); } catch (e) { console.warn("[evolution.logout]", e); }
      await supabase
        .from("whatsapp_instances")
        .update({ status: "disconnected" })
        .eq("company_id", companyId);
    }
    return { ok: true };
  });

export const removeWhatsappConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const companyId = await resolveCompanyId(supabase, userId);
    const { data: row, error } = await supabase.from("whatsapp_instances")
      .select("instance_name,status").eq("company_id", companyId).maybeSingle();
    if (error) throw new Error("Não foi possível consultar a conexão salva.");
    if (row && row.status !== "disconnected") throw new Error("Desconecte a linha antes de remover a conexão.");
    const { evoDelete } = await import("./evolution.server");
    const { removeConnectionRecord } = await import("./connection-removal");
    return removeConnectionRecord(
      async () => { if (row) await evoDelete(row.instance_name); },
      async () => {
        const { error: deleteError } = await supabase.from("whatsapp_instances").delete().eq("company_id", companyId);
        if (deleteError) throw new Error("Não foi possível remover a conexão salva. Tente novamente.");
      },
    );
  });

export const sendWhatsappText = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { numero: string; texto: string; contatoNome?: string | null }) => d)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const companyId = await resolveCompanyId(supabase, userId);
    const { data: inst } = await supabase
      .from("whatsapp_instances").select("instance_name,status").eq("company_id", companyId).maybeSingle();
    if (!inst?.instance_name) throw new Error("WhatsApp não conectado");
    const { data: recentInbound } = await supabase
      .from("mensagens")
      .select("id")
      .eq("company_id", companyId)
      .eq("numero", data.numero)
      .eq("direcao", "entrada")
      .gte("created_at", new Date(Date.now() - 24 * 60 * 60_000).toISOString())
      .limit(1);
    if (!recentInbound?.length) {
      throw new Error("Por segurança, só é possível responder contatos que mandaram mensagem nas últimas 24h. Para iniciar conversa, use a API oficial com template aprovado.");
    }
    const { data: recentOutbound } = await supabase
      .from("mensagens")
      .select("id")
      .eq("company_id", companyId)
      .eq("numero", data.numero)
      .eq("direcao", "saida")
      .gte("created_at", new Date(Date.now() - 10 * 60_000).toISOString())
      .limit(6);
    if ((recentOutbound?.length ?? 0) >= 6) {
      throw new Error("Envio pausado por alguns minutos para proteger a qualidade do número.");
    }
    const { assertWithinLimit } = await import("./plan-limits.server");
    await assertWithinLimit(companyId, "mensagens");
    const { evoSendText } = await import("./evolution.server");
    try { await evoSendText(inst.instance_name, data.numero, data.texto); }
    catch (e: any) { throw new Error(`Falha ao enviar: ${e?.message ?? e}`); }
    const { error } = await supabase.from("mensagens").insert({
      company_id: companyId, user_id: userId, numero: data.numero,
      contato_nome: data.contatoNome ?? null,
      direcao: "saida", autor: "humano", texto: data.texto,
    });
    if (error) throw new Error(error.message);
    // Pause IA on this contact (humano assumed)
    await supabase.from("contact_pause").upsert(
      { company_id: companyId, user_id: userId, numero: data.numero, pausado: true },
      { onConflict: "company_id,numero" },
    );
    return { ok: true };
  });

export const setContactIaActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { numero: string; ativa: boolean }) => d)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const companyId = await resolveCompanyId(supabase, userId);
    const { error } = await supabase.from("contact_pause").upsert(
      { company_id: companyId, user_id: userId, numero: data.numero, pausado: !data.ativa },
      { onConflict: "company_id,numero" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const testAiReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { message: string }) => d)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const companyId = await resolveCompanyId(supabase, userId);
    const { lovableAiChat } = await import("./lovable-ai.server");
    const { buildSystemPrompt, parseAiOutput } = await import("./ai-prompt");
    const [{ data: cfg }, { data: stagesRows }, { data: prodRows }] = await Promise.all([
      supabase.from("agent_config").select("*").eq("company_id", companyId).maybeSingle(),
      supabase.from("crm_stage").select("nome, tipo, ordem").eq("company_id", companyId).order("ordem", { ascending: true }),
      supabase.from("produto").select("nome, preco, descricao, ordem").eq("company_id", companyId).eq("ativo", true).order("ordem", { ascending: true }),
    ]);
    const stages = (stagesRows ?? []).map((s: any) => ({ nome: s.nome, tipo: s.tipo }));
    const produtos = (prodRows ?? []).map((p: any) => ({ nome: p.nome, preco: p.preco, descricao: p.descricao }));
    const system = buildSystemPrompt(cfg ?? {}, {
      responderEmPartes: cfg?.responder_em_partes ?? true,
      stages,
      produtos,
    });

    // Enforcement: provider precisa estar liberado no plano (Starter = Gemini)
    const { getCompanyPlan } = await import("./plan-limits.server");
    const { allowsProvider, PLAN_LABEL } = await import("./plan-features");
    const plan = await getCompanyPlan(companyId);
    let provider = ((cfg as any)?.ai_provider || "gemini") as string;
    let model = ((cfg as any)?.ai_model || "google/gemini-2.5-flash") as string;
    if (!allowsProvider(plan.slug, provider)) {
      throw new Error(
        `O provedor ${provider.toUpperCase()} não está incluso no plano ${PLAN_LABEL[plan.slug]}. Faça upgrade para Pro para usar GPT/Claude.`,
      );
    }

    const raw = await lovableAiChat(
      [
        { role: "system", content: system },
        { role: "user", content: data.message },
      ],
      {
        provider,
        model,
        openaiKey: (cfg as any)?.openai_api_key || "",
        anthropicKey: (cfg as any)?.anthropic_api_key || "",
      },
    );
    const { parts, stage } = parseAiOutput(raw, stages);
    return { reply: parts.join("\n\n"), parts, stage, system };
  });

