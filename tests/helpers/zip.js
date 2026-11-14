/** 시험용: gas-fakes의 Utilities.zip이 만든 압축 없는(stored) zip을 읽는다. 중앙 디렉터리를 따라 {이름: Buffer}를 돌려준다. */
function unzipStored(buf) {
  buf = Buffer.from(buf);
  let end = -1;
  for (let i = buf.length - 22; i >= 0; i--) if (buf.readUInt32LE(i) === 0x06054b50) { end = i; break; }
  if (end < 0) throw new Error('zip 끝 표지가 없습니다');
  const n = buf.readUInt16LE(end + 10);
  let p = buf.readUInt32LE(end + 16);
  const out = {}, order = [];
  for (let k = 0; k < n; k++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('중앙 디렉터리가 깨졌습니다');
    const method = buf.readUInt16LE(p + 10), size = buf.readUInt32LE(p + 24), nlen = buf.readUInt16LE(p + 28), elen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32), off = buf.readUInt32LE(p + 42);
    const name = buf.slice(p + 46, p + 46 + nlen).toString('utf8');
    if (method !== 0) throw new Error('압축 없는 zip만 읽습니다: ' + name);
    const lnlen = buf.readUInt16LE(off + 26), lelen = buf.readUInt16LE(off + 28);
    out[name] = buf.slice(off + 30 + lnlen + lelen, off + 30 + lnlen + lelen + size);
    order.push(name);
    p += 46 + nlen + elen + clen;
  }
  Object.defineProperty(out, '_order', { value: order, enumerable: false });
  return out;
}
module.exports = { unzipStored };
