# Social video plan: Secrets of Elsinore

Written 2026-11-11 for backlog item BL-26. Assets live in `ads/` (layout in `ads/README.md`).
This is a plan for a first-time video maker: every step names the tool and the setting.

## 1. The short version

- **Make eight short vertical videos, not one long trailer.** Seven show one thing each (zoom,
  farming, story, exploring, characters, crafting, combat) and the eighth is a 30 second
  "everything" cut made from the best seconds of the other seven.
- **Each one is 12 to 25 seconds, 1080 x 1920, and opens on its best moment.** The same file goes
  to TikTok, Instagram Reels and Facebook Reels.
- **Record on the Mac in a tall browser window with OBS, edit in CapCut.** Both are free.
- **Start with three:** V1 Zoom, V2 Farming, V5 Characters. They need the least staging and avoid
  the parts of the game that are not camera-ready.
- **Record the outdoor footage before 20 November.** The live season is Fall and ends
  2026-11-20; after that the grass is snow until spring (the debug panel's Melt the Snow fixes one
  grid at a time, which is slow).
- **Capture mode hides the game's chrome.** On a developer account, Cmd+Ctrl+H hides the
  header, nav and floating buttons so the board fills the window (section 4.2).
- **Three things to settle before recording** (section 9): whether the in-game music may be used
  in ads, how to stage the late story scenes, and whether the combat video waits for painted
  enemies (BL-17).

## 2. What the research says

The sources are mostly marketing blogs and developer write-ups, so treat numbers as directional.
Where they disagree, this says so.

| Finding | What it means here |
|---|---|
| Watch time and completion drive reach on all three platforms. Shorter videos that people finish beat longer ones, and a video that loops counts again. | 12 to 25 seconds. End where the start can pick up. |
| Show the result first; the hook has to land in about 2 seconds. | Open on the payoff (the field clearing, the statue waking), then show how. No logo intro. |
| TikTok judges each video by itself; follower count matters little. | A new account can still get reach. Each video must make sense with no context. |
| Cozy, good-looking games do well in short video. Strategy games and games without strong visuals do not. | Lead with the painted homestead, the water, the autumn trees. Keep panels and text-only shop cards to a second or two. |
| Short gameplay clips, before-and-after, and "I added X to my game" devlog clips perform well. Bugs and glitches do too. | The seven feature clips first. Devlog and funny-bug clips are an easy second wave. |
| Results conflict on conversion: one developer saw many views and few installs, others got tens of thousands of wishlists. | Views are not the goal. Measure players who start and who are still playing at day 7, the same test the launch checklist already uses. |
| A free game that opens from a link has a shorter path than a paid store page. No case study for browser games was found. | The call to action is "Play free in your browser", never "wishlist". This is an advantage, but an unproven one. |
| Business accounts on TikTok can only use the Commercial Music Library; trending songs are not available for promotional posts. One source says the same of Instagram (unconfirmed). | Do not plan around trending sounds. Use the game's own music if it is licensed for this, see section 9. |
| Cross-post the same video to every platform, but upload the original file each time. A TikTok watermark on a Reel reduces its reach. | One master file per video in `ads/video/final/`. |
| Audiences: TikTok skews 18 to 34, Instagram 25 to 44, Facebook over 30. | Farming-game players are well represented on Facebook. Do not treat it as an afterthought. |
| Suggested cadence is 3 to 5 posts a week. | For one person, 2 to 3 a week is realistic: eight videos plus alternate hooks is about a month of posts. |
| Paid TikTok ads rarely pay off for small games. | Keep the paid test on Meta, as the launch checklist plans. The best organic video becomes the ad. |

## 3. Format

| Setting | Value |
|---|---|
| Size | 1080 x 1920 (9:16), all three platforms |
| Frame rate | 60 fps recorded, 30 or 60 exported (60 if the editor allows it free) |
| File | MP4, H.264, AAC audio, about 15 to 20 Mbps |
| Length | 12 to 25 s for V1 to V7; 30 to 40 s for V8 |
| Captions | Burned-in text, 3 to 6 words at a time. Many people watch muted. |
| End | 1.5 s card: logo, "Play free in your browser", `secretsofelsinore.com` |

**Safe area.** Each app covers part of the frame with its own buttons and caption. Sources give
different pixel counts, so use one cautious box for all three: keep text and anything that must
be seen **at least 250 px from the top, 450 px from the bottom, 60 px from the left and 130 px
from the right**. Gameplay can fill the whole frame; only text and the key action need the box.
Check each finished video in the app's own preview before posting.

**Camera rule (owner, 2026-11-13).** Most videos change zoom level on camera at least once, so
the camera never sits still: a push-in at the start, a zoom-out between beats, a pull-back at
the end. A shot script records the zoom key press inside a segment so the game's own zoom
animation is in the cut.

**On-screen text style.** Follow `docs/narrative-style.md`: plain, a little Shakespearean, no
em-dashes. White text with a dark outline or a soft dark plate; one font throughout (use the
game's heading font; put the font file in `ads/brand/`).

## 4. How to record

### 4.1 Account and place

- Record on the **live site** (`https://www.secretsofelsinore.com`) signed in as **`ftuetester`**.
  It is a developer account (so it has the Debug panel) and a test account (so it stays off the
  leaderboard and out of analytics). Never record from Oberon.
- Do not use a local server for this: local runs write to the same production database and add
  nothing for recording.
- Close every other tab and app, turn on Do Not Disturb, hide the bookmarks bar.

### 4.2 Staging with the Debug panel

The nav bar's Debug button (developer accounts only) has what staging needs:

- **Teleport presets**: Oracle, Caliban, Leontes, Prospero, Titania, Viola, Belmont, Acheron,
  Yorick's Hollow, Skull Island and more. Use these for the exploring and story shots.
- **Get Rich, Add Money, Get Skills, Add All Weapons / Armor / Magic**: build a full, pretty
  homestead in minutes instead of days.
- **Make it Snow / Melt the Snow**: a before-and-after on one grid.
- **Reset FTUE**: replay the opening (Gertrude's spirit at the forest edge) as often as needed.

**Capture mode** (built 2026-11-11, `game-client/src/Dev/devCaptureMode.js`): press
**Cmd+Ctrl+H** on a developer account to hide the header, status bar, zoom / map / To Do / season
buttons, the nav bar (and its Debug button) and the Ko-fi widget, and stops the hover tips that
follow the pointer over things on the board. The board fills the whole window. Press it again to bring everything back. A panel or modal that is already open stays
open, so for a shot that needs one (planting from the Farming panel, an NPC's menu), open it
first and then press the keys. Zoom still works on the `+` and `-` keys. A short notice appears
for about a second when it switches, so start recording after it fades.

What does not exist: a way to set the player's level or jump to a quest stage, and a safe way to
change the season. See section 9.

Build the "hero homestead" once, before any recording: crops in tidy blocks at different growth
stages, a paddock with cows and sheep, a row of crafting stations, fences that join up, some deco,
Audrey hired. Every farming and zoom shot uses it. `game-client/public/social-share.png` is the
look to aim for.

### 4.3 Window shape

The game has a phone layout (`mobile.css`) that switches on when the window is narrower than
768 px and taller than it is wide. That gives two ways to get vertical footage:

| Way | How | Good for |
|---|---|---|
| **A. Tall window (recommended)** | Make the Chrome window about 600 x 1067 points on the Mac's built-in Retina display. Retina records it at twice that, about 1200 x 2134 px, which is more than 1080 x 1920. The game shows its phone layout, which is what viewers will get when they tap through. | Most shots. What you see is what you post. |
| **B. Wide window, crop the middle** | Record the normal desktop window full screen, then crop a 9:16 slice in the editor. The camera always keeps the player in the centre of the board, so the middle slice follows the action and the side panels fall outside it. | The frontier zoom (desktop only), wide establishing shots, and any shot where the phone header is in the way. |

**Do this test first** (10 minutes, before anything else): record 20 seconds each way on the hero
homestead, drop both into a 1080 x 1920 CapCut project, and look at them on a phone. Pick the one
that reads better and use it for everything except the frontier zoom. This has not been tried
yet; the plan assumes A works.

A real iPhone screen recording is a third option and proves the game runs on a phone, but touch
input makes staging slow, the frontier zoom is not available on phones, and iOS can kill the tab
on heavy grids (BL-24). Use it for one or two "playing on my phone" clips later, not for the main
set.

### 4.4 OBS settings

OBS Studio is free (`obsproject.com`). Settings for this job:

1. **Settings > Video**: Base (Canvas) Resolution `1080x1920`, Output (Scaled) Resolution
   `1080x1920`, FPS `60`.
2. **Settings > Output > Recording**: format `MOV` or `MKV` (MKV survives a crash; OBS can remux
   to MP4 from File > Remux Recordings), encoder Apple VT H264 Hardware Encoder, bitrate about
   30,000 kbps. Set the recording path to `ads/video/raw/`.
3. **Sources > + > macOS Screen Capture**, method Window Capture, pick the Chrome window. On
   recent macOS versions this source also carries the window's sound, so the game's music and
   effects are recorded. Check the audio meter moves; if it does not, record silent and add sound
   in the edit.
4. Drag the source to fill the 1080 x 1920 canvas. For way B use a second profile with a
   1920 x 1080 canvas.
5. Record a 10 second test, play it back, and look for stutter. If it stutters, close other apps
   and lower the bitrate before lowering the frame rate.

Keep the mouse pointer out of the shot when it is not doing anything. Move it slowly and on
purpose when it is.

### 4.5 Recording habits

- **Record long, cut later.** Let each action run 2 seconds before and after.
- **Three takes of everything.** Name them as in `ads/README.md` and move each into its
  `ads/video/raw/<video>/` folder the same day.
- **Rehearse the path once without recording.** Know where the player walks and what gets clicked.
- **Hold still on pretty frames for 3 seconds.** These become the stills and the cover frames.
- **Close panels** unless the panel is the subject. In the phone layout a panel covers more than
  half the board.

## 5. The eight videos

Order of work: **V1, V2, V5** first, then V4, V6, V3, then V7, and V8 last because it is cut from
the others. "Text" lines are the on-screen captions.

### V1. Zoom: "How big is this farming game?" (12 to 15 s)

Shows: the six zoom levels. The strongest single hook the game has, and it loops.

| Time | Shot | Text |
|---|---|---|
| 0 to 2 s | Closest zoom on the avatar among crops on the hero homestead | This is my farm. |
| 2 to 5 s | Press `-` twice: the whole homestead comes into view | |
| 5 to 8 s | `-` again: the settlement map, 64 grids | This is my valley. |
| 8 to 11 s | `-` again: the frontier, the whole kingdom | This is the kingdom. |
| 11 to 13 s | Snap back to the closest zoom in one cut | All of it is yours to walk. |

Notes: way B (desktop) because the frontier level is desktop only. Hold each level one full
second before the next press. Make a second version that runs backwards (kingdom down to one
carrot); test which holds viewers better.

### V2. Farming: "The most satisfying harvest" (18 to 22 s)

Shows: plant, grow, harvest, sell, and the farm running itself.

| Time | Shot | Text |
|---|---|---|
| 0 to 3 s | Audrey's Bulk Harvest clearing a full ripe field, items flying to the inventory | One tap. Whole field. |
| 3 to 7 s | Planting a block of seeds, the grow effect | Plant it. |
| 7 to 10 s | Crops ripening (cut between growth stages) | Grow it. |
| 10 to 13 s | Walking onto a ready cow and sheep, collect bursts | |
| 13 to 17 s | Selling to Kent, the sale burst and the Gold counter rising | Sell it. |
| 17 to 20 s | Slow pull back over the whole homestead | Then build all this. |

Notes: this is the classic satisfying loop; keep the game's own sound effects loud here.

### V3. Story: "Every Shakespeare character, one shore" (22 to 28 s)

Shows: the premise and one dramatic beat.

| Time | Shot | Text |
|---|---|---|
| 0 to 3 s | The stone Queen in the castle hall, ghosts drifting nearby | The Queen has been turned to stone. |
| 3 to 8 s | The opening: Gertrude's spirit speaks at the forest edge (StoryModal) | A storm tore every character out of their play. |
| 8 to 14 s | Quick cuts of named characters on the board: Falstaff, Juliet, Feste, Prospero, Hecate | Falstaff. Juliet. Prospero. All washed ashore. |
| 14 to 22 s | Feste walks to the statue and sings; the statue becomes Gertrude | Wake her. |
| 22 to 25 s | End card | You are the one with no part written. |

Notes: the opening is easy (Reset FTUE). The statue waking happens around level 14 to 15 and
there is no debug control to jump there, so it needs either a played-through account or a small
developer helper to replay the scene (section 9). If neither is ready, make a version without
that shot and end on the cast montage.

### V4. Exploring: "I walked off the edge of my farm" (18 to 22 s)

Shows: how varied the world is.

| Time | Shot | Text |
|---|---|---|
| 0 to 2 s | The avatar steps off the homestead's edge; screen fades | I walked off the edge of my farm. |
| 2 to 16 s | Seven 2 second cuts, each a different place, always walking the same direction: Town, Sunflower Lake (water shimmer), Belmont and Leontes' castle, Hecate's moss peninsula, Prospero's Peak and the violet pines, Acheron's lava, Hope Mountain | (place names, small, bottom left) |
| 16 to 20 s | Make it Snow on one grid: before, then after | And then winter came. |

Notes: use the teleport presets. Walking the same direction in every cut makes it feel like one
journey. Ambient effects (butterflies, clouds, lava bubbles) are free production value; wait for
them.

### V5. Characters: "You can flirt with Falstaff" (15 to 20 s)

Shows: talking to, befriending and romancing the cast.

| Time | Shot | Text |
|---|---|---|
| 0 to 3 s | The relationship menu open on a named character, cursor on Flatter or Profess Love | You can flirt with Falstaff. |
| 3 to 9 s | Three quick conversations with speech bubbles: a Joke, a Gift, a Hug | Or tell Juliet a joke. |
| 9 to 13 s | A Taunt or Insult going badly | Or make an enemy for life. |
| 13 to 17 s | Hearts over two characters, the status changing to Love or Married | Befriend them. Marry them. |

Notes: humour is the hook. Pick the characters with the best painted figures. Avoid the Doctor
and Falstaff in close-up while they blink (known art glitches), and conversations whose topic
glyphs are still emoji.

### V6. Crafting and skills: "Wheat to Gold" (18 to 22 s)

Shows: the production chains and how the player grows.

| Time | Shot | Text |
|---|---|---|
| 0 to 3 s | A full row of working stations on the hero homestead: Mill, Oven, Dairy, Loom, Winery | 16 workshops. 67 things to make. |
| 3 to 11 s | One chain, fast: harvest Wheat, Mill it, Oven it, collect bread, sell it | Wheat. Flour. Bread. Gold. |
| 11 to 15 s | Before and after of two skills: chopping with the Axe then the Better Axe; walking then riding the Horse | Learn 57 skills. |
| 15 to 19 s | Hired workers doing the jobs while the player walks away | Then hire help and go exploring. |

Notes: skill and shop panels are text-only cards and look flat on video. Show what a skill
*does* on the board, and keep any panel on screen for a second at most.

### V7. Combat: "Cozy farm. Also, a three-headed dog." (15 to 20 s)

Shows: fights and dungeons.

| Time | Shot | Text |
|---|---|---|
| 0 to 2 s | Peaceful farm, butterflies | Cozy farming game. |
| 2 to 4 s | Hard cut to the dungeon entrance | Also this. |
| 4 to 12 s | The Drowned Chantry (flooded church, ghosts): lunge, knockback, damage numbers, a kill | |
| 12 to 16 s | The lava walkway in Acheron's Pit, Cerberus at the end | Something waits at the bottom. |
| 16 to 18 s | Back to the farm | Bring a sword. |

Notes: **this is the one video the game is not ready for.** The twelve enemies are still emoji
(BL-17), combat animations are under review (BL-27), and weapons and armour are not drawn on the
figure (BL-23). Recommendation: make it last, after BL-17. Until then, combat appears only as
2 seconds inside V8, shot at the `farish` zoom where emoji read as small figures, in the Chantry
where the setting carries the shot.

### V8. Everything: the trailer (30 to 40 s)

Cut from the best 2 to 4 seconds of V1 to V7, in this order: zoom out (hook), harvest, sale,
characters, a story beat, three places, crafting row, a flash of combat, zoom back in, end card.
Text: one line per section, for example "Farm it. Craft it. Sell it. Befriend them. Fight that.
Find the seven treasures." Pin it to the top of each profile and use it as the Meta ad.

### Second wave (after the eight)

Cheap to make from footage already recorded: alternate hooks for the best two videos; a
homestead decorating time-lapse; "one thing I added this week" devlog clips; a funny bug; a
"playing on my phone" clip recorded on a real iPhone.

## 6. Stills

The launch checklist already asks for ad stills at 4:5 and 9:16 from the painted parts of the
board. Take these while recording (hold 3 seconds on each, then also press Cmd+Shift+4 and Space
for a window screenshot into `ads/stills/raw/`):

1. Hero homestead, whole grid, Fall colours.
2. Hero homestead, closest zoom, avatar among ripe crops.
3. The same homestead under snow.
4. The row of crafting stations, all working.
5. Paddock with animals, Audrey at work.
6. The Town: castle hall and the stone Queen.
7. Sunflower Lake with the water shimmer.
8. Acheron's lava walkway.
9. A conversation with speech bubbles and hearts.
10. The settlement map zoom.

Crop each into the four sizes in `ads/stills/final/`. Keep the avatar or the main building inside
the centre of the frame so one screenshot survives all four crops.

## 7. Editing in CapCut

CapCut desktop is free and is the easiest editor for vertical video. Its free tier changes
often; if a needed feature moves behind the paywall, DaVinci Resolve is free with no watermark
but takes longer to learn.

Per video:

1. New project, ratio 9:16, 1080 x 1920. Save the project into `ads/video/project/`.
2. Import the takes. Scrub through and split out the good moments (keyboard: `Cmd+B` splits).
   Export nothing yet.
3. Put the **best moment first**. Then lay the rest in the order of the shot table.
4. Trim hard. No shot longer than 3 seconds unless something is changing in it. Total length
   inside the range in section 3.
5. Speed: 1.5x to 2x on walking and waiting. Never speed up the payoff moment.
6. Zoom: for way B footage, scale up and position so the action sits in the safe area. A slow
   105 % push-in on still shots adds life.
7. Text: add the caption lines from the shot table, inside the safe area, each on screen at
   least 1.2 seconds.
8. Sound: game audio at full for effects; music under it at about 30 %. Fade the last half second.
9. End card: 1.5 seconds, from `ads/brand/`.
10. Export 1080p, H.264, 60 fps if offered, into `ads/video/final/`.

**Check before posting** (every video):

- [ ] The first 2 seconds make sense with the sound off.
- [ ] No text under the app buttons (preview it in each app).
- [ ] Nothing from the off-camera list in section 8.
- [ ] `ftuetester` name, debug button and browser chrome are not visible (capture mode on).
- [ ] It still reads on a phone held at arm's length.
- [ ] The end card shows the address.

## 8. Keep off camera

- Enemies in close-up (emoji until BL-17) and emoji topic glyphs in speech bubbles.
- The Gold Pass panel (out-of-date perk text, missing offer).
- The Debug button and any developer-only UI.
- The Doctor and Falstaff mid-blink in close-up.
- Prospero's riddle (stub) and any language other than EN, DE, ES, FR.
- The frontier zoom on a phone (it crashes).
- Other players' names on the leaderboard or in chat.

## 9. To settle before recording

1. **Music rights.** No licence note was found for the tracks in
   `game-client/public/sound/music/`. If they are licensed for commercial use including
   advertising, use them: the game's own music is the simplest and most recognisable choice. If
   not, or if unsure, buy or pick a royalty-free track with a clear commercial licence and keep
   the licence in `ads/video/audio/music/`. Do not use trending songs.
2. **Story staging.** The statue waking, the twins' reunion and the King's Crown are the best
   story shots and all sit behind days of play. Either play `ftuetester` up to them, or add a
   developer helper that replays a scene. Until then V3 uses the opening and the cast montage.
3. **Combat timing.** Make V7 after BL-17 (recommended), or accept emoji enemies at a distance.

## 10. Posting

**Accounts.** One TikTok account, one Instagram account, one Facebook Page, all named for the
game, with the same avatar (the logo) and the same one-line bio: what it is, that it is free, and
the link. Link Instagram and the Page in Meta's Accounts Centre so a Reel can be shared to both.

**Links.** The game already records `utm_source` and `utm_campaign` (see `docs/analytics.md`).
Use one tagged link per platform in the bio, for example
`https://www.secretsofelsinore.com/?utm_source=tiktok&utm_campaign=social-video`, with `ig` and
`fb` for the other two as the launch checklist names them. Links in captions are not clickable
on TikTok or Instagram, so the caption says "link in bio".

**Each post.** Write the caption in `ads/copy/<video>.md` first.

- Line one repeats the hook in words.
- One line says "Free in your browser, link in bio."
- Three to five hashtags: two broad (`#cozygames`, `#farmingsim`), two specific
  (`#indiegame`, `#shakespeare`), one for the game (`#secretsofelsinore`).
- Choose the cover frame from `ads/video/thumbnails/`.
- Reply to every comment in the first hour.

**Rhythm.** Two or three posts a week, same video on all three platforms the same day.

| Week | Make | Post |
|---|---|---|
| 1 (by 20 Nov) | Setup, the window test, hero homestead. Record all outdoor footage for V1, V2, V4, V5, V6 and the stills while it is still Fall. | |
| 2 | Edit V1, V2, V5 | V1, V2 |
| 3 | Edit V4, V6 | V5, V4, V6 |
| 4 | Record and edit V3; cut V8 | V3, V8, one alternate hook |
| Later | V7 after BL-17; second wave | |

## 11. Measuring

Look at each video 48 hours and 7 days after posting.

| Number | Where | What to do with it |
|---|---|---|
| Average watch time and percent who finish | Each app's analytics | The main quality signal. Below about half the length, the hook or the pace is wrong. |
| Where viewers leave | The retention graph | Cut or shorten the shot at the drop, repost as version `b`. |
| Profile visits and link taps | Each app's analytics | If views are high and taps are low, the call to action is weak. |
| New players by `utm_source` | The analytics dashboard (`tools/analytics`) | The number that matters. |
| Still playing at day 7 | The analytics dashboard | The launch checklist's test for any channel. |

After the first eight, make more of whatever kind held viewers longest and brought players who
stayed, and stop making the kind that did not.

## 12. Sources

- [presskit.gg: TikTok indie game marketing](https://presskit.gg/field-guides/tiktok-indie-game-marketing)
- [How To Market A Game: how to go viral on TikTok](https://howtomarketagame.com/2022/02/14/how-to-go-viral-on-tiktok/)
- [How To Market A Game: seven tips for TikTok](https://howtomarketagame.com/seven-great-tips-for-marketing-your-indie-game-on-tiktok/)
- [Game Developer: 120M TikTok views, 60k wishlists](https://www.gamedeveloper.com/game-platforms/this-game-used-tiktok-to-get-120m-views-60k-steam-wishlists-)
- [Game Developer: from 400 to 20,000 wishlists with one video](https://www.gamedeveloper.com/game-platforms/from-400-to-20-000-wishlists-with-1-video-how-tiktok-can-make-your-game-go-viral)
- [Game Industry Library: short-form video and games](https://gameindustrylibrary.com/documents/everything-you-want-to-know-about-shortform-video-games?page=1)
- [StraySpark: building in public](https://www.strayspark.studio/blog/devlog-marketing-build-wishlists)
- [GeekChamp: promoting an indie game across TikTok and Shorts](https://geekchamp.com/promote-an-indie-game-across-tiktok-and-youtube-shorts/)
- [Tiny Glade marketing write-up](https://opgamemarketing.substack.com/p/tiny-glade-an-indie-game-by-2-devs)
- [Ignite Social Media: safe zones for TikTok and Reels](https://www.ignitesocialmedia.com/content-creation/what-are-the-safe-zones-for-tiktoks-and-instagram-reels/)
- [Wyzowl: social media video specs 2026](https://wyzowl.com/social-media-video-specs/)
- [Soundstripe: TikTok music licensing rules](https://www.soundstripe.com/blogs/tiktok-music-licensing-rules)
- [TikTok for Business: royalty-free audio library](https://ads.tiktok.com/business/zh/blog/audio-library-royalty-free-music)
- [Tiger Pistol: Reels vs TikTok vs Shorts 2026](https://tigerpistol.com/reels-vs-tiktok-vs-youtube-shorts-2026/)
- [Socialinsider: TikTok vs Reels vs Shorts engagement](https://www.socialinsider.io/blog/instagram-reels-vs-tiktok/)
- [EaseUS: recording vertical video with OBS](https://recorder.easeus.com/screen-recording-resource/record-vertical-video-obs.html)
- [CapCut: free usage limits](https://www.capcut.com/help/different-free-usage-limits-features)
- [Bitly: TikTok link in bio](https://bitly.com/blog/tiktok-link-in-bio/)

## 13. Automated capture (proof, 2026-11-13)

`tools/capture/` records and edits a video with no OBS and no manual editing. Proven on V1 only.

- `node capture.js login`: opens the capture browser (the installed Chrome with its own profile
  in `tools/capture/.profile`, not in git) to sign in once. It quits when the window is closed.
- `node capture.js shot v01-zoom`: plays `shots/v01-zoom.js` headlessly at 1080 x 1920 with
  capture mode on, records the tab, and writes `ads/video/raw/v01-zoom/v01-zoom.rec` plus
  `.marks.json` (the time of each beat). Needs the local client on port 3000
  (`CAPTURE_URL` overrides).
- `node edit.js v01-zoom`: reads `edits/v01-zoom.json` (which marks to cut between, captions
  between marks, the end card) and writes the finished MP4 into `ads/video/final/`.

What the proof showed: the picture is sharp; Chrome's tab recording delivers about 30 fps (the
game itself holds 60), so finals are 30 fps; **no sound is captured in headless mode**, so music
and effects have to be mixed in by `edit.js` from audio files; key presses sent faster than
about 0.4 s apart are dropped while a zoom level loads. ffmpeg here has no text filter, so
captions and the end card are drawn by Chrome as transparent PNGs and overlaid.

Since the proof (2026-11-13): `shots/lib.js` holds the helpers shots share (tile and NPC
positions from the game's dev hooks, zoom, hide or close a panel); `survey.js` lists what is on
the signed-in player's board; an edit can reorder `segments`, speed each one up and mix takes
(`"source": "<folder>/<take>"`). V2 Farming is `shots/v02-farming.js` + `shots/v02-kent.js` and
`edits/v02-farming.json`; these PLAY the account (they harvest, plant and sell for real).
Known gaps in the V2 first cut: it was recorded one zoom level further out than intended, so the
action is small in the frame, and it has no sound.

Lessons from recording V2 (2026-11-13), all handled in the tool now:

- **Pace clicks to the server.** Every harvest or planting saves the whole grid, one request at
  a time. Clicks 45 ms apart left the local server not answering writes for that player until it
  was restarted; at 110 ms the board showed 66 plantings but the server kept 12. `CLICK_MS` is
  240 with a 6 s pause between passes, and the edit speeds those segments up 7x.
- **The dev client reloads when any source file is saved**, which ends a take. The capture
  browser blocks webpack's `/ws` socket, so it keeps the page it loaded.
- **Opening a panel returns the camera to the player.** A shot that looks elsewhere calls
  `lookAt` again after opening or closing one.
- A failed take no longer replaces the last good recording (`.rec.part`, renamed on success).
- A square board at the `farish` zoom is shorter than a 9:16 frame; a segment's `"scale": 1.2`
  crops in to fill it.
- `shots/prep-wheat.js` replants the crop field slowly so the next take starts with ripe Wheat.

**The capture page is phone-sized (owner, 2026-11-13).** Videos must show the UI at the size a
phone shows it. `capture.js` opens a 432 x 768 page at 2x with touch emulation, so the game
serves its mobile layout (panels 58 % of the width, phone type sizes); Chrome's tab recording
tops out at 2x, so takes are 864 x 1536 and `edit.js` scales them to 1080 x 1920. A 1080 x 1920
page gets the desktop layout and a sliver of a panel: never record UI that way. At this size
the normal zoom shows about 10 x 17 tiles, `farish` about 17 x 30, and `far` fits the whole
board with no bands. V1 Zoom is phone-sized too (version b): it runs closer, close, farish, far and back,
and leaves out the settlement map (mostly "Unoccupied" cells, and it shows other players' names
and net worth) and the kingdom level (not on phones). The recorder waits for the stream to reach full size before it
starts, and a take that is under-sized or has broken picture data is rejected.
Developer-only controls inside player UI carry `data-dev-ui` and are hidden in capture mode.

Open issue: about one take in five fails with a Playwright `TimeoutError` before or at the start
of recording (cause not found). Nothing is saved from a failed take; run the shot again.
