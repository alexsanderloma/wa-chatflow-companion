CREATE OR REPLACE FUNCTION public.protect_customer_company_billing()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF coalesce(auth.role(), '') = 'service_role' OR public.is_super_admin() OR (auth.uid() IS NULL AND session_user = 'postgres') THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    IF auth.uid() IS NULL OR NEW.created_by IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Responsável inválido'; END IF;
    NEW.status_cobranca := 'trial';
    NEW.selected_plan_slug := 'starter';
    NEW.trial_ate := now() + interval '3 days';
    NEW.master_access_until := NULL;
  ELSIF NEW.status_cobranca IS DISTINCT FROM OLD.status_cobranca
    OR NEW.selected_plan_slug IS DISTINCT FROM OLD.selected_plan_slug
    OR NEW.trial_ate IS DISTINCT FROM OLD.trial_ate
    OR NEW.master_access_until IS DISTINCT FROM OLD.master_access_until
    OR NEW.creditos_saldo IS DISTINCT FROM OLD.creditos_saldo
    OR NEW.creditos_origem IS DISTINCT FROM OLD.creditos_origem
    OR NEW.creditos_resetam_em IS DISTINCT FROM OLD.creditos_resetam_em
    OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'O plano e o acesso só podem ser alterados após pagamento confirmado ou pelo Master';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.protect_customer_company_billing() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER aa_protect_customer_company_billing BEFORE INSERT OR UPDATE ON public.company FOR EACH ROW EXECUTE FUNCTION public.protect_customer_company_billing();
CREATE OR REPLACE FUNCTION public.protect_customer_subscription_billing()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF coalesce(auth.role(), '') = 'service_role' OR public.is_super_admin() OR (auth.uid() IS NULL AND session_user = 'postgres') THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'Assinaturas só podem ser alteradas pelo pagamento confirmado ou pelo Master';
END;
$$;
REVOKE ALL ON FUNCTION public.protect_customer_subscription_billing() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER protect_customer_subscription_billing BEFORE INSERT OR UPDATE OR DELETE ON public.subscription FOR EACH ROW EXECUTE FUNCTION public.protect_customer_subscription_billing();