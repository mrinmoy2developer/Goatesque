#!/usr/bin/env python3
"""Update Goatesque's user-owned files without restarting active online rooms."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import tempfile
import time


def digest(path):
    result = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            result.update(chunk)
    return result.hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('public', type=Path)
    args = parser.parse_args()
    source = args.public.resolve()
    assert (source / 'index.html').is_file(), 'Missing source index'
    root = Path('/var/www/goatesque/current').resolve()
    assert root.is_relative_to('/var/www/goatesque/releases'), 'Unexpected nginx target'
    targets = [root, (Path.home() / 'goatesque/current/public').resolve()]
    plan = []
    for label, target in enumerate(targets):
        for src in source.rglob('*'):
            if not src.is_file():
                continue
            assert not src.is_symlink(), 'Symlink in deployment source'
            relative = src.relative_to(source)
            dest = target / relative
            if dest.is_file() and digest(src) == digest(dest):
                continue
            assert not dest.is_symlink(), 'Symlink in deployment destination'
            if dest.exists():
                assert dest.is_file() and os.access(dest, os.W_OK), 'File is not writable: %s' % relative
            else:
                parent = dest.parent
                while not parent.exists():
                    parent = parent.parent
                assert os.access(parent, os.W_OK), 'Parent is not writable: %s' % relative
            plan.append((label, src, dest, relative))
    backup = Path.home() / 'goatesque/backups' / time.strftime('%Y%m%dT%H%M%SZ', time.gmtime())
    backup.mkdir(parents=True, exist_ok=False)
    for label, src, dest, relative in plan:
        if dest.exists():
            saved = backup / str(label) / relative
            saved.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(dest, saved)
    # Modules/assets first; the HTML entry point is written last.
    plan.sort(key=lambda item: item[3].as_posix() == 'index.html')
    for label, src, dest, relative in plan:
        dest.parent.mkdir(parents=True, exist_ok=True)
        if os.access(dest.parent, os.W_OK):
            with tempfile.NamedTemporaryFile(dir=dest.parent, delete=False) as stream:
                temporary = Path(stream.name)
                with src.open('rb') as incoming:
                    shutil.copyfileobj(incoming, stream)
                stream.flush()
                os.fsync(stream.fileno())
            temporary.chmod(0o644)
            temporary.replace(dest)
        else:
            # Root owns the entry-point directory; these existing files belong
            # to the deployment user. Every prior version was backed up above.
            with src.open('rb') as incoming, dest.open('wb') as output:
                shutil.copyfileobj(incoming, output)
                output.flush()
                os.fsync(output.fileno())
        assert digest(src) == digest(dest), 'Deployment verification failed'
    report = {'backup': str(backup), 'updated': [{'target': label, 'path': str(relative), 'sha256': digest(dest)} for label, src, dest, relative in plan]}
    (backup / 'deployment.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report))


if __name__ == '__main__':
    main()
