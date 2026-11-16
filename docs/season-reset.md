# Season reset redesign (2026-11-16)

Owner's decisions, 2026-11-16. The owner moved the end of the live season (Fall #38) to
**2026-11-16 21:00 Eastern (2026-11-17 02:00 UTC)**; the reset runs then, followed by 2 minutes of
off-season (was 25: the reset now takes seconds), then season #39. Backlog: BL-30; this closes
BL-25 once the reset runs clean.

## Goals

- Players should want to build in the Town and the valleys, so a season never takes away what they built there.
- The Quest for Hope can be hunted again every season. It should take several seasons to finish.
- Valley3 is the story stage: nobody builds there, and it is rebuilt for everyone every season, so new storylines can ship there.
- Homestead columns 0-7 are reserved for features shipped later.
- Seasons are about the rotating crops and recipes, and the Caravan and the Harvest Fair asking for seasonal goods.
- Competitive play lives in the Harvest Fair: players move to competitive settlements for harder orders and better rewards. There are no season-end rewards.

## The calendar

| Season | Type | Length | Approx. dates |
|---|---|---|---|
| #39 | Fall (again) | 60 days (one-off) | 2026-11-20 to 2027-01-19 |
| #40 | Winter | 30 days (one-off) | to 2027-02-18 |
| #41 on | Spring, Summer, Fall, Winter | 90 days each | Northern Hemisphere cadence |

Built as a per-season-number override in `tuning/globalTuning.json` (`seasons.schedule`:
`{ "39": { "seasonType": "Fall", "days": 60 }, "40": { "seasonType": "Winter", "days": 30 } }`).
A season with no entry follows the rotation (`seasons.json` order) and `phases.onSeason`
(90 days). Fall to Fall changes no tiles (snow comes only with Winter).

## What a season change does

| Thing | Before | After |
|---|---|---|
| Players | sent home | sent home (unchanged) |
| Town copies | snow / melt | snow / melt (unchanged) |
| Valley1 / Valley2 copies | Wood pickups cleared, trees topped up, snow / melt | Wood pickups cleared, **no new trees**, snow / melt, Quest for Hope guardians put back (below) |
| Valley3 copies | as Valley1 | **every player copy deleted**: the next entry builds a fresh one from the template |
| Homesteads | snow / melt | snow / melt (unchanged) |
| Quests | **every active and completed quest emptied** | only the Quest for Hope quests reset (below); everything else kept |
| Quest for Hope | nothing | reset (below) |
| Gold Pass | reset to Free | **gone**: the Gold Pass and `accountStatus` were removed (owner 2026-11-16) |
| Season rewards | top 3 by net worth + top settlement: mail and trophies | **none** (the season log is still written) |

## The Quest for Hope reset

**Kept:** keys, skills, relationships, woken characters, every other quest and story flag.

**Reset, for every player:**
- The seven artifacts (the Oracle's Hope trade in `traders.json`, `utils/hopeArtifacts.js`) and Hope itself are taken from the backpack and the warehouse.
- `hopeFound` is emptied, so the shops that sell an artifact offer it again.
- `storyFlags.hopeReturned` is cleared, so the Oracle is back on Hope Mountain. Hope Mountain is in Valley3, so the copy is rebuilt anyway.
- `hopeGemsDropped` is kept: the 100 gems fall once, ever.
- Elbow's artifact quests are removed from active and completed, so they are offered again with their XP: the "Find" quests for an artifact or Hope (A Crown for the King, All Great Neptune's Ocean, When Churchyards Yawn, The Bell Invites Me, Out, Out, Brief Candle, Our Revels Now Are Ended, The Bird of Wonder, Such Stuff as Dreams Are Made On).
- The guardians come back. On a Valley1 / Valley2 copy's first entry of the new season, any Quest for Hope guardian or artifact pickup that the layout places and the copy lacks is put back at its layout spot, or the nearest free one. Today that means the Great Bear (Belmont 1011165), and Cerberus with the Brief Candle (1014571). An artifact pickup comes back only on a grid that also has a guardian, so the test grid 1016101 (walled in by mountains, every artifact laid out) never refills. Dungeons already reset on their own clock (the Phoenix).

## Building rules

- **Valley3: nothing can be placed** (`/action/place` and moves refuse it; the client shows the spot as blocked). Chopping, mining and collecting still work.
- **Homestead columns 0-7: nothing can be placed or moved there**, on the server and the client. What is already there stays; the new homestead template (owner, in parallel) decides what goes there.
- **Town, Valley1, Valley2:** building as on the homestead (range check already gone).

## Editing templates later

The rules above stay as they are:
- An edited template reaches a player the first time they visit that grid.
- The editor's Reset grid rebuilds every player's copy of a grid, which deletes what they built there, so use it rarely.

Next step (not for Thursday): mark what a player places (`placedBy`), so a Reset for Everyone can keep player builds.

## Checks before Thursday

1. Back up the database (`game-server/scripts/backup.js`).
2. Dry run: `node game-server/scripts/season-reset-dry-run.js` reports what the reset would change on production data and writes nothing: players, artifacts taken, quests removed, Valley3 copies deleted.
3. Test the parts on ftuetester's copies locally: the place refusals, the guardian put-back, and a Valley3 rebuild.
4. Check that the Caravan and the Harvest Fair ask for the season's goods (`seasons.json`).
