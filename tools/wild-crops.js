#!/usr/bin/env node
/**
 * Wild crops in the valley templates: how often each scroll / wild crop is laid out per valley
 * type (fixed cells + resourceDistribution of layouts/gridLayouts/valleyFixedCoord/*.json, which
 * re-seed every season). Feeds the "Wild crops" section of docs/tuning.md; re-run after editing
 * valley templates.
 *
 *   node tools/wild-crops.js [Crop ...]
 */
const fs=require('fs'),G=require('path').join(__dirname,'../game-server');
const r=require(G+'/tuning/resources.json');const byKey={};r.forEach(x=>{if(x.layoutkey)byKey[x.layoutkey]=x});
const front=JSON.parse(fs.readFileSync(G+'/layouts/frontierLayouts/frontierTier1/frontierLayout.json'));
const setCache={};const setLayout=n=>setCache[n]||(setCache[n]=JSON.parse(fs.readFileSync(`${G}/layouts/settlementLayouts/${n}/${n}Layout.json`)));
const typeOf=gc=>{const ssgg=Number(gc)%10000;const sR=Math.floor(ssgg/1000),sC=Math.floor(ssgg/100)%10,gR=Math.floor(ssgg/10)%10,gCc=ssgg%10;
  const rows=Array.isArray(front)?front:(front.layout||front.settlements||Object.values(front));const setName=rows?.[sR]?.[sC];if(!setName)return '?';
  try{return setLayout(setName)[gR][gCc]}catch(e){return '?:'+setName}};
const crops=process.argv.slice(2).length?process.argv.slice(2):['Tulip','Mushroom','Sunflower','Daisy','Rosemary','Feverfew','Blueberry','Garlic','Magic Mushroom'];
const stat={};const tcount={};
const dir=G+'/layouts/gridLayouts/valleyFixedCoord/';
for(const f of fs.readdirSync(dir).filter(f=>/^\d+\.json$/.test(f))){
  const l=JSON.parse(fs.readFileSync(dir+f));const vt=typeOf(f.replace('.json',''));tcount[vt]=(tcount[vt]||0)+1;
  const fixed={};for(const row of l.resources||[])for(const k of row){const d=byKey[k];if(d&&crops.includes(d.type))fixed[d.type]=(fixed[d.type]||0)+1}
  const dist=l.resourceDistribution||{};
  for(const c of crops){const n=(fixed[c]||0)+(dist[c]||0);if(!n)continue;const s=(stat[c]=stat[c]||{});const t=(s[vt]=s[vt]||{templates:0,total:0});t.templates++;t.total+=n;}
}
console.log('templates by valley type:',JSON.stringify(tcount));
for(const c of crops){const s=stat[c]||{};console.log(c.padEnd(15),Object.entries(s).sort().map(([vt,t])=>`${vt}: in ${t.templates}/${tcount[vt]} templates, ${t.total} total (avg ${(t.total/tcount[vt]).toFixed(1)}/grid)`).join(' | ')||'none')}
