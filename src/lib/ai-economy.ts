import type { ChatMsg } from './lovable-ai.server';

/** Soft context target: never truncate system rules, facts, prices or the latest input. */
export function economicalHistory<T extends { texto: string }>(history: T[], targetChars = 2000): T[] {
  const selected: T[] = [];
  let size = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    const row = history[i];
    if (selected.length >= 6 || (selected.length >= 2 && size + row.texto.length > targetChars)) break;
    selected.unshift(row); size += row.texto.length;
  }
  return selected;
}
export function economicalMessages(messages: ChatMsg[]): ChatMsg[] {
  return messages.map(message => message.role !== 'system' ? message : {
    ...message,
    content: message.content + '\nPrefira respostas objetivas de cerca de 200 tokens, sem repetir informações. Preserve dados essenciais, preços, políticas e marcadores de ação; não corte conteúdo necessário.',
  });
}