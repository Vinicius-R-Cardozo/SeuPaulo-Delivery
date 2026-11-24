import contextlib
import unittest
from unittest.mock import Mock, patch

import agent


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
        self.assertTrue(data.endswith(b"\x1dV\x00"))
        text = data[:-3].decode("ascii")
        self.assertTrue(all(len(line) <= 42 for line in text.splitlines()))
        for value in ("DELIVERY #AB12", "2x Feijao", "+ Farofa", "OBS: Sem cebola"):
            self.assertIn(value, text)
        self.assertNotIn("\x1b", text)
        self.assertNotIn("REIMPRESSAO", text)
        self.job["copy"] = 1
        self.assertIn(b"REIMPRESSAO 1", agent.receipt(self.job))

    def test_before_send_failure_retries(self):
        with patch.object(agent, "printer", side_effect=OSError):
            agent.process_one(self.api, {})
        self.assertEqual(self.actions(), ["retry"])

    def test_partial_write_requires_review(self):
        write = Mock(side_effect=OSError)
        with patch.object(agent, "printer", return_value=contextlib.nullcontext(write)):
            agent.process_one(self.api, {})
        self.assertEqual(self.actions(), ["begin", "review"])
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
            self.assertEqual(self.actions(), ["retry"])
            spooler.WritePrinter.assert_called_once()


if __name__ == "__main__":
    unittest.main()
