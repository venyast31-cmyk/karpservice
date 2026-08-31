from pathlib import Path
import os
import re

path = Path("index.html")
text = path.read_text(encoding="utf-8")
bridge_url = os.environ["BRIDGE_URL"].rstrip("/") + "/"

old_api = "const API_URL = new URL('/api/', window.location.origin).href;"
if old_api in text:
    text = text.replace(old_api, f"const API_URL = {bridge_url!r};", 1)
else:
    text, count = re.subn(
        r"const API_URL = ['\"]https://[^'\"]+['\"];",
        f"const API_URL = {bridge_url!r};",
        text,
        count=1,
    )
    if count != 1:
        raise SystemExit("API_URL declaration was not found")

old_verify = "\n".join([
    "    setAuthSession(true);",
    "    clearLegacyAuthToken();",
    "    authChallengeId = '';",
    "    await loadCustomer();",
])
new_verify = "\n".join([
    "    if (typeof data.token === 'string' && /^[A-Za-z0-9_-]{40,100}$/.test(data.token)){",
    "      legacyAuthToken = data.token;",
    "      try{ window.sessionStorage.setItem(LEGACY_AUTH_TOKEN_KEY, data.token); }catch{}",
    "    }else{",
    "      throw new Error('Сервіс не повернув токен входу.');",
    "    }",
    "    setAuthSession(true);",
    "    authChallengeId = '';",
    "    await loadCustomer();",
])

if old_verify in text:
    text = text.replace(old_verify, new_verify, 1)
elif "window.sessionStorage.setItem(LEGACY_AUTH_TOKEN_KEY, data.token)" not in text:
    raise SystemExit("Telegram verification block was not found")

old_loaded = "\n".join([
    "    customerData = data;",
    "    setAuthSession(true);",
    "    clearLegacyAuthToken();",
    "    renderCustomer();",
])
new_loaded = "\n".join([
    "    customerData = data;",
    "    setAuthSession(true);",
    "    renderCustomer();",
])
if old_loaded in text:
    text = text.replace(old_loaded, new_loaded, 1)
elif new_loaded not in text:
    raise SystemExit("Customer session retention block was not found")

path.write_text(text, encoding="utf-8")
print(f"Connected app to {bridge_url}")
