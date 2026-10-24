import { test } from 'node:test';
import assert from 'node:assert/strict';
import { economicalHistory, economicalMessages } from './ai-economy.ts';
test('context target never truncates latest input', () => { const rows=[{texto:'old'}, {texto:'x'.repeat(3000)}];assert.equal(economicalHistory(rows)[1].texto.length,3000); });
test('keeps at most six recent messages',()=>assert.equal(economicalHistory(Array.from({length:25},(_,i)=>({texto:String(i)}))).length,6));
test('critical system facts are preserved intact',()=>assert.ok(economicalMessages([{role:'system',content:'Produto R$97. Não prometer transferência.'}])[0].content.startsWith('Produto R$97. Não prometer transferência.')));