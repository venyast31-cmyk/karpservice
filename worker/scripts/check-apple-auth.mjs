import assert from 'node:assert/strict';

// Exercises deployed key fetching and signature verification without a real
// Apple identity, authorization code, CRM access, or customer session.
const origin = 'https://karpservice-api.venyast31.workers.dev';
async function post(path, body) {
  return fetch(`${origin}${path}`, {
    method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(20000),
    headers: {'Content-Type':'application/json'}, body: JSON.stringify(body)
  });
}
const keysResponse = await fetch('https://appleid.apple.com/auth/keys', {redirect:'manual',signal:AbortSignal.timeout(10000)});
assert.equal(keysResponse.status, 200);
const {keys} = await keysResponse.json();
const key = keys.find(key => key.kty === 'RSA' && key.alg === 'RS256' && key.use === 'sig');
assert.ok(key);
const start = await post('/auth/apple/start', {mode:'login'});
assert.equal(start.status, 200);
const challenge = await start.json();
assert.ok(challenge.success);
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const issued = Math.floor(Date.now()/1000);
const identity = `${encode({alg:'RS256',kid:key.kid})}.${encode({iss:'https://appleid.apple.com',aud:'ua.karpservice.client',sub:'invalid-signature-probe',nonce:challenge.nonce,iat:issued,exp:issued+60})}.${Buffer.alloc(Buffer.from(key.n,'base64url').length).toString('base64url')}`;
const complete = await post('/auth/apple/complete', {challenge_id:challenge.challenge_id,identity_token:identity,authorization_code:'invalid-signature-probe'});
const result = await complete.json();
assert.equal(complete.status,401,'Invalid signature must be rejected with 401, never a Worker runtime error');
assert.equal(result.success,false);
assert.equal(result.token,undefined);
console.log('Deployed Apple key verification passed: invalid signature rejected with 401; no session created.');
