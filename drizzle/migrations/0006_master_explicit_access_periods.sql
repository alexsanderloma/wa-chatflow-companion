ALTER TABLE public.company ADD COLUMN IF NOT EXISTS master_access_until timestamptz;
COMMENT ON COLUMN public.company.master_access_until IS 'Expiry for explicit temporary Master grants; NULL means no Master expiry. Existing companies unchanged.';
CREATE OR REPLACE FUNCTION public.has_company_access(_company_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT EXISTS (SELECT 1 FROM public.company_user cu JOIN public.company c ON c.id=cu.company_id
 WHERE cu.user_id=auth.uid() AND cu.company_id=_company_id AND cu.ativo=true
 AND (c.master_access_until IS NULL OR c.master_access_until > now()));
$$;
CREATE OR REPLACE FUNCTION public.master_manage_company_plan(_actor_id uuid, _company_id uuid, _plan_id uuid, _action text, _period text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
 c public.company%ROWTYPE; p public.plan%ROWTYPE; s public.subscription%ROWTYPE;
 new_id uuid; ts timestamptz := now(); period_end timestamptz; trial_end timestamptz;
 target_status text; company_status text; reason text;
BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=_actor_id AND role='super_admin') THEN RAISE EXCEPTION 'Acesso negado'; END IF;
 IF _action IS NULL OR _action NOT IN ('assign','cancel') THEN RAISE EXCEPTION 'Ação inválida'; END IF;
 IF _action='assign' AND (_period IS NULL OR _period NOT IN ('trial_7','temporary_30','permanent')) THEN RAISE EXCEPTION 'Selecione um período válido'; END IF;
 SELECT * INTO c FROM public.company WHERE id=_company_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Empresa não encontrada'; END IF;
 IF _action='assign' THEN
  SELECT * INTO p FROM public.plan WHERE id=_plan_id AND ativo=true FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Plano inexistente ou inativo'; END IF;
  target_status := CASE WHEN _period='trial_7' THEN 'trialing' ELSE 'active' END;
  company_status := CASE WHEN _period='trial_7' THEN 'trial' ELSE 'ativo' END;
  period_end := CASE _period WHEN 'trial_7' THEN ts + interval '7 days' WHEN 'temporary_30' THEN ts + interval '30 days' ELSE NULL END;
  trial_end := CASE WHEN _period='trial_7' THEN period_end ELSE NULL END;
 END IF;
 SELECT * INTO s FROM public.subscription WHERE company_id=c.id AND status IN ('trialing','active','past_due','incomplete','paused') FOR UPDATE;
 IF _action='cancel' AND s.id IS NULL AND c.status_cobranca='suspenso' AND c.selected_plan_slug IS NULL THEN RETURN jsonb_build_object('ok',true,'changed',false); END IF;
 IF _action='assign' AND s.id IS NOT NULL AND s.plan_id=p.id AND s.provider='manual'
 AND s.status=target_status AND s.metadata->>'master_period'=_period
 AND (s.current_period_end IS NULL OR s.current_period_end > ts)
 AND c.status_cobranca=company_status AND c.selected_plan_slug=p.slug THEN
  RETURN jsonb_build_object('ok',true,'changed',false,'subscriptionId',s.id);
 END IF;
 reason := CASE WHEN _action='cancel' THEN 'Cancelamento administrativo interno; cobrança externa não alterada.' ELSE 'Atribuição administrativa interna; cobrança externa não alterada.' END;
 IF s.id IS NOT NULL THEN
  UPDATE public.subscription SET status='canceled',canceled_at=ts,cancel_at_period_end=false,current_period_end=ts,updated_at=ts,
   metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('admin_reason',reason,'admin_actor_id',_actor_id) WHERE id=s.id;
 END IF;
 IF _action='assign' THEN
  INSERT INTO public.subscription(company_id,plan_id,provider,status,current_period_start,current_period_end,trial_ends_at,metadata)
   VALUES(c.id,p.id,'manual',target_status,ts,period_end,trial_end,jsonb_build_object('admin_reason',reason,'admin_actor_id',_actor_id,'master_period',_period)) RETURNING id INTO new_id;
  UPDATE public.company SET status_cobranca=company_status,selected_plan_slug=p.slug,trial_ate=coalesce(trial_end,ts),master_access_until=period_end,updated_at=ts WHERE id=c.id;
 ELSE
  UPDATE public.company SET status_cobranca='suspenso',selected_plan_slug=NULL,master_access_until=ts,updated_at=ts WHERE id=c.id;
 END IF;
 INSERT INTO public.audit_log(company_id,user_id,acao,recurso,detalhes) VALUES(c.id,_actor_id,
  CASE WHEN _action='cancel' THEN 'master_plan_cancel' ELSE 'master_plan_assign' END,'subscription',
  jsonb_build_object('previous_subscription_id',s.id,'previous_plan_id',s.plan_id,'previous_status',s.status,'subscription_id',new_id,
   'plan_id',CASE WHEN _action='assign' THEN p.id ELSE NULL END,'plan_name',CASE WHEN _action='assign' THEN p.nome ELSE NULL END,
   'status',CASE WHEN _action='assign' THEN target_status ELSE 'canceled' END,'master_period',_period,'period_end',period_end,'reason',reason,'external_billing_changed',false));
 RETURN jsonb_build_object('ok',true,'changed',true,'subscriptionId',new_id);
END;
$$;
REVOKE ALL ON FUNCTION public.master_manage_company_plan(uuid,uuid,uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.master_manage_company_plan(uuid,uuid,uuid,text,text) TO service_role;
CREATE OR REPLACE FUNCTION public.master_manage_company_plan(_actor_id uuid, _company_id uuid, _plan_id uuid, _action text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
 IF _action IS DISTINCT FROM 'cancel' THEN RAISE EXCEPTION 'Selecione um período no novo diálogo Master'; END IF;
 RETURN public.master_manage_company_plan(_actor_id,_company_id,_plan_id,_action,NULL);
END;
$$;
REVOKE ALL ON FUNCTION public.master_manage_company_plan(uuid,uuid,uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.master_manage_company_plan(uuid,uuid,uuid,text) TO service_role;