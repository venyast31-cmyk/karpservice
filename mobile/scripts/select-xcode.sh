#!/usr/bin/env bash
set -euo pipefail
# Use the newest installed Xcode 26 release on the existing macOS runner.
KARP_XCODE_PATH=$(python3 - <<'PY'
import glob, re
paths = glob.glob('/Applications/Xcode_26*.app/Contents/Developer')
if not paths:
    raise SystemExit('Xcode 26 is required on this runner')
print(sorted(paths, key=lambda p: tuple(map(int, re.findall(r'\d+', p))))[-1])
PY
)
sudo xcode-select -s "$KARP_XCODE_PATH"
xcodebuild -version
