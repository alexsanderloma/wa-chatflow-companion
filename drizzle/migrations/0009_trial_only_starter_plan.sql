-- Trial grátis somente no Starter; Pro e Business ativam somente após pagamento.
UPDATE public.plan SET trial_days = 0 WHERE slug IN ('pro', 'business');

CREATE OR REPLACE FUNCTION public.create_company_with_owner(_owner_id uuid, _nome text, _slug text, _plan_id uuid, _forcar_troca_senha boolean DEFAULT false)
 RETURNS TABLE(company_id uuid, trial_ate timestamp with time zone, trial_days integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _plan record;
  _company uuid;
  _trial_end timestamptz;
  _has_trial boolean;
BEGIN
  IF _owner_id IS NULL THEN RAISE EXCEPTION 'Responsável inválido'; END IF;
  IF coalesce(length(trim(_nome)),0) < 2 THEN RAISE EXCEPTION 'Nome inválido'; END IF;
  IF coalesce(length(trim(_slug)),0) < 1 THEN RAISE EXCEPTION 'Slug inválido'; END IF;
  SELECT p.id, p.slug, p.trial_days INTO _plan FROM public.plan p WHERE p.id = _plan_id AND p.ativo = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'Plano inexistente ou inativo'; END IF;

  _has_trial := coalesce(_plan.trial_days, 0) > 0;
  _trial_end := now() + make_interval(days => GREATEST(0, coalesce(_plan.trial_days, 0)));

  INSERT INTO public.company (nome, slug, created_by, status_cobranca, trial_ate, selected_plan_slug)
  VALUES (trim(_nome), _slug, _owner_id, CASE WHEN _has_trial THEN 'trial' ELSE 'checkout_pending' END, _trial_end, _plan.slug)
  RETURNING id INTO _company;

  INSERT INTO public.company_user (company_id, user_id, role, ativo, forcar_troca_senha)
  VALUES (_company, _owner_id, 'owner', true, coalesce(_forcar_troca_senha, false));

  IF EXISTS (SELECT 1 FROM public.subscription s WHERE s.company_id = _company AND s.status <> 'canceled') THEN
    RAISE EXCEPTION 'Empresa já possui assinatura corrente';
  END IF;

  INSERT INTO public.subscription (company_id, plan_id, status, trial_ends_at, current_period_start, current_period_end)
  VALUES (_company, _plan.id, CASE WHEN _has_trial THEN 'trialing' ELSE 'incomplete' END, _trial_end, now(), _trial_end);

  RETURN QUERY SELECT _company, _trial_end, coalesce(_plan.trial_days, 0)::integer;
END $function$;