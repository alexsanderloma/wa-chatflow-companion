# FLOWA — Auditoria e plano de créditos, economia da IA e finanças Master

## Limites desta etapa

Auditoria somente leitura, realizada em 24/10/2026. Nenhum código de aplicação, banco, saldo, assinatura ou preço foi alterado. Nenhuma resposta foi enviada a clientes, nenhuma geração real de IA foi solicitada e nada foi publicado. Aprovar este plano autoriza implementação, não publicação nem ajuste retroativo de saldos.

## 1. Auditoria comprovada

### Franquias e causa dos 1.000 créditos

| Plano | Preço atual confirmado | Créditos mensais no banco | Correção solicitada |
|---|---:|---:|---:|
| Starter | R$ 97 | 1.000 | 1.000 |
| Pro | R$ 197 | 1.000 | 6.000 |
| Business | R$ 497 | 1.000 | 30.000 |

- `plan.creditos_mensais` tem padrão 1.000 e os três registros ativos estão efetivamente com 1.000. A origem histórica de quem gravou esses valores não está documentada; não atribuir a uma migração específica.
- `topup_plan_credits` lê esse campo corretamente, mas substitui o saldo pelo valor lido: por isso uma recarga Pro/Business entrega 1.000. Não soma créditos. Também grava `delta` como franquia inteira, mesmo quando a mudança líquida do saldo é diferente: futuras entradas devem registrar a diferença real, sem reescrever o histórico.
- `billing/webhook.ts:192–199` chama a recarga ao ativar/renovar. A proteção atual contra repetição é uma consulta anterior apenas para eventos Asaas; não há chave única de pagamento/recarga no banco. Duas notificações do mesmo pagamento ou uma falha após a recarga podem reaplicá-la.
- Há também divergência em `Starter.limite_mensagens`: 1.500 no banco, contra os 1.000 contratados. Esse limite mede mensagens enviadas, não necessariamente respostas lógicas. Alinhar a franquia de IA solicitada sem passar a cobrar cada bolha de uma resposta como um crédito.
- O banco consultado tem zero registros em `billing_event_log` e apenas assinaturas manuais. Logo, confirmou-se o defeito dos valores e o caminho no código, mas não pagamentos Pro/Business efetivamente recarregados com erro neste histórico. Não há base para creditar todas as empresas indiscriminadamente.

### Descontos e bloqueios

- `whatsapp-webhook.ts:332–380` desconta antes do bloqueio por frequência, análise de mídia e geração da IA. Falha posterior não devolve o crédito.
- `whatsapp-webhook.ts:420–438` não consolida sucesso das partes enviadas; falhas são registradas, mas a execução pode terminar como sucesso. A resposta dividida atualmente consome um crédito total, não um por parte.
- `consume_ai_credit` é atômica para impedir saldo negativo, mas não é idempotente: a referência recebida é o telefone, sem unicidade de resposta.
- Erro dessa RPC pode ser interpretado como saldo esgotado porque seu `error` não é verificado.
- A persistência de mensagens tem índice único `(company_id, whatsapp_message_id)` e o código interrompe a automação se o registro falhar. Portanto já existe proteção contra duplicação da entrada identificada; falta um registro idempotente próprio da cobrança e do resultado do envio.
- O extrato recente contém 37 descontos de IA, sem devoluções registradas. Isso não prova que as 37 respostas falharam, nem permite calcular reembolso por comparação simples com as bolhas enviadas.

### Provedor e compatibilidade

- **Divergência importante:** os arquivos atuais `lovable-ai.server.ts`, `gemini.server.ts` e `whatsapp-media.server.ts` ainda usam Google direto. O retorno ao Gateway relatado anteriormente não está presente neste estado do projeto; os módulos Gateway não existem. Não confundir memória da conversa com código persistido ou serviço publicado.
- `LOVABLE_API_KEY` está presente no ambiente consultado; seu valor não foi exposto. O catálogo autenticado lista `google/gemini-2.5-flash` para Chat Completions, com texto, imagens e áudio, e retenção zero nessa superfície.
- **Compatibilidade operacional pendente:** o catálogo marca o modelo como depreciado, com data de expiração 20/10/2026, já passada nesta auditoria. Estar listado não comprova que gera respostas hoje. Não foi feita geração real nesta etapa; não prometer sua disponibilidade nem substituir o modelo silenciosamente. Antes de implementar o perfil econômico, confirmar a disponibilidade e os parâmetros em um teste controlado autorizado; se o endpoint/modelo estiver indisponível, parar essa etapa e pedir decisão sobre alternativa disponível.
- Não aplicar diretamente `thinkingConfig` do Google no Gateway. Redução de raciocínio depende dos parâmetros efetivamente aceitos pelo transporte; sua aceitação continua não verificada.

### Economia e finanças

- O atendimento carrega 25 mensagens (`whatsapp-webhook.ts:282–289`) e envia catálogo e instruções extensas (`ai-prompt.ts`). Há candidato de redução de contexto, sem economia ou qualidade preservada já comprovadas.
- Os transportes atuais retornam somente texto, sem persistir tokens ou custos de cada tentativa. Não existe tabela dedicada de uso/custo da IA no banco consultado.
- O MRR atual do Master soma preços das assinaturas ativas (`master.functions.ts:40–42`), inclusive concessões manuais; isso é receita nominal esperada, não recebimento confirmado.
- O financeiro das empresas é outro módulo. Não será reaproveitado para expor despesas internas do FLOWA aos clientes.
- Entre 11/10 e 24/10 às 15:09 UTC, os registros retornados indicam 0,32829 créditos solicitados pelo Gateway e 1,717932048 pelo banco. São quantidades registradas, não custo em reais. No Gateway, os itens registrados são do 3.8 Flash, não uma medida do custo do 2.5 por empresa.
- Exemplo medido: chamada `01a16d62-df6f-7695-a2c2-44a3ccf9b3d7`, 24/10 às 10:09:22 UTC, 3.8 Flash, 1.461 tokens de entrada/343 de saída, 0,009528 créditos. A amostra não constitui média representativa; conteúdo está redigido e não foi reconstruído.

## 2. Estimativa condicional da IA

Tarifas do catálogo autenticado para o 2.5 Flash: entrada textual 0,0000012 crédito/token; saída 0,00001; entrada de áudio 0,000004. Imagens são tarifadas como entrada textual. Sem conversão comprovada de créditos para dinheiro, não apresentar custo real em reais.

Hipótese: cada unidade da franquia corresponde a uma resposta com 500 tokens de entrada e 200 de saída tarifada, sem cache, áudio, imagens ou tentativas extras.

| Plano | Respostas hipotéticas | Entrada / saída totais | Créditos solicitados estimados |
|---|---:|---:|---:|
| Starter | 1.000 | 500.000 / 200.000 | 2,6 |
| Pro | 6.000 | 3.000.000 / 1.200.000 | 15,6 |
| Business | 30.000 | 15.000.000 / 6.000.000 | 78 |

Cada 1.000 respostas nesse cenário custam 2,6 créditos Lovable, não 1.000. Metas 500/200 não são teto nem previsão garantida. Raciocínio tarifado, contexto maior, mídia e novas tentativas mudam os valores. Créditos FLOWA e créditos Lovable são unidades distintas. Hospedagem, despesas, taxas de pagamento e implantação ficam fora desta conta. Economia realizada e lucro em reais permanecem desconhecidos.

## 3. Etapas de implementação após aprovação

### Etapa A — Créditos prioritários

1. Migração restrita do catálogo para franquias 1.000/6.000/30.000, mantendo preços, trial, assinaturas e saldos atuais. Auditar todos os leitores dos limites para não contradizer franquias ou contar partes como respostas.
2. Recarga transacional ligada à empresa, assinatura, plano e pagamento confirmado. Chave única por pagamento/ciclo evita reprocessamento, inclusive quando o provedor envia eventos diferentes para o mesmo pagamento. Conservar o comportamento de reposição da franquia, sem acúmulo silencioso.
3. Preservar log e histórico; recargas futuras registram saldo anterior, posterior e delta real. Eventos atrasados, falhas, estornos e cancelamentos não recarregam o plano errado. Concessão manual não inventa pagamento.
4. Reserva atômica de um crédito por resposta lógica, depois dos bloqueios. Saldo disponível considera reservas; sucesso consolida uma única cobrança. Falha conhecida antes do envio ou resposta vazia libera a reserva uma única vez; mídia/tentativas extras não descontam créditos FLOWA adicionais.
5. Persistir o resultado de cada parte. Uma resposta com alguma parte confirmada continua sendo uma cobrança única, identificada como parcial se necessário. Resultado de envio incerto fica pendente de conciliação: não reenviar nem devolver automaticamente como se fosse falha comprovada. Identificar o que a Evolution confirma (aceitação ou entrega) e usar confirmação de entrega quando disponível; não chamar aceitação de entrega efetiva.
6. Separar erro técnico de falta real de crédito e revalidar pausa/supressão antes de enviar. Não alterar os comandos ou as regras existentes.
7. Entregar análise das empresas potencialmente afetadas, com valores comprovados/propostos e lacunas. Nenhum ajuste retroativo sem autorização específica; eventual correção terá chave única e lançamento compensatório, sem apagar histórico.

### Etapa B — Medição e perfil econômico

1. Resolver a divergência do transporte: com autorização, Gemini texto/mídia usam Gateway; Google direto e sua chave permanecem inativos para futuro, OpenAI/Anthropic com chave própria ficam preservados. Não migrar modelo sem decisão explícita.
2. Registrar por chamada e tentativa empresa, plano vigente, resposta lógica, finalidade, provedor/modelo, status, tokens retornados e IDs de correlação. Incluir áudio/imagem e tentativas que falham; uso ausente permanece desconhecido, nunca zero.
3. Separar tokens medidos, custo calculado com tarifa versionada e custo confirmado pelo Gateway. Não assumir custo real em dinheiro. Conciliação exige fonte de faturamento autorizada; acesso ao diagnóstico deste chat não é uma API disponível automaticamente ao aplicativo.
4. Compactar instruções redundantes, manter contexto recente e fatos relevantes, selecionar itens úteis do catálogo e conservar regras críticas, preços, políticas, agendamento e escalonamento. Incluir custo de eventual resumo na medição; não gerar resumo a cada mensagem por padrão.
5. Respostas curtas com meta de 200 tokens, sem teto rígido que corte marcadores ou conteúdo necessário. Meta de 500 de entrada flexível quando o atendimento exige mais contexto. Reduzir raciocínio só por opção compatível validada.
6. Comparar antes/depois em casos representativos: vendas, objeções, suporte, agendamento, transferência e mídia. Só declarar economia/qualidade preservada com medições comparáveis e avaliação desses casos.

### Etapa C — Gestão Financeira da IA, exclusiva do Master

- Nova seção com filtros por empresa, plano e período; tokens, chamadas, respostas entregues, custo por 1.000 respostas, pendências e alertas de risco.
- Receita recebida vem de pagamentos confirmados e estornos; MRR nominal separado, sem tratar acesso manual como pagamento. Despesas operacionais registradas pelo Master, com regra explícita de rateio para margens por plano.
- Simulador com custos, uso esperado da franquia, outras despesas, multiplicador e margem de segurança. R$ 100 × 3 = R$ 300 antes das demais despesas. Preços recomendados são simulação; nenhum botão altera preços públicos nesta entrega.
- Tarifas, moeda/câmbio e rateios versionados e visíveis no cálculo. Sem base suficiente, resultado/margem ficam estimados ou indisponíveis, nunca apresentados como lucro real.
- Proteção em página, funções autenticadas e RLS; escrita de telemetria apenas no servidor. Negar clientes e administradores de empresas, inclusive consultas diretas. Não expor prompts, mensagens privadas, chaves ou dados brutos de mídia nos relatórios.
- Manter visual atual, menu completo no celular e financeiro das empresas inalterado. Clientes continuam vendo apenas plano, saldo e consumo próprio.

## 4. Arquivos e tabelas previstos

- Créditos/ativação: `src/routes/api/public/whatsapp-webhook.ts`, `src/routes/api/public/billing/webhook.ts`, `src/lib/credits.functions.ts`, `src/lib/plan-limits.server.ts`, `src/lib/plan.functions.ts`; RPCs `topup_plan_credits`/`consume_ai_credit`, tabelas `plan`, `credit_ledger`, novos registros de reserva/recarga.
- IA: `src/lib/lovable-ai.server.ts`, `gemini.server.ts` (preservar direto), `whatsapp-media.server.ts`, `ai-prompt.ts`, `agent-ai.functions.ts`; módulos focados de transporte Gateway, contexto econômico e telemetria.
- Master: `src/routes/master.tsx`, nova página financeira e funções/calculadoras separadas; novas tabelas de uso, despesas, tarifas e parâmetros de simulação. Metadados próprios na nova página. Não modificar telas fora do necessário.
- Toda nova tabela pública terá GRANT, RLS e políticas na mesma migração, aplicada pelo fluxo oficial; operações privilegiadas autorizam Master antes de importar cliente administrativo. Nenhuma edição de arquivos de integração gerados.

## 5. Testes e validação

- Um teste por franquia: Starter 1.000, Pro 6.000, Business 30.000; confirmar preços 97/197/497 preservados.
- Mesmo pagamento repetido/concurrente recarrega uma vez; novo ciclo recarrega a franquia correta; plano errado/evento atrasado/cancelamento não concede créditos; rollback atômico em erro.
- Uma resposta entregue = um crédito; partes da mesma resposta = um total; falha, vazio e bloqueio = zero; reserva/reembolso idempotentes; concorrência no último crédito; erro de RPC não aparece como saldo zero; envio incerto não dispara duplicata.
- Uso de texto/mídia/tentativas, tarifa e cálculo por 1.000, campos desconhecidos, receita recebida versus nominal, filtros e rateios; simulação 100 × 3 = 300 sem alteração pública.
- Acesso negado a cliente, admin de empresa e visitante em página/funções/tabelas; testes autenticados Master e conta comum sem mensagens a clientes.
- Testes atuais relevantes e regressões offline com provedores/WhatsApp simulados. Após autorização, teste controlado do Gateway sem cliente; parar em indisponibilidade/negação. Compilação automática e conferência de erros; navegação desktop/celular e leitura de relatórios.

## 6. Riscos, custos e aprovação

Maior risco: disponibilidade do 2.5 Flash, conciliação de envios incertos e recargas simultâneas. Mitigar com validação do modelo, estados duráveis, transações e testes antes de publicação. Alterações no banco compartilhado podem afetar o serviço publicado mesmo sem publicar código; mudanças de contrato precisam ser retrocompatíveis e coordenadas.

Telemetria aumenta gravações/armazenamento; otimizar agregações e consultas, sem política de exclusão de histórico não autorizada. Custo de implementação e execução depende do trabalho e tráfego; não há orçamento fechado comprovado. Começar pela Etapa A, seguir com medição e só depois usar as margens para decidir preços. Nenhum preço público, saldo retroativo ou publicação está autorizado por este plano.