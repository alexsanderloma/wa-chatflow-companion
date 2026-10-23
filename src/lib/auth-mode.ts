// Regras puras do fluxo público de autenticação.
export type AuthMode = "login" | "signup";

/** Login é o padrão. Cadastro só quando pedido explicitamente (?modo=signup). */
export function resolveAuthMode(modo: unknown): AuthMode {
  return modo === "signup" ? "signup" : "login";
}

export const PASSWORD_MIN = 8;

/** Retorna a lista de problemas da senha (vazia = válida). */
export function passwordIssues(pwd: string): string[] {
  const issues: string[] = [];
  if (pwd.length < PASSWORD_MIN) issues.push(`Mínimo de ${PASSWORD_MIN} caracteres`);
  if (pwd.length > 72) issues.push("Máximo de 72 caracteres");
  if (!/[a-zA-Z]/.test(pwd)) issues.push("Inclua pelo menos uma letra");
  if (!/\d/.test(pwd)) issues.push("Inclua pelo menos um número");
  return issues;
}

export function validateSignup(email: string, pwd: string, confirm: string): string | null {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) return "E-mail inválido";
  const issues = passwordIssues(pwd);
  if (issues.length) return issues[0];
  if (pwd !== confirm) return "As senhas não conferem";
  return null;
}
