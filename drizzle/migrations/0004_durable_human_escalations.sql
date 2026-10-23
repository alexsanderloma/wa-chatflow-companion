ALTER TABLE public.agent_config ADD COLUMN IF NOT EXISTS responsavel_escalonamento_nome text NOT NULL DEFAULT '';
CREATE TABLE public.human_escalations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 company_id uuid NOT NULL REFERENCES public.company(id),
 source_message_id text NOT NULL,
 contato_numero text NOT NULL,
 contato_nome text,
 motivo text NOT NULL,
 ultima_mensagem text NOT NULL,
 responsavel_nome text,
 responsavel_telefone text,
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','notified','failed')),
 erro text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 notified_at timestamptz,
 UNIQUE (company_id, source_message_id)
);
GRANT SELECT ON public.human_escalations TO authenticated;
GRANT ALL ON public.human_escalations TO service_role;
ALTER TABLE public.human_escalations ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_read_escalations ON public.human_escalations FOR SELECT TO authenticated USING (public.has_company_access(company_id));
CREATE INDEX human_escalations_company_status ON public.human_escalations(company_id,status,created_at);
CREATE FUNCTION public.claim_human_escalation(_company_id uuid, _user_id uuid, _source_message_id text, _numero text, _nome text, _motivo text, _ultima_mensagem text, _responsavel_nome text, _responsavel_telefone text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE new_id uuid;
BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.whatsapp_instances WHERE company_id=_company_id AND user_id=_user_id) THEN RAISE EXCEPTION 'Instance association invalid'; END IF;
 INSERT INTO public.human_escalations(company_id,source_message_id,contato_numero,contato_nome,motivo,ultima_mensagem,responsavel_nome,responsavel_telefone)
 VALUES (_company_id,_source_message_id,_numero,_nome,_motivo,_ultima_mensagem,_responsavel_nome,_responsavel_telefone)
 ON CONFLICT (company_id,source_message_id) DO NOTHING RETURNING id INTO new_id;
 IF new_id IS NULL THEN RETURN NULL; END IF;
 INSERT INTO public.contact_pause(company_id,user_id,numero,pausado) VALUES (_company_id,_user_id,_numero,true)
 ON CONFLICT (company_id,numero) DO UPDATE SET pausado=true,updated_at=now();
 RETURN new_id;
END $$;
REVOKE ALL ON FUNCTION public.claim_human_escalation(uuid,uuid,text,text,text,text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_human_escalation(uuid,uuid,text,text,text,text,text,text,text) TO service_role;