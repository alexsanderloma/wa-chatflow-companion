import { createFileRoute } from "@tanstack/react-router";
import { HelpTip } from "@/components/help-tip";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, RefreshCw, Power, QrCode } from "lucide-react";
import { brand } from "@/config/brand";
import { connectWhatsapp, checkWhatsappStatus, disconnectWhatsapp, diagnoseWhatsapp } from "@/lib/evolution.functions";
import { usePlanFeatures } from "@/hooks/use-plan-features";
import { PlanUsageBadge } from "@/components/plan-usage-badge";
import { connectionRequests, connectionStatus, pairingView, type ConnectionStatus } from "@/lib/connection-ui";
import { withTimeout } from "@/lib/auth-timeout";

export const Route = createFileRoute("/app/conexao")({
  head: () => ({ meta: [
    { title: `${brand.name} — Conexão WhatsApp` },
    { name: "description", content: "Gerencie o pareamento e o status da sua linha WhatsApp no FLOWA." },
    { property: "og:title", content: `${brand.name} — Conexão WhatsApp` },
    { property: "og:description", content: "Gerencie o pareamento e o status da sua linha WhatsApp no FLOWA." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: ConexaoPage,
});

function ConexaoPage() {
  const connect = useServerFn(connectWhatsapp);
  const check = useServerFn(checkWhatsappStatus);
  const disconnect = useServerFn(disconnectWhatsapp);
  const diagnose = useServerFn(diagnoseWhatsapp);
  const plan = usePlanFeatures();

  const [loading, setLoading] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>("unknown");
  const [checking, setChecking] = useState(false);
  const [pending, setPending] = useState(false);
  const [numero, setNumero] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [diag, setDiag] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const requests = useRef(connectionRequests());
  const checkBusy = useRef(false);
  const actionBusy = useRef(false);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    void doCheck(true);
    return () => { mounted.current = false; requests.current.next(); checkBusy.current = false; stopPolling(); };
  }, []);

  function startPolling() {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(() => { void doCheck(true); }, 5000);
  }
  function stopPolling() {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
  }

  async function doCheck(silent = false) {
    if (checkBusy.current || actionBusy.current) return;
    checkBusy.current = true;
    setChecking(true);
    const request = requests.current.next();
    try {
      const r = await withTimeout(check(), 45_000);
      if (!mounted.current || !requests.current.current(request)) return;
      const next = connectionStatus(r.status);
      if (next === "unknown") throw new Error("unknown_status");
      setStatus(next);
      setNumero(r.numero ?? null);
      const view = pairingView(next, null);
      if (next !== "connecting") setQr(view.qr);
      if (view.poll) startPolling(); else stopPolling();
      if (r.state === null && next !== "disconnected") {
        setDiag("Não foi possível confirmar o estado agora. Mantivemos o último status conhecido; tente atualizar novamente.");
      } else setDiag(null);
      if (next === "connected") { setProblem(null); if (!silent) toast.success("WhatsApp conectado!"); }
      if (next === "disconnected") setProblem((old) => old || "Sua linha está desconectada. Conecte novamente para gerar um QR Code válido.");
    } catch {
      if (mounted.current && requests.current.current(request)) {
        setDiag("Não foi possível consultar a conexão. Tente atualizar novamente em instantes.");
        if (!silent) toast.error("Não foi possível consultar a conexão. Tente novamente.");
      }
    } finally { checkBusy.current = false; if (mounted.current) setChecking(false); }
  }

  async function doConnect() {
    if (actionBusy.current) return;
    actionBusy.current = true;
    stopPolling(); requests.current.next();
    setLoading(true); setQr(null); setProblem(null); setDiag(null);
    try {
      const operation = connect();
      void operation.finally(() => { actionBusy.current = false; if (mounted.current) setPending(false); }).catch(() => {});
      const r = await withTimeout(operation, 90_000);
      if (!mounted.current) return;
      if (r.diagnostic === "conectada") {
        setStatus("connected"); stopPolling(); toast.success("Já está conectado!");
        void doCheck(true);
      } else if (r.qrBase64) {
        setQr(r.qrBase64); setStatus("connecting"); startPolling();
        toast.message("QR Code gerado. Escaneie no WhatsApp.");
      } else {
        setStatus(connectionStatus(r.state === "connecting" ? "connecting" : "disconnected"));
        setProblem(r.message); toast.error(r.message);
      }
    } catch (e: any) {
      const msg = actionBusy.current
        ? "O servidor do WhatsApp está demorando. Aguarde a tentativa terminar antes de gerar outro QR Code."
        : "Não foi possível conectar ao servidor do WhatsApp. Tente novamente em instantes.";
      if (mounted.current) setPending(actionBusy.current);
      setProblem(msg); toast.error(msg);
    }
    finally { if (mounted.current) setLoading(false); }
  }

  async function doDiagnose() {
    try { const r = await withTimeout(diagnose(), 45_000); if (mounted.current) setDiag(r.message); }
    catch { if (mounted.current) setDiag("Não foi possível executar o diagnóstico. Tente novamente ou peça ao dono da empresa para verificar."); }
  }

  async function doDisconnect() {
    if (actionBusy.current) return;
    actionBusy.current = true; requests.current.next(); stopPolling();
    setLoading(true);
    try {
      await disconnect();
      setStatus("disconnected"); setNumero(null); setQr(null); stopPolling();
      toast.success("Desconectado");
    } catch (e: any) { toast.error(e?.message || "Falha ao desconectar"); }
    finally { actionBusy.current = false; if (mounted.current) setLoading(false); }
  }

  const statusBadge =
    status === "unknown" ? <Badge variant="outline">{checking ? "Verificando…" : "Não confirmado"}</Badge>
    : status === "connected" ? <Badge className="bg-success-soft text-success border-success/30">Conectado</Badge>
    : status === "connecting" ? <Badge variant="secondary" className="text-warning">Conectando…</Badge>
    : <Badge variant="outline">Desconectado</Badge>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">Conexão WhatsApp <HelpTip text="Pareie seu número escaneando o QR Code no celular. Depois disso, o agente passa a responder automaticamente as mensagens recebidas." /></h1>
          <p className="text-sm text-muted-foreground">Conecte sua linha via Evolution API.</p>
        </div>
        {!plan.loading && (
          <PlanUsageBadge label="números" used={plan.usage.instancias} limit={plan.limites.instancias} />
        )}
      </div>


      <Card className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <div className="text-sm text-muted-foreground">Status</div>
            <div className="flex items-center gap-3 mt-1">
              {statusBadge}
              {numero && <span className="text-sm text-muted-foreground">· {numero}</span>}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => doCheck()} disabled={loading || checking || pending}>
              <RefreshCw className={`size-4 mr-1.5 ${checking ? "animate-spin" : ""}`} /> Atualizar
            </Button>
            {status === "connected" ? (
              <Button variant="destructive" size="sm" onClick={doDisconnect} disabled={loading}>
                <Power className="size-4 mr-1.5" /> Desconectar
              </Button>
            ) : (
              <Button size="sm" onClick={doConnect} disabled={loading || pending || checking}>
                {loading ? <Loader2 className="size-4 mr-1.5 animate-spin" /> : <QrCode className="size-4 mr-1.5" />}
                {qr ? "Gerar novo QR" : "Conectar WhatsApp"}
              </Button>
            )}
          </div>
        </div>

        {qr ? (
          <div className="grid md:grid-cols-2 gap-6 items-center">
            <div className="p-2 rounded-lg border border-border w-fit max-w-full mx-auto">
              <img src={qr} alt="QR Code WhatsApp" className="w-72 max-w-full aspect-square object-contain" />
            </div>
            <div className="space-y-3 text-sm">
              <h3 className="font-semibold text-base">Como escanear</h3>
              <ol className="list-decimal pl-5 space-y-1.5 text-muted-foreground">
                <li>Abra o WhatsApp no celular.</li>
                <li>Toque em <b>Aparelhos conectados</b>.</li>
                <li>Toque em <b>Conectar um aparelho</b>.</li>
                <li>Aponte para esta tela.</li>
              </ol>
              <p className="text-xs text-muted-foreground">Verificando a cada 5 s.</p>
            </div>
          </div>
        ) : status === "connected" ? (
          <div className="text-sm text-muted-foreground">Tudo certo! As mensagens serão respondidas automaticamente.</div>
        ) : problem ? (
          <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm space-y-3">
            <p>{problem}</p>
            <div className="flex flex-wrap gap-2">
               <Button size="sm" onClick={doConnect} disabled={loading || pending}><RefreshCw className="size-4 mr-1.5" />Tentar novamente</Button>
               <Button size="sm" variant="outline" onClick={doDiagnose} disabled={loading || pending}>Diagnosticar</Button>
            </div>
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">{status === "unknown" ? "Aguardando confirmação do estado da linha. Use Atualizar para consultar novamente." : status === "connecting" ? "A linha aguarda pareamento. Gere um novo QR Code se o anterior não estiver disponível." : <>Clique em <b>Conectar WhatsApp</b> para gerar o QR Code.</>}</div>
        )}
        {loading && <p role="status" className="mt-4 text-sm text-muted-foreground">Aguardando o servidor do WhatsApp…</p>}
        {diag && <p role="status" className="mt-4 text-sm text-warning">{diag}</p>}
      </Card>
    </div>
  );
}
