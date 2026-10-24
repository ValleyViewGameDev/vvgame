# Narrative style: how Secrets of Elsinore sounds

The owner's direction for the game's voice (2026-10-24). Read this before writing or rewording
ANY player-facing text: NPC speech, quests, hints, the FTUE, modals, toasts, item and place
names, mailbox messages. It sits beside two other narrative documents:

| Read | For |
|---|---|
| `story.md` | WHAT the story is: the mash-up rule, the cast and where each comes from, the Quest for Hope spine, the threads |
| this file | HOW it sounds: the direction, the voice by surface, quoting, plain-language rules, each character's voice |
| `narrative-pass.md` | the plan for re-voicing the whole game (a proposal until the owner approves it) |
| `ui-conventions.md` §7 | the mechanics of copy: strings files, ten languages, `_touch` siblings, no em-dashes |

## 1. The direction

Secrets of Elsinore began as a generic farming game (Valley View) and still carries that
game's voice in places: a cowboy buyer, "kitchen magic", a "local artisan", Merlin's Orb,
"Hire Lumberjack". The direction is to make the game **deliberately Shakespearean** in its story
and its text, while staying a fun, unique mash-up.

1. **A mash-up, kept.** Characters from many plays live in one world and deal with each other
   (`story.md` §1: cross the plays, don't be literal, borrow the nature, not the script).
2. **A whimsical fairy tale.** The tone is light, warm and a little mischievous, never grim.
   Death, ghosts and witches are welcome, as fairy tales have them.
3. **Lean on the comedies and the tragedies.** The magical, romantic and haunted plays carry the
   world: A Midsummer Night's Dream, The Tempest, Twelfth Night, As You Like It, Much Ado About
   Nothing, The Merchant of Venice, The Winter's Tale, The Merry Wives of Windsor, Hamlet,
   Macbeth, Romeo and Juliet, King Lear, Othello. The histories are used sparingly and for
   their best company (Falstaff, Hotspur, Mistress Quickly, Harfleur), never for politics.
4. **From the plays, as much as possible.** Real lines, fragments of real lines, real objects,
   real names. A quote woven into a fresh sentence is the house style (§4).
5. **Playful and approachable.** A player who has never read Shakespeare must understand every
   line on the first read. No arcane words, no obscure references (§5).

## 2. The voice by surface

Not every string gets the same amount of Shakespeare. The rule: the more a text is a
character speaking, the more flavour it carries; the more it tells the player what to do, the
plainer it is.

| Surface | Where | Flavour | Rule |
|---|---|---|---|
| Character speech | NPC greetings and milestone dialogs (strings 16xxx), trader lines, Clues, conversation stories | **High** | In character, from the character's voice card (§6). A quote or a fragment in most speeches. thee/thou welcome. |
| Riddles and hints | Quest for Hope hints (2008xx), signpost and door lines | **High** | A riddle in a turned phrase, built on a line or an object from the plays; it names a place and a person, never a menu (`story.md` §2). |
| Story moments | intro story, death and revival, level up, season end, an artifact found, Hope | **Medium-high** | One famous line, re-aimed, then a plain sentence. These are the moments a player screenshots. |
| Quest titles and asks | the To Do list, quest cards | **Medium** | The title is a quote fragment or a play on one ("Exit, Pursued by a Bear"). The ask is the giver speaking, one or two short lines, and the goal itself stays plain ("Bring 10 Wool"). |
| Names | NPCs, places, story items, buildings | **Medium** | Story things take play names (Yorick's Skull, Birnam Wood). Ordinary goods keep ordinary names (Wheat, Wool, Axe): a player must know what a thing is. |
| Panel and modal titles, buttons | UI chrome | **Low** | Plain words. A flourish only where it costs nothing ("Well met!" on a first meeting). Buttons are verbs: Buy, Collect, Travel. |
| Instructions and help | FTUE toasts, How to Play, tips, errors, status bar | **Plain** | Modern, short and exact. At most one light touch per screen ("Tap Constable Elbow. He'll see thy deed done." is too much; "Tap Constable Elbow." is right). Errors are never in character. |

## 3. Character speech

- **thee and thou, lightly.** NPCs may use thou / thee / thy / thine, hast / hath / art / doth,
  'tis, prithee, well met, good morrow, alas, fie, methinks, anon. Keep the grammar right
  (thou art, thou hast, thou wilt; never "thou has"), and don't mix "you" and "thou" to the
  same person in one speech.
- **One flourish per sentence, most sentences plain.** An archaic word, an inversion or a
  quote, not all three. Read it aloud: if it sounds like a costume, cut half of it.
- **Short.** A speech is two to four sentences, about 40 words at most, and fits a phone modal
  without scrolling. A milestone dialog may run to 60 words.
- **The ask is plain even when the speaker isn't.** "Bring me twelve Magic Mushrooms and three
  Pelts" is said in plain words inside the flavoured speech, so the player knows what to do.
- **The player is a stranger in this world,** addressed as traveller, friend, or by name
  (`{username}`). Characters gossip about each other: that is how the mash-up shows.

## 4. Quoting

- **Real lines.** Quote the plays as written (modern spelling, a standard text such as the
  Folger Shakespeare). Check every line against the text before it ships; a famous misquote
  ("Alas, poor Yorick, I knew him well") is a bug.
- **Fragments woven in are the house style.** "Something is rotten in the state of the cheese
  cellar" or "the course of true love never did run smooth, and neither does this river" keep
  the rhythm and the recognition, and make the line the character's own. A twisted quote must
  still be recognisable.
- **Famous lines first, then plain lesser-known ones.** A line works if a reader understands it
  with no footnote. "Put money in thy purse" (Iago) is perfect for a trader; "fardels" is not.
- **Re-aim, don't recite.** The quote serves the moment in the game (`story.md` §1: famous lines
  are fair game, re-aimed). Hamlet's "Neither a borrower nor a lender be" belongs on the Bank.
- **One quote per speech** as a rule; two only in a set piece (the Oracle, Hecate).
- **Any character may quote any play,** but a character's own play and nature come first (Feste
  quotes fools, Iago quotes money, Juliet quotes names and roses).
- **No attribution in the text.** The line carries itself. The source goes in the quote bank
  (§7) and in a comment in review.
- **Translations** (DE, ES, FR, the three translated languages): use the line from a classic,
  public-domain translation where one exists (German: Schlegel-Tieck; French: François-Victor
  Hugo; Spanish: a nineteenth-century translation such as Macpherson's), otherwise translate the
  meaning. The six English-only languages keep the English.

## 5. Plain language: words to keep and words to drop

Approachable beats authentic. A word is fine if a ten-year-old can guess it from the sentence.

- **Welcome:** thee, thou, thy, thine, art, hast, hath, doth, 'tis, 'twas, prithee, well met,
  good morrow, farewell, alas, fie, methinks, anon, aye, nay, mayhap, wouldst, shouldst, sweet
  (as address), good sir / good lady, knave, rogue, villain, fool, wench (only in Falstaff's
  mouth, kindly), merry, woe.
- **Avoid:** forsooth, zounds, sirrah, marry (as an oath), wherefore (players read it as
  "where"), ere, oft, betwixt, ay me, fardels, bodkin, coz, swain, varlet, gramercy, mickle,
  an (meaning "if"), and any word that needs a footnote.
- **Avoid obscure references:** no line whose joke depends on knowing the play's plot or a
  minor character. "Arthur's bosom", "Quinapalus" and the like stay out.
- **No modern slang or brand voice** ("awesome", "kitchen confidential", "level up your
  skills"), and no generic fantasy borrowings (Merlin, elves, wizards as a word for Prospero:
  he is a magician, "the old magician").
- **No em-dashes** (repo rule). Commas, colons or two sentences.

## 6. Voice cards: the cast

One line per character: the play, the nature they keep, how they talk, and lines that suit
them (from the plays; verify before shipping, §4). `story.md` §5 says what each one does in the
game.

| Character | Play | Nature and speech | Lines that suit |
|---|---|---|---|
| Kent | King Lear | Loyal, blunt, plain-spoken servant who buys honest goods; few words, no frills | "Fortune, good night: smile once more; turn thy wheel!"; "I have years on my back forty-eight" |
| Portia | The Merchant of Venice | Clever, fair, a lawyer at heart; precise, warm, a little proud | "The quality of mercy is not strained"; "How far that little candle throws his beams! So shines a good deed in a naughty world"; "All that glisters is not gold" |
| The Shepherd | The Winter's Tale | Kindly old countryman who found a foundling; homely, practical, wonders at the world | "Thou met'st with things dying, I with things new-born"; "A sad tale's best for winter" |
| Hotspur | Henry IV Part 1 | Hot-headed, brave, impatient young warrior; quick, fiery, all honour | "Out of this nettle, danger, we pluck this flower, safety"; "O, the blood more stirs to rouse a lion than to start a hare!" |
| Cassio | Othello | Courtly soldier who lost his good name and wants it back; polite, wounded pride | "Reputation, reputation, reputation! O, I have lost my reputation!" |
| Mistress Quickly | Henry IV / Merry Wives | Bustling hostess of the tavern, motherly, gets words a little wrong, feeds everyone | food and tavern talk; Falstaff gossip; gentle malapropisms |
| Feste | Twelfth Night | The wise fool; sings, teases, tells the truth sideways | "Better a witty fool than a foolish wit"; "Many a good hanging prevents a bad marriage" (sparingly); "journeys end in lovers meeting" |
| Helena | A Midsummer Night's Dream | Lovesick, loyal, braver than she thinks; sighs, then acts | "Love looks not with the eyes, but with the mind"; "Though she be but little, she is fierce" |
| Titania | A Midsummer Night's Dream | Proud queen of the fairies; grand, magical, commanding | "Out of this wood do not desire to go"; "I will purge thy mortal grossness so" |
| Prospero | The Tempest | The old magician, stern, then forgiving; speaks of storms, books, dreams | "We are such stuff as dreams are made on"; "Our revels now are ended" |
| Caliban | The Tempest | Grudging, earthy, poetic in spite of himself; knows every secret path | "Be not afeard; the isle is full of noises, sounds and sweet airs"; "This island's mine, by Sycorax my mother" |
| Constable Elbow | Measure for Measure | Pompous, well-meaning officer who mangles big words | proud malapropisms ("I do lean upon justice"); short, official |
| Snug | A Midsummer Night's Dream | The shy joiner who played the lion, slow of study; gentle, nervous, eager | "I am slow of study"; a lion who promises not to roar too loud |
| Falstaff | Henry IV / Merry Wives | Fat, witty, cowardly, lovable rogue who lives for sack | "The better part of valour is discretion"; "If sack and sugar be a fault, God help the wicked!" |
| Apothecary | Romeo and Juliet | Poor, careful seller of potions; quiet, a little sinister, honest about it | "My poverty, but not my will, consents" |
| Iago | Othello | Smiling schemer, flatterer, always selling; speaks in confidences | "Put money in thy purse"; "I am not what I am"; "the green-eyed monster" |
| Gertrude | Hamlet | A queen who loves her garden and her quiet; regal, sad, sharp | "One woe doth tread upon another's heel"; "The lady doth protest too much, methinks" |
| Leontes | The Winter's Tale | A jealous king full of regret, collecting secrets; brooding, then tender | "I am a feather for each wind that blows"; "Exit, pursued by a bear" (about others) |
| Juliet | Romeo and Juliet | Young, bold, in love, impatient with names and feuds | "What's in a name? That which we call a rose by any other name would smell as sweet"; "Parting is such sweet sorrow" |
| Viola | Twelfth Night | Shipwrecked twin, clever, cheerful, lives by the sea | "O time, thou must untangle this, not I"; "I am all the daughters of my father's house, and all the brothers too" |
| The Oracle | The Winter's Tale | Apollo's voice; solemn, few words, every line a prophecy | "if that which is lost be not found" |
| Hecate | Macbeth | Queen of the witches; chanting, sly, enjoys mortals | "Double, double toil and trouble"; "By the pricking of my thumbs, something wicked this way comes"; "Fair is foul, and foul is fair" |
| Duke Angelo | Measure for Measure | A cold, false judge; the villain | "Some rise by sin, and some by virtue fall" (said of him) |

The rest of the cast (helpers, workers, healers, enemies) gets a voice card when the pass
gives them a Shakespearean identity (`narrative-pass.md` §3).

## 7. The quote bank

Lines that suit the game's moments and systems, collected so any writer reaches for the same
good lines. Starter set; the pass grows it into `docs/narrative/quote-bank.md` with the play,
act and scene, and checks each line against the text.

| Moment | Line | Play |
|---|---|---|
| The world, the game | "All the world's a stage" | As You Like It |
| Welcome, a new player | "O brave new world, that has such people in't!" | The Tempest |
| Wonder, the valley | "There are more things in heaven and earth than are dreamt of in your philosophy" | Hamlet |
| A storm, travel by sea | "Full fathom five thy father lies" | The Tempest |
| Danger, the valley's monsters | "Hell is empty, and all the devils are here" | The Tempest |
| A bear | "Exit, pursued by a bear" | The Winter's Tale |
| A ghost | "Remember me" | Hamlet |
| Death, falling | "Out, out, brief candle!" | Macbeth |
| Coming back from death | "Once more unto the breach, dear friends" | Henry V |
| Love and relationships | "The course of true love never did run smooth" | A Midsummer Night's Dream |
| Music | "If music be the food of love, play on" | Twelfth Night |
| Fools, mistakes | "Lord, what fools these mortals be!" | A Midsummer Night's Dream |
| Skills, levels | "Some are born great, some achieve greatness, and some have greatness thrust upon 'em" | Twelfth Night |
| Money, trading | "Put money in thy purse" | Othello |
| The Bank | "Neither a borrower nor a lender be" | Hamlet |
| Gold, the Store | "All that glisters is not gold" | The Merchant of Venice |
| A crown, the King's Crown | "Uneasy lies the head that wears a crown" | Henry IV Part 2 |
| Bravery, caution | "The better part of valour is discretion" | Henry IV Part 1 |
| Winter, the season | "A sad tale's best for winter" | The Winter's Tale |
| Hard times | "Sweet are the uses of adversity" | As You Like It |
| A short answer | "Brevity is the soul of wit" | Hamlet |
| Something wrong | "Something is rotten in the state of Denmark" | Hamlet |
| Goodbye | "Parting is such sweet sorrow" | Romeo and Juliet |
| Dreams, the end of the game | "We are such stuff as dreams are made on" | The Tempest |
| Nothing gained | "Nothing will come of nothing" | King Lear |

## 8. Checklist for any new text

1. Which surface is it (§2), so how much flavour?
2. Who speaks, and does it match their voice card (§6)?
3. Is there a real line that fits (§7)? Is it checked against the text?
4. Would a player who never read Shakespeare understand it first time (§5)?
5. Is the ask or instruction plain?
6. Short enough for a phone? No em-dashes? All ten languages (`ui-conventions.md` §7)?
