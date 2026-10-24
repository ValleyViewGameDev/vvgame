/**
 * OpenAI image generation (gpt-image family) through the REST API, no SDK.
 * With reference images it uses /v1/images/edits (multipart, several `image[]` entries:
 * the model treats them as references and the prompt says which is which); without, it
 * uses /v1/images/generations. Returns PNG buffers plus the usage block for the sidecar.
 */
const fs = require('fs');
const path = require('path');
const { mimeOf } = require('./common');

async function generate({ apiKey, model, prompt, refs = [], size = '1024x1024', quality = 'medium', background = 'auto', n = 1 }) {
  const headers = { Authorization: `Bearer ${apiKey}` };
  let res;
  if (refs.length) {
    const form = new FormData();
    form.append('model', model);
    form.append('prompt', prompt);
    form.append('size', size);
    form.append('quality', quality);
    form.append('background', background);
    form.append('output_format', 'png');
    form.append('n', String(n));
    for (const p of refs) form.append('image[]', new Blob([fs.readFileSync(p)], { type: mimeOf(p) }), path.basename(p));
    // a stalled upload hung the generator for over ten minutes once; the generator is idempotent, so fail and let the re-run retry
    res = await fetch('https://api.openai.com/v1/images/edits', { method: 'POST', headers, body: form, signal: AbortSignal.timeout(900000) });
  } else {
    res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt, size, quality, background, output_format: 'png', n }),
      signal: AbortSignal.timeout(900000),
    });
  }
  const body = await res.json();
  if (!res.ok || body.error) throw new Error(`openai ${res.status}: ${body.error?.message || JSON.stringify(body).slice(0, 300)}`);
  return (body.data || []).map((d) => ({ png: Buffer.from(d.b64_json, 'base64'), usage: body.usage || null, mime: 'image/png' }));
}

module.exports = { generate };
