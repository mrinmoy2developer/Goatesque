import importlib.util
import json
from pathlib import Path
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor

spec = importlib.util.spec_from_file_location('goatesque_relay', Path(__file__).parents[1] / 'deploy/ludia/relay.py')
relay = importlib.util.module_from_spec(spec)
spec.loader.exec_module(relay)


class RelayTests(unittest.TestCase):
    def test_reordered_protocol_packets_never_restore_old_controls_or_world_state(self):
        rooms = relay.Rooms()
        host = rooms.request({'action': 'create'})
        guest = rooms.request({'action': 'join', 'code': host['code']})
        for packet, right in [(2, False), (1, True)]:
            rooms.request({**guest, 'action': 'sync', 'input': {'protocol': 2, 'packet': packet, 'epoch': 1, 'stream': 2, 'right': right, 'frames': [[packet, int(right) * 2, 0, 0, 0, 0, 0]]}})
        latest = rooms.request({**host, 'action': 'sync', 'state': {'players': [{}, {}], 'protocol': 2, 'packet': 2, 'tick': 200}})
        self.assertFalse(latest['input']['right'])
        self.assertEqual(latest['input']['packet'], 2)
        self.assertEqual(latest['input']['frames'][0][0], 2)
        rooms.request({**host, 'action': 'sync', 'state': {'players': [{}, {}], 'protocol': 2, 'packet': 1, 'tick': 100}})
        self.assertEqual(rooms.request({**guest, 'action': 'sync', 'input': {'protocol': 2, 'packet': 3}})['state']['tick'], 200)

    def test_input_batches_are_bounded_and_new_guest_packet_numbers_start_fresh(self):
        rooms = relay.Rooms()
        host = rooms.request({'action': 'create'})
        guest = rooms.request({'action': 'join', 'code': host['code']})
        rooms.request({**guest, 'action': 'sync', 'input': {'protocol': 2, 'packet': 200, 'frames': [[i+1, 2, 0, 0, 0, 0, 0] for i in range(200)]}})
        state = {'players': [{}, {}]}
        self.assertEqual(len(rooms.request({**host, 'action': 'sync', 'state': state})['input']['frames']), 180)
        rooms.request({**guest, 'action': 'leave'})
        guest = rooms.request({'action': 'join', 'code': host['code']})
        rooms.request({**guest, 'action': 'sync', 'input': {'protocol': 2, 'packet': 1, 'stream': 1}})
        self.assertEqual(rooms.request({**host, 'action': 'sync', 'state': state})['input']['packet'], 1)

    def test_two_players_authentication_rejoin_and_snapshot_protocol(self):
        rooms = relay.Rooms()
        host = rooms.request({'action': 'create'})
        guest = rooms.request({'action': 'join', 'code': host['code']})
        with self.assertRaises(relay.ApiError) as third:
            rooms.request({'action': 'join', 'code': host['code']})
        self.assertEqual(third.exception.status, 409)
        with self.assertRaises(relay.ApiError) as wrong:
            rooms.request({**guest, 'action': 'sync', 'token': 'wrong'})
        self.assertEqual(wrong.exception.status, 403)
        rooms.request({**guest, 'action': 'sync', 'input': {'rewind': True, 'switchHeld': True, 'switch': 4, 'menu': 2, 'confirm': 3, 'jump': -1, 'seq': 6}})
        state = {'players': [{}, {}], 'presentation': {'screen': 'play'}}
        sync = rooms.request({**host, 'action': 'sync', 'state': state})
        self.assertTrue(sync['connected'])
        self.assertEqual(sync['input']['jump'], 0)
        self.assertEqual(sync['input']['confirm'], 3)
        self.assertEqual(sync['input']['switch'], 4)
        self.assertTrue(sync['input']['rewind'])
        self.assertEqual(len(sync['guestSession']), 16)
        self.assertNotIn(guest['token'], json.dumps(sync))
        self.assertEqual(rooms.request({**guest, 'action': 'sync', 'input': {}})['state'], state)
        rooms.request({**guest, 'action': 'leave'})
        second = rooms.request({'action': 'join', 'code': host['code']})
        self.assertNotEqual(second['token'], guest['token'])
        self.assertNotEqual(rooms.request({**host, 'action': 'sync', 'state': state})['guestSession'], sync['guestSession'])
        rooms.request({**host, 'action': 'leave'})
        with self.assertRaises(relay.ApiError) as gone:
            rooms.request({**second, 'action': 'sync', 'input': {}})
        self.assertEqual(gone.exception.status, 404)

    def test_room_cap_expiration_and_atomic_join(self):
        clock = [1000000]
        rooms = relay.Rooms(max_rooms=1, clock=lambda: clock[0])
        host = rooms.request({'action': 'create'})
        with self.assertRaises(relay.ApiError) as full:
            rooms.request({'action': 'create'})
        self.assertEqual(full.exception.status, 503)
        def join(_):
            try:
                rooms.request({'action': 'join', 'code': host['code']})
                return 200
            except relay.ApiError as error:
                return error.status
        with ThreadPoolExecutor(8) as pool:
            statuses = list(pool.map(join, range(8)))
        self.assertEqual(statuses.count(200), 1)
        self.assertEqual(statuses.count(409), 7)
        clock[0] += 1801
        rooms.request({'action': 'create'})
        self.assertEqual(len(rooms.rooms), 1)

    def test_http_json_limits_origin_static_mime_and_path_boundaries(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / 'index.html').write_text('<title>Goatesque</title>')
            (root / 'game.mjs').write_text('export const ready=true;')
            (root / '.hidden').write_text('private')
            server = relay.Server(('127.0.0.1', 0), root)
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            origin = 'http://127.0.0.1:%s' % server.server_port
            def request(path, data=None, headers=None):
                try:
                    response = urllib.request.urlopen(urllib.request.Request(origin + path, data=data, headers=headers or {}))
                    self.addCleanup(response.close)
                    return response
                except urllib.error.HTTPError as error:
                    self.addCleanup(error.close)
                    return error
            try:
                self.assertEqual(json.load(request('/api/health'))['game'], 'Goatesque')
                self.assertEqual(request('/game.mjs').headers.get_content_type(), 'text/javascript')
                self.assertEqual(request('/.hidden').code, 404)
                self.assertEqual(request('/../relay.py').code, 404)
                headers = {'Content-Type': 'application/json'}
                self.assertEqual(request('/api/rooms', b'{}', {**headers, 'Origin': 'https://attacker.example'}).code, 403)
                self.assertEqual(request('/api/rooms', b'x' * 24001, headers).code, 413)
                self.assertEqual(request('/api/rooms', b'{"n":NaN}', headers).code, 400)
                self.assertEqual(request('/api/rooms', b'[]', headers).code, 400)
                self.assertEqual(request('/api/rooms', b'{}', {}).code, 415)
                host = json.load(request('/api/rooms', b'{"action":"create"}', headers))
                self.assertEqual(host['role'], 'host')
            finally:
                server.shutdown()
                server.server_close()
                thread.join()


if __name__ == '__main__':
    unittest.main()
