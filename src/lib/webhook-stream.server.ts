/** Keep a verified webhook alive while its awaited automation completes. */
export function streamWebhookWork(work: () => Promise<Response>, heartbeatMs = 5000): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const write = (text: string) => {
        if (open) controller.enqueue(encoder.encode(text));
      };
      write("processing\n");
      const interval = setInterval(() => write("processing\n"), heartbeatMs);
      try {
        const result = await work();
        write(`${await result.text()}\n`);
      } catch {
        write("processing-error\n");
      } finally {
        clearInterval(interval);
        open = false;
        controller.close();
      }
    },
  });
  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" },
  });
}