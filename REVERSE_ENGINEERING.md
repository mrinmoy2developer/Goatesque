# Goatesque analysis and reconstruction

Target: the official free Windows DYO release from [Team DYO on itch.io](https://josia-roncancio.itch.io/dyo), upload `1536745`. The ZIP is 278,668,574 bytes with SHA-256 `5c85ac4c17c95db84239f26e12675448c7673336b26acfacee0db66772d0b2bc`.

## Tools actually used

[Reverse Engineer Anything](https://github.com/morluto/rea), npm `rea-agents@6.8.0`, running under Node 26.12.1, inspected the original ZIP inventory and the Windows executable's PE imports. Its JSON evidence is retained outside the published checkout at `../research/rea/`. REA does not understand GameMaker's `data.win`; that unsupported result is also retained. No global Codex/MCP configuration was changed.

A small local parser decoded the GameMaker FORM chunks, VM instruction references, room declarations, and `.dlf` numeric grids. Focused readings were then verified using [UndertaleModTool](https://github.com/UnderminersTeam/UndertaleModTool) CLI 0.9.2.0. Local original binaries, recovered disassemblies, tool packages, and detailed findings remain under `../research/`; they are excluded from this site's Git repository and deployment.

## Workflow and retained outputs

1. **Acquire and identify the artifact.** Download the official Windows ZIP from [itch.io](https://josia-roncancio.itch.io/dyo), inventory it, and record its SHA-256 before interpreting its contents. The [Steam listing](https://store.steampowered.com/app/791470/DYO/) is also linked as an original-game reference; the analyzed binary came from itch.io.
2. **Triage with REA.** The retained operations are `inspect_artifact` for the ZIP and `inspect_pe_imports` for `DYO.exe`. The latter identifies an x86 PE runner. The separate `data.win` attempt returns `unsupported_target`; REA was not a GameMaker decompiler in this workflow.
3. **Read the GameMaker container.** The local `inspect_vm.py` research script walks FORM chunks, instruction words, and named VARI/FUNC reference chains. It reads data statically and never executes target instructions. This exposed the gameplay assignments and calls needed to interpret the relevant mechanics.
4. **Recover rooms and grids.** `parse_levels.py` decodes external `.dlf` hex payloads, converts column-major grids into row-major JSON, and retains object declarations. `parse_campaign.py` joins native ROOM data to the external levels. Subsequent UI/ending research corrected the campaign to the implemented 31 rooms behind 30 map nodes, including the playable credits room.
5. **Cross-check focused entries.** UndertaleModTool CLI 0.9.2.0 decompiled selected gameplay, camera, gate, rewind, input, and menu entries. Comparing these with the custom decoder corrected details such as the order of gravity and jump assignment, suspended blocks, camera ownership, and transition thresholds. This was targeted static verification, not an original-runtime playthrough.
6. **Export and package media.** UndertaleModTool exported sprites and metadata. The included [atlas packer](scripts/pack-dyo-assets.py), using Python and Pillow, generated browser atlases while retaining frame pixels and origins. Crops were compared as RGBA data against the exports. FFmpeg supplied selected AAC audio transcodes. The README's [promotional GIFs](docs/media/SOURCES.md) are a separate, attributed documentation conversion from the Steam listing.
7. **Write the browser implementation.** New JavaScript implements simulation, clipped seam collisions, camera transforms, menus, transitions, and history. Canvas composes the recovered artwork. Touch controls, fullscreen behavior, invitations, and server-authoritative online co-op are browser additions.
8. **Validate the reconstruction.** Node tests check layouts, constants, collision/camera behavior, gates, rewind, snapshots, and input isolation. Playwright checks menus and real two-client browser flows, plus simulated latency, reordered HTTP responses in the earlier transport, WebSocket outages, and mobile controls. These establish implementation behavior, not complete equivalence to the original executable.

The three custom decoders and original/decompiled material remain in the sibling local `research/` tree. They are described here for provenance, but are not included as runnable files in this published checkout.

| Published artifact | What it preserves or implements |
| --- | --- |
| [`levels.json`](public/game/levels.json) | Collision grids, spawns, view sizes, gates, blocks, and campaign rooms |
| [`render-map.json`](public/game/assets/render-map.json) | Sprite/theme mappings and native scenery placement |
| [`ui-layout.json`](public/game/assets/ui-layout.json) | Menu positions, campaign prerequisites, and UI/transition data |
| [`controls.json`](public/game/assets/controls.json) | Recovered keyboard/gamepad bindings and glyph mappings |
| [`assets/manifest.json`](public/game/assets/manifest.json) | Atlas locations, sprite dimensions/origins, frame rectangles, and hashes |
| [`audio/manifest.json`](public/game/audio/manifest.json) | Selected original music and sound-effect mappings |
| [`engine.mjs`](public/game/engine.mjs) / [`renderer.mjs`](public/game/renderer.mjs) | New browser simulation and Canvas rendering code |
| [`tests/`](tests/) | Regression checks for reconstructed behavior and online synchronization |

## Direct observations used

- 60 Hz simulation; gravity .8; fall cap20; horizontal acceleration1.4; velocity cap10.2; friction .8 each frame; jump velocity -18; player collision mask56×94.
- 64-pixel world grid; camera follow factor .3; focus ratios .5 and20/33; camera lock snapping; separate occupied-pane and owned-camera identities.
- Both cameras must lock before crossing. A seam portal transforms position, velocity, and physical size according to the ratio of view dimensions. A body straddling the seam checks clipped geometry in both worlds.
- Original campaign ordering: 30 map nodes covering31 gameplay rooms, using25 external layouts and6 native room declarations including the playable credits ending. The first node contains both introduction rooms. Four extra external files are outside the main campaign.
- Single and two-character gates; suspended sliding blocks; camera-dependent walls; combined-weight breakable groups; intro fall progression.

The browser engine is newly written JavaScript. Numeric grids and dimensions are serialized in `public/game/levels.json`; the renderer draws original sprite frames extracted from the analyzed release, preserving their pixels and origins. `ui-layout.json` and `controls.json` record the recovered menu positions, progression dependencies, input mappings, transition constants, and control-help glyphs. Online room controls and touch buttons are browser additions.

The title screen uses the original paired stone heads and blinking confirmation glyph. Input setup uses the original background and four tiles. The scrolling level map preserves its30 nodes, number images, utility icons and prerequisite branches. The original first two introductions used one shared camera; this browser version deliberately shows both panes in every room, at the user's request. Completion waits at fade1.2 for confirmation and then returns to the map; the first intro advances automatically. Menu transitions change rooms at fade1.9 and open over20 simulation frames. The final playable credits room aligns two camera-bound gate halves, accepts three unlock presses per player and fades to white before returning to the title.

Floor debris and dust use deterministic motion with original floor/particle sprites. Their break timestamps and the exit-door frames are part of synchronized, rewindable world state. Exits remain visible for12frames after closing before completion. These effects approximate the original GameMaker particle systems. The introductory floor collapse uses the recovered15-pixel fall-speed cap and original break sound. Rewind stops at its earliest saved state instead of alternating forward and backward at the history boundary.

## Fidelity limits

This is a playable reconstruction, not a byte-for-byte port. The original Windows game was not run here for matched side-by-side behavioral validation. Tests verify the reconstructed system, not equivalence to the original executable. All31 room layouts load, but every original puzzle solution has not been completed end to end.

Native room rectangles are normalized onto the64-pixel grid. Intro cinematic trigger/zoom details, the complete shader/particle pipeline and carry/push corner cases remain approximate. Movable-block contact and fading-wall clipping are approximations. Held rewind restores a bounded history of up to1800 movement snapshots, with the recovered accelerating rate; it is not a replay of the original VM. Standard gamepad mappings are implemented and tested with synthetic inputs, but physical controllers have not been checked. Editor/Workshop and achievements are omitted. Selected original effects and title/map music are included, rather than the complete original score. Online play now uses the protocol-3 authoritative Node server on Ludia. Each browser predicts only its own character; WebSockets carry 60 Hz delta input delivery and 30 Hz state updates, with SSE/HTTP fallbacks. Remote rendering uses an adaptive 50–140 ms buffer, bounded cubic interpolation, and limited extrapolation. Shared physics and history stay on the server. The older Sites/D1 copy is retained for reference and is not the current multiplayer backend. Network delay and browser scheduling can still affect play.

An earlier, HTTP-transport two-browser flat-corridor experiment added a repeating20–110ms delay to synchronization requests. Over roughly3seconds of steady guest movement, the prior client produced12 backward player/camera frames (maximum56.4world pixels); the updated client produced zero. This is a controlled jitter regression check, not a guarantee for every connection or device. Unit tests separately verify that correction smoothing never changes simulation positions and resets on seam crossings, locking, rewind, restart, gate entry and large teleports.

## Original artwork update

UndertaleModTool exported the original raster sprites. `scripts/pack-dyo-assets.py --include-ui` packs900 frames from155 sprites into18 PNG atlases, without resizing, filtering, recoloring, or quantization. Every atlas crop was checked byte for byte as RGBA against its original exported PNG. The manifest retains sprite origins, dimensions, frame rectangles, page SHA-256 hashes, and the original artifact digest.

The renderer uses the original idle/walk/jump/fall/carry/push frames, gate frames, five wall and background themes, columns, statues, blocks, torch images, fog/light images, and split-screen border images. The original font is included with its SIL license. Native theme choices and scenery placements were corrected from the visual analysis.

The original builds randomized wall/background mosaics each run. This renderer uses a deterministic mosaic with the same source artwork and architectural neighborhood rules, so different sessions share a stable appearance. Background surfaces repeat over a smaller area to bound memory. The added online dialog and mobile touch controls use browser styling. Original asset pixels are verified; full pixel-identical rendering of the Windows game is not claimed.

## Protocol2 synchronization correction

The initial guest replay advanced the whole world with a stale host input and truncated its unacknowledged history to24frames. Combined with host movement catch-up counters, this could replay jumps or make controls appear coupled under long latency. Protocol2 uses sequenced, epoch-scoped input frames with explicit consumed-frame acknowledgments. Guest prediction uses an isolated body/camera copy and never moves the other player, pushes shared blocks, advances the global clock, or adds rewind history. Relay packet guards and ordered response delivery prevent stale updates replacing new releases. A stream handshake cancels old commands on a stall/reconnect; requests are bounded to3 in flight and batches to180 frames.

Two-browser checks added180–600ms request/response delays and reordering, followed by a1.8second outage. A single jump stayed single; guest WASD moved only red, host arrows moved only white, releases remained stopped, and reconnecting did not replay abandoned commands. These checks address the supplied video pattern; they cannot guarantee low latency on every international route.

## Current online implementation and validation

Protocol 3 moved world authority from the host browser to Ludia to remove competing host/guest physics clocks. Each player has a separate sequenced command stream; missing input never inserts unacknowledged body steps. A small input buffer and bounded catch-up batches absorb jitter without advancing shared animations more than once per world tick. Both devices render both panes, including the introductions.

WebSockets replaced repeated synchronization requests as the preferred transport. Reliable socket messages send new commands once; the complete unacknowledged history is retained for local reconciliation and reconnects. Fractional-frame local rendering, adaptive remote interpolation, and camera extrapolation change presentation without changing authoritative physics, gates, or rewind history. See [the networking implementation](public/game/network.mjs), [presentation code](public/game/network-presentation.mjs), and [deployment notes](deploy/ludia/DEPLOYMENT.md).

A short matched test with an added 240 ms RTT measured peer input-to-visible-motion at approximately 435 → 382 ms and input traffic about 15% lower after client latency tuning. The current 64-test suite and two-browser checks cover isolated controls, one jump per press, shared rewind, level changes, host-rendering pauses, and recovery from a 2.6-second message outage. These are controlled regression results, not a promise of a particular latency on an international connection.
