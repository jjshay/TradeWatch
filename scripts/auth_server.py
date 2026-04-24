#!/usr/bin/env python3
"""
Tiny HTTP Basic Auth wrapper around python's built-in static server.
Serves the current dir on port 8000, but every request must carry a valid
Authorization header. Used as the origin behind the cloudflared tunnel so
the public URL is password-gated at the front door.

Usage:
    python3 scripts/auth_server.py [PORT] [USER] [PASSWORD]

Defaults: PORT=8000 USER=tradelocal PASSWORD=tradelocal
Override via env vars: TR_AUTH_USER, TR_AUTH_PASS, TR_AUTH_PORT.
"""
import base64
import http.server
import os
import socketserver
import sys


def resolve_cfg():
    port = int(os.environ.get('TR_AUTH_PORT', sys.argv[1] if len(sys.argv) > 1 else '8000'))
    user = os.environ.get('TR_AUTH_USER', sys.argv[2] if len(sys.argv) > 2 else 'tradelocal')
    password = os.environ.get('TR_AUTH_PASS', sys.argv[3] if len(sys.argv) > 3 else 'tradelocal')
    return port, user, password


class AuthHandler(http.server.SimpleHTTPRequestHandler):
    # Set per-instance by server
    auth_user = 'tradelocal'
    auth_pass = 'tradelocal'
    auth_b64 = ''

    def do_AUTH(self):
        """Send 401 with Basic challenge."""
        self.send_response(401)
        self.send_header('WWW-Authenticate', 'Basic realm="TradeRadar"')
        self.send_header('Content-Type', 'text/html; charset=utf-8')
        self.end_headers()
        self.wfile.write(b'<h1>401 - Authentication required</h1>')

    def _check_auth(self):
        hdr = self.headers.get('Authorization') or ''
        if not hdr.startswith('Basic '):
            return False
        return hdr.split(' ', 1)[1].strip() == self.auth_b64

    def do_GET(self):
        if not self._check_auth():
            return self.do_AUTH()
        return super().do_GET()

    def do_HEAD(self):
        if not self._check_auth():
            return self.do_AUTH()
        return super().do_HEAD()

    def log_message(self, format, *args):
        # Quieter logs - skip the default noisy line-per-request
        sys.stderr.write("%s %s\n" % (self.log_date_time_string(), format % args))


class ThreadedServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    allow_reuse_address = True
    daemon_threads = True


def main():
    port, user, pw = resolve_cfg()
    repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
    os.chdir(repo_root)

    # Bake credentials into the handler class (instances read them)
    handler_cls = type('BoundAuthHandler', (AuthHandler,), {
        'auth_user': user,
        'auth_pass': pw,
        'auth_b64': base64.b64encode(f'{user}:{pw}'.encode()).decode(),
    })

    srv = ThreadedServer(('0.0.0.0', port), handler_cls)
    sys.stderr.write(f'TradeRadar auth server on :{port} · user={user!r} · serving {repo_root}\n')
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        sys.stderr.write('\nshutting down\n')
        srv.shutdown()


if __name__ == '__main__':
    main()
