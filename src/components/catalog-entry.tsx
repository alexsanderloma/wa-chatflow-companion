import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import Papa from "papaparse";
import { toast } from "sonner";
import { Loader2, Plus, Upload } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CATEGORY_LABELS, SUPPLIER_CATEGORIES, mapCatalogRows, parseBrlToCents, type CatalogItemInput, type SupplierCategory } from "@/lib/suppliers";
import { addCatalogItems } from "@/lib/suppliers.functions";

const blank = { produto: "", marca: "", modelo: "", categoria: "outros" as SupplierCategory, custo: "", disponibilidade: "" };

export function CatalogEntry({ companyId, suppliers, onSaved }: { companyId: string; suppliers: { id: string; nome: string }[]; onSaved: () => Promise<void> }) {
  const add = useServerFn(addCatalogItems);
  const [supplierId, setSupplierId] = useState<string>("");
  const [form, setForm] = useState(blank);
  const [parsed, setParsed] = useState<{ name: string; items: CatalogItemInput[]; skipped: number } | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(items: CatalogItemInput[], fonte: "manual" | "arquivo") {
    if (!supplierId) { toast.error("Escolha o fornecedor"); return false; }
    setBusy(true);
    try {
      const r = await add({ data: { companyId, supplierId, fonte, items } });
      toast.success(`${r.count} ${r.count === 1 ? "item salvo" : "itens salvos"} no catálogo`);
      await onSaved();
      return true;
    } catch (e: any) { toast.error(e?.message || "Erro ao salvar"); return false; }
    finally { setBusy(false); }
  }

  function readFile(file: File) {
    if (/\.(xlsx?|ods)$/i.test(file.name)) { toast.error("Salve a planilha como CSV (Arquivo → Salvar como → CSV) e envie de novo."); return; }
    Papa.parse<string[]>(file, {
      skipEmptyLines: true,
      complete: (res) => {
        try {
          const r = mapCatalogRows(res.data as string[][]);
          if (!r.items.length) throw new Error("Nenhum produto encontrado no arquivo.");
          setParsed({ name: file.name, ...r });
        } catch (e: any) { setParsed(null); toast.error(e?.message); }
      },
      error: () => toast.error("Não foi possível ler o arquivo."),
    });
  }

  if (!suppliers.length) return null;

  return (
    <Card className="space-y-4 p-4">
      <div>
        <h2 className="font-medium">Adicionar ao catálogo</h2>
        <p className="text-xs text-muted-foreground">Além das mensagens recebidas no WhatsApp, você pode cadastrar itens manualmente ou enviar um arquivo.</p>
      </div>
      <div className="max-w-sm">
        <Label>Fornecedor</Label>
        <Select value={supplierId} onValueChange={setSupplierId}>
          <SelectTrigger><SelectValue placeholder="Escolha o fornecedor" /></SelectTrigger>
          <SelectContent>{suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <Tabs defaultValue="manual">
        <TabsList><TabsTrigger value="manual">Manual</TabsTrigger><TabsTrigger value="arquivo">Arquivo</TabsTrigger></TabsList>
        <TabsContent value="manual" className="space-y-3 pt-2">
          <div className="grid gap-3 md:grid-cols-3">
            <div><Label>Produto *</Label><Input value={form.produto} onChange={(e) => setForm({ ...form, produto: e.target.value })} /></div>
            <div><Label>Marca</Label><Input value={form.marca} onChange={(e) => setForm({ ...form, marca: e.target.value })} /></div>
            <div><Label>Modelo</Label><Input value={form.modelo} onChange={(e) => setForm({ ...form, modelo: e.target.value })} /></div>
            <div><Label>Categoria</Label>
              <Select value={form.categoria} onValueChange={(v) => setForm({ ...form, categoria: v as SupplierCategory })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{SUPPLIER_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{CATEGORY_LABELS[c]}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Custo (R$)</Label><Input inputMode="decimal" placeholder="1.299,90" value={form.custo} onChange={(e) => setForm({ ...form, custo: e.target.value })} /></div>
            <div><Label>Disponibilidade</Label><Input placeholder="Em estoque" value={form.disponibilidade} onChange={(e) => setForm({ ...form, disponibilidade: e.target.value })} /></div>
          </div>
          <Button disabled={busy || !form.produto.trim()} onClick={async () => {
            const ok = await save([{ produto: form.produto, marca: form.marca || null, modelo: form.modelo || null, categoria: form.categoria, custo_cents: parseBrlToCents(form.custo), disponibilidade: form.disponibilidade || null }], "manual");
            if (ok) setForm(blank);
          }}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}Adicionar item</Button>
        </TabsContent>
        <TabsContent value="arquivo" className="space-y-3 pt-2">
          <p className="text-xs text-muted-foreground">Envie um arquivo CSV com cabeçalho. Colunas reconhecidas: <b>produto</b> (obrigatória), marca, modelo, categoria, custo/preço e disponibilidade. Planilhas do Excel podem ser salvas como CSV.</p>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted">
            <Upload className="h-4 w-4" /> Escolher arquivo
            <input type="file" accept=".csv,.txt,text/csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) readFile(f); e.target.value = ""; }} />
          </label>
          {parsed && (
            <div className="space-y-2 rounded-md border border-border p-3 text-sm">
              <p><b>{parsed.name}</b>: {parsed.items.length} produtos encontrados{parsed.skipped ? ` · ${parsed.skipped} linhas sem produto ignoradas` : ""}.</p>
              <ul className="list-disc pl-5 text-xs text-muted-foreground">
                {parsed.items.slice(0, 5).map((i, n) => <li key={n}>{i.produto}{i.custo_cents != null ? ` — R$ ${(i.custo_cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : ""}</li>)}
                {parsed.items.length > 5 && <li>…</li>}
              </ul>
              <div className="flex gap-2">
                <Button size="sm" disabled={busy} onClick={async () => { if (await save(parsed.items, "arquivo")) setParsed(null); }}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}Importar {parsed.items.length} itens</Button>
                <Button size="sm" variant="outline" onClick={() => setParsed(null)}>Cancelar</Button>
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </Card>
  );
}
