import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Visualização de APRESENTAÇÃO — somente a conta proprietária (ID exato) + super_admin.
export const getApresentacao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { OWNER_USER_ID, buildApresentacao } = await import("./apresentacao.server");
    if (context.userId !== OWNER_USER_ID) throw new Error("Acesso negado");
    const { data } = await context.supabase
      .from("user_roles").select("role")
      .eq("user_id", context.userId).eq("role", "super_admin").maybeSingle();
    if (!data) throw new Error("Acesso negado");
    return buildApresentacao();
  });
