# Analysis and reconstruction

Target: the official free Windows DYO release from [Team DYO on itch.io](https://josia-roncancio.itch.io/dyo), upload `1536745`. The ZIP is 278,668,574 bytes with SHA-256 `5c85ac4c17c95db84239f26e12675448c7673336b26acfacee0db66772d0b2bc`.

## Tools actually used

[Reverse Engineer Anything](https://github.com/morluto/rea), npm `rea-agents@6.8.0`, running under Node 26.12.1, inspected the original ZIP inventory and the Windows executable's PE imports. Its JSON evidence is retained outside the published checkout at `../research/rea/`. REA does not understand GameMaker's `data.win`; that unsupported result is also retained. No global Codex/MCP configuration was changed.

A small local parser decoded the GameMaker FORM chunks, VM instruction references, room declarations, and `.dlf` numeric grids. Focused readings were then verified using [UndertaleModTool](https://github.com/UnderminersTeam/UndertaleModTool) CLI 0.9.2.0. Local original binaries, recovered disassemblies, tool packages, and detailed findings remain under `../research/`; they are excluded from this site's Git repository and deployment.

## Direct observations used

- 60 Hz simulation; gravity .8; fall cap20; horizontal acceleration1.4; velocity cap10.2; friction .8 each frame; jump velocity -18; player collision mask56×94.
- 64-pixel world grid; camera follow factor .3; focus ratios .5 and20/33; camera lock snapping; separate occupied-pane and owned-camera identities.
- Both cameras must lock before crossing. A seam portal transforms position, velocity, and physical size according to the ratio of view dimensions. A body straddling the seam checks clipped geometry in both worlds.
- Original campaign ordering: 30 rooms, using25 external layouts and5 native room declarations. Four extra external files are outside the main campaign.
- Single and two-character gates; suspended sliding blocks; camera-dependent walls; combined-weight breakable groups; intro fall progression.

The browser engine is newly written JavaScript. Numeric grids and dimensions are serialized in `public/game/levels.json`; the renderer now draws original sprite frames extracted from the analyzed release, preserving their pixels and origins. Stage display names and interface text are new.

## Fidelity limits

This is a playable reconstruction, not a byte-for-byte port. The original Windows game was not run here for matched side-by-side behavioral validation. Tests verify the reconstructed system, not equivalence to the original executable. All30 stage layouts load, but every original puzzle solution has not been completed end to end.

The first two original shared-camera introductions use split views here. Native room rectangles are normalized onto the64-pixel grid. Cinematic triggers, controller mapping, editor/Workshop, achievements, original audio and the complete shader/particle pipeline, the complete carry/push corner cases, and continuous original rewind behavior are not reproduced. Rewind restores a recent snapshot. Movable-block contact and fading-wall clipping are approximations. Online play uses an HTTPS/D1 relay at up to10 state exchanges per second with client prediction; it is not a low-latency WebSocket service. Network delay and host-tab suspension affect play.

## Original artwork update

UndertaleModTool exported the original raster sprites. `scripts/pack-dyo-assets.py` packs 821 frames from 131 in-game sprites into 12 PNG atlases, without resizing, filtering, recoloring, or quantization. Every atlas crop was checked byte for byte as RGBA against its original exported PNG. The manifest retains sprite origins, dimensions, frame rectangles, page SHA-256 hashes, and the original artifact digest.

The renderer uses the original idle/walk/jump/fall/carry/push frames, gate frames, five wall and background themes, columns, statues, blocks, torch images, fog/light images, and split-screen border images. The original font is included with its SIL license. Native theme choices and scenery placements were corrected from the visual analysis.

The original builds randomized wall/background mosaics each run. This renderer uses a deterministic mosaic with the same source artwork and architectural neighborhood rules, so different sessions share a stable appearance. Background surfaces repeat over a smaller area to bound memory. The outer browser interface remains custom. Original asset pixels are verified; full pixel-identical rendering of the Windows game is not claimed.
