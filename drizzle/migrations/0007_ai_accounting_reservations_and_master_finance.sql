CREATE TABLE public.ai_response_charge (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES public.company(id), source_message_id uuid NOT NULL REFERENCES public.mensagens(id), status text NOT NULL DEFAULT 'reserved', delivered_parts integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(company_id,source_message_id)
);
GRANT SELECT ON public.ai_response_charge TO authenticated; GRANT ALL ON public.ai_response_charge TO service_role;
ALTER TABLE public.ai_response_charge ENABLE ROW LEVEL SECURITY;
CREATE POLICY master_read ON public.ai_response_charge FOR SELECT TO authenticated USING(public.is_super_admin());
CREATE TABLE public.ai_response_part (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), charge_id uuid NOT NULL REFERENCES public.ai_response_charge(id), company_id uuid NOT NULL REFERENCES public.company(id), part_index integer NOT NULL, whatsapp_message_id text, status text NOT NULL DEFAULT 'sending', created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(charge_id,part_index), UNIQUE(company_id,whatsapp_message_id)
);
GRANT SELECT ON public.ai_response_part TO authenticated; GRANT ALL ON public.ai_response_part TO service_role;
ALTER TABLE public.ai_response_part ENABLE ROW LEVEL SECURITY;
CREATE POLICY master_read ON public.ai_response_part FOR SELECT TO authenticated USING(public.is_super_admin());
CREATE TABLE public.ai_usage (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid REFERENCES public.company(id), charge_id uuid REFERENCES public.ai_response_charge(id), plan_slug text, provider text NOT NULL, model text NOT NULL, purpose text NOT NULL DEFAULT 'chat', status text NOT NULL, input_tokens bigint, output_tokens bigint, estimated_credits numeric, confirmed_credits numeric, rate_version text, gateway_run_id text, created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ai_usage TO authenticated; GRANT ALL ON public.ai_usage TO service_role;
ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY master_read ON public.ai_usage FOR SELECT TO authenticated USING(public.is_super_admin());
CREATE INDEX ai_usage_period_company ON public.ai_usage(created_at,company_id);
CREATE TABLE public.ai_access_state (model text PRIMARY KEY, paused boolean NOT NULL DEFAULT false, reason text, updated_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.ai_access_state TO authenticated; GRANT ALL ON public.ai_access_state TO service_role;
ALTER TABLE public.ai_access_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY master_read ON public.ai_access_state FOR SELECT TO authenticated USING(public.is_super_admin());
CREATE TABLE public.ai_fin_expense (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid REFERENCES public.company(id), description text NOT NULL, amount_cents bigint NOT NULL DEFAULT 0, incurred_on date NOT NULL DEFAULT CURRENT_DATE, created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT,INSERT,UPDATE ON public.ai_fin_expense TO authenticated; GRANT ALL ON public.ai_fin_expense TO service_role;
ALTER TABLE public.ai_fin_expense ENABLE ROW LEVEL SECURITY;
CREATE POLICY master_manage ON public.ai_fin_expense TO authenticated USING(public.is_super_admin()) WITH CHECK(public.is_super_admin());
CREATE TABLE public.ai_fin_settings (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), credit_brl numeric, multiplier numeric NOT NULL DEFAULT 3, safety_pct numeric NOT NULL DEFAULT 20, created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT,INSERT ON public.ai_fin_settings TO authenticated; GRANT ALL ON public.ai_fin_settings TO service_role;
ALTER TABLE public.ai_fin_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY master_read ON public.ai_fin_settings FOR SELECT TO authenticated USING(public.is_super_admin());
CREATE POLICY master_insert ON public.ai_fin_settings FOR INSERT TO authenticated WITH CHECK(public.is_super_admin());
CREATE TABLE public.billing_payment_credit (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), payment_key text NOT NULL UNIQUE, company_id uuid NOT NULL REFERENCES public.company(id), plan_id uuid NOT NULL REFERENCES public.plan(id), subscription_id uuid NOT NULL REFERENCES public.subscription(id), amount_cents bigint, event_type text NOT NULL, period_end timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.billing_payment_credit TO authenticated; GRANT ALL ON public.billing_payment_credit TO service_role;
ALTER TABLE public.billing_payment_credit ENABLE ROW LEVEL SECURITY;
CREATE POLICY master_read ON public.billing_payment_credit FOR SELECT TO authenticated USING(public.is_super_admin());
CREATE UNIQUE INDEX billing_paid_cycle ON public.billing_payment_credit(subscription_id,period_end) WHERE period_end IS NOT NULL AND event_type IN ('purchase_approved','subscription_renewed');
CREATE OR REPLACE FUNCTION public.reserve_ai_response(_company_id uuid,_source_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c public.company%ROWTYPE; r public.ai_response_charge%ROWTYPE; held integer;
BEGIN
 SELECT * INTO c FROM public.company WHERE id=_company_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Company not found'; END IF;
 SELECT * INTO r FROM public.ai_response_charge WHERE company_id=_company_id AND source_message_id=_source_id;
 IF FOUND THEN RETURN jsonb_build_object('id',r.id,'claimed',false,'status',r.status); END IF;
 IF NOT EXISTS(SELECT 1 FROM public.mensagens WHERE id=_source_id AND company_id=_company_id AND direcao='entrada') THEN RAISE EXCEPTION 'Invalid source'; END IF;
 SELECT count(*) INTO held FROM public.ai_response_charge WHERE company_id=_company_id AND status IN ('reserved','pending');
 IF c.creditos_saldo-held<=0 THEN RETURN jsonb_build_object('claimed',false,'status','no_credits'); END IF;
 INSERT INTO public.ai_response_charge(company_id,source_message_id) VALUES(_company_id,_source_id) RETURNING * INTO r;
 RETURN jsonb_build_object('id',r.id,'claimed',true,'status','reserved');
END $$;
REVOKE ALL ON FUNCTION public.reserve_ai_response(uuid,uuid) FROM PUBLIC,anon,authenticated; GRANT EXECUTE ON FUNCTION public.reserve_ai_response(uuid,uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.finish_ai_response(_id uuid,_outcome text) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.ai_response_charge%ROWTYPE; balance integer; cid uuid;
BEGIN
 SELECT company_id INTO cid FROM public.ai_response_charge WHERE id=_id;
 IF cid IS NULL THEN RAISE EXCEPTION 'Response not found'; END IF;
 PERFORM 1 FROM public.company WHERE id=cid FOR UPDATE;
 SELECT * INTO r FROM public.ai_response_charge WHERE id=_id FOR UPDATE;
 IF r.status IN ('delivered','released') THEN RETURN r.status; END IF;
 IF _outcome NOT IN ('delivered','released','pending') THEN RAISE EXCEPTION 'Invalid outcome'; END IF;
 IF _outcome='released' AND EXISTS(SELECT 1 FROM public.ai_response_part WHERE charge_id=_id AND status IN ('sending','accepted','delivered')) THEN RAISE EXCEPTION 'Delivery uncertain'; END IF;
 IF _outcome='delivered' THEN
  IF NOT EXISTS(SELECT 1 FROM public.ai_response_part WHERE charge_id=_id AND status='delivered') THEN RAISE EXCEPTION 'Delivery not confirmed'; END IF;
  UPDATE public.company SET creditos_saldo=GREATEST(0,creditos_saldo-1) WHERE id=cid RETURNING creditos_saldo INTO balance;
  INSERT INTO public.credit_ledger(company_id,delta,saldo_apos,motivo,ref) VALUES(cid,-1,balance,'ai_message',_id::text);
 END IF;
 UPDATE public.ai_response_charge SET status=_outcome,delivered_parts=(SELECT count(*) FROM public.ai_response_part WHERE charge_id=_id AND status='delivered'),updated_at=now() WHERE id=_id;
 RETURN _outcome;
END $$;
REVOKE ALL ON FUNCTION public.finish_ai_response(uuid,text) FROM PUBLIC,anon,authenticated; GRANT EXECUTE ON FUNCTION public.finish_ai_response(uuid,text) TO service_role;
CREATE OR REPLACE FUNCTION public.confirm_ai_delivery(_company_id uuid,_whatsapp_id text,_status text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE rid uuid;
BEGIN
 IF _status NOT IN ('DELIVERY_ACK','READ','PLAYED','3','4','5') THEN RETURN false; END IF;
 UPDATE public.ai_response_part SET status='delivered' WHERE company_id=_company_id AND whatsapp_message_id=_whatsapp_id AND status<>'delivered' RETURNING charge_id INTO rid;
 IF rid IS NULL THEN RETURN false; END IF;
 PERFORM public.finish_ai_response(rid,'delivered'); RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.confirm_ai_delivery(uuid,text,text) FROM PUBLIC,anon,authenticated; GRANT EXECUTE ON FUNCTION public.confirm_ai_delivery(uuid,text,text) TO service_role;