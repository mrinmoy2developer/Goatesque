#!/usr/bin/env python3
"""Enable only Goatesque's WebSocket location; preserve its TLS and other hosts."""
import hashlib
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import time

TARGET = Path('/etc/nginx/conf.d/goatesque.nginx.conf')
EXPECTED = '8d5b190ae5d55d7b95f8bfa3b79b1a702ee02c181d147c92c9a7f5f62009e67a'
MARKER = '    location = /api/rooms/socket {'
BLOCK = '''    location = /api/rooms/socket {
        proxy_pass http://127.0.0.1:8792;
        proxy_http_version 1.1;
        proxy_set_header Host $http_host;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 75s;
        proxy_connect_timeout 2s;
        proxy_buffering off;
    }
'''

def main():
    if os.geteuid() != 0:
        raise SystemExit('Root is required to update nginx configuration.')
    original = TARGET.read_bytes()
    nginx = shutil.which('nginx') or '/usr/sbin/nginx'
    if MARKER in original.decode():
        subprocess.run([nginx, '-t'], check=True)
        print('Goatesque WebSocket route is already configured.')
        return
    if hashlib.sha256(original).hexdigest() != EXPECTED:
        raise SystemExit('Goatesque nginx configuration changed. No files were modified.')
    anchor = '    location = /api/rooms {\n'
    assert original.decode().count(anchor) == 1
    updated = original.decode().replace(anchor, BLOCK + anchor, 1)
    backup = TARGET.with_name(TARGET.name + '.before-websocket-' + time.strftime('%Y%m%dT%H%M%SZ', time.gmtime()))
    shutil.copy2(TARGET, backup)
    def replace(contents):
        with tempfile.NamedTemporaryFile(dir=TARGET.parent, delete=False) as stream:
            temporary = Path(stream.name)
            stream.write(contents)
            stream.flush()
            os.fsync(stream.fileno())
        temporary.chmod(0o644)
        temporary.replace(TARGET)
    replace(updated.encode())
    try:
        subprocess.run([nginx, '-t'], check=True)
        subprocess.run(['systemctl', 'reload', 'nginx'], check=True)
    except Exception:
        replace(original)
        subprocess.run([nginx, '-t'], check=True)
        subprocess.run(['systemctl', 'reload', 'nginx'], check=True)
        raise
    print('Goatesque WebSocket route enabled. Backup: ' + str(backup))

if __name__ == '__main__':
    main()
