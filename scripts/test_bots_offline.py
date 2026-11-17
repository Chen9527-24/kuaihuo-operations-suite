#!/usr/bin/env python3
"""Run desktop-client unit tests in temporary copies with network access denied."""
from pathlib import Path
import os
import shutil
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
PRIVATE_NAMES = {
    '__pycache__', '.venv', 'node_modules', 'dist', 'build',
    'login_cache.json', 'gui_session_cache.json', 'core_session.json',
    'gui_settings.json', 'accounts.json', 'api_settings.json',
}
ROOT_PRIVATE_NAMES = {'profiles', 'records', 'state', 'output', 'logs'}


def ignore(directory, names):
    project_root = Path(directory).parent == ROOT
    return [name for name in names if name in PRIVATE_NAMES or (project_root and name in ROOT_PRIVATE_NAMES) or name == '.env' or (name.startswith('.env.') and name != '.env.example')]


def main():
    failed = False
    for project in ('ucp', 'interception-bot'):
        with tempfile.TemporaryDirectory(prefix='kuaihuo-offline-tests-') as directory:
            work = Path(directory) / project
            shutil.copytree(ROOT / project, work, ignore=ignore)
            runner = work / '_offline_runner.py'
            runner.write_text('''import socket,sys,unittest
def denied(*args, **kwargs):
    raise RuntimeError("Network disabled during offline verification")
socket.create_connection=denied
socket.socket.connect=denied
socket.socket.connect_ex=denied
suite=unittest.defaultTestLoader.discover("tests")
result=unittest.TextTestRunner(verbosity=2).run(suite)
sys.exit(not result.wasSuccessful())
''')
            environment = {key: value for key, value in os.environ.items() if not key.startswith(('CORE_NEXUS', 'COZE', 'ACS_', 'DM_', 'WHISPER'))}
            environment['PYTHONDONTWRITEBYTECODE'] = '1'
            print('Testing ' + project, flush=True)
            result = subprocess.run([sys.executable, '-B', str(runner)], cwd=work, env=environment, timeout=120)
            failed = failed or result.returncode != 0
    return int(failed)


if __name__ == '__main__':
    raise SystemExit(main())
