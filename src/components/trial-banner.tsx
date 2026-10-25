import { AlertTriangle } from "lucide-react";
import { trialDaysLeft, type CompanyRow } from "@/lib/tenant";
import { Link } from "@tanstack/react-router";

export function TrialBanner({ company }: { company: CompanyRow }) {
  if (company.status_cobranca !== "trial") return null;
  const days = trialDaysLeft(company.trial_ate);

  return (
    <div className="px-4 py-2.5 text-sm flex items-center justify-center gap-2 bg-red-600 text-white border-b border-red-700 font-medium">
      <AlertTriangle className="size-4 shrink-0" />
      <span>
        {days > 0 ? (
          <>Teste Starter — restam <b>{days} {days === 1 ? "dia" : "dias"}</b>. Outros planos exigem pagamento.</>
        ) : (
          <>Seu período de teste terminou. Ative seu plano para continuar.</>
        )}
      </span>
      <Link
        to="/app/checkout" search={{ mode: "purchase", plano: "starter" }}
        className="ml-2 inline-flex items-center rounded-md bg-white/15 hover:bg-white/25 px-2.5 py-0.5 text-xs font-semibold ring-1 ring-white/30"
      >
        Ativar plano
      </Link>
    </div>
  );
}
