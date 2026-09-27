#!/usr/bin/env bash
set -euo pipefail
[[ "${GITHUB_ACTIONS:-}" == "true" && "$(uname -s)" == "Darwin" ]] || exit 1
SOURCE_APP="DerivedData/Build/Products/Release-iphonesimulator/App.app"
CAPTURE_APP="$RUNNER_TEMP/Karpservice-Screenshots.app"
ditto "$SOURCE_APP" "$CAPTURE_APP"
DEVICE_TYPE=$(xcrun simctl list devicetypes -j | python3 -c 'import sys,json; d=json.load(sys.stdin); print(next(x["identifier"] for x in d["devicetypes"] if x["name"]=="iPhone 14 Plus"))')
RUNTIME_ID=$(xcrun simctl list runtimes -j | python3 -c 'import sys,json; d=json.load(sys.stdin); print(next(x["identifier"] for x in d["runtimes"] if x.get("isAvailable") and x["name"].startswith("iOS 26")))')
CAPTURE_SIM=$(xcrun simctl create Karpservice-AppStore "$DEVICE_TYPE" "$RUNTIME_ID")
trap 'xcrun simctl shutdown "$CAPTURE_SIM" >/dev/null 2>&1 || true; xcrun simctl delete "$CAPTURE_SIM" >/dev/null 2>&1 || true; rm -rf "$CAPTURE_APP"' EXIT
xcrun simctl boot "$CAPTURE_SIM"
xcrun simctl bootstatus "$CAPTURE_SIM" -b
xcrun simctl status_bar "$CAPTURE_SIM" override --time '9:41' --batteryState charged --batteryLevel 100 --dataNetwork wifi --wifiMode active --wifiBars 3
mkdir -p artifacts/app-store-screenshots
index=1
for screen in cars service time history order done; do
  node screenshots/prepare-bundle.mjs "$CAPTURE_APP" "$screen"
  codesign --force --sign - "$CAPTURE_APP"
  xcrun simctl install "$CAPTURE_SIM" "$CAPTURE_APP"
  xcrun simctl launch "$CAPTURE_SIM" ua.karpservice.client
  sleep 8
  xcrun simctl io "$CAPTURE_SIM" screenshot "artifacts/app-store-screenshots/0${index}-${screen}.png"
  xcrun simctl terminate "$CAPTURE_SIM" ua.karpservice.client
  xcrun simctl uninstall "$CAPTURE_SIM" ua.karpservice.client
  index=$((index + 1))
done
python3 - <<'PY'
import json,os,struct
from pathlib import Path
folder=Path('artifacts/app-store-screenshots')
images=[]
for path in sorted(folder.glob('*.png')):
    size=struct.unpack('>II',path.read_bytes()[16:24])
    assert size==(1284,2778),(str(path),size)
    images.append({'file':path.name,'width':size[0],'height':size[1]})
assert len(images)==6
(folder/'capture.json').write_text(json.dumps({'sourceCommit':os.environ['GITHUB_SHA'],'device':'iPhone 14 Plus','data':'Public local demo with fictional records; no production requests','productionBundleModified':False,'screenshots':images},indent=2)+'\n')
PY
