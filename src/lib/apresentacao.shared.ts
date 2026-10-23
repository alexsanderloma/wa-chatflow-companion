// DEMONSTRAÇÃO — ID da conta proprietária (apenas para exibir o atalho no menu; a proteção real está no servidor).
export const OWNER_USER_ID = "5d59803b-d8b6-492c-870f-597bf304cd9e";
export const APRESENTACAO_ABAS = ["painel", "empresas", "assinaturas"] as const;
export type ApresentacaoAba = (typeof APRESENTACAO_ABAS)[number];
