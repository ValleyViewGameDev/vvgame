import React from 'react';
import { getMasterResources } from '../../Utils/TuningManager';
import './ResourceIcon.css';

/**
 * ResourceIcon: the picture of one resource for DOM panels, modals and buttons.
 *
 * Every resource row in resources.json with an `iconFile` or `filename` (all doobers since
 * 2026-11-07, docs/art/doobers.md; sources, trees, buildings, deco) renders its painted art as an <img>;
 * a row without one still prints its emoji `symbol` (the remaining emoji in the game are
 * exactly the rows this falls back on). Use this wherever a panel used to print
 * `resource.symbol` next to a name or a count; it sizes itself to the surrounding text
 * (1.25em, baseline-aligned) and takes `size` (px) or a `className` to break out of that.
 *
 *   <ResourceIcon type="Wheat" />                      looks the row up in masterResources
 *   <ResourceIcon resource={row} />                    a row you already hold
 *   <ResourceIcon type={t} masterResources={list} />   a list other than the loaded master
 *   <ResourceIcon symbol="💰" />                       a bare symbol (Money, Gem) when no row is at hand
 *   <ResourceIcon file="item-health-heart.svg" />     a picture that is not a resource row (Health)
 *
 * Plain-string contexts (status toasts, chat lines, `title` attributes) cannot hold an <img>;
 * those keep `symbol` until the toast renders rich content (docs/art/doobers.md "What is left").
 */
export default function ResourceIcon({ type, resource, symbol, file: fileProp, masterResources, size, className = '', title }) {
  const list = masterResources || getMasterResources() || [];
  const row = resource || (type ? list.find((r) => r.type === type) : null) || (symbol ? list.find((r) => r.symbol === symbol && r.filename) : null);
  const style = size ? { width: size, height: size } : undefined;
  // iconFile: the panel picture when the board draws something else (Apple's board art is the
  // fruited tree, tree-apple.svg; its panel icon is the painted apple, doober-apple.svg)
  const file = fileProp || row?.iconFile || row?.filename;
  if (file) {
    return <img className={`resource-icon ${className}`.trim()} src={`/assets/resources/${file}`} alt="" draggable="false" style={style} title={title} />;
  }
  const glyph = symbol || row?.symbol || ''; // the caller's glyph wins over the row's when there is no art
  if (!glyph) return null;
  return <span className={`resource-icon resource-icon--glyph ${className}`.trim()} style={style} title={title} aria-hidden="true">{glyph}</span>;
}

/** The file behind a resource type, or null: for places that build an <img> themselves (cursor, VFX). */
export function resourceIconFile(type, masterResources) {
  const list = masterResources || getMasterResources() || [];
  const row = list.find((r) => r.type === type);
  return row?.iconFile || row?.filename || null;
}

/**
 * The same picture as an HTML string, for the few panels that build their requirement lists
 * with dangerouslySetInnerHTML (`<span style="color: ...">${icon} ${name} ${qty} / ${have}</span>`).
 * Falls back to the emoji symbol like the component does.
 */
export function resourceIconHtml(type, masterResources, fileOverride) {
  const list = masterResources || getMasterResources() || [];
  const row = type ? list.find((r) => r.type === type) : null;
  const file = fileOverride || row?.iconFile || row?.filename;
  if (file) return `<img class="resource-icon" src="/assets/resources/${file}" alt="" draggable="false">`;
  return row?.symbol || '';
}
