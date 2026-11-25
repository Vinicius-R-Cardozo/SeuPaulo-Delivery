"""Impressora TCP de homologação do Seu Paulo, com visor somente neste computador."""
import argparse
import html
import ipaddress
import socketserver
import threading
import time
from collections import deque
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from agent import PAPER_CUT, RECEIPT_END, printer, receipt


class Receiver(socketserver.BaseRequestHandler):
    def handle(self):
        data = bytearray()
        deadline = time.monotonic() + 10
        try:
            while len(data) <= 65536:
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    return
                self.request.settimeout(remaining)
                chunk = self.request.recv(4096)
                if not chunk:
                    break
                data.extend(chunk)
        except OSError:
            return
        if not data or len(data) > 65536:
            return
        cut = data.endswith(PAPER_CUT)
        trailer = RECEIPT_END if data.endswith(RECEIPT_END) else PAPER_CUT
        body = data[:-len(trailer)] if cut else data
        text = "".join(chr(b) if 32 <= b <= 126 or b == 10 else "?" for b in body)
        stamp = datetime.now().strftime("%H:%M:%S")
        with self.server.lock:
            self.server.receipts.appendleft((stamp, len(data), cut, text.rstrip()))


def test_local(address):
    now = datetime.now()
    job = {"copy": 0, "ticket": {"code": "#TESTE-LOCAL", "ordered_at": now.strftime("%d/%m %H:%M"),
           "items": [{"product": {"name": "TESTE - NAO PREPARAR"}, "quantity": 1,
                      "addons": [{"optionName": "Arroz"}], "notes": "Comanda de homologação"}]}}
    with printer({"mode": "tcp", "host": address[0], "port": address[1]}) as send:
        send(receipt(job))


class Viewer(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path != "/":
            self.send_error(404)
            return
        tcp = self.server.receiver
        with tcp.lock:
            receipts = list(tcp.receipts)
        blocks = []
        for stamp, size, cut, content in receipts:
            label = "Comando de corte recebido" if cut else "Sem comando de corte"
            blocks.append(f"<article><small>{stamp} · {size} bytes · {label}</small>"
                          f"<pre>{html.escape(content)}</pre></article>")
        address, port = tcp.server_address
        doc = f"""<!doctype html><html lang="pt-BR"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="5">
<title>Impressora virtual · Seu Paulo</title>
<style>*{{box-sizing:border-box}}body{{background:#211b18;color:#fff7ea;font:16px system-ui;margin:0}}
main{{max-width:620px;margin:auto;padding:32px 16px}}h1{{margin:0}}button{{padding:12px 18px;border:0;border-radius:8px;
background:#a42129;color:white;font:inherit;cursor:pointer}}article{{background:#fff6e3;color:#251f19;
margin:20px 0;padding:18px;border-radius:3px}}pre{{overflow:auto;line-height:1.4}}small{{color:#53483e}}</style>
<main><h1>Impressora virtual da cozinha</h1><p>Destino de teste: <strong>{address}:{port}</strong></p>
<form method="post" action="/teste"><button>Enviar teste local</button></form>
<h2>Comandas recebidas</h2>{''.join(blocks) or '<p>Aguardando a primeira comanda.</p>'}</main></html>"""
        raw = doc.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_POST(self):
        port = self.server.server_port
        allowed = {f"http://127.0.0.1:{port}", f"http://localhost:{port}"}
        if self.path != "/teste" or self.headers.get("Origin") not in allowed:
            self.send_error(403)
            return
        try:
            test_local(self.server.receiver.server_address)
        except OSError:
            self.send_error(503, "Receptor indisponivel")
            return
        self.send_response(303)
        self.send_header("Location", "/")
        self.end_headers()

    def log_message(self, *args):
        pass


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--ip", required=True, type=ipaddress.IPv4Address, help="IPv4 desta máquina na rede local")
    parser.add_argument("--porta", type=int, default=9100)
    parser.add_argument("--visor", type=int, default=19101)
    args = parser.parse_args()
    if not any(args.ip in ipaddress.ip_network(net) for net in ("10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16")):
        parser.error("Escolha um IPv4 privado desta máquina.")
    with socketserver.TCPServer((str(args.ip), args.porta), Receiver) as tcp:
        tcp.receipts = deque(maxlen=20)
        tcp.lock = threading.Lock()
        with ThreadingHTTPServer(("127.0.0.1", args.visor), Viewer) as web:
            web.receiver = tcp
            threading.Thread(target=tcp.serve_forever, daemon=True).start()
            print(f"Impressora {args.ip}:{args.porta} | Visor http://127.0.0.1:{args.visor}", flush=True)
            try:
                web.serve_forever()
            except KeyboardInterrupt:
                pass
            finally:
                tcp.shutdown()


if __name__ == "__main__":
    main()
