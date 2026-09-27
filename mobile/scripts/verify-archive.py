"""Reject simulator archives or archives with the wrong app identity."""
import plistlib
import subprocess
import sys
from pathlib import Path

archive = Path(sys.argv[1])
app = archive / 'Products/Applications/App.app'
with (app / 'Info.plist').open('rb') as stream:
    info = plistlib.load(stream)
assert info['CFBundleIdentifier'] == 'ua.karpservice.client', 'Unexpected bundle ID'
assert info['CFBundleShortVersionString'] == '1.0', 'Unexpected marketing version'
assert info['CFBundleSupportedPlatforms'] == ['iPhoneOS'], 'Not an iPhone device build'
assert info['UIDeviceFamily'] == [1], 'Unexpected device family'
assert 'arm64' in subprocess.check_output(
    ['lipo', '-archs', str(app / info['CFBundleExecutable'])], text=True
).split(), 'Missing arm64 device binary'
assert (app / 'public/index.html').is_file(), 'Missing bundled interface'
print(f"Verified iPhone archive: {info['CFBundleIdentifier']} {info['CFBundleShortVersionString']} ({info['CFBundleVersion']})")
