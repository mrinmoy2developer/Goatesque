# Goatesque deployment status — 2026-10-26

Production: https://goatesque.mrinmoy.org. HTTPS, DNS and nginx routes are active. The original base release remains selected by `~/goatesque/current`; verified updates are applied to its user-owned files and the matching nginx static tree.

The latest update archive is `~/goatesque/goatesque-authority-final.tar.gz`, SHA-256 `e40f2d565a1d4cb7fec4fab6f9fcd82c1450bb66e9ea3b976129046afb86c26f`, staged at `~/goatesque/updates/e40f2d565a1d`. Health returns `{"ok":true,"game":"Goatesque","protocol":3,"simulation":"server"}`.

The dependency-free Node 16 server owns shared worlds at 60 Hz. Both browsers predict their own character and replay unacknowledged commands. Missing input cannot add unacknowledged gravity/friction steps. After jitter, queues drain in batches of at most four body commands per player; shared animation/time advances once per server tick. Shared action boundaries remain ordered. Menus and level selection belong to the room creator.

`goatesque.service` binds to 127.0.0.1:8792, with 96 MiB hard memory, 80 MiB soft pressure, zero swap, 25% of one CPU, 32 tasks, a 40 MB Node heap and at most four rooms. An initial four-room simulation benchmark used about 67 MiB RSS and 2.3% of one core. An early two-browser public test used about 61 MiB RSS; these are bounded observations rather than a long-duration capacity guarantee.

Validation: 54 JavaScript tests cover authority, ownership, exact prediction/reconciliation through delivery gaps, bounded backlog drainage, stream baselines, gates, shared rewind, and startup through the actual release-symlink structure. Local two-browser checks passed with 180–600 ms delays, response reordering, a 2.6-second outage, isolated movement, single-jump replay, host rendering suspension, original floor/door animations, guest completion/map return, both panes, and mobile touch/fullscreen.

Rollback backups: `~/goatesque/backups/20261025T192342Z` contains pre-authority static files and the Python service unit. `~/goatesque/backups/20261025T193025Z` contains the previous server and the static files changed by the final batching update. The original Python relay remains available only with its matching protocol-2 client. Starting Node through the release symlink is covered by a regression test. The final controller-only tolerance update is backed up at `~/goatesque/backups/20261025T193243Z`. Both clients must refresh and create a new room after the protocol change.

Only Goatesque's service was restarted. At the user's previous request, MinIO remains stopped with its data preserved. Other services were not changed.

Final public HTTPS verification passed in two browsers with injected guest latency: protocol 3, both panes, one jump per press, independent controls, guest movement while host rendering was suspended, level changes, shared rewind, guest map requests and zero browser runtime errors. All three served game modules matched local source byte for byte. Temporary local preview and QA listeners were stopped after testing.

## Realtime transport update — 2026-10-26

Archive: `~/goatesque/goatesque-realtime.tar.gz`, SHA-256 `ea1b5dd5da150f25938f460d1e14cc7615d27b82516959e81fe54a276f12d265`. Backup: `~/goatesque/backups/20261025T202117Z`. The private server includes ws 8.22.0, its MIT license and verified npm integrity. Existing service limits are unchanged.

WebSocket input and state channels, server-sent event fallback, input jitter buffering, remote snapshot interpolation and independent uplink-stall handling are deployed. Public WebSocket activation requires the root-only command in the main README; the SSE fallback is already available. The nginx activation script checks the current virtual-host digest, backs up only that file, adds a separate WebSocket location, retains Certbot TLS configuration, tests/reloads nginx and rolls back on failure. No DNS or new public ports are required.

58 JavaScript tests pass. Under a private 210–360 ms RTT proxy, polling delivered approximately 7–8 state updates per second; SSE and WebSockets delivered about 30. During the measured steady-walk section, WebSockets rendered at 60 FPS on both clients with zero frozen or backward frames. This is a controlled short-run measurement, not a guarantee for every internet connection. WebSocket ownership, one-jump-per-press and recovery from a 2.6-second message outage passed separately. Existing floor/door, completion, map, rewind, touch and fullscreen browser checks passed with WebSockets.

The final compact-receipt/adaptive-fallback update was additionally verified by all 58 tests. Two browsers passed full gameplay checks through the temporary nginx WebSocket route and through public HTTPS using SSE fallback. Public nginx remains unchanged until the user runs the sudo activation script.
