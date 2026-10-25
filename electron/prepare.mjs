import { readFile, writeFile } from 'node:fs/promises';
const source = await readFile(new URL('../src/config/brand.ts', import.meta.url), 'utf8');
const name = source.match(/name:\s*"([^"]+)"/)?.[1];
if (!name) throw new Error('Nome da marca não encontrado.');
await writeFile(new URL('./brand.json', import.meta.url), JSON.stringify({ name }, null, 2));