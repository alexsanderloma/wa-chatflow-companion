DROP INDEX IF EXISTS public.subscription_company_unique;
CREATE UNIQUE INDEX IF NOT EXISTS subscription_provider_external_unique
  ON public.subscription (provider, external_subscription_id)
  WHERE external_subscription_id IS NOT NULL;