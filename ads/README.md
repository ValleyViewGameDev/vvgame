# ads/: advertising assets for Secrets of Elsinore

Stills and videos for social posts and paid ads. The plan that says what to make is
`docs/social-video-plan.md` (backlog item BL-26).

```
ads/
├── brand/                  logo, key art, end card, fonts used in ads (SoELogo.png copied from art/logos)
├── copy/                   one text file per post: caption, hashtags, tagged link (v01-zoom.md, ...)
├── stills/
│   ├── raw/                screenshots exactly as captured, full resolution, never edited
│   └── final/
│       ├── 9x16_1080x1920/   TikTok, Reels and Stories stills
│       ├── 4x5_1080x1350/    Instagram and Facebook feed
│       ├── 1x1_1080x1080/    square feed and ad placements
│       └── 16x9_1920x1080/   link previews, forum posts, YouTube
└── video/
    ├── raw/<video>/        screen recordings as captured, one folder per planned video   (not in git)
    ├── selects/            the trimmed good takes pulled from raw                        (not in git)
    ├── audio/
    │   ├── music/          licensed tracks only; keep the licence note beside each file
    │   ├── sfx/
    │   └── voiceover/
    ├── project/            editor project files (CapCut / DaVinci Resolve)               (not in git)
    ├── final/              finished 1080x1920 MP4s, the files that get uploaded
    └── thumbnails/         cover frames, 1080x1920
```

## File names

- Raw recording: `v02-farming_take03_2026-11-14.mov`
- Raw screenshot: `still_homestead-fall_2026-11-14_01.png`
- Finished video: `soe_v02-farming_9x16_a.mp4` (`a`, `b`, `c` = versions with a different hook or caption)
- Finished still: `soe_homestead-fall_4x5_a.png`

## Rules

- `video/raw/`, `video/selects/` and `video/project/` are in `.gitignore`: screen recordings are
  hundreds of megabytes each and a push to `main` is a deploy. Back them up outside git.
- Finished files in `video/final/` are small enough to commit, but only commit the ones that were
  actually posted.
- Upload the file from `video/final/` to every platform. Never download a posted video from one
  platform and re-upload it to another: it carries that platform's watermark.
- Record from `ftuetester`, never from Oberon.
