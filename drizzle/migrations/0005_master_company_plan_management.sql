CREATE OR REPLACE FUNCTION public.master_manage_company_plan(_actor_id uuid, _company_id uuid, _plan_id uuid, _action text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  c public.company%ROWTYPE;
  p public.plan%ROWTYPE;
  s public.subscription%ROWTYPE;
  new_id uuid;
  ts timestamptz := now();
  trial_end timestamptz;
  period_end timestamptz;
  target_company_status text;
  reason text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _actor_id AND role = 'super_admin') THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;
  IF _action IS NULL OR _action NOT IN ('assign','cancel') THEN RAISE EXCEPTION 'Ação inválida'; END IF;
  SELECT * INTO c FROM public.company WHERE id = _company_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Empresa não encontrada'; END IF;
  IF _action = 'assign' THEN
    SELECT * INTO p FROM public.plan WHERE id = _plan_id AND ativo = true FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Plano inexistente ou inativo'; END IF;
  END IF;
  SELECT * INTO s FROM public.subscription WHERE company_id = c.id
    AND status IN ('trialing','active','past_due','incomplete','paused') FOR UPDATE;
  IF _action = 'cancel' AND s.id IS NULL AND c.status_cobranca = 'suspenso' AND c.selected_plan_slug IS NULL THEN
    RETURN jsonb_build_object('ok',true,'changed',false);
  END IF;
  IF _action = 'assign' THEN
    trial_end := CASE WHEN c.status_cobranca = 'trial' AND c.trial_ate > ts THEN c.trial_ate ELSE NULL END;
    target_company_status := CASE WHEN trial_end IS NOT NULL THEN 'trial' ELSE 'ativo' END;
    IF s.id IS NOT NULL AND s.plan_id = p.id AND s.provider = 'manual' AND s.status = 'active'
      AND s.current_period_end > ts AND c.status_cobranca = target_company_status AND c.selected_plan_slug = p.slug THEN
      RETURN jsonb_build_object('ok',true,'changed',false,'subscriptionId',s.id);
    END IF;
    period_end := coalesce(trial_end, (ts AT TIME ZONE 'UTC' + interval '1 month') AT TIME ZONE 'UTC');
  END IF;
  reason := CASE WHEN _action = 'cancel' THEN 'Cancelamento administrativo interno; cobrança externa não alterada.' ELSE 'Substituição administrativa interna; cobrança externa não alterada.' END;
  IF s.id IS NOT NULL THEN
    UPDATE public.subscription SET status = 'canceled', canceled_at = ts,
      cancel_at_period_end = false, current_period_end = ts, updated_at = ts,
      metadata = coalesce(metadata,'{}'::jsonb) || jsonb_build_object('admin_reason',reason,'admin_actor_id',_actor_id)
      WHERE id = s.id;
  END IF;
  IF _action = 'assign' THEN
    INSERT INTO public.subscription (company_id,plan_id,provider,status,current_period_start,current_period_end,trial_ends_at,metadata)
      VALUES (c.id,p.id,'manual','active',ts,period_end,trial_end,
        jsonb_build_object('admin_reason','Atribuição administrativa interna; cobrança externa não alterada.','admin_actor_id',_actor_id))
      RETURNING id INTO new_id;
    UPDATE public.company SET status_cobranca = target_company_status, selected_plan_slug = p.slug, updated_at = ts WHERE id = c.id;
  ELSE
    UPDATE public.company SET status_cobranca = 'suspenso', selected_plan_slug = NULL, updated_at = ts WHERE id = c.id;
  END IF;
  INSERT INTO public.audit_log(company_id,user_id,acao,recurso,detalhes)
    VALUES(c.id,_actor_id,CASE WHEN _action = 'cancel' THEN 'master_plan_cancel' ELSE 'master_plan_assign' END,'subscription',
      jsonb_build_object('previous_subscription_id',s.id,'previous_plan_id',s.plan_id,'previous_status',s.status,
        'subscription_id',new_id,'plan_id',CASE WHEN _action = 'assign' THEN p.id ELSE NULL END,
        'plan_name',CASE WHEN _action = 'assign' THEN p.nome ELSE NULL END,
        'status',CASE WHEN _action = 'assign' THEN 'active' ELSE 'canceled' END,'reason',reason,'external_billing_changed',false));
  RETURN jsonb_build_object('ok',true,'changed',true,'subscriptionId',new_id);
END;
$$;
REVOKE ALL ON FUNCTION public.master_manage_company_plan(uuid,uuid,uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.master_manage_company_plan(uuid,uuid,uuid,text) TO service_role;