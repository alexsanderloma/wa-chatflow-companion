import { createFileRoute, Link } from "@tanstack/react-router";
import { brand, supportWhatsappUrl, supportWhatsappDisplay } from "@/config/brand";

export const Route = createFileRoute("/reembolso")({
  head: () => ({
    meta: [
      { title: `Política de Reembolso — ${brand.name}` },
      { name: "description", content: `Garantia de 30 dias da ${brand.name}. Saiba como solicitar reembolso.` },
      { property: "og:title", content: `Política de Reembolso — ${brand.name}` },
      { property: "og:description", content: `Garantia de 30 dias da ${brand.name}. Saiba como solicitar reembolso.` },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReembolsoPage,
});

function ReembolsoPage() {
  return (
    <main className="min-h-screen bg-white text-slate-900">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <Link to="/" className="text-sm text-slate-500 hover:text-slate-900">← Voltar</Link>
        <h1 className="mt-6 text-4xl font-bold">Política de Reembolso</h1>
        <p className="mt-2 text-sm text-slate-500">Última atualização: 17 de junho de 2026</p>

        <div className="mt-10 space-y-8 leading-relaxed text-slate-700">
          <section>
            <h2 className="text-xl font-semibold text-slate-900">Garantia de 30 dias</h2>
            <p className="mt-2">
              A <strong>{brand.name}</strong> oferece uma garantia de satisfação de
              <strong> 30 dias</strong>. Se você não estiver satisfeito com sua compra, pode
              solicitar reembolso integral em até 30 dias a partir da data do pedido.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900">Como solicitar</h2>
            <p className="mt-2">
              Os reembolsos são processados pelo nosso provedor de pagamentos,
              <strong> Paddle</strong> (Merchant of Record). Para solicitar:
            </p>
            <ol className="mt-2 list-decimal pl-6 space-y-1">
              <li>
                Acesse{" "}
                <a className="underline" href="https://paddle.net" target="_blank" rel="noopener noreferrer">paddle.net</a>{" "}
                e localize seu pedido pelo e-mail de compra.
              </li>
              <li>Solicite o reembolso diretamente pelo portal da Paddle.</li>
              <li>Ou entre em contato com nosso suporte e encaminharemos o pedido.</li>
            </ol>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900">Prazo de processamento</h2>
            <p className="mt-2">
              Após a aprovação, o estorno costuma aparecer no método de pagamento original em
              até 5 a 10 dias úteis, conforme as regras do emissor do cartão ou meio de
              pagamento.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900">Assinaturas e renovações</h2>
            <p className="mt-2">
              Você pode cancelar sua assinatura a qualquer momento para evitar renovações
              futuras. Cobranças já realizadas dentro do período de 30 dias da última fatura
              podem ser reembolsadas conforme esta política.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900">Contato</h2>
            <p className="mt-2">
              Em caso de dúvidas, entre em contato com nosso suporte pelo WhatsApp <a className="underline" href={supportWhatsappUrl} target="_blank" rel="noopener noreferrer">{supportWhatsappDisplay}</a> ou diretamente em
              paddle.net.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
