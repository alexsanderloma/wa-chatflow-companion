CREATE UNIQUE INDEX IF NOT EXISTS subscription_one_current_per_company
  ON public.subscription (company_id)
  WHERE status IN ('trialing','active','past_due','incomplete','paused');