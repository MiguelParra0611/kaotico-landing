"""Servidor de desarrollo sin cache.

http.server normal deja que el navegador cachee los .js y .css, y entonces
uno cree estar viendo el cambio que acaba de hacer cuando en realidad ve el
anterior. Aqui todo se sirve con no-store.
"""
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

class SinCache(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, fmt, *args):
        pass  # sin ruido en la consola

if __name__ == "__main__":
    puerto = int(sys.argv[1]) if len(sys.argv) > 1 else 5173
    print(f"sirviendo en http://localhost:{puerto} (sin cache)")
    ThreadingHTTPServer(("", puerto), SinCache).serve_forever()
