/** Local cleanup is authoritative; a missing/unreachable remote instance must not trap usage. */
export async function removeConnectionRecord(remote: () => Promise<unknown>, local: () => Promise<void>) {
  let remoteRemoved = true;
  try { await remote(); } catch { remoteRemoved = false; }
  await local();
  return { ok: true, remoteRemoved };
}