# P2, batch 2: the Valley cast (APPLIED 2026-10-24)

Approved and applied in all ten languages, with two owner changes: both treasure trades removed (traders.json), and Viola's greeting asks the player to look for her twin Sebastian instead of offering to buy the Trident (her new purpose is a proposal, `narrative-pass.md` P2). Before / after for every milestone line of the Valley's characters: Helena, Titania, Caliban, Leontes, Viola and the Vampire (`RelationshipMatrix.json` dialog keys, strings 16xxx; each plays once as a StoryModal and is kept under Clues). Rules: `docs/narrative-style.md`; story: `docs/story.md` §0. Quotes from memory, to be checked against the text before shipping. Once approved: English applied, then German, Spanish and French; the six English-only files take the English.

Kent and the Shepherd are not in this batch (owner, 2026-10-24: Kent never needs to speak; the Shepherd may get story text later): Kent has no relationship (`output: noRel`) and the Shepherd's relationship card is hidden, so neither has milestone lines. Their words are in the tutorial (P4).

## Found while drafting (decided 2026-10-24)

1. **The Vampire's greeting is Prospero's speech.** His `dialogOnMet` points at 16008, Prospero's "you have defeated my dragons, my Orb is yours", so meeting the Vampire plays it. The page gives him his own line on a new string (16024); 16008 stays for Prospero (whose own greeting, 16009, is still the placeholder "[Prospero]": the late batch).
2. **Viola buys the Trident, repeatably, for 25 Gold**, the same problem Leontes' crown trade had: a player can sell a treasure. DECIDED: removed. Her greeting today says she sells it; the new one says she buys it and that the Oracle needs it more.
3. **Leontes still buys the King's Crown once.** In the new story the crown goes back to him at the end; selling it to him early leaves the player needing another from the Castle. DECIDED: removed; his lines are about the Mirror Key.

## Helena

*A Midsummer Night's Dream. Lovesick, loyal, braver than she thinks; keeps the Golden Key; still loves Gertrude and asks for her waking ("Rosemary, for Remembrance"). The met line stays close to today's: the early-game work tuned it to send the player for the Daisies and warn of the Great Bear.*

| Milestone | Key | Today | Proposed | Quote |
|---|---|---|---|---|
| met | 16006 | Well met, kind traveller. I am Helena, and I live here among the fields. I alone keep the Golden Key to the ca... | Well met, kind traveller. I am Helena, and I live among the fields and flowers. I keep the Golden Key to King Leontes' castle in Belmont, where his crown was lost in the storm. Bring me fifty Daisies and the key is thine. But mind the great bear on the castle road, and go armed. | (today's line, the storm added) |
| friend | 16106 | Thou hast become dear to me, {username}. Bring me fifty Daisies and I shall give thee the Golden Key to Leonte... | Thou hast become dear to me, {username}. Love looks not with the eyes, but with the mind, and mine has never stopped seeing the Queen as she was. Stone or no stone, I would bring her rosemary every day. | 1.1 |
| love | 16206 | "I love thee truly" (the stock line) | Things base and vile, holding no quantity, love can transpose to form and dignity. Even me. I love thee, {username}, and that is a braver thing than I ever thought to say. | 1.1 |
| married | 16406 | (none) | Married! I who always ran after others have been caught at last. The fields will be full of daisies for us. |  |
| rival | 16306 | (none) | I am your spaniel, I once told a man: the more he beat me, the more I fawned. Not with thee. Go. | 2.1 |

## Titania

*A Midsummer Night's Dream. Proud queen of the fairies; grand, commanding; Prospero's old friend, now afraid of him; gives the hard fights (ghosts, ogres, dragons, demons) and Titania's Secret.*

| Milestone | Key | Today | Proposed | Quote |
|---|---|---|---|---|
| met | 16007 | You have traveled far, {username}. I am Titania, Queen of the Fairies. You have now come to the place beyond w... | You have travelled far, {username}. I am Titania, Queen of the Fairies, and beyond this place the dangers only grow: ghosts, ogres, dragons. Prospero was my friend before his storm, and now I fear him. Make no enemy of him lightly, or of me. |  |
| friend | 16107 | (none) | Out of this wood do not desire to go: thou art my friend now, and the fairies will guard thee. Kill the dragons that burn my meadows, and I will tell thee what I know of Prospero's Peak. | 3.1 |
| love | 16207 | "I love thee truly" (the stock line) | I will purge thy mortal grossness so that thou shalt like an airy spirit go. Or I would, {username}, if I did not love thee just as thou art. | 3.1 |
| married | 16407 | (none) | The Queen of the Fairies, wed to a mortal! Oberon will sulk for a hundred years. Let him. |  |
| rival | 16307 | (none) | Ill met by moonlight, proud {username}. The fairies have forsworn thy company. | "Ill met by moonlight, proud Titania" (2.1) |

## Caliban

*The Tempest. Prospero's old servant: grudging, earthy, poetic in spite of himself; trades bones for Silver; digs up Yorick's Skull; knows the way to Hecate; loves Titania.*

| Milestone | Key | Today | Proposed | Quote |
|---|---|---|---|---|
| met | 16015 | This bridge is mine, by Sycorax my mother.’ Prospero tried to steal it with spells and smiles. They called me ... | This bridge is mine, by Sycorax my mother, as the island was, before Prospero stole it with spells and smiles. They call me beast. I am earth and storm. I trade bones for Silver: tokens of the dead for coin of the living. Bring me what others fear, and I shall make thee rich. Or haunted. | "This island's mine, by Sycorax my mother" (1.2; today's line, its broken quote fixed) |
| friend | 16115 | Thou wouldst climb to the old magician? His pines are cloven and cursed, and no common axe will bite them. Onl... | Thou wouldst climb to the old magician? His pines are cloven and cursed, and no common axe will bite them. Only the witch in Birnam Wood forges a blade for such wood, and she dearly loves a skull. Fifty-two bones buys one from me. | (today's line, the price added) |
| love | 16215 | "I love thee truly" (the stock line) | Be not afeard; the isle is full of noises, sounds and sweet airs that give delight and hurt not. When thou art near, {username}, I hear them all. | 3.2 |
| married | 16415 | (none) | Married to Caliban! Prospero would choke. I'll show thee every fresh spring, every brine pit, every barren place and fertile. | 1.2 |
| rival | 16315 | (none) | You taught me language, and my profit on it is I know how to curse. Go, before I use it. | 1.2 |

## Leontes

*The Winter's Tale. The King, a jealous man full of regret; his Queen is stone, his crown lost; collects secrets for his Mirror Key; Prospero and Iago are his enemies.*

| Milestone | Key | Today | Proposed | Quote |
|---|---|---|---|---|
| met | 16014 | My grief is a statue; silent, but never still. I buried my crown in snow the day Gertrude chose her garden ove... | My grief is a statue, silent but never still. The storm turned my Queen to stone and stole my crown, and I, a jealous fool, had driven her into her garden long before. I am a feather for each wind that blows. Win my trust and bring me six secrets, and I will give thee my Mirror Key. | 2.3 |
| friend | 16114 | (none) | Thou art a friend to a broken king, {username}, and I have few. Bring me six secrets, Portia's, Gertrude's, Viola's, Juliet's, Caliban's and Titania's, and my Mirror Key is thine. What it opens, I dare not look at. | (the Mirror Key trade) |
| love | 16214 | "I love thee truly" (the stock line) | I loved once, and my jealousy turned it to stone. I will not be that man again. I love thee, {username}, and I trust thee. Mark that I said both. |  |
| married | 16414 | (none) | A king wed again! Let Elsinore talk. I am done with silence. |  |
| rival | 16314 | (none) | Exit, pursued by a bear. That is my wish for thee. | 3.3 (the stage direction) |

## Viola

*Twelfth Night. Shipwrecked, lost her twin; clever, cheerful, lives in the sea since the storm; buys the Trident; Viola's Secret.*

| Milestone | Key | Today | Proposed | Quote |
|---|---|---|---|---|
| met | 16017 | Hello, friend. Do you seek the Trident of the old gods? It is one of the seven artifacts needed to satisfy the... | Hello, friend! I'm Viola. The storm wrecked my ship and took my brother, so I took to the sea, and the sea took to me. If thou findest the Trident of the old gods, I would pay well to hold it a while. But the Oracle needs it more than I do. | (today's line said she sells it; she buys it) |
| friend | 16117 | (none) | O time, thou must untangle this, not I; it is too hard a knot for me to untie. But thou art good at knots, {username}. Friends! Come and swim when the Town wearies thee. | 2.2 |
| love | 16217 | "I love thee truly" (the stock line) | I am all the daughters of my father's house, and all the brothers too, and every one of them loves thee. | 2.4 |
| married | 16417 | (none) | Married at sea! Journeys end in lovers meeting, and mine ended in a shipwreck, and then in thee. | Feste's song, 2.3 |
| rival | 16317 | (none) | I left my brother in the storm and lived. I can leave thee on the shore and live too. |  |

## Vampire

*Original. A courteous pale lord of the night whose churchyard the storm woke; wants quiet among his dead (the Zombies); pays in his blood, one of the seven treasures.*

| Milestone | Key | Today | Proposed | Quote |
|---|---|---|---|---|
| met | 16024 (new) | Well, you've done it. I never dreamed there would be such a one as to defeat my dragons and reach me in this p... | Good evening. Do not be alarmed; I bite only the dull, never the living. The storm woke every grave in my churchyard, and the dead will not lie still. Put my restless neighbours back to sleep, and I will give thee my blood, which the Oracle wants for reasons of her own. | NEW string 16024: today he wrongly plays Prospero's Orb speech (16008) |
| friend | 16108 | (none) | 'Tis now the very witching time of night, when churchyards yawn. A good hour for friends. Thou art mine, {username}; come and sit with the quiet dead. | Hamlet 3.2 |
| love | 16208 | "I love thee truly" (the stock line) | I have watched a thousand years of moons and never once looked away from one. Until thee. |  |
| married | 16408 | (none) | Wed to the night! Thou wilt find me a fine husband: I keep late hours, but I am always home by dawn. |  |
| rival | 16308 | (none) | Go and stand in the sun, {username}. We have nothing left to say. |  |

