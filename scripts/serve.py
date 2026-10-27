"""Local static server with single-byte-range support for seeking the MP3.

Cloudflare Pages handles byte ranges in production. Python's stock http.server
does not, so use this helper when checking local media playback.
"""
import argparse
import re
from functools import partial
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


class Handler(SimpleHTTPRequestHandler):
    def send_head(self):
        self.remaining = None
        path = Path(self.translate_path(self.path))
        requested = self.headers.get("Range", "")
        match = re.fullmatch(r"bytes=(\d*)-(\d*)", requested)
        if not match or not path.is_file():
            return super().send_head()
        size = path.stat().st_size
        first, last = match.groups()
        start = int(first) if first else max(0, size - int(last or 0))
        end = min(int(last), size - 1) if first and last else size - 1
        if start > end or start >= size:
            self.send_response(HTTPStatus.REQUESTED_RANGE_NOT_SATISFIABLE)
            self.send_header("Content-Range", f"bytes */{size}")
            self.send_header("Content-Length", "0")
            self.end_headers()
            return None
        stream = path.open("rb")
        stream.seek(start)
        self.remaining = end - start + 1
        self.send_response(HTTPStatus.PARTIAL_CONTENT)
        self.send_header("Content-Type", self.guess_type(str(path)))
        self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.send_header("Content-Length", str(self.remaining))
        self.send_header("Last-Modified", self.date_time_string(path.stat().st_mtime))
        self.end_headers()
        return stream

    def end_headers(self):
        self.send_header("Accept-Ranges", "bytes")
        super().end_headers()

    def copyfile(self, source, outputfile):
        if self.remaining is None:
            return super().copyfile(source, outputfile)
        while self.remaining:
            chunk = source.read(min(64 * 1024, self.remaining))
            if not chunk:
                break
            outputfile.write(chunk)
            self.remaining -= len(chunk)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()
    site = Path(__file__).resolve().parent.parent / "dist"
    if not site.is_dir():
        parser.error("Build first: python3 scripts/build.py")
    server = ThreadingHTTPServer(("127.0.0.1", args.port), partial(Handler, directory=str(site)))
    print(f"Serving dist on port {args.port}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
