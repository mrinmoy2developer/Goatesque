#!/usr/bin/env bash
set -euo pipefail
if [[ ${EUID} -ne 0 ]]; then
    echo 'Run with sudo: sudo bash /home/mrinmoy/goatesque/current/activate-public.sh' >&2
    exit 1
fi
app=/home/mrinmoy/goatesque/current
domain=goatesque.mrinmoy.org
release=$(basename "$(readlink -f "$app")")
destination=/var/www/goatesque/releases/$release
conf=/etc/nginx/conf.d/goatesque.nginx.conf
curl --fail --silent http://127.0.0.1:8792/api/health
echo
if [[ -e "$conf" ]]; then
    cp -a "$conf" "$conf.backup.$(date +%Y%m%d%H%M%S)"
fi
install -d -m 755 /var/www/goatesque/releases "$destination"
cp -a "$app/public/." "$destination/"
find "$destination" -type d -exec chmod 755 {} +
find "$destination" -type f -exec chmod 644 {} +
if command -v restorecon >/dev/null; then restorecon -R /var/www/goatesque; fi
ln -sfn "$destination" /var/www/goatesque/current
install -m 644 "$app/goatesque.nginx.conf" "$conf"
nginx -t
systemctl reload nginx
echo "HTTP route ready for $domain. Requesting HTTPS (DNS must already point here)."
certbot --nginx -d "$domain" --redirect
nginx -t
systemctl reload nginx
curl --fail --silent "https://$domain/api/health"
echo
echo "Goatesque is live at https://$domain"
