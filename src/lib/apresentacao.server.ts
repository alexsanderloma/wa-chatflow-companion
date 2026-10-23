// DEMONSTRAÇÃO — dados 100% SINTÉTICOS. Nada aqui toca o banco nem gera cobranças.
export { OWNER_USER_ID } from "./apresentacao.shared";
export const PRECO_CENTS = 29700;

const MESES = [
  { key: "2026-04", label: "Abr/26", cumul: 18 },
  { key: "2026-05", label: "Mai/26", cumul: 26 },
  { key: "2026-06", label: "Jun/26", cumul: 35 },
  { key: "2026-07", label: "Jul/26", cumul: 44 },
  { key: "2026-08", label: "Ago/26", cumul: 55 },
  { key: "2026-09", label: "Set/26", cumul: 110 },
];

// Negócios locais: [tipo, usa nome de pessoa?]
const TIPOS: [string, "pessoa" | "lugar"][] = [
  ["Consultório", "pessoa"], ["Odontologia", "lugar"], ["Barbearia", "lugar"], ["Pet Shop", "lugar"],
  ["Studio de Pilates", "lugar"], ["Ótica", "lugar"], ["Imobiliária", "lugar"], ["Escritório Contábil", "lugar"],
  ["Auto Center", "lugar"], ["Doceria", "lugar"], ["Escola de Idiomas", "lugar"], ["Floricultura", "lugar"],
  ["Advocacia", "lugar"], ["Buffet", "lugar"], ["Boutique", "lugar"], ["Pizzaria", "lugar"],
  ["Laboratório", "lugar"], ["Estética", "lugar"], ["Academia", "lugar"], ["Fisioterapia", "lugar"],
  ["Nutricionista", "pessoa"], ["Psicologia", "pessoa"], ["Hamburgueria", "lugar"], ["Salão", "lugar"],
];
const LUGARES = ["Jardim Botânico", "Vila Madalena", "Savassi", "Batel", "Moinhos", "Setor Bueno", "Lagoa da Conceição", "Barra", "Boa Viagem", "Praia do Canto", "Alto da XV", "Pampulha", "Centro Histórico", "Ipiranga", "Cambuí", "Ponta Verde", "Itaim", "Asa Norte", "Meireles", "Cabral", "Petrópolis", "Tatuapé", "Mooca", "Aldeota", "Água Verde", "Funcionários", "Bela Vista", "Trindade", "Campeche", "Graças", "Pinheiros", "Lourdes", "Rio Vermelho", "Bigorrilho", "Menino Deus", "Jardins"];
const PRIMEIROS = ["Ana", "Bruno", "Carla", "Diego", "Eduarda", "Felipe", "Gabriela", "Henrique", "Isabela", "João", "Larissa", "Marcos", "Natália", "Otávio", "Paula", "Rafael", "Sabrina", "Thiago", "Vanessa", "William", "Juliana", "Ricardo", "Camila", "Lucas", "Fernanda", "Renata", "Gustavo", "Beatriz", "Leandro", "Priscila", "Caio", "Letícia"];
const SOBRENOMES = ["Figueiredo", "Albuquerque", "Nogueira", "Tavares", "Moreira", "Bittencourt", "Queiroz", "Siqueira", "Campos", "Andrade", "Vasconcelos", "Prado", "Teixeira", "Brandão", "Fontes", "Arruda", "Leal", "Pacheco", "Sampaio", "Rezende", "Macedo", "Toledo", "Guimarães", "Pimentel"];
const CIDADES = ["São Paulo/SP", "Campinas/SP", "Belo Horizonte/MG", "Curitiba/PR", "Porto Alegre/RS", "Goiânia/GO", "Florianópolis/SC", "Salvador/BA", "Recife/PE", "Vitória/ES", "Ribeirão Preto/SP", "Londrina/PR", "Fortaleza/CE", "Brasília/DF"];

function rng(seed: number) {
  return () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
}
const slug = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "");
const nextMonth = (key: string) => { const [y, m] = key.split("-").map(Number); return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`; };

export function buildApresentacao() {
  const r = rng(297);
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
  const usedNome = new Set<string>();
  const usedResp = new Set<string>();
  const empresas: any[] = [];
  let prev = 0;
  MESES.forEach((m) => {
    const novas = m.cumul - prev;
    prev = m.cumul;
    for (let i = 0; i < novas; i++) {
      let resp = "";
      do { resp = `${pick(PRIMEIROS)} ${pick(SOBRENOMES)}`; } while (usedResp.has(resp));
      usedResp.add(resp);
      let nome = "";
      do {
        const [tipo, modo] = pick(TIPOS);
        nome = modo === "pessoa"
          ? `${tipo} ${tipo.endsWith("do") || tipo.endsWith("da") ? resp.split(" ")[0] : resp}`
          : `${tipo} ${pick(LUGARES)}`;
      } while (usedNome.has(nome));
      usedNome.add(nome);
      const dia = String(1 + Math.floor(r() * 28)).padStart(2, "0");
      empresas.push({
        id: `demo-${empresas.length + 1}`,
        nome,
        responsavel: resp,
        email: `${slug(resp.split(" ")[0])}.${slug(resp.split(" ")[1])}@${slug(nome).slice(0, 24)}.example`,
        cidade: pick(CIDADES),
        plano: "Pro mensal",
        preco_cents: PRECO_CENTS,
        status: "ativo",
        criado_em: `${m.key}-${dia}`,
      });
    }
  });

  const asc = [...empresas].sort((a, b) => a.criado_em.localeCompare(b.criado_em));
  const pagamentos: any[] = [];
  MESES.forEach((m) => {
    asc.filter((e) => e.criado_em.slice(0, 7) <= m.key).forEach((e) => {
      pagamentos.push({
        id: `pg-${pagamentos.length + 1}`,
        empresa_id: e.id,
        empresa: e.nome,
        responsavel: e.responsavel,
        competencia: m.key,
        competencia_label: m.label,
        valor_cents: PRECO_CENTS,
        pago_em: `${m.key}-${e.criado_em.slice(8, 10)}`,
        status: "pago",
      });
    });
  });

  const ultimo = MESES[MESES.length - 1].key;
  const assinaturas = asc.map((e, i) => {
    const pgs = pagamentos.filter((p) => p.empresa_id === e.id);
    return {
      id: `sub-${i + 1}`,
      empresa_id: e.id,
      empresa: e.nome,
      responsavel: e.responsavel,
      email: e.email,
      plano: "Pro mensal",
      valor_cents: PRECO_CENTS,
      inicio: e.criado_em,
      ultimo_pagamento: `${ultimo}-${e.criado_em.slice(8, 10)}`,
      proxima_cobranca: `${nextMonth(ultimo)}-${e.criado_em.slice(8, 10)}`,
      pagamentos: pgs.length,
      total_pago_cents: pgs.length * PRECO_CENTS,
      status: "ativa",
    };
  }).sort((a, b) => b.inicio.localeCompare(a.inicio));

  empresas.sort((a, b) => b.criado_em.localeCompare(a.criado_em));
  pagamentos.sort((a, b) => b.pago_em.localeCompare(a.pago_em) || a.empresa.localeCompare(b.empresa));

  const series = MESES.map((m) => {
    const n = pagamentos.filter((p) => p.competencia === m.key).length;
    return { key: m.key, mes: m.label, empresas: n, receita: (n * PRECO_CENTS) / 100 };
  });
  const total = empresas.length;
  return {
    stats: {
      total,
      novasMes: MESES[5].cumul - MESES[4].cumul,
      ativas: assinaturas.length,
      mrr_cents: assinaturas.length * PRECO_CENTS,
      receitaTotal_cents: pagamentos.length * PRECO_CENTS,
      totalPagamentos: pagamentos.length,
    },
    series,
    empresas,
    assinaturas,
    pagamentos,
  };
}
