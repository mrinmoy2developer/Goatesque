# Goatesque

Goatesque is a playable browser recreation of DYO's cooperative split-screen puzzles, using original artwork, menu and map assets, 31 gameplay rooms behind the original 30 level-map nodes, and room-code online co-op.

## Ludia hosting

**Goatesque** is live at `https://goatesque.mrinmoy.org`. The original source artwork and Team DYO credit remain attributed to their creators.

Build the standalone deployment on your Mac:

```sh
node scripts/build-standalone.mjs
node --max-old-space-size=40 outputs/goatesque/server.mjs --public outputs/goatesque/public --port 8792
```

The standalone build uses the same page, styles, engine and assets as the framework build. Ludia runs the Node 16+ authoritative simulation (with a pinned, bundled MIT-licensed WebSocket library), with nginx serving static files and proxying `/api/rooms` and `/api/health`. Up to four rooms live in memory and disappear on service restart. No database is needed there. The user service has `MemoryHigh=80M`, `MemoryMax=96M`, no swap allocation, and `CPUQuota=25%` (one quarter of a CPU).

See [deploy/ludia/README.md](deploy/ludia/README.md) for DNS, activation and service commands. Build output is under ignored `outputs/goatesque/`; original research and recovered executable/source are excluded.

## Framework development and existing Sites copy

```sh
npm ci
npm run dev -- --port 5173
```

Local multiplayer works immediately. Use the standalone Node server above for current online co-op. The older Sites copy and its D1 relay are retained for reference and do not support protocol 3. Its previous database setup was:

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
- Online: choose Online co-op → Create a room → copy invite. Your friend opens the link and joins. Either movement key set controls your own character. The room creator chooses levels; Ludia simulates both players. Menus and transitions synchronize between browsers. Either player can confirm completion or return to the map.

Ludia owns both players, shared physics, time, gates and world events at 60 Hz. Both browsers predict only their own character, then restore server snapshots and replay every unacknowledged input command. Player command streams, action counters and acknowledgments remain separate. If an input frame has not arrived, that player's body and camera wait; the server never inserts unacknowledged gravity or friction steps. After a jitter spike, the server drains up to four body commands per player per tick until the queue is small again. Shared animation effects still advance once per server tick; shared-action changes remain ordered. The room creator retains control of menus and level selection.

WebSockets are the primary transport: inputs and 30 Hz state updates share one persistent authenticated connection. If the proxy cannot upgrade WebSockets, a persistent server-sent event stream delivers state at 30 Hz while compact POSTs carry inputs. Ordinary HTTP polling remains a final fallback. Tokens are sent in message/request bodies, never URL parameters. Messages and buffered writes are bounded; snapshots coalesce for slow connections. No extra public application port is opened.

A four-frame input buffer (at most 80 ms to prime) absorbs short gaps. The other player's body and camera render from a 100 ms snapshot buffer with at most 60 ms extrapolation. Local movement remains predicted immediately. Teleports, gates, rewind and level changes reset interpolation. Input acknowledgement progress is monitored separately from state delivery, so a stalled uplink cannot keep replaying abandoned movement while the downlink remains alive.

The public WebSocket route is enabled on Ludia and has passed two-browser HTTPS verification. For a fresh installation, the one-time root-owned route update is prepared in `deploy/ludia/enable-websocket.py`:

```sh
ssh -t ludia 'sudo python3 /home/mrinmoy/goatesque/current/enable-websocket.py'
```

The script changes only Goatesque's virtual host, preserves TLS settings, backs up the previous file, checks nginx, reloads it, and restores the original on failure. Both browsers should refresh and create a new room after updating. Tailscale is optional and is not configured.

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
