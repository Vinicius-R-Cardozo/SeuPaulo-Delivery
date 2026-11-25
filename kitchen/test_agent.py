import contextlib
import errno
import socketserver
import threading
import unittest
from collections import deque
from unittest.mock import Mock, patch

import agent
from impressora_virtual import Receiver


class KitchenAgentTests(unittest.TestCase):
    def setUp(self):
        self.job = {"lease": "lease", "copy": 0, "ticket": {
            "code": "#AB12", "ordered_at": "24/11 12:00", "items": [{
                "quantity": 2, "product": {"name": "Feijão"}, "addons": [{"optionName": "Farofa"}],
                "notes": "Sem cebola\n\x1bp" + " e bem passado" * 8,
            }],
        }}
        self.api = Mock()
        self.api.call.return_value = self.job
        self.api.update.return_value = True

    def actions(self):
        return [entry.args[1] for entry in self.api.update.call_args_list]

    def test_single_ticket_with_wrapped_notes_and_only_cut_command(self):
        data = agent.receipt(self.job)
        self.assertTrue(data.endswith(b"\x1d\x56\x42\x30"))
        text = data[:-len(agent.FEED_AND_CUT)].decode("ascii")
        self.assertTrue(all(len(line) <= 42 for line in text.splitlines()))
        for value in ("DELIVERY #AB12", "2x Feijao", "+ Farofa", "OBS: Sem cebola"):
            self.assertIn(value, text)
        self.assertNotIn("\x1b", text)
        self.assertNotIn("REIMPRESSAO", text)
        self.job["copy"] = 1
        self.assertIn(b"REIMPRESSAO 1", agent.receipt(self.job))

    def test_short_and_long_tickets_cut_once_after_last_line_over_tcp(self):
        with socketserver.TCPServer(("127.0.0.1", 0), Receiver) as receiver:
            receiver.lock = threading.Lock()
            receiver.receipts = deque(maxlen=3)
            receiver.timeout = 2
            host, port = receiver.server_address
            self.job["destination"] = {"mode": "tcp", "host": host, "port": port}
            for count in (1, 18):
                items = [{"product": {"name": f"Item {i}"}, "quantity": 1} for i in range(count)]
                items[-1]["notes"] = "Ultima observacao"
                self.job["ticket"]["items"] = items
                expected = agent.receipt(self.job)
                self.assertEqual(expected.count(b"\x1dV"), 1)
                self.assertTrue(expected.endswith(b"Ultima observacao\n" + agent.FEED_AND_CUT))
                agent.process_one(self.api, {})
                receiver.handle_request()

        self.assertEqual(self.actions(), ["begin", "sent", "begin", "sent"])
        self.assertEqual(len(receiver.receipts), 2)
        long_receipt, short_receipt = receiver.receipts
        self.assertGreater(long_receipt[1], short_receipt[1])
        for _, _, cut, text in receiver.receipts:
            self.assertTrue(cut)
            self.assertTrue(text.endswith("OBS: Ultima observacao"))

    def test_paper_test_identifies_running_agent_and_last_line(self):
        self.job["ticket"]["code"] = "#TESTE"
        data = agent.receipt(self.job)
        body = data[:-len(agent.FEED_AND_CUT)].decode("ascii")
        self.assertIn(f"AGENTE {agent.AGENT_VERSION}", body)
        self.assertTrue(body.rstrip().endswith("FIM DO TESTE"))
        self.assertTrue(data.endswith(agent.FEED_AND_CUT))

    def test_before_send_failure_retries(self):
        for error, code in (
            (TimeoutError, "tcp_timeout"),
            (ConnectionRefusedError, "tcp_refused"),
            (OSError(errno.EHOSTUNREACH, "host unreachable"), "tcp_unreachable"),
            (OSError, "tcp_connect_failed"),
        ):
            with self.subTest(code=code):
                self.api.reset_mock()
                with patch.object(agent.socket, "create_connection", side_effect=error):
                    agent.process_one(self.api, {"mode": "tcp", "host": "127.0.0.1", "port": 9100})
                self.api.update.assert_called_once_with("lease", "retry", code)

    def test_interrupted_write_requires_review(self):
        write = Mock(side_effect=OSError)
        with patch.object(agent, "printer", return_value=contextlib.nullcontext(write)):
            agent.process_one(self.api, {})
        self.assertEqual(self.actions(), ["begin", "review"])
        self.api.update.assert_called_with("lease", "review", "send_failed")
        write.assert_called_once()

    def test_cancelled_reservation_does_not_write(self):
        write = Mock()
        self.api.update.return_value = False
        with patch.object(agent, "printer", return_value=contextlib.nullcontext(write)):
            agent.process_one(self.api, {})
        write.assert_not_called()

    def test_lost_ack_does_not_repeat_write(self):
        self.api.update.side_effect = [True, TimeoutError()]
        write = Mock()
        with patch.object(agent, "printer", return_value=contextlib.nullcontext(write)):
            with self.assertRaises(TimeoutError):
                agent.process_one(self.api, {})
        write.assert_called_once()
        self.assertEqual(self.actions(), ["begin", "sent"])

    def test_windows_queue_one_raw_document(self):
        from types import SimpleNamespace
        spooler = SimpleNamespace(**{name: Mock() for name in (
            "OpenPrinter", "GetPrinter", "StartDocPrinter", "StartPagePrinter", "WritePrinter",
            "EndPagePrinter", "EndDocPrinter", "ClosePrinter", "AbortPrinter")})
        spooler.PRINTER_STATUS_PAUSED, spooler.PRINTER_STATUS_ERROR = 1, 2
        spooler.PRINTER_STATUS_PAPER_OUT, spooler.PRINTER_STATUS_PAPER_JAM, spooler.PRINTER_STATUS_OFFLINE = 16, 8, 128
        spooler.GetPrinter.return_value = {"Status": 0}
        spooler.WritePrinter.side_effect = lambda handle, data: len(data)
        config = {"mode": "windows", "queue": "Fila cozinha"}
        with patch.dict("sys.modules", win32print=spooler):
            agent.process_one(self.api, config)
            spooler.OpenPrinter.assert_called_once_with("Fila cozinha")
            spooler.StartDocPrinter.assert_called_once_with(spooler.OpenPrinter.return_value, 1,
                                                           ("Seu Paulo - Delivery", None, "RAW"))
            spooler.EndDocPrinter.assert_called_once()
            self.assertEqual(self.actions(), ["begin", "sent"])
            self.api.reset_mock()
            spooler.GetPrinter.return_value = {"Status": spooler.PRINTER_STATUS_PAPER_OUT}
            agent.process_one(self.api, config)
            self.api.update.assert_called_once_with("lease", "retry", "paper_out")
            spooler.WritePrinter.assert_called_once()


if __name__ == "__main__":
    unittest.main()
