// Drop-in replacement for localtunnel's lib/HeaderHostTransformer.js.
// The original turns each chunk into a UTF-8 string to rewrite the Host header,
// which corrupts binary request bodies (uploaded audio) that share that first chunk.
// This version works on raw bytes (latin1 maps every byte 1:1), so bodies pass intact.
const { Transform } = require('stream');

class HeaderHostTransformer extends Transform {
  constructor(opts = {}) {
    super(opts);
    this.host = opts.host || 'localhost';
    this.replaced = false;
  }

  _transform(data, encoding, callback) {
    if (this.replaced) return callback(null, data);
    const text = data.toString('latin1');
    const out = text.replace(/(\r\n[Hh]ost: )\S+/, (match, $1) => {
      this.replaced = true;
      return $1 + this.host;
    });
    callback(null, Buffer.from(out, 'latin1'));
  }
}

module.exports = HeaderHostTransformer;
