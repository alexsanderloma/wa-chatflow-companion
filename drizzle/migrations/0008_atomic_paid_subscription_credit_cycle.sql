CREATE OR REPLACE FUNCTION public.apply_paid_credit_event(_event jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE cid uuid:=(_event->>'companyId')::uuid; pid uuid:=(_event->>'planId')::uuid; payment text:=_event->>'paymentKey'; prov text:=_event->>'provider'; ext text:=_event->>'externalSubscriptionId'; et text:=_event->>'eventType'; pend timestamptz:=NULLIF(_event->>'periodEnd','')::timestamptz; p public.plan%ROWTYPE; s public.subscription%ROWTYPE; oldbal integer; newbal integer; existing public.billing_payment_credit%ROWTYPE; held integer;
BEGIN
 IF et NOT IN ('purchase_approved','subscription_renewed') OR length(coalesce(payment,''))<3 OR prov NOT IN ('asaas','kiwify','cakto','perfectpay') THEN RAISE EXCEPTION 'Invalid paid event'; END IF;
 SELECT creditos_saldo INTO oldbal FROM public.company WHERE id=cid FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Company not found'; END IF;
 SELECT * INTO p FROM public.plan WHERE id=pid AND ativo=true;
 IF NOT FOUND THEN RAISE EXCEPTION 'Invalid plan'; END IF;
 SELECT * INTO existing FROM public.billing_payment_credit WHERE payment_key=payment;
 IF FOUND THEN
  IF existing.company_id<>cid OR existing.plan_id<>pid THEN RAISE EXCEPTION 'Payment association conflict'; END IF;
  RETURN jsonb_build_object('ok',true,'duplicate',true);
 END IF;
 IF ext IS NOT NULL THEN SELECT * INTO s FROM public.subscription WHERE provider=prov AND external_subscription_id=ext FOR UPDATE; END IF;
 IF s.id IS NOT NULL AND (s.company_id<>cid OR s.plan_id IS DISTINCT FROM pid OR s.status='canceled') THEN RAISE EXCEPTION 'Subscription conflict'; END IF;
 IF s.id IS NULL THEN
  SELECT * INTO s FROM public.subscription WHERE company_id=cid AND status IN ('trialing','active','past_due','incomplete','paused') FOR UPDATE;
  IF s.id IS NOT NULL AND (s.plan_id IS DISTINCT FROM pid OR (s.provider<>prov AND s.status<>'trialing') OR (s.external_subscription_id IS NOT NULL AND s.external_subscription_id IS DISTINCT FROM ext)) THEN RAISE EXCEPTION 'Current subscription conflict'; END IF;
 END IF;
 IF s.id IS NOT NULL AND pend IS NOT NULL AND s.current_period_end IS NOT NULL AND s.status='active' AND pend<s.current_period_end THEN RAISE EXCEPTION 'Stale payment period'; END IF;
 IF s.id IS NOT NULL AND pend IS NOT NULL AND EXISTS(SELECT 1 FROM public.billing_payment_credit WHERE subscription_id=s.id AND period_end=pend AND event_type IN ('purchase_approved','subscription_renewed')) THEN RETURN jsonb_build_object('ok',true,'duplicate',true); END IF;
 IF s.id IS NULL THEN
  INSERT INTO public.subscription(company_id,plan_id,provider,status,external_subscription_id,external_customer_id,buyer_email,current_period_start,current_period_end) VALUES(cid,pid,prov,'active',ext,_event->>'externalCustomerId',_event->>'buyerEmail',now(),coalesce(pend,now()+interval '30 days')) RETURNING * INTO s;
 ELSE
  UPDATE public.subscription SET provider=prov,status='active',external_subscription_id=ext,external_customer_id=_event->>'externalCustomerId',buyer_email=_event->>'buyerEmail',current_period_end=coalesce(pend,now()+interval '30 days'),updated_at=now() WHERE id=s.id;
 END IF;
 SELECT count(*) INTO held FROM public.ai_response_charge WHERE company_id=cid AND status IN ('reserved','pending');
 newbal:=p.creditos_mensais+held;
 INSERT INTO public.billing_payment_credit(payment_key,company_id,plan_id,subscription_id,amount_cents,event_type,period_end) VALUES(payment,cid,pid,s.id,NULLIF(_event->>'amountCents','')::bigint,et,pend);
 UPDATE public.company SET status_cobranca='ativo',selected_plan_slug=p.slug,creditos_saldo=newbal,creditos_origem='plano',creditos_resetam_em=coalesce(pend,now()+interval '30 days'),updated_at=now() WHERE id=cid;
 INSERT INTO public.credit_ledger(company_id,delta,saldo_apos,motivo,ref) VALUES(cid,newbal-oldbal,newbal,'plan_topup',payment);
 INSERT INTO public.billing_event_log(provider,event_type,external_id,buyer_email,matched_company_id,processed,payload) VALUES(prov,et,ext,_event->>'buyerEmail',cid,true,_event);
 RETURN jsonb_build_object('ok',true,'duplicate',false,'balance',newbal);
END $$;
REVOKE ALL ON FUNCTION public.apply_paid_credit_event(jsonb) FROM PUBLIC,anon,authenticated; GRANT EXECUTE ON FUNCTION public.apply_paid_credit_event(jsonb) TO service_role;
COMMENT ON FUNCTION public.topup_plan_credits(uuid,text) IS 'Legacy topup: new paid webhooks must use apply_paid_credit_event for transactional payment/cycle idempotency.';