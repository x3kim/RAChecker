// Minimal Server-Sent-Events helper for Fastify 5 (raw response + hijack).
export function openSSE(request, reply) {
  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  reply.hijack();

  const send = (event, data) => {
    try {
      reply.raw.write(`event: ${event}\n`);
      reply.raw.write(`data: ${JSON.stringify(data ?? {})}\n\n`);
    } catch { /* socket closed */ }
  };
  const heartbeat = setInterval(() => {
    try { reply.raw.write(': ping\n\n'); } catch { /* ignore */ }
  }, 15000);
  const close = () => {
    clearInterval(heartbeat);
    try { reply.raw.end(); } catch { /* ignore */ }
  };
  request.raw.on('close', close);
  return { send, close };
}
