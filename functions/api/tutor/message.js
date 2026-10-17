// The browser stays on Pages. Only this fixed public tutor endpoint is contacted.
const UPSTREAM = 'https://aurora2d.tail8abf1e.ts.net/english-tutor';
const MAX_BYTES = 16384;
function json(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
  }});
}
export async function onRequest({ request }) {
  if (request.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);
  const origin = request.headers.get('Origin');
  if (origin && origin !== new URL(request.url).origin) return json({ error: 'Origem não autorizada.' }, 403);
  if (request.headers.get('Content-Type')?.split(';')[0].trim() !== 'application/json') return json({ error: 'Use JSON.' }, 415);
  if (Number(request.headers.get('Content-Length')) > MAX_BYTES) return json({ error: 'Solicitação muito grande.' }, 413);
  const reader = request.body?.getReader();
  if (!reader) return json({ error: 'Solicitação inválida.' }, 400);
  const chunks = []; let size = 0, body;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) { await reader.cancel(); return json({ error: 'Solicitação muito grande.' }, 413); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    body = JSON.parse(new TextDecoder().decode(bytes));
    if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ error: 'Solicitação inválida.' }, 400);
  } catch { return json({ error: 'Solicitação inválida.' }, 400); }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  let diagnostic = "network";
  try {
    const response = await fetch(UPSTREAM, {
      method: 'POST', redirect: 'manual', signal: controller.signal,
      headers: { 'Content-Type': 'application/json', 'Origin': 'https://boring-chat.pages.dev' },
      body: JSON.stringify(body),
    });
    diagnostic = "http_" + response.status;
    if (![200, 400, 413, 415, 429].includes(response.status)) throw new Error('Tutor unavailable');
    diagnostic += "_json";
    const value = await response.json();
    if (response.ok) {
      if (typeof value.text !== 'string' || !Array.isArray(value.choices) || !value.choices.every(s => typeof s === 'string')) throw new Error('Invalid tutor response');
      return json({ text: value.text, choices: value.choices, state: value.state ?? null });
    }
    return json({ error: typeof value.error === 'string' ? value.error : 'Não foi possível responder.' }, response.status);
  } catch (error) { const response = json({ error: 'O tutor está indisponível. Tente novamente em instantes.' }, 502); response.headers.set('X-Tutor-Diagnostic', diagnostic + '_' + error.name); response.headers.set('X-Tutor-Diagnostic-Detail', String(error.message).slice(0,220).replace(/[^\x20-\x7e]/g,'')); return response; }
  finally { clearTimeout(timer); }
}
