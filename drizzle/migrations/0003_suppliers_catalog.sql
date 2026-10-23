CREATE TABLE public.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  nome text NOT NULL CHECK (char_length(nome) BETWEEN 1 AND 120),
  telefone text NOT NULL CHECK (telefone ~ '^[0-9]{10,15}$'),
  validade_horas integer NOT NULL DEFAULT 24 CHECK (validade_horas BETWEEN 1 AND 720),
  observacoes text,
  ativo boolean NOT NULL DEFAULT true,
  ultima_atualizacao_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT suppliers_company_telefone_unique UNIQUE (company_id, telefone)
);
CREATE INDEX suppliers_company_idx ON public.suppliers(company_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.suppliers TO authenticated;
GRANT ALL ON public.suppliers TO service_role;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
CREATE POLICY suppliers_company_access ON public.suppliers FOR ALL TO authenticated
  USING (public.has_company_access(company_id)) WITH CHECK (public.has_company_access(company_id));
CREATE TRIGGER suppliers_updated_at BEFORE UPDATE ON public.suppliers FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE public.supplier_catalog_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('texto','imagem','audio','documento','video','outro')),
  conteudo_bruto text,
  midia_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  whatsapp_message_id text,
  status text NOT NULL DEFAULT 'pendente_revisao' CHECK (status IN ('pendente_revisao','processando','processado','erro','ignorado')),
  erro text,
  recebido_em timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX supplier_catalog_updates_company_idx ON public.supplier_catalog_updates(company_id, recebido_em DESC);
CREATE INDEX supplier_catalog_updates_supplier_idx ON public.supplier_catalog_updates(supplier_id, recebido_em DESC);
CREATE UNIQUE INDEX supplier_catalog_updates_msg_unique ON public.supplier_catalog_updates(company_id, whatsapp_message_id) WHERE whatsapp_message_id IS NOT NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.supplier_catalog_updates TO authenticated;
GRANT ALL ON public.supplier_catalog_updates TO service_role;
ALTER TABLE public.supplier_catalog_updates ENABLE ROW LEVEL SECURITY;
CREATE POLICY supplier_updates_company_access ON public.supplier_catalog_updates FOR ALL TO authenticated
  USING (public.has_company_access(company_id)) WITH CHECK (public.has_company_access(company_id));

CREATE TABLE public.supplier_catalog_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  update_id uuid REFERENCES public.supplier_catalog_updates(id) ON DELETE SET NULL,
  produto text NOT NULL,
  marca text,
  modelo text,
  categoria text NOT NULL DEFAULT 'outros' CHECK (categoria IN ('android','iphone','tablet','acessorios','manutencao','outros')),
  custo_cents bigint CHECK (custo_cents IS NULL OR custo_cents >= 0),
  moeda text NOT NULL DEFAULT 'BRL',
  disponibilidade text,
  fonte text,
  aprovado boolean NOT NULL DEFAULT false,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX supplier_catalog_items_company_idx ON public.supplier_catalog_items(company_id, atualizado_em DESC);
CREATE INDEX supplier_catalog_items_supplier_idx ON public.supplier_catalog_items(supplier_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.supplier_catalog_items TO authenticated;
GRANT ALL ON public.supplier_catalog_items TO service_role;
ALTER TABLE public.supplier_catalog_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY supplier_items_company_access ON public.supplier_catalog_items FOR ALL TO authenticated
  USING (public.has_company_access(company_id)) WITH CHECK (public.has_company_access(company_id));

CREATE TABLE public.supplier_margin_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  categoria text NOT NULL CHECK (categoria IN ('android','iphone','tablet','acessorios','manutencao','outros')),
  margem_liquida_pct numeric(5,2) NOT NULL CHECK (margem_liquida_pct >= 0 AND margem_liquida_pct < 95),
  custos_extras_cents bigint NOT NULL DEFAULT 0 CHECK (custos_extras_cents >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT supplier_margin_rules_unique UNIQUE (company_id, categoria)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.supplier_margin_rules TO authenticated;
GRANT ALL ON public.supplier_margin_rules TO service_role;
ALTER TABLE public.supplier_margin_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY supplier_margins_company_access ON public.supplier_margin_rules FOR ALL TO authenticated
  USING (public.has_company_access(company_id)) WITH CHECK (public.has_company_access(company_id));
CREATE TRIGGER supplier_margin_rules_updated_at BEFORE UPDATE ON public.supplier_margin_rules FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();