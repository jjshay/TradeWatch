#!/usr/bin/env python3
import gzip
import os
from http.server import HTTPServer, SimpleHTTPRequestHandler

MIME = {
    '.html': 'text/html',
    '.js':   'application/javascript',
    '.json': 'application/json',
    '.css':  'text/css',
    '.png':  'image/png',
    '.ico':  'image/x-icon',
}

class GzipHandler(SimpleHTTPRequestHandler):
    def send_head(self):
        path = self.translate_path(self.path)
        if os.path.isdir(path):
            path = os.path.join(path, 'index.html')

        ext = os.path.splitext(path)[1]
        ctype = MIME.get(ext, 'application/octet-stream')
        ae = self.headers.get('Accept-Encoding', '')

        try:
            with open(path, 'rb') as f:
                data = f.read()
        except FileNotFoundError:
            self.send_error(404)
            return None

        if 'gzip' in ae and ext in ('.html', '.js', '.json', '.css'):
            data = gzip.compress(data, compresslevel=6)
            self.send_response(200)
            self.send_header('Content-Type', ctype)
            self.send_header('Content-Encoding', 'gzip')
            self.send_header('Content-Length', len(data))
            self.send_header('Cache-Control', 'no-cache')
            self.end_headers()
            self.wfile.write(data)
            return None
        else:
            self.send_response(200)
            self.send_header('Content-Type', ctype)
            self.send_header('Content-Length', len(data))
            self.end_headers()
            self.wfile.write(data)
            return None

    def log_message(self, fmt, *args):
        pass  # silence logs

if __name__ == '__main__':
    os.chdir('/home/user/oil-tracker')
    server = HTTPServer(('0.0.0.0', 8080), GzipHandler)
    print('Serving with gzip on http://0.0.0.0:8080')
    server.serve_forever()
