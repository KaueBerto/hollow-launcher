'use strict';
const { Transform } = require('node:stream');
const { StringDecoder } = require('node:string_decoder');
function redactedLog(secret) {
  const decoder = new StringDecoder('utf8');
  let pending = '';
  const redact = text => secret ? text.replaceAll(secret, '[sessão protegida]') : text;
  return new Transform({
    transform(chunk, _encoding, done) {
      pending += decoder.write(chunk);
      const last = pending.lastIndexOf('\n');
      if (last >= 0) { this.push(redact(pending.slice(0, last + 1))); pending = pending.slice(last + 1); }
      // Retain enough tail to catch a token split across any stdout chunk boundary.
      if (pending.length > 65536 + (secret?.length || 0)) {
        const boundary = pending.length - Math.max(secret?.length || 0, 1);
        const safe = redact(pending);
        if (safe !== pending) { this.push(safe); pending = ''; }
        else { this.push(pending.slice(0, boundary)); pending = pending.slice(boundary); }
      }
      done();
    },
    flush(done) { this.push(redact(pending + decoder.end())); done(); },
  });
}
module.exports = { redactedLog };
