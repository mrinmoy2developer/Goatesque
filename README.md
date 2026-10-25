# Goatesque

Goatesque is a playable browser recreation of DYO's cooperative split-screen puzzles, using original artwork, menu and map assets, 31 gameplay rooms behind the original 30 level-map nodes, and room-code online co-op.

## Ludia hosting

The production name is **Goatesque**, with planned URL `https://goatesque.mrinmoy.org`. The original source artwork and Team DYO credit remain attributed to their creators.

Build a dependency-free deployment on your Mac:

```sh
node scripts/build-standalone.mjs
python3 outputs/goatesque/relay.py --public outputs/goatesque/public --port 8792
```

The standalone build uses the same page, styles, engine and assets as the framework build. Ludia runs Python's standard library, with nginx serving static files and proxying `/api/rooms` and `/api/health`. Rooms live in bounded memory and disappear on service restart. No database or Node runtime is needed there. The user service has `MemoryHigh=64M`, `MemoryMax=96M`, no swap allocation, and `CPUQuota=25%` (one quarter of a CPU).

See [deploy/ludia/README.md](deploy/ludia/README.md) for DNS, activation and service commands. Build output is under ignored `outputs/goatesque/`; original research and recovered executable/source are excluded.

## Framework development and existing Sites copy

```sh
npm ci
npm run dev -- --port 5173
```

Local multiplayer works immediately. Online rooms use the Sites-provisioned Cloudflare D1 binding `DB`. For a fresh local database:

```sh
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_redundant_lake.sql
```

Apply that migration once per local database. Hosted migrations are applied during deployment.

## Play

- Player 1: A/D move, W jump, S lock camera, F enter/leave a door.
- Player 2: arrows move/jump/lock, Enter enters/leaves a door.
- Hold Q (white) or Shift (red) to rewind both characters. Hold E and Ctrl together to exchange screens when both players are grounded. These abilities unlock at their original campaign points.
- Both panes are visible on both devices in every room, including the introductions. Collapsing floors animate falling stone and dust; exits finish closing before the completion transition. These animation states restore when rewinding.
- Space swaps the two keyboard movement/action sets in local play; F and Enter remain the respective doorway controls. Escape returns to the level map with the original stone-head transition.
- Arrows navigate menus; Space/Enter confirms. New saves begin with the original four input choices. Standard browser gamepads support shared controller, two controllers, or controller plus keyboard. Touch controls include a character selector.
- The Touch toggle enables thumb controls for movement, jump, lock, doorway, held rewind and screen exchange. Online controls always operate your own character; local play has a White/Red selector. Local touch screen exchange operates both switch controls together. The full-screen button is always available. Browsers without element fullscreen can launch the game from a Home Screen shortcut; portrait and landscape layouts respect safe areas.
- Completion closes the stone heads and waits for Space/Enter/Up, then returns to the map. R restarts while this completion screen is waiting. The first introduction advances automatically to the second.
- Online: choose Online co-op → Create a room → copy invite. Your friend opens the link and joins. Either movement key set controls your own character. Host remains the simulation authority and chooses levels; menus and transitions synchronize between browsers. Either player can confirm completion or return to the map.

The server stores the latest state and inputs in a short-lived room. Independent action counters preserve jump/lock/door/restart requests between polls; motion counters retain short taps. The relay polls at a target20Hz and sends input changes promptly without overlapping requests. Guest prediction is reconciled with fresh host snapshots; duplicate revisions are ignored. Small visual position/camera/block corrections ease out over roughly90ms without changing physics, while portals, locking, rewind, gate entry and restarts reset smoothing immediately. Guest walk animations use a stable visual clock. Keep the host's browser tab active. This implementation uses an HTTPS relay, so Tailscale is optional and is not configured.

## Verification

```sh
node --test tests/*.test.mjs
npx tsc --noEmit
npm run build
```

The tests cover all 31 room spawns, movement, jump trajectory, portal clipping, unequal-view scaling, gates, suspended blocks, held rewind, cooperative screen switching, tutorial unlocks, shared intro cameras, the playable ending, map prerequisites, transition timings, and synthetic gamepad input. Two-browser checks additionally exercised menu flow, keyboard swapping, room creation/join, remote movement, locking, level changes, completion confirmation, map return, third-player rejection, and token checks. Physical gamepads have not been tested.

Read [REVERSE_ENGINEERING.md](REVERSE_ENGINEERING.md) for provenance and fidelity limits. This is an independent reconstruction, not an official DYO release. Original artwork, interface, music and sound effects are credited to Team DYO. The original executable and recovered source code are not served by this site.

## Original artwork

`public/game/assets/manifest.json` describes 900 original PNG sprite frames from 155 sprites, packed losslessly into 18 atlases. This includes the original title and completion heads, input-selection tiles, scrolling level map, number glyphs, control panels, and playable credits artwork. The original input background is included separately. Sprite origins, all five themes, native scenery placement, character animation timing, and architectural edge selection come from the analyzed release. Every packed frame was compared pixel for pixel against the exported PNG. The original EBGaramond font is accompanied by its SIL license. Selected original sound effects and title/map music are AAC transcodes of the recovered audio.

To regenerate the atlases from UndertaleModTool sprite exports (Pillow required):

```sh
python scripts/pack-dyo-assets.py /path/to/export /path/to/output --include-ui
```

The export directory must contain `metadata.json` with sprite dimensions/origins and a `Sprites/` folder of numbered PNG frames. Pack into a research directory, then copy the content-addressed atlases and manifest into `public/game/assets/`. `render-map.json` records the recovered visual mappings. Original artwork remains Team DYO's work; this reconstruction does not provide a new license to those assets.
