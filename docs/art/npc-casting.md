# Named NPCs: casting for the full-body art (2026-11-09)

The owner's direction for Phase 4 (docs/avatar-plan.md v2 §7, reordered 2026-11-09): **the
named NPCs are drawn first**, as whole characters on the figure rig, and the player parts
set is chosen afterwards from what they needed. The current busts are the starting point
and we largely stick to them, but they do not bind the final casting. Two rules from the
owner: **variety in hair colour and skin tone**, and **no racial stereotypes**: tone, hair
and features are spread across every role and station (nobles, merchants, workers, healers
alike) and never paired with a costume cue; a character's culture is the valley's, not a
real-world one. Signature pieces (Hecate's red hood, Prospero's star hat, Hotspur's horns,
Kent's top hat) stay because they are how players know them.

Two more rules from batch 1's review (owner 2026-11-09): **no contemporary dress.** Portia as
a modern judge and the Doctor in a white coat with a stethoscope were rejected as "too
contemporary"; every profession is cast in fairy-tale terms (a magistrate in a velvet gown with
a chain of office and a scroll, a physician in a long robe with spectacles, a satchel and a
vial), and the Surgeon, the Field Nurse and any other modern-looking bust get the same
treatment. **One candidate per subject** from now on (OpenAI spend); the owner asks for a
redraw when the one guess misses. Also: the cast has a lot of green clothing, so vary the
cloth colours (Feste's smock went lavender, asked as a pale bluish lavender for the keyer).

Tones are named T1 (very fair) to T6 (deep brown); hair is named by colour. Generation:
`tools/art/jobs/npcs-r<n>.json`, refs = the Cow (rendering) + the approved farm woman or
farm man (proportion per body) + the rasterised bust (`tools/art/guides/control-<name>-bust.png`,
likeness) + `guides/figure-cut.png`; two candidates each; cut by `tools/art/figurecut.js`,
installed as `npc-figure-<name>.svg` on the row with `artSpan 1.8`, `artFacing right`, and
the bust kept in `iconFile` for panels and quest cards until the head crop replaces it.

| # | NPC | role | body | from the bust | cast: tone, hair, age | signature | batch |
|---|---|---|---|---|---|---|---|
| 1 | Gertrude | trade | F | queen, red robe, crown | T2, brown, 30s | silver crown, red robe | DONE (Phase 1) |
| 2 | Kent | quest | M | top hat, red beard | T2, red, 40s | top hat, bow tie | DONE (Phase 1) |
| 3 | Portia | quest | F | judge, navy, bob | T6, black bob, 30s | magistrate's velvet gown, chain of office, scroll (the judge's robe was too modern) | 1, redrawn in 2 |
| 4 | Juliet | trade | F | red bob, tiara, green | T2, red, 20s | tiara with green stone | 1 |
| 5 | Hotspur | quest | M | horned helmet, fur | T1, blond, 30s | horned helmet, fur collar | 1 |
| 6 | Falstaff | trade | M | tricorn, eye patch | T3 olive, black and grey, 50s, stout | tricorn, eye patch, belly | 1 |
| 7 | Prospero | quest | M | star hat, grey beard | T2, grey, old | star hat, staff | 1 |
| 8 | Helena | quest | F | green hair, flower crown | T4 tan, green, 20s | flower crown, leaf collar | 1 |
| 9 | Feste | quest | M | beret, palette, moustache | T5, black, 30s | beret, palette | 1 |
| 10 | Doctor | heal | M | white coat, stethoscope | T6, black, 40s, small beard | physician's robe, spectacles, satchel (the coat was too modern) | 1, redrawn in 2 |
| 11 | Surgeon | heal | M | blue scrubs and cap | T3, dark brown, 30s | a barber-surgeon: leather apron, rolled sleeves, a cloth cap (no scrubs) | 2 |
| 12 | Field Nurse | heal | F | nurse cap, red cross | T2, dark brown, 20s | a healer: white wimple-style cap, grey dress, white apron, a bandage roll (no red cross) | 2 |
| 13 | Apothecary | trade | F | kerchief, hoop earrings, herbs | T4, black, 40s | green kerchief (not a scarf tied as any real dress), herb pouch | 2 |
| 14 | Hecate | trade | F | red hood, grey hair, crook | T2, grey, old | red hood | 2 |
| 15 | The Shepherd | quest | F | red hood, green eyes, crook | T3, white, old | crook (hood goes brown so she is not Hecate) | 2 |
| 16 | Leontes | trade | M | silver crown, blue robe | T5, black, 40s | sapphire crown, blue robe | 2 |
| 17 | Cassio | quest | M | elf, laurel circlet, green | T1, pale blond, 20s | laurel circlet, pointed ears | 2 |
| 18 | Sebastian | quest | M | (shares Cassio's bust) | T4, dark brown, 20s | needs his own look: a traveller's green cloak, no circlet | 2 |
| 19 | Mistress Quickly | quest | F | chef hat, red hair, whisk | T3, red, 40s | chef's hat, spoon | 2 |
| 20 | Titania | quest | F | antler crown, long blond | T1, pale gold, ageless | antler crown, white gown | 3 |
| 21 | Vampire | quest | M | black hair, red eyes, cape | T1 (grey-pale), black, ageless | high collar cape, red eyes | 3 |
| 22 | Constable Elbow | quest | M | beard, purple tunic | T2, white-blond, 50s | a constable's blue coat (the purple goes) | 3 |
| 23 | Snug | trade | M | fur hat, beard, fox | T3, brown, 40s | fur hat, fur coat | 3 |
| 24 | Iago | trade | M | black mask, hood | T4, black, 30s | hood and half-mask (a rogue, not a ninja) | 3 |
| 25 | Caliban | trade | M | green ogre, blue hair | green skin, blue, ageless | tusks, bare chest, torn trousers | 3 |
| 26 | Viola | quest | F | mermaid | T3, teal, 20s | tail: sits on a rock, 1 x 1 footprint, span 1.5 | 3 |
| 27 | Duke Angelo | attack | M | black crown, blond, fur | T2, blond, 30s | black spiked crown, fur collar | 3 |
| 28 | Farm Hand | worker | F | straw hat, black bob, overalls | T5, black, 20s | straw hat, overalls | 4 |
| 29 | Rancher | worker | M | cowboy hat, black coat | T4, black, 30s | wide hat, vest | 4 |
| 30 | Lumberjack / Peter Quince | worker | M | brown hat, plaid, beard | T2, dark brown, 40s | plaid shirt, axe at the side | 4 (one art, two rows) |
| 31 | Crafter | worker | M | straw hat, green shirt | T3, dark brown, 30s | straw hat, apron | 4 |
| 32 | Fairy | heal | F | emoji only | T1, white, small | wings, span 1.2 (a small figure) | 4 |
| 33 | Santa Claus | quest | M | emoji only | T2, white, old, stout | red coat, hat | 4 |
| 34 | The Porter | trade | M | emoji only | T6, grey, 60s | lantern, brown coat | 4 |
| 35 | Oracle | trade | F | emoji only | T5, white, ageless | veil and gold circlet | 4 |

Batches are eight to nine characters, one grass sheet each; the owner picks one of two per
character or asks for a redraw. The tone and hair columns are proposals: the owner may move
any of them before a batch runs. Enemies (Coyote to Phoenix) are not here: they are the
creature lane.

## Progress

- Batch 1 (`npcs-r1.json`, 2026-11-09): APPROVED and installed Prospero 2, Juliet 2, Hotspur 1,
  Falstaff 2, Helena 2. Redrawn in `npcs-r2.json` (one candidate each) and installed: Feste (lavender smock),
  Portia (magistrate), the Doctor (physician). Ten of 35 named NPCs were on the board.
- Batch 2 (`npcs-r3.json`, 2026-11-09, one candidate each, all installed): Juliet redone as a
  princess (bigger hair, finer gown), Mistress Quickly (poofy orange hair), Leontes (a cool king:
  sapphire crown, ermine collar), Sebastian (shipwrecked, torn clothes, barefoot; his own look at
  last), the Apothecary (long deep-plum gown; the dark bluish purple survived the keyer), Hecate
  (a thin, pale, slightly scary witch in a tattered red hood), the Shepherd (brown hood), Cassio
  (handsome, princely, blonde), the Surgeon (barber-surgeon in a leather apron) and the Field
  Nurse (a healer in a wimple cap). Nineteen of 35 named NPCs are on the board.
