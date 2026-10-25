# Goatesque deployment status — 2026-10-25

Installed release: `/home/mrinmoy/goatesque/releases/938d3a519ae2`, selected by `~/goatesque/current`.

Deployment archive SHA-256: `938d3a519ae226b1b742ae6398b4f52ab39dcf8526522ff7ca2a06b4833ab5a8` (verified on Ludia before extraction).

`goatesque.service` is enabled and running at127.0.0.1:8792 with96MiB hard memory limit,64MiB soft pressure,zero swap allocation,25% of one CPU and32tasks. During two-browser testing it used about14MiB with17.6MiB observed peak and zero restarts. This is a small-session observation, not a multi-room capacity benchmark.

Validation passed:

- 19 JavaScript engine/presentation/gamepad tests and3 Python relay test cases.
- Two isolated browser clients against the actual Ludia service through SSH forwarding: original menu/input/map flow, keyboard swapping, room creation/join, remote movement, both camera locks, stage changes, shared completion hold, guest confirmation/map return, third-player/token rejection, mobile fit and no browser runtime errors.
- Ludia nginx configuration syntax and temporary unprivileged HTTP test: correct JavaScript MIME, Goatesque page title, health endpoint and proxied create/join/input/state/leave flow. Temporary nginx instance stopped after the test.

Public activation remains pending: DNS `A goatesque →92.4.77.163`, followed by the sudo command in [README.md](README.md). The SSH account cannot change root-owned nginx/certificate files without a password. The public80/443 binding and TLS certificate will be verified by the activation script.

At the user's explicit request, the manually launched MinIO process was stopped gracefully. `/home/mrinmoy/minio-data` was preserved. Ports9000/9001 no longer listen. Existing wallet monitors, nginx, notification service, game relays and QuantStorm listener were kept running.
