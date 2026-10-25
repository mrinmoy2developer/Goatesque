# Goatesque on Ludia

DNS record (DNS-only initially):

| Type | Name | Value | TTL |
| --- | --- | --- | --- |
| A | goatesque | 92.4.77.163 | Auto or 300 seconds |

This creates `goatesque.mrinmoy.org`. No CNAME, AAAA, SRV, separate API hostname or new public application port is needed. Web traffic uses existing ports80/443. `/` serves the game, `/game/` its assets, `/api/rooms` the room relay and `/api/health` the health check. The room-code invitation remains a URL fragment on the same hostname.

Releases live under `/home/mrinmoy/goatesque/releases/`; the `current` symlink selects the active release. `goatesque.service` binds only127.0.0.1:8792. The system nginx serves a separately copied static release under `/var/www/goatesque/current`, with the original atlas filenames cached immutably and code/HTML revalidated.

After the A record resolves, activate public routing and HTTPS from your Mac:

```sh
ssh -t ludia 'sudo bash /home/mrinmoy/goatesque/current/activate-public.sh'
```

Sudo is required because nginx configuration and TLS certificates are owned by root. The script only installs Goatesque's static release and virtual host, checks nginx, reloads it, then uses the existing Certbot nginx plugin to obtain HTTPS and redirect HTTP. Certbot may ask for account details if no reusable account exists. An existing Goatesque nginx config is backed up before replacement.

Service commands:

```sh
ssh ludia 'systemctl --user status goatesque.service --no-pager'
ssh ludia 'systemctl --user restart goatesque.service'
ssh ludia 'systemctl --user stop goatesque.service'
ssh ludia 'systemctl --user start goatesque.service'
ssh ludia 'journalctl --user -u goatesque.service -n 40 --no-pager'
```

Verify `curl https://goatesque.mrinmoy.org/api/health` returns `{"ok":true,"game":"Goatesque"}`. An active relay remains available through SSH forwarding before DNS/nginx activation:

```sh
ssh -N -L 18792:127.0.0.1:8792 ludia
```

Then open `http://localhost:18792` on your Mac. This is a private test route and does not expose8792 publicly.

The service is capped at96MB RAM,64MB soft pressure,25% of one CPU and32tasks. It accepts at most16rooms and16simultaneous HTTP handlers; stale rooms expire after30minutes. Credentials and game-state bodies are not journaled. All graphics/physics remain in players' browsers. Host tab suspension and network latency still affect online play.

Tests:

```sh
node --test tests/*.test.mjs
python3 -m unittest discover -s tests -p 'test_*.py'
```
