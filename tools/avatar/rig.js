#!/usr/bin/env node
/**
 * Draw the rig from the body contract (tools/avatar/recipes/_body.json): rig.svg (guides to
 * draw over) and public/assets/avatar/body.json (the same contours for the editor's Avatar
 * Lab). docs/avatar-plan.md §2.3. Run after editing _body.json; assemble.js reads the same file.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const body = JSON.parse(fs.readFileSync(path.join(__dirname, 'recipes', '_body.json'), 'utf8'));
const out = path.join(ROOT, 'game-client', 'public', 'assets', 'avatar');
fs.writeFileSync(path.join(out, 'body.json'), JSON.stringify(body, null, 2) + '\n');
const n = body.neck;
const svg = `<?xml version="1.0" encoding="utf-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
<!--
  The avatar rig, drawn by tools/avatar/rig.js from tools/avatar/recipes/_body.json. Do not edit
  by hand; edit _body.json and run the script. Every part is drawn in this 256 x 256 frame and
  conforms to the BODY: one female head, one male head, the shared neck and bust (the tunic's
  measured outline). docs/avatar-plan.md section 2.3.

    eye line y ${body.eyeLine}, eyes at x ${body.eyesX.join(' / ')}; mouth y ~${body.mouth}; chin y ~${Math.round(body.chin)}
    hair band: tops out at y ${body.hairTop}, never ends above the crown at y ~${Math.round(body.crown)}
    neck x ${n.x}..${n.x + n.w}, y ${n.y}..${n.y + n.h}; collar top y ${body.collarTop}; shoulders from y ${body.shoulderLine}
    hand slot centre (${body.handSlot.cx}, ${body.handSlot.cy}), r ${body.handSlot.r}
-->
  <rect x="0.5" y="0.5" width="255" height="255" fill="none" stroke="#9aa" stroke-dasharray="4 4"/>
  <path d="${body.bust}" fill="#f3e6d6" stroke="#66c" stroke-width="1"/>
  <rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" fill="#f3e6d6" stroke="#6a6" stroke-width="1"/>
  <path d="${body.female.headRig}" fill="#f3e6d6" stroke="#c66" stroke-width="1"/>
  <path d="${body.male.headRig}" fill="none" stroke="#36c" stroke-width="1" stroke-dasharray="3 2"/>
  <line x1="40" y1="${body.hairTop}" x2="216" y2="${body.hairTop}" stroke="#a6a" stroke-dasharray="6 3"/>
  <line x1="64" y1="${body.eyeLine}" x2="192" y2="${body.eyeLine}" stroke="#c66" stroke-dasharray="2 3"/>
  <circle cx="${body.eyesX[0]}" cy="${body.eyeLine}" r="3" fill="#c66"/><circle cx="${body.eyesX[1]}" cy="${body.eyeLine}" r="3" fill="#c66"/>
  <line x1="104" y1="${body.mouth}" x2="152" y2="${body.mouth}" stroke="#c66" stroke-dasharray="2 3"/>
  <line x1="24" y1="${body.shoulderLine}" x2="232" y2="${body.shoulderLine}" stroke="#66c" stroke-dasharray="2 3"/>
  <circle cx="${body.handSlot.cx}" cy="${body.handSlot.cy}" r="${body.handSlot.r}" fill="none" stroke="#c93" stroke-dasharray="3 3"/>
  <text x="128" y="250" font-family="sans-serif" font-size="9" text-anchor="middle" fill="#888">rig: female head (red), male head (blue dashed), neck, bust; eyes y${body.eyeLine}; hair top y${body.hairTop}</text>
</svg>
`;
fs.writeFileSync(path.join(out, 'rig.svg'), svg);
console.log('rig.svg + body.json written from _body.json');
