import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const html = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');
test('Apple is the sole login; Telegram verification belongs to a separate post-login screen', () => {
 const login = html.match(/<section id="login"[\s\S]*?<\/section>/)[0];
 assert.match(login, /nativeAppleLogin/);
 assert.doesNotMatch(login, /id="phone"|nativeReviewLogin|nativeDemoStart|requestTelegramAuth/);
 const phone = html.match(/<section id="phoneLink"[\s\S]*?<\/section>/)[0];
 assert.match(phone, /requestTelegramAuth/);
 assert.match(phone, /verifyTelegramCode/);
 assert.doesNotMatch(html, /nativeLinkApple/);
 const home = html.match(/<section id="home"[\s\S]*?<\/section>/)[0];
 assert.doesNotMatch(home, /Послуги сервісу|Контакти та години роботи/);
 assert.doesNotMatch(html, /Ваші дані для входу/);
});
