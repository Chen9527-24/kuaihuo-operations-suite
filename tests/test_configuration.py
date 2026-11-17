import contextlib
import importlib.util
import io
from pathlib import Path
import tempfile
import unittest

SPEC = importlib.util.spec_from_file_location('configure', Path(__file__).resolve().parents[1] / 'scripts' / 'configure.py')
CONFIGURE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(CONFIGURE)


class ConfigurationDistributionTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        templates = {
            'core-nexus': 'DATABASE_URL=\nREDIS_URL=redis://localhost:6379\nJWT_ACCESS_SECRET=\nJWT_REFRESH_SECRET=\n',
            'kf-pc': 'VITE_API_BASE_URL=/api/v1\n',
            'task-distribution-app': 'VITE_ENABLE_WECHAT_OAUTH=false\n',
            'ucp': 'CORE_NEXUS_API_BASE_URL=http://localhost:3000\n',
            'interception-bot': 'CORE_NEXUS_API_BASE_URL=http://localhost:3000\n',
        }
        for project, contents in templates.items():
            directory = self.root / project
            directory.mkdir()
            (directory / '.env.example').write_text(contents)
        self.configuration = self.root / 'config.local.env'
        self.configuration.write_text(
            'CORE__DATABASE_URL=postgresql://demo:fixture@localhost/demo\n'
            'CORE__JWT_ACCESS_SECRET=fixture-access-value-0123456789-abcdefgh\n'
            'CORE__JWT_REFRESH_SECRET=fixture-refresh-value-0123456789-abcdefgh\n'
            'PC__VITE_API_BASE_URL=/custom-api\n'
        )

    def run_cli(self, *arguments):
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            return CONFIGURE.main(list(arguments), root=self.root)

    def test_server_credentials_are_not_distributed_to_frontends(self):
        self.assertEqual(self.run_cli(), 0)
        core = (self.root / 'core-nexus' / '.env').read_text()
        self.assertIn('fixture-access-value-', core)
        for project in ('kf-pc', 'task-distribution-app'):
            target = self.root / project / '.env.development'
            contents = target.read_text()
            self.assertNotIn('fixture-access-value-', contents)
            self.assertNotIn('DATABASE_URL', contents)
            self.assertEqual(target.stat().st_mode & 0o777, 0o600)
        self.assertIn('VITE_API_BASE_URL=/custom-api', (self.root / 'kf-pc' / '.env.development').read_text())

    def test_unknown_frontend_secret_field_is_rejected_before_writing(self):
        with self.configuration.open('a') as stream:
            stream.write('PC__JWT_ACCESS_SECRET=fixture-should-never-reach-browser\n')
        self.assertEqual(self.run_cli(), 1)
        self.assertFalse((self.root / 'core-nexus' / '.env').exists())

    def test_check_is_read_only_and_existing_files_are_preserved(self):
        self.assertEqual(self.run_cli('--check'), 0)
        self.assertFalse((self.root / 'core-nexus' / '.env').exists())
        target = self.root / 'ucp' / '.env'
        target.write_text('existing-local-configuration\n')
        self.assertEqual(self.run_cli(), 1)
        self.assertEqual(target.read_text(), 'existing-local-configuration\n')
        self.assertFalse((self.root / 'core-nexus' / '.env').exists())
        self.assertEqual(self.run_cli('--force'), 0)


if __name__ == '__main__':
    unittest.main()
