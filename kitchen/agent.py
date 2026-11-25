"""Agente da comanda do Seu Paulo. Acesso de saída ao Supabase e à fila indicada."""
import argparse
import base64
import contextlib
import errno
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


AGENT_VERSION = "1.2.0"
# GS V 66 is the Elgin i9 feed-and-cut command. Advance to the blade
# plus 48 vertical motion units to leave a margin below the last line.
FEED_AND_CUT = b"\x1d\x56\x42\x30"


def plain(value):
    # Only printable ASCII reaches the receipt, including user-supplied notes.
    normalized = unicodedata.normalize("NFKD", str(value))
    return " ".join("".join(c if 32 <= ord(c) < 127 else " "
                            for c in normalized if not unicodedata.combining(c)).split())


def receipt(job):
    ticket = job["ticket"]
    width = 42
    code = plain(ticket["code"])
    lines = ["SEU PAULO BUTECO".center(width), ("DELIVERY " + code).center(width)]
    is_test = code in ("#TESTE", "#TESTE-LOCAL")
    if is_test:
        lines.append(f"AGENTE {AGENT_VERSION}".center(width))
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
    if is_test:
        lines.extend(["FIM DO TESTE".center(width), ""])
    return "\n".join(lines).encode("ascii") + FEED_AND_CUT


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

    def update(self, lease, action, failure_code=None):
        args = {"p_lease": lease, "p_action": action}
        if failure_code:
            args["p_failure_code"] = failure_code
        return self.call("update_kitchen_ticket", args)


class PrinterFailure(Exception):
    """A known printer failure safe to report in the panel."""


def printer_failure_code(exc, mode, dispatch_started):
    if isinstance(exc, PrinterFailure):
        return str(exc)
    if mode == "tcp" and not dispatch_started:
        error = getattr(exc, "winerror", None) or getattr(exc, "errno", None)
        if isinstance(exc, TimeoutError) or error in (errno.ETIMEDOUT, 10060):
            return "tcp_timeout"
        if isinstance(exc, ConnectionRefusedError) or error in (errno.ECONNREFUSED, 10061):
            return "tcp_refused"
        if error in (errno.ENETDOWN, errno.ENETUNREACH, errno.EHOSTUNREACH, 10050, 10051, 10065):
            return "tcp_unreachable"
        return "tcp_connect_failed"
    if mode == "windows":
        error = getattr(exc, "winerror", None)
        if error == 1801:  # ERROR_INVALID_PRINTER_NAME
            return "queue_not_found"
        if error == 5:  # ERROR_ACCESS_DENIED
            return "queue_access_denied"
        if not dispatch_started:
            return "queue_unavailable"
    return "send_failed" if dispatch_started else "printer_unavailable"


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
            for flag, code in (
                (win32print.PRINTER_STATUS_PAPER_OUT, "paper_out"),
                (win32print.PRINTER_STATUS_PAPER_JAM, "paper_jam"),
                (win32print.PRINTER_STATUS_OFFLINE, "printer_offline"),
                (win32print.PRINTER_STATUS_PAUSED, "queue_paused"),
                (win32print.PRINTER_STATUS_ERROR, "queue_unavailable"),
            ):
                if status & flag:
                    raise PrinterFailure(code)
            def write(data):
                win32print.StartDocPrinter(handle, 1, ("Seu Paulo - Delivery", None, "RAW"))
                try:
                    win32print.StartPagePrinter(handle)
                    if win32print.WritePrinter(handle, data) != len(data):
                        raise PrinterFailure("partial_write")
                    win32print.EndPagePrinter(handle)
                    win32print.EndDocPrinter(handle)
                except Exception:
                    with contextlib.suppress(Exception):
                        win32print.AbortPrinter(handle)
                    raise
            yield write
        finally:
            win32print.ClosePrinter(handle)
    else:
        raise PrinterFailure("invalid_destination")


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
            api.update(lease, "review", "invalid_ticket")
        logging.error("Confira os itens da comanda no painel.")
        return True
    dispatch_started = False
    authorizing = False
    destination = job.get("destination", config)
    try:
        with printer(destination) as write:
            started = time.monotonic()
            authorizing = True
            authorized = api.update(lease, "begin")
            authorizing = False
            if not authorized:
                return True
            dispatch_started = True
            if time.monotonic() - started > 30:
                raise PrinterFailure("authorization_timeout")
            write(data)
    except Exception as exc:
        code = "authorization_failed" if authorizing else printer_failure_code(
            exc, destination.get("mode"), dispatch_started
        )
        logging.warning("Falha de impressão: %s (%s)", code, type(exc).__name__)
        api.update(lease, "review" if dispatch_started else "retry", code)
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
    parser.add_argument("--version", action="version", version=AGENT_VERSION)
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
