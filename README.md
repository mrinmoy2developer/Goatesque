# DYO browser reconstruction

A playable browser recreation of DYO's cooperative split-screen puzzles, using the original DYO artwork, the recovered 30-stage campaign geometry, and room-code online co-op.

## Run

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
- Space locks both cameras in local mode, or your own camera online.
- Q rewinds about three seconds; E swaps cameras; R restarts; Escape pauses.
- Tab changes which minotaur WASD controls for solo play. Touch controls include a character selector.
- Online: choose Play online → Create a room → copy invite. Your friend opens the link and joins. Either movement key set controls your own character. Host remains the simulation authority and chooses stages; host menus pause both views.

The server stores the latest state and inputs in a short-lived room. Independent action counters preserve jump/lock/door/restart requests between polls; motion counters retain short taps. Guest prediction is reconciled with host snapshots. Keep the host's browser tab active. This implementation uses an HTTPS relay, so Tailscale is optional and is not configured.

## Verification

```sh
node --test tests/engine.test.mjs
npx tsc --noEmit
npm run build
```

The engine tests cover all campaign spawns, movement, jump trajectory, portal clipping, unequal-view scaling, gates, suspended blocks, and one-shot restarts. Two-browser tests additionally exercised room creation/join, remote movement, locking, stage changes, restart, third-player rejection, and token checks.

Read [REVERSE_ENGINEERING.md](REVERSE_ENGINEERING.md) for provenance and fidelity limits. This is an independent reconstruction, not an official DYO release. The original DYO artwork is credited to Team DYO. The original game executable, music recordings, and recovered source code are not served by this site.

## Original artwork

`public/game/assets/manifest.json` describes 821 original PNG sprite frames from 131 sprites, packed losslessly into 12 atlases. Sprite origins, all five themes, native scenery placement, character animation timing, and architectural edge selection come from the analyzed release. Every packed frame was compared pixel for pixel against the exported PNG. The original EBGaramond font is accompanied by its SIL license.

To regenerate the atlases from UndertaleModTool sprite exports (Pillow required):

```sh
python scripts/pack-dyo-assets.py /path/to/export /path/to/output
```

The export directory must contain `metadata.json` with sprite dimensions/origins and a `Sprites/` folder of numbered PNG frames. Pack into a research directory, then copy the content-addressed atlases and manifest into `public/game/assets/`. `render-map.json` records the recovered visual mappings. Original artwork remains Team DYO's work; this reconstruction does not provide a new license to those assets.
