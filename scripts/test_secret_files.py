import unittest
from check_secret_files import forbidden_filename, validate_template


class SecretFilePolicyTests(unittest.TestCase):
    def test_only_exact_env_template_is_allowed(self):
        self.assertFalse(forbidden_filename(".env.example"))
        self.assertFalse(forbidden_filename("services/api/.env.example"))
        for path in [".env", ".env.local", ".ENV", ".Env.local", ".ENV.EXAMPLE", ".env.example.local", "api/.env.production", "id_rsa", "key.pem", "key.pfx"]:
            self.assertTrue(forbidden_filename(path), path)

    def test_values_and_credential_like_placeholders_are_rejected_without_echoing_them(self):
        self.assertEqual(validate_template("# Names only\nDATABASE_URL=\nGOOGLE_CLIENT_SECRET=\n"), [])
        self.assertEqual(validate_template("DATABASE_URL=postgresql://placeholder\nTOKEN=example-secret\n"), [1, 2])
        self.assertEqual(validate_template("export SECRET=\nSECRET =\n"), [1, 2])


if __name__ == "__main__":
    unittest.main()
