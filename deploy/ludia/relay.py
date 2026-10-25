#!/usr/bin/env python3
"""Goatesque's bounded, in-memory room relay; Python 3.9+, no dependencies."""
import argparse
import hashlib
import hmac
import json
import math
import secrets
import threading
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit

MAX_BODY = 24000
ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'


class ApiError(Exception):
    def __init__(self, status, message):
        self.status, self.message = status, message


def counter(value, ceiling=10**9):
    try:
        number = float(value)
        return min(ceiling, max(0, int(number))) if math.isfinite(number) else 0
    except (ValueError, TypeError, OverflowError):
        return 0


class Rooms:
    def __init__(self, max_rooms=16, clock=time.time):
        self.rooms, self.lock, self.max_rooms, self.clock = {}, threading.Lock(), max_rooms, clock

    def request(self, body):
        if not isinstance(body, dict):
            raise ApiError(400, 'Invalid request.')
        now = int(self.clock() * 1000)
        with self.lock:
            expired = [code for code, room in self.rooms.items() if max(room['host_seen'], room['guest_seen']) < now - 1800000]
            for code in expired:
                del self.rooms[code]
            action = body.get('action')
            if action == 'create':
                if len(self.rooms) >= self.max_rooms:
                    raise ApiError(503, 'The room server is full. Please try again later.')
                code = ''.join(secrets.choice(ALPHABET) for _ in range(8))
                while code in self.rooms:
                    code = ''.join(secrets.choice(ALPHABET) for _ in range(8))
                secret = secrets.token_urlsafe(48)
                self.rooms[code] = dict(host_token=secret, guest_token=None, host_seen=now, guest_seen=0, state={}, input={}, revision=0)
                return dict(code=code, token=secret, role='host')
            code = ''.join(str(body.get('code', '')).upper().split())
            if len(code) != 8 or any(c not in ALPHABET for c in code):
                raise ApiError(400, 'Enter the 8-character room code.')
            room = self.rooms.get(code)
            if action == 'join':
                if not room or room['host_seen'] < now - 30000:
                    raise ApiError(409, 'This room is offline. Ask your friend to create a new room.')
                if room['guest_token']:
                    raise ApiError(409, 'This room already has two players.')
                secret = secrets.token_urlsafe(48)
                room.update(guest_token=secret, guest_seen=now, input={})
                return dict(code=code, token=secret, role='guest')
            if not room:
                raise ApiError(404, 'Room expired. Create a new room.')
            supplied = body.get('token', '')
            if not isinstance(supplied, str) or not supplied.isascii() or len(supplied) > 256:
                raise ApiError(403, 'Room session expired. Please rejoin.')
            host = hmac.compare_digest(supplied, room['host_token'])
            guest = bool(room['guest_token'] and hmac.compare_digest(supplied, room['guest_token']))
            if not host and not guest:
                raise ApiError(403, 'Room session expired. Please rejoin.')
            if action == 'leave':
                if host:
                    del self.rooms[code]
                else:
                    room.update(guest_token=None, guest_seen=0, input={})
                return {'ok': True}
            if action != 'sync':
                raise ApiError(400, 'Unknown room action.')
            if host:
                state = body.get('state')
                if not isinstance(state, dict) or not isinstance(state.get('players'), list) or len(state['players']) != 2:
                    raise ApiError(400, 'Invalid game state.')
                room.update(state=state, host_seen=now, revision=room['revision'] + 1)
                session = hashlib.sha256(room['guest_token'].encode()).hexdigest()[:16] if room['guest_token'] else None
                return dict(input=room['input'] if room['guest_seen'] > now - 2500 else {}, guestSession=session, connected=bool(room['guest_token'] and room['guest_seen'] > now - 5000), peerSeen=room['guest_seen'], serverTime=now)
            source = body.get('input', {})
            if not isinstance(source, dict):
                raise ApiError(400, 'Invalid input.')
            controls = {key: bool(source.get(key)) for key in ['left', 'right', 'rewind', 'switchHeld']}
            controls.update({key: counter(source.get(key)) for key in ['gate', 'jump', 'lock', 'restart', 'switch', 'confirm', 'menu']})
            controls.update({key: counter(source.get(key), 10**12) for key in ['seq', 'leftFrames', 'rightFrames']})
            room.update(input=controls, guest_seen=now)
            return dict(state=room['state'], connected=room['host_seen'] > now - 5000, revision=room['revision'], serverTime=now)


class Server(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True
    request_queue_size = 32

    def __init__(self, address, directory, max_rooms=16):
        self.directory, self.rooms = Path(directory).resolve(), Rooms(max_rooms)
        self.slots = threading.BoundedSemaphore(16)
        super().__init__(address, Handler)

    def process_request(self, request, client_address):
        if not self.slots.acquire(False):
            self.shutdown_request(request)
            return
        try:
            super().process_request(request, client_address)
        except Exception:
            self.slots.release()
            raise

    def process_request_thread(self, request, client_address):
        try:
            super().process_request_thread(request, client_address)
        finally:
            self.slots.release()


class Handler(SimpleHTTPRequestHandler):
    server_version = 'Goatesque'
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, '.mjs': 'text/javascript', '.m4a': 'audio/mp4', '.wasm': 'application/wasm'}

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(args[2].directory), **kwargs)

    def setup(self):
        self.request.settimeout(5)
        super().setup()

    def log_message(self, fmt, *args):
        # Bodies and room credentials never enter the journal.
        if len(args) > 1 and str(args[1]).isdigit() and int(args[1]) < 400:
            return
        super().log_message(fmt, *args)

    def end_headers(self):
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def json_response(self, value, status=200, head=False):
        data = json.dumps(value, separators=(',', ':'), allow_nan=False).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        if not head:
            self.wfile.write(data)

    def list_directory(self, path):
        self.send_error(404)
        return None

    def do_GET(self):
        if urlsplit(self.path).path == '/api/health':
            return self.json_response({'ok': True, 'game': 'Goatesque'})
        if not self.allowed_static():
            return self.send_error(404)
        super().do_GET()

    def do_HEAD(self):
        if urlsplit(self.path).path == '/api/health':
            return self.json_response({'ok': True, 'game': 'Goatesque'}, head=True)
        if not self.allowed_static():
            return self.send_error(404)
        super().do_HEAD()

    def allowed_static(self):
        parts = unquote(urlsplit(self.path).path).split('/')
        if any(p.startswith('.') for p in parts if p):
            return False
        target = Path(self.translate_path(self.path)).resolve()
        return target.is_relative_to(self.server.directory)

    def do_POST(self):
        if urlsplit(self.path).path != '/api/rooms':
            return self.json_response({'error': 'Not found.'}, 404)
        try:
            origin = self.headers.get('Origin')
            if origin and urlsplit(origin).netloc != self.headers.get('Host'):
                raise ApiError(403, 'Invalid request origin.')
            if self.headers.get('Transfer-Encoding'):
                raise ApiError(400, 'Unsupported request encoding.')
            if self.headers.get_content_type() != 'application/json':
                raise ApiError(415, 'Send JSON requests.')
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 < length <= MAX_BODY:
                raise ApiError(413, 'Request too large.' if length > MAX_BODY else 'Empty request.')
            data = self.rfile.read(length)
            if len(data) != length:
                raise ApiError(400, 'Incomplete request.')
            def invalid_constant(value):
                raise ValueError('Non-finite JSON number')
            body = json.loads(data, parse_constant=invalid_constant)
            self.json_response(self.server.rooms.request(body))
        except ApiError as error:
            self.json_response({'error': error.message}, error.status)
        except (ValueError, UnicodeError, RecursionError):
            self.json_response({'error': 'Invalid JSON request.'}, 400)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--host', default='127.0.0.1')
    parser.add_argument('--port', type=int, default=8792)
    parser.add_argument('--public', type=Path, default=Path(__file__).with_name('public'))
    parser.add_argument('--max-rooms', type=int, default=16)
    args = parser.parse_args()
    if not (args.public / 'index.html').is_file():
        parser.error('Public directory must contain index.html')
    server = Server((args.host, args.port), args.public, args.max_rooms)
    print('Goatesque listening on %s:%s' % server.server_address, flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
