/**
 * Google Gemini image generation through the REST API, no SDK. Reference images go in as
 * inline parts before the prompt text; the response carries the image inline. One image per
 * call (n loops). No alpha channel from these models: ask for a flat background and key or
 * matte it afterwards (docs/art-pipeline-plan.md §3).
 */
const fs = require('fs');
const { mimeOf } = require('./common');

async function generate({ apiKey, model, prompt, refs = [], n = 1, aspectRatio = '1:1', imageSize = null }) {
  const parts = refs.map((p) => ({ inline_data: { mime_type: mimeOf(p), data: fs.readFileSync(p).toString('base64') } }));
  parts.push({ text: prompt });
  const imageConfig = { aspectRatio };
  if (imageSize) imageConfig.imageSize = imageSize; // "1K" | "2K" | "4K" on the pro models
  const out = [];
  for (let i = 0; i < n; i++) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts }], generationConfig: { responseModalities: ['IMAGE'], imageConfig } }),
    });
    const body = await res.json();
    if (!res.ok || body.error) throw new Error(`gemini ${res.status}: ${body.error?.message || JSON.stringify(body).slice(0, 300)}`);
    const img = (body.candidates?.[0]?.content?.parts || []).find((p) => p.inlineData);
    if (!img) throw new Error(`gemini: no image in the response (${JSON.stringify(body).slice(0, 300)})`);
    out.push({ png: Buffer.from(img.inlineData.data, 'base64'), usage: body.usageMetadata || null, mime: img.inlineData.mimeType });
  }
  return out;
}

module.exports = { generate };
