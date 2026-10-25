# README media sources

## Goatesque screenshots

The six PNGs in [`screenshots/`](../../screenshots/) were supplied for this project and are used without editing. They show the browser reconstruction; the underlying artwork is credited to Team DYO / Josia Roncancio.

| File | View |
| --- | --- |
| `image2.png` | Title screen |
| `image1..png` | Campaign map |
| `image3.png` | Input selection |
| `image4.png` | Online room creation/join dialog |
| `image5.png` | Rewind with both panes visible |
| `image6.png` | Split-screen puzzle room |

## Original DYO promotional loops

Source: [DYO on Steam](https://store.steampowered.com/app/791470/DYO/), as returned by the [official Steam app-details endpoint](https://store.steampowered.com/api/appdetails?appids=791470&l=english). Retrieved 2026-10-26 (Asia/Kolkata).

The Steam description embeds these loops as WebM/MP4 videos. The GIFs in this folder are conversions of the complete WebM loops, not original GIF downloads or Goatesque recordings. They preserve the sequence, use 15 fps at 512 pixels wide, and loop continuously. The original artwork and footage remain the work of Team DYO / Josia Roncancio; inclusion here does not assign a new license to them.

### `dyo-split-screen.gif`

- Original video: [Steam CDN loop 1](https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/791470/extras/01b227d1bb6bec64d4bdbae4357ebb25.webm?t=1782483744).
- Original SHA-256: `c4dc56fc36acc9b7fc3ceefa70e2428727c1bf8d58702ea8876d4e3cbca5dc99`.
- GIF SHA-256: `3998506f5692b995c2794b60eeca69dee12201b7a6a2211703fd9985b652d012`.
- GIF size: 4,129,471 bytes; 512 × 288; 96 frames; approximately 6.40 seconds.

### `dyo-cooperative-puzzle.gif`

- Original video: [Steam CDN loop 2](https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/791470/extras/8f69e2447a631b1c959eae5773066c72.webm?t=1782483744).
- Original SHA-256: `f2b775aac1371b1a52d38f7d730b288e02f628b819f6dd570d1cf38ada460675`.
- GIF SHA-256: `1d7fdd44a026c56fc7f19fbbab2e541248836d40ebbb0e7c7aed8cd5da8fa841`.
- GIF size: 2,345,528 bytes; 512 × 288; 63 frames; approximately 4.20 seconds.

## Conversion command

The same conversion was applied to each complete source loop:

```sh
ffmpeg -i INPUT.webm \
  -filter_complex "[0:v]fps=15,scale=512:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=192:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=3" \
  -loop 0 OUTPUT.gif
```

Source videos are kept only in ignored local build/research output, not bundled with these README assets.
