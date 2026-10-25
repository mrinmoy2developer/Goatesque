# DYO browser reconstruction

A playable browser recreation of DYO's cooperative split-screen puzzles, with original Canvas artwork, the recovered 30-stage campaign geometry, and room-code online co-op.

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

- Ember: A/D move, W jump, S lock camera, F enter/leave a door.
- Ivory: arrows move/jump/lock, Enter enters/leaves a door.
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

Read [REVERSE_ENGINEERING.md](REVERSE_ENGINEERING.md) for provenance and fidelity limits. This is an independent reconstruction, not an official DYO release. No original artwork, sound recordings, fonts, executable, or decompiled source is served by this site.
