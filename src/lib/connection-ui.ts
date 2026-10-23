export type ConnectionStatus = "unknown" | "connected" | "connecting" | "disconnected";

export function connectionStatus(value: unknown): ConnectionStatus {
  return value === "connected" || value === "connecting" || value === "disconnected" ? value : "unknown";
}

export function pairingView(status: ConnectionStatus, qr: string | null) {
  return { qr: status === "connecting" ? qr : null, poll: status === "connecting" };
}

/** A mutation invalidates every older status response, including checks already in flight. */
export function connectionRequests() {
  let revision = 0;
  return {
    next: () => ++revision,
    current: (request: number) => request === revision,
  };
}