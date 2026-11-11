"""Private configuration regression tests use invented values only."""
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("validate_env", Path(__file__).parents[1] / "validate-env.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class EnvironmentTests(unittest.TestCase):
    def setUp(self):
        self.text = "\n".join([
            "NODE_ENV=production", "HOST=127.0.0.1", "PORT=3001", "TRUST_PROXY_LOOPBACK=1",
            "DATABASE_URL=postgresql://iipa@localhost/iipa_demo?host=/var/run/postgresql",
            "FRONTEND_ORIGIN=https://iipa.example.test",
            "GOOGLE_CALLBACK_URL=https://iipa.example.test/api/v1/auth/google/callback",
            "GOOGLE_CLIENT_ID=", "GOOGLE_CLIENT_SECRET=", "MARKET_PROVIDER=alpha-vantage",
            "MAIL_OUTPUT_DIR=/var/lib/iipa/mail", "SESSION_HOURS=24", "QUOTE_MAX_AGE_HOURS=72",
        ])

    def test_expected_peer_target_and_optional_google(self):
        module.validate(self.text, "iipa.example.test")

    def test_target_cookie_origin_callback_and_provider_cannot_drift(self):
        for before, after in [("iipa_demo?", "other_database?"), ("HOST=127.0.0.1", "HOST=0.0.0.0"),
                              ("TRUST_PROXY_LOOPBACK=1", "TRUST_PROXY_LOOPBACK=0"),
                              ("https://", "http://"), ("google/callback", "wrong/callback"),
                              ("alpha-vantage", "fixture")]:
            with self.subTest(setting=before), self.assertRaises(ValueError):
                module.validate(self.text.replace(before, after), "iipa.example.test")

    def test_duplicates_quotes_shell_syntax_and_partial_google_rejected(self):
        for candidate in [self.text + "\nHOST=127.0.0.1", self.text + '\nEXTRA="quoted value"',
                          self.text + "\nEXTRA=`unsafe`", self.text.replace("GOOGLE_CLIENT_ID=", "GOOGLE_CLIENT_ID=placeholder")]:
            with self.assertRaises(ValueError):
                module.validate(candidate, "iipa.example.test")

    def test_numeric_bounds(self):
        for value in ["0", "169", "not-an-integer"]:
            with self.assertRaises(ValueError):
                module.validate(self.text.replace("SESSION_HOURS=24", "SESSION_HOURS=" + value), "iipa.example.test")


if __name__ == "__main__":
    unittest.main()
