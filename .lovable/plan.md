# FLOWA — Auditoria e plano de créditos, economia da IA e finanças Master

## Limites desta etapa

Auditoria somente leitura em 24/10/2026; código, banco, saldos, assinaturas e preços intactos. Sem geração real, mensagem a cliente ou publicação. Aprovação não autoriza publicação nem correção retroativa.

## 1. Auditoria comprovada

### Franquias e causa dos 1.000 créditos

| Plano | Preço confirmado | Créditos no banco | Correção |
|---|---:|---:|---:|
| Starter | R$ 97 | 1.000 | 1.000 |
| Pro | R$ 197 | 1.000 | 6.000 |
| Business | R$ 497 | 1.000 | 30.000 |

- `plan.creditos_mensais` tem padrão 1.000 e os três registros ativos têm 1.000. Não há evidência de quem gravou os valores.
- `topup_plan_credits` lê esse campo e repõe o saldo: o defeito é o catálogo, não um 1.000 fixo na função. Grava `delta` como franquia inteira mesmo quando a mudança líquida é diferente; corrigir futuros lançamentos sem reescrever antigos.
- `billing/webhook.ts:192–199` recarrega na ativação/renovação; consulta antirrepetição é somente Asaas, sem chave única de pagamento. Repetições/concorrência podem reaplicar recarga.
- Starter também tem `limite_mensagens=1.500`, divergente dos 1.000 contratados. Esse contador mede mensagens enviadas, não respostas lógicas; alinhar a franquia de IA sem cobrança por bolha.
- Zero registros em `billing_event_log` e apenas assinaturas manuais no banco: defeito confirmado, mas não há pagamentos históricos demonstrando perdas específicas. Não corrigir saldos indiscriminadamente.

### Descontos e bloqueios

- `whatsapp-webhook.ts:332–380` desconta antes do bloqueio por frequência, mídia e geração. Falhas posteriores não devolvem crédito. `:420–438` não consolida resultado das partes e pode terminar como sucesso apesar de erros.
- `consume_ai_credit` impede saldo negativo atomicamente, mas referência é telefone sem unicidade de resposta. O chamador ignora `error`, confundindo falha técnica com falta de crédito.
- Já existe índice único de mensagem recebida `(company_id, whatsapp_message_id)` e interrupção se persistir falhar; não atribuir duplicação comprovada a esse caminho. Falta idempotência própria da cobrança/recarga.
- Uma resposta dividida hoje consome um crédito total. A contabilização nova preservará isso e distinguirá envio confirmado, parcial, falho e incerto.

### Provedor e compatibilidade

- **Divergência:** `lovable-ai.server.ts`, `gemini.server.ts` e `whatsapp-media.server.ts` ainda usam Google direto; módulos Gateway não existem neste estado. O retorno relatado antes não está persistido aqui; não inferir o serviço publicado.
- `LOVABLE_API_KEY` presente, sem revelar valor. Catálogo autenticado lista `google/gemini-2.5-flash` para Chat Completions, texto/imagem/áudio e retenção zero.
- **Risco de disponibilidade:** o catálogo também marca depreciação e expiração 20/10/2026, já passada. Listagem não prova geração funcional. Não houve chamada real nesta etapa. Após autorização, validar modelo e parâmetros sem cliente; indisponibilidade/negação interrompe essa etapa até decisão, sem substituir modelo.
- Não transportar `thinkingConfig` do Google diretamente para Gateway; redução de raciocínio depende de opção compatível ainda não validada.

### Economia e finanças

- Atendimento envia 25 mensagens (`whatsapp-webhook.ts:282–289`), catálogo e instruções extensas (`ai-prompt.ts`): candidato de redução, não economia comprovada.
- Transportes retornam texto, sem persistir tokens/custos; não existe tabela dedicada de uso. MRR Master soma preços de assinaturas ativas, inclusive manuais (`master.functions.ts:40–42`): receita nominal, não recebimento.
- Amostra Gateway `01a16d62-df6f-7695-a2c2-44a3ccf9b3d7`, 24/10 10:09:22 UTC, modelo 3.8: 1.461 entrada/343 saída, 0,009528 créditos; não é média do 2.5 por empresa. Conteúdo redigido não reconstruído.

## 2. Estimativa condicional

Tarifas do catálogo 2.5: entrada textual 0,0000012 crédito/token, saída 0,00001, áudio 0,000004; imagem como texto. Sem conversão comprovada, não apresentar reais como custo real.

Hipótese: uma resposta por crédito FLOWA, 500 tokens entrada/200 saída tarifada, sem cache, mídia ou tentativas extras.

| Plano | Respostas | Entrada / saída totais | Créditos Lovable estimados |
|---|---:|---:|---:|
| Starter | 1.000 | 500.000 / 200.000 | 2,6 |
| Pro | 6.000 | 3.000.000 / 1.200.000 | 15,6 |
| Business | 30.000 | 15.000.000 / 6.000.000 | 78 |

1.000 respostas neste cenário = 2,6 créditos Lovable. Metas não são tetos. Contexto, raciocínio tarifado, mídia e tentativas mudam a conta; Cloud, despesas e implantação não incluídos. Créditos FLOWA e Lovable são diferentes; lucro e economia reais desconhecidos.

## 3. Etapas de implementação após aprovação

### Etapa A — Créditos prioritários

1. Corrigir somente catálogo/franquias futuras para 1.000/6.000/30.000; manter preços, trial, assinaturas e saldos. Auditar limites sem cobrar bolhas como respostas.
2. Recarga transacional por empresa/assinatura/plano/pagamento confirmado, única por pagamento/ciclo mesmo com notificações diferentes. Preservar reposição sem acúmulo; gravar delta real e histórico. Evento atrasado/plano errado não recarrega; concessão manual não é pagamento.
3. Reservar atomicamente um crédito por resposta lógica após bloqueios; saldo disponível desconta reservas. Consolidar uma cobrança em sucesso; liberar uma vez em falha conhecida, vazio ou bloqueio. Mídia e tentativas não cobram créditos FLOWA extras.
4. Registrar partes e confirmação: alguma parte entregue = uma cobrança parcial; todas comprovadamente falhas = zero. Resultado incerto aguarda conciliação, sem reenvio/devolução automática. Verificar confirmação real de entrega da Evolution; aceitação não é entrega.
5. Separar erro da RPC de saldo zero; revalidar pausas antes de enviar sem mudar seus comandos/regras.
6. Relatório de empresas afetadas e lacunas antes de correção retroativa; autorização específica, chave única e lançamento compensatório sem apagar histórico.

### Etapa B — Medição e perfil econômico

- Com autorização, resolver o transporte divergente: Gemini texto/mídia via Gateway, Google direto/chave preservados inativos; OpenAI/Anthropic intactos. Validar modelo solicitado e opções antes; não substituir silenciosamente.
- Registrar por chamada/tentativa empresa, plano vigente, resposta lógica, finalidade, provedor/modelo, status, tokens e correlação; incluir mídia e erros. Uso ausente = desconhecido, nunca zero.
- Separar tokens medidos, custo calculado por tarifa versionada e custo confirmado do Gateway. Custo em dinheiro exige faturamento autorizado; ferramentas deste chat não são APIs automaticamente disponíveis ao app.
- Compactar instruções redundantes, contexto e catálogo relevante, preservando fatos, preços, políticas, pausa, agendamento e escalonamento. Medir também eventual resumo; não regenerá-lo a cada mensagem.
- Metas flexíveis 500/200, não tetos rígidos; raciocínio reduzido somente por parâmetro validado. Comparar casos representativos antes/depois para comprovar economia e qualidade, sem presumir resultados.

### Etapa C — Gestão Financeira da IA, exclusiva do Master

- Seção com filtros empresa/plano/período, tokens, chamadas, respostas entregues, custo por 1.000, pendências e alertas de risco.
- Receita recebida baseada em pagamentos confirmados/estornos, separada do MRR nominal e acesso manual. Despesas operacionais e rateio explícito registrados pelo Master.
- Simulador: custos reais disponíveis, uso previsto, despesas, multiplicador e margem de segurança; R$ 100 × 3 = R$ 300 antes das demais despesas. Não incluir ação que altere preços públicos.
- Tarifas, moedas/câmbio e rateios versionados; margens sem base suficiente ficam estimadas ou indisponíveis, nunca lucro real.
- Proteger página, funções autenticadas e RLS; telemetria escrita só no servidor. Negar clientes/admins de empresa também em consultas diretas. Não expor chaves, prompts, mensagens ou mídia bruta.
- Manter visual e menu móvel atuais; financeiro das empresas intacto; cliente vê somente plano, saldo e consumo próprio.

## 4. Arquivos e testes previstos

**Arquivos:** `whatsapp-webhook.ts`, `billing/webhook.ts`, `credits.functions.ts`, `plan-limits.server.ts`, `plan.functions.ts`, `lovable-ai.server.ts`, `whatsapp-media.server.ts`, `ai-prompt.ts`, `agent-ai.functions.ts`, `master.tsx`; novos módulos focados e página Master financeira. Preservar Google direto inativo e integrações geradas.

**Banco:** catálogo, RPCs de recarga/consumo, extrato; novos registros de reservas, pagamentos, uso, despesas, tarifas e simulações. Toda tabela nova recebe GRANT, RLS e políticas na mesma migração oficial; privilégios Master verificados antes do cliente administrativo.

**Testes:**
- Starter 1.000, Pro 6.000, Business 30.000; preços 97/197/497 intactos.
- Recarga única por pagamento, concorrência/rollback, novo ciclo, evento atrasado/plano errado.
- Entrega = um crédito; partes = um total; falha/vazio/bloqueio = zero; devolução idempotente, último crédito concorrente, erro técnico distinto de saldo zero, envio incerto sem duplicata.
- Uso de mídia/tentativas/valores desconhecidos; custo por 1.000, tarifas/rateios, receita real versus nominal; 100 × 3 = 300 sem alterar preços.
- Negar cliente/admin de empresa/visitante em página, funções e banco; verificar Master e conta comum autenticados.
- Regressões offline; após autorização, Gateway controlado sem cliente e avaliação comparativa de vendas/suporte/agendamento/transferência/mídia. Compilação automática e relatórios desktop/celular.

## 5. Riscos, custos e autorização

Riscos principais: disponibilidade do 2.5, envios incertos e recargas concorrentes; mitigar com validação, estados duráveis e transações. Banco é compartilhado com produção: migrações podem afetar o site mesmo sem publicação, portanto contratos precisam ser retrocompatíveis/coordenados.

Telemetria aumenta gravações/armazenamento; nenhuma exclusão de histórico não autorizada. Implementação e execução não têm orçamento fechado; dependem do trabalho/tráfego. Começar por créditos, medir e só então decidir preços. Aprovação autoriza implementar, não publicar, mudar preços ou corrigir saldos retroativos.
