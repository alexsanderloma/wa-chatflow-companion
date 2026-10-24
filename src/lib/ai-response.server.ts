import { deliveredStatus } from './ai-accounting';

export async function reserveResponse(admin: any, companyId: string, sourceId: string) {
  const { data, error } = await admin.rpc('reserve_ai_response', { _company_id: companyId, _source_id: sourceId });
  if (error) throw new Error('Falha ao reservar crédito da resposta.');
  return data as { id?: string; claimed: boolean; status: string };
}
export async function finishResponse(admin: any, id: string, outcome: 'released' | 'pending' | 'delivered') {
  const { error } = await admin.rpc('finish_ai_response', { _id: id, _outcome: outcome });
  if (error) throw new Error('Falha ao conciliar crédito da resposta.');
}
export async function sendAccountedPart(admin: any, chargeId: string, companyId: string, index: number, send: () => Promise<any>) {
  const { data: part, error } = await admin.from('ai_response_part').insert({ charge_id: chargeId, company_id: companyId, part_index: index }).select('id').single();
  if (error || !part) throw new Error('Falha ao registrar envio; nada foi enviado.');
  let receipt: any;
  try { receipt = await send(); }
  catch (error) {
    // Explicit 4xx rejection is known failure; network/5xx can be accepted remotely.
    const status = error && typeof error === 'object' && 'status' in error ? Number(error.status) : 0;
    if (status >= 400 && status < 500) {
      const { error: updateError } = await admin.from('ai_response_part').update({ status: 'failed' }).eq('id', part.id);
      if (updateError) throw new Error('Falha ao registrar rejeição de envio.');
      return { delivered: false, accepted: false, uncertain: false };
    }
    return { delivered: false, accepted: false, uncertain: true };
  }
  const id = receipt?.key?.id || receipt?.message?.key?.id;
  const delivered = deliveredStatus(receipt?.status ?? receipt?.message?.status);
  const { error: updateError } = await admin.from('ai_response_part').update({ whatsapp_message_id: typeof id === 'string' ? id : null, status: delivered ? 'delivered' : id ? 'accepted' : 'sending' }).eq('id', part.id);
  if (updateError) throw new Error('Envio realizado, mas confirmação pendente de conciliação.');
  if (delivered) await finishResponse(admin, chargeId, 'delivered');
  return { delivered, accepted: !!id, uncertain: !id };
}

export async function confirmDeliveryEvent(admin: any, companyId: string, data: any) {
  const rows = Array.isArray(data) ? data : [data];
  for (const row of rows) {
    const id = row?.key?.id ?? row?.id;
    const status = row?.update?.status ?? row?.status;
    if (typeof id !== 'string' || !deliveredStatus(status)) continue;
    const { error } = await admin.rpc('confirm_ai_delivery', { _company_id: companyId, _whatsapp_id: id, _status: String(status) });
    if (error) throw new Error('Falha ao registrar confirmação de entrega.');
  }
}