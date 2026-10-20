#!/usr/bin/env node
/**
 * The generator (docs/art-pipeline-plan.md §5). Reads a job and a style, builds one request per
 * (model, variant, subject), sends the style refs + the subject's guide + the assembled prompt,
 * and writes the candidates with a sidecar that makes each one reproducible:
 *
 *   tools/art/_candidates/<job>/exploration/<provider>/<variant>-<subject>-<n>.png
 *   tools/art/_candidates/<job>/exploration/<provider>/<variant>-<subject>-<n>.json   (prompt, refs, model, usage)
 *
 * approve.js moves the chosen ones to <job>/approved/<provider>--<name>.png. Idempotent: an
 * output that exists (in exploration or approved) is skipped, so a failed run is re-run as is.
 * Options:
 *   --job slice-a --style graveyard-bright [--models openai,gemini] [--variants a,b]
 *   [--subjects x,y] [--n 1] [--dry-run] [--force]
 */
const fs = require('fs');
const path = require('path');
const { ART, CANDIDATES, loadEnv, readJSON, ensureDir, resolveRef } = require('./lib/common');

const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) => (a.startsWith('--') ? [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true] : null)).filter(Boolean));
const list = (v) => (typeof v === 'string' ? v.split(',').map((s) => s.trim()).filter(Boolean) : null);

async function main() {
  const jobName = args.job || 'slice-a';
  const job = readJSON(path.join(ART, 'jobs', `${jobName}.json`));
  const style = readJSON(path.join(ART, 'styles', args.style || 'graveyard-bright', 'style.json'));
  const env = loadEnv();
  const providers = { openai: require('./lib/openai'), gemini: require('./lib/gemini') };
  const models = list(args.models) || Object.keys(job.models);
  const variants = list(args.variants) || Object.keys(style.variants);
  const subjects = list(args.subjects) || Object.keys(job.subjects);
  const n = Number(args.n || job.n || 1);
  const styleRefs = style.refs.map(resolveRef);
  const preamble = style.preamble.replace('{refCount}', String(styleRefs.length));

  let sent = 0, skipped = 0, failed = 0;
  for (const providerKey of models) {
    const cfg = job.models[providerKey];
    if (!cfg) throw new Error(`job has no model config for "${providerKey}"`);
    const apiKey = providerKey === 'openai' ? env.OPENAI_API_KEY : env.GEMINI_API_KEY;
    if (!apiKey) throw new Error(`no API key for ${providerKey} in game-server/.env`);
    const outDir = path.join(CANDIDATES, jobName, 'exploration', providerKey);
    const approvedDir = path.join(CANDIDATES, jobName, 'approved');
    ensureDir(outDir);
    for (const variant of variants) {
      for (const subjectKey of subjects) {
        const subject = job.subjects[subjectKey];
        if (subject.variants && !subject.variants.includes(variant)) continue;
        // style refs first, then the subject's own extra references, then its guide LAST
        const refs = [...styleRefs, ...(subject.refs || []).map(resolveRef), ...(subject.guide ? [resolveRef(subject.guide)] : [])];
        const prompt = [preamble, style.variants[variant], subject.prompt].filter(Boolean).join('\n\n');
        for (let i = 1; i <= n; i++) {
          const base = path.join(outDir, `${variant}-${subjectKey}-${i}`);
          const approvedPng = path.join(approvedDir, `${providerKey}--${variant}-${subjectKey}-${i}.png`);
          if ((fs.existsSync(`${base}.png`) || fs.existsSync(approvedPng)) && !args.force) { skipped++; continue; }
          if (args['dry-run']) { console.log(`[dry] ${providerKey}/${variant}-${subjectKey}-${i}\n  refs: ${refs.map((r) => path.basename(r)).join(', ')}\n  prompt: ${prompt.slice(0, 160)}...`); continue; }
          process.stdout.write(`${providerKey} ${cfg.model} ${variant}/${subjectKey} #${i} ... `);
          const t0 = Date.now();
          try {
            // a subject may ask for a landscape frame (turnaround sheets) with its own `size`
            const [out] = await providers[providerKey].generate({ apiKey, model: cfg.model, prompt, refs, n: 1, size: subject.size || cfg.size, quality: cfg.quality, background: cfg.background, imageSize: cfg.imageSize, aspectRatio: subject.aspectRatio });
            fs.writeFileSync(`${base}.png`, out.png);
            fs.writeFileSync(`${base}.json`, JSON.stringify({ job: jobName, style: style.name, provider: providerKey, model: cfg.model, config: cfg, variant, subject: subjectKey, refs: refs.map((r) => path.relative(ART, r)), prompt, usage: out.usage, mime: out.mime, ms: Date.now() - t0, at: new Date().toISOString() }, null, 2));
            sent++;
            console.log(`ok ${((Date.now() - t0) / 1000).toFixed(0)}s`);
          } catch (e) {
            failed++;
            console.log(`FAILED: ${e.message}`);
          }
        }
      }
    }
  }
  console.log(`done: ${sent} generated, ${skipped} skipped (exist), ${failed} failed. Sheet: node tools/art/sheet.js --job ${jobName}`);
  if (failed) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
