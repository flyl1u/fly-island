param([string]$Python)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
if (-not $Python) { $Python = Join-Path $root 'artifacts/device-battery/engine/runtime/python.exe' }
if (-not (Test-Path -LiteralPath $Python)) { throw 'Build the plugin runtime first, or pass -Python with an interpreter path.' }
$code = @'
import sys, unittest
from pathlib import Path
root = Path(sys.argv[1])
sys.path[:0] = [str(root / 'tests'), str(root / 'engine'), str(root / 'engine/tests')]
suite = unittest.defaultTestLoader.discover(str(root / 'engine/tests'))
result = unittest.TextTestRunner(verbosity=1).run(suite)
raise SystemExit(not result.wasSuccessful())
'@
& $Python -I -B -c $code (Join-Path $PSScriptRoot 'upstream')
if ($LASTEXITCODE -ne 0) { throw 'Upstream offline battery protocol tests failed.' }
