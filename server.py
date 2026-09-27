#!/usr/bin/env python3
"""
音乐盒子 - 本地后端服务器
========================
零依赖，只用 Python 标准库。

用途：
1. 代理 music.itzo.cn 的搜索 API，加 CORS 头
2. 代理音乐 CDN 音频，加 CORS 头（这是核心！否则浏览器拒绝播放）
3. 静态托管 public/index.html

启动：
    python3 server.py

然后浏览器打开：
    http://localhost:8765
"""

import os
import sys
import http.server
import http.client
import urllib.parse
import urllib.request
import urllib.error
import ssl
import socket
from http.server import SimpleHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

# ========== Config ==========
HOST = os.environ.get("HOST", "0.0.0.0")
PORT = int(os.environ.get("PORT", "8765"))
PUBLIC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "public")
ITZO_API = "https://music.itzo.cn/"

# 上游请求头（伪造浏览器）
UPSTREAM_UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)

# CORS 响应头
CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "*",
    "Access-Control-Max-Age": "86400",
    "Access-Control-Expose-Headers": "Content-Length, Content-Type",
}

SSL_CONTEXT = ssl.create_default_context()
SSL_CONTEXT.check_hostname = False  # some CDNs have cert issues
SSL_CONTEXT.verify_mode = ssl.CERT_NONE


class MusicHandler(SimpleHTTPRequestHandler):
    """Handler: / 提供静态文件，/_api/* 是代理端点。"""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=PUBLIC_DIR, **kwargs)

    # ---------- CORS / OPTIONS ----------
    def do_OPTIONS(self):
        self.send_response(204)
        for k, v in CORS_HEADERS.items():
            self.send_header(k, v)
        self.end_headers()

    # ---------- Static files ----------
    def do_GET(self):
        if self.path.startswith("/_api/"):
            return self.handle_api_get()
        return super().do_GET()

    def do_POST(self):
        if self.path.startswith("/_api/search"):
            return self.handle_search_post()
        self.send_error(404)

    # ---------- Proxy: /_api/search ----------
    def handle_search_post(self):
        """POST /_api/search -> POST https://music.itzo.cn/"""
        try:
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length) if length else b""
            content_type = self.headers.get("Content-Type", "application/x-www-form-urlencoded")

            req = urllib.request.Request(
                ITZO_API,
                data=body,
                method="POST",
                headers={
                    "Content-Type": content_type,
                    "User-Agent": UPSTREAM_UA,
                    "X-Requested-With": "XMLHttpRequest",
                    "Referer": "https://music.itzo.cn/",
                    "Origin": "https://music.itzo.cn",
                },
            )

            with urllib.request.urlopen(req, context=SSL_CONTEXT, timeout=30) as resp:
                data = resp.read()
                self.send_response(resp.status)
                for k, v in CORS_HEADERS.items():
                    self.send_header(k, v)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Content-Length", str(len(data)))
                self.send_header("Cache-Control", "public, max-age=60")
                self.end_headers()
                self.wfile.write(data)

        except urllib.error.HTTPError as e:
            self._send_error_json(e.code, e.read().decode("utf-8", errors="replace"))
        except Exception as e:
            self._send_error_json(500, str(e))

    # ---------- Proxy: /_api/audio?url=<encoded> ----------
    def handle_api_get(self):
        """GET /_api/audio?url=... -> GET url (with CORS + streaming)"""
        if not self.path.startswith("/_api/audio"):
            return self.send_error(404, "Unknown endpoint")

        parsed = urlparse(self.path)
        qs = parse_qs(parsed.query)
        target_url = qs.get("url", [None])[0]

        if not target_url:
            return self._send_error_json(400, "Missing url parameter")

        try:
            # Build upstream request
            upstream_headers = {
                "User-Agent": UPSTREAM_UA,
                "Referer": "https://music.163.com/" if "163.com" in target_url else "https://music.itzo.cn/",
            }

            # Forward Range header if present
            if self.headers.get("Range"):
                upstream_headers["Range"] = self.headers["Range"]

            req = urllib.request.Request(target_url, headers=upstream_headers)

            with urllib.request.urlopen(req, context=SSL_CONTEXT, timeout=60) as resp:
                status = resp.status
                content_type = resp.headers.get("Content-Type", "audio/mpeg")
                content_length = resp.headers.get("Content-Length")
                accept_ranges = resp.headers.get("Accept-Ranges")
                content_range = resp.headers.get("Content-Range")

                self.send_response(status)
                for k, v in CORS_HEADERS.items():
                    self.send_header(k, v)
                self.send_header("Content-Type", content_type)
                if content_length:
                    self.send_header("Content-Length", content_length)
                if accept_ranges:
                    self.send_header("Accept-Ranges", accept_ranges)
                if content_range:
                    self.send_header("Content-Range", content_range)
                # No cache, let browser decide
                self.send_header("Cache-Control", "no-store")
                self.end_headers()

                # Stream response
                chunk_size = 64 * 1024
                while True:
                    chunk = resp.read(chunk_size)
                    if not chunk:
                        break
                    self.wfile.write(chunk)

        except urllib.error.HTTPError as e:
            self._send_error_json(e.code, f"Upstream HTTP {e.code}: {e.reason}")
        except socket.timeout:
            self._send_error_json(504, "Upstream timeout")
        except Exception as e:
            self._send_error_json(500, str(e))

    # ---------- Helpers ----------
    def _send_error_json(self, code, message):
        body = ('{"error":%s,"message":"%s"}' % (
            code,
            message.replace("\\", "\\\\").replace('"', '\\"')
        )).encode("utf-8")
        self.send_response(code)
        for k, v in CORS_HEADERS.items():
            self.send_header(k, v)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    # ---------- Logging ----------
    def log_message(self, format, *args):
        # 静默，除非出错
        if args and isinstance(args[0], str) and (" 5" in args[0][:5] or " 4" in args[0][:5]):
            sys.stderr.write("[music] %s - %s\n" % (self.address_string(), format % args))


class ThreadingHTTPServer(http.server.ThreadingHTTPServer):
    """多线程服务器，避免一个慢请求卡住整个服务。"""
    allow_reuse_address = True
    daemon_threads = True


def main():
    if not os.path.isdir(PUBLIC_DIR):
        print(f"[error] public/ directory not found at {PUBLIC_DIR}", file=sys.stderr)
        sys.exit(1)

    server = ThreadingHTTPServer((HOST, PORT), MusicHandler)
    print(f"""
╔═══════════════════════════════════════════════════════════╗
║                  🎵 音乐盒子 · 本地服务器                  ║
╠═══════════════════════════════════════════════════════════╣
║                                                           ║
║   打开浏览器访问：                                         ║
║       http://localhost:{PORT}                              ║
║                                                           ║
║   局域网访问（手机等）：                                   ║
║       http://{HOST}:{PORT}                                ║
║                                                           ║
║   按 Ctrl+C 停止                                          ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
""")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[bye] Server stopped.")
        server.server_close()


if __name__ == "__main__":
    main()
