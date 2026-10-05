import { readFile, access } from 'node:fs/promises';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import path from 'node:path';
const config = JSON.parse(await readFile('capacitor.config.json', 'utf8'));
assert.equal(config.webDir, 'dist');
assert.ok(!config.server?.url, 'The release app must bundle its UI.');
const html = await readFile('dist/index.html', 'utf8');
assert.ok(html.includes('nativeAppleLogin'), 'Apple login button must be bundled.');
const loginSection = html.match(/<section id="login"[\s\S]*?<\/section>/)?.[0] || '';
assert.ok(loginSection.includes('nativeAppleLogin'), 'Apple must be the primary login.');
assert.ok(!loginSection.includes('onclick="requestTelegramAuth()"'), 'Telegram must not be the primary login.');
assert.ok(!html.includes('sessionStorage.setItem(LEGACY_AUTH_TOKEN_KEY, data.token)'));
for (const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) new vm.Script(match[1]);
const staticHtml = html.replace(/<script(?:\s[^>]*)?>[\s\S]*?<\/script>/g, '');
for (const match of staticHtml.matchAll(/(?:src|href)="([^"#?]+)(?:[?#][^"]*)?"/g)) {
  const target = match[1];
  if (!target.includes(':') && !target.startsWith('//')) await access(path.join('dist', target));
}
for (const file of ['KarpserviceAPIPlugin.swift', 'KarpserviceViewController.swift', 'PrivacyInfo.xcprivacy']) {
  const project = await readFile('ios/App/App.xcodeproj/project.pbxproj', 'utf8');
  assert.ok(project.includes(`${file} in `), `${file} must be part of the Xcode target`);
}
const auth = await readFile('ios/App/App/KarpserviceAPIPlugin.swift', 'utf8');
assert.ok(auth.includes('kSecAttrAccessibleWhenUnlockedThisDeviceOnly'));
assert.ok(auth.includes('completionHandler(nil)'));
assert.ok(auth.includes('ASAuthorizationAppleIDProvider'));
assert.ok(auth.includes('"auth/apple": "POST"'));
const project = await readFile('ios/App/App.xcodeproj/project.pbxproj', 'utf8');
assert.ok(project.includes('CODE_SIGN_ENTITLEMENTS = App/App.entitlements;'));
const entitlements = await readFile('ios/App/App/App.entitlements', 'utf8');
assert.ok(entitlements.includes('com.apple.developer.applesignin'));
console.log('Bundled UI, source syntax, assets, Xcode references and transport configuration verified.');
