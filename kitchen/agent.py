"""Agente da comanda do Seu Paulo. Acesso de saída ao Supabase e à fila indicada."""
import argparse
import base64
import contextlib
import hashlib
import json
import logging
import secrets
import socket
import textwrap
import time
import unicodedata
import urllib.error
import urllib.request
from logging.handlers import RotatingFileHandler
from pathlib import Path
from urllib.parse import urlsplit


def plain(value):
    # Only printable ASCII reaches the receipt, including user-supplied notes.
    normalized = unicodedata.normalize("NFKD", str(value))
    return " ".join("".join(c if 32 <= ord(c) < 127 else " "
                            for c in normalized if not unicodedata.combining(c)).split())


def receipt(job):
    ticket = job["ticket"]
    width = 42
    lines = ["SEU PAULO BUTECO".center(width), ("DELIVERY " + plain(ticket["code"])).center(width)]
    if job["copy"]:
        lines.append(("REIMPRESSAO " + str(job["copy"])).center(width))
    lines.extend(["-" * width, "PEDIDO EM: " + plain(ticket["ordered_at"]), "-" * width])
    if not ticket["items"]:
        raise ValueError("Pedido sem itens")
    for item in ticket["items"]:
        name = plain(item["product"]["name"])
        quantity = int(item["quantity"])
        if not name or quantity < 1:
            raise ValueError("Item incompleto")
        lines.extend(textwrap.wrap(f"{quantity}x {name}", width, subsequent_indent="   "))
        for addon in item.get("addons") or []:
            lines.extend(textwrap.wrap("   + " + plain(addon["optionName"]), width, subsequent_indent="     "))
        if item.get("notes"):
            lines.extend(textwrap.wrap("   OBS: " + plain(item["notes"]), width, subsequent_indent="        "))
        lines.append("")
    return ("\n".join(lines) + "\n\n\n").encode("ascii") + b"\x1dV\x00"


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args):
        return None


class KitchenAPI:
    def __init__(self, config):
        url = urlsplit(config["url"])
        if url.scheme != "https" or not url.hostname or url.username or url.path.strip("/") or url.query or url.fragment:
            raise ValueError("Informe a origem HTTPS do projeto Supabase")
        self.base = config["url"].rstrip("/") + "/rest/v1/rpc/"
        self.headers = {"apikey": config["public_key"], "x-kitchen-key": config["device_key"],
                        "Content-Type": "application/json"}
        self.client = urllib.request.build_opener(NoRedirect)

    def call(self, name, args):
        req = urllib.request.Request(self.base + name, data=json.dumps(args).encode(), headers=self.headers)
        with self.client.open(req, timeout=8) as response:
            body = response.read()
            return json.loads(body) if body else None

    def update(self, lease, action):
        return self.call("update_kitchen_ticket", {"p_lease": lease, "p_action": action})


@contextlib.contextmanager
def printer(config):
    if config["mode"] == "tcp":
        with socket.create_connection((config["host"], int(config.get("port", 9100))), timeout=5) as sock:
            yield sock.sendall
    elif config["mode"] == "windows":
        import win32print
        handle = win32print.OpenPrinter(config["queue"])
        try:
            status = win32print.GetPrinter(handle, 2)["Status"]
            blocked = (win32print.PRINTER_STATUS_PAUSED | win32print.PRINTER_STATUS_ERROR |
                       win32print.PRINTER_STATUS_PAPER_OUT | win32print.PRINTER_STATUS_PAPER_JAM |
                       win32print.PRINTER_STATUS_OFFLINE)
            if status & blocked:
                raise OSError("Fila de impressão indisponível")
            def write(data):
                win32print.StartDocPrinter(handle, 1, ("Seu Paulo - Delivery", None, "RAW"))
                try:
                    win32print.StartPagePrinter(handle)
                    if win32print.WritePrinter(handle, data) != len(data):
                        raise OSError("Envio parcial")
                    win32print.EndPagePrinter(handle)
                    win32print.EndDocPrinter(handle)
                except Exception:
                    win32print.AbortPrinter(handle)
                    raise
            yield write
        finally:
            win32print.ClosePrinter(handle)
    else:
        raise ValueError("Destino de impressão inválido")


def process_one(api, config):
    job = api.call("claim_kitchen_ticket", {})
    if not job:
        return False
    lease = job["lease"]
    try:
        data = receipt(job)
    except (KeyError, ValueError, TypeError):
        # Invalid snapshots need operator review, not an endless automatic retry.
        if api.update(lease, "begin"):
            api.update(lease, "review")
        logging.error("Confira os itens da comanda no painel.")
        return True
    dispatch_started = False
    try:
        with printer(job.get("destination", config)) as write:
            started = time.monotonic()
            if not api.update(lease, "begin"):
                return True
            dispatch_started = True
            if time.monotonic() - started > 30:
                raise TimeoutError("Autorização de envio expirou")
            write(data)
    except Exception as exc:
        logging.warning("Falha na impressora (%s)", type(exc).__name__)
        api.update(lease, "review" if dispatch_started else "retry")
        return True
    # If this ACK is lost, the server keeps the job for review. Never resend the bytes.
    api.update(lease, "sent")
    return True


def windows_queues():
    import pywintypes
    import win32print
    flags = win32print.PRINTER_ENUM_LOCAL | win32print.PRINTER_ENUM_CONNECTIONS
    try:
        return sorted({row[2] for row in win32print.EnumPrinters(flags)})
    except (OSError, pywintypes.error):
        # A dedicated TCP printer remains usable when the Windows spooler is down.
        return []


def connect(path):
    code = input("Cole o codigo de conexao do painel e pressione Enter: ").strip()
    try:
        invitation = json.loads(base64.urlsafe_b64decode(code + "=" * (-len(code) % 4)))
        config = {"url": invitation["url"], "public_key": invitation["key"],
                  "device_key": secrets.token_hex(32), "managed": True}
        api = KitchenAPI(config)
        api.call("connect_kitchen_computer", {"p_code": invitation["code"], "p_machine": socket.gethostname()})
        path.write_text(json.dumps(config), encoding="utf-8")
    except urllib.error.HTTPError as exc:
        raise SystemExit(f"Pareamento recusado (HTTP {exc.code}). Gere um novo codigo no painel.") from None
    except urllib.error.URLError as exc:
        raise SystemExit(f"Falha de rede ao conectar: {exc.reason}") from None
    except (ValueError, OSError, KeyError, TypeError):
        raise SystemExit("Confira o codigo completo e a permissao para salvar a configuracao.") from None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("config", type=Path)
    parser.add_argument("--pair", action="store_true", help="Gerar chave e SQL de ativação")
    parser.add_argument("--connect", action="store_true", help="Conectar pelo painel administrativo")
    args = parser.parse_args()
    if args.connect:
        connect(args.config)
        return
    config = json.loads(args.config.read_text(encoding="utf-8-sig"))
    if args.pair:
        if not config.get("device_key"):
            config["device_key"] = secrets.token_hex(32)
            args.config.write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding="utf-8")
        digest = hashlib.sha256(config["device_key"].encode()).hexdigest()
        print("insert into kitchen_print.device (secret_hash) values ('" + digest +
              "') on conflict (singleton) do update set secret_hash=excluded.secret_hash;")
        return
    api = KitchenAPI(config)
    log = RotatingFileHandler(args.config.with_suffix(".log"), maxBytes=256000, backupCount=2)
    logging.basicConfig(handlers=[log], level=logging.INFO, format="%(asctime)s %(message)s")
    next_heartbeat = 0
    while True:
        try:
            if config.get("managed") and time.monotonic() >= next_heartbeat:
                api.call("kitchen_heartbeat", {"p_queues": windows_queues()})
                next_heartbeat = time.monotonic() + 12
            if not process_one(api, config):
                time.sleep(1)
        except Exception as exc:
            logging.warning("Fila indisponível (%s)", type(exc).__name__)
            time.sleep(3)


if __name__ == "__main__":
    main()
