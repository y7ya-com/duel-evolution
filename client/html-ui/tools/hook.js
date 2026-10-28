// WebGL2 draw logger for the recompiled client (platform/gfx: one program, one VBO of 24-byte vertices
// x,y,z f32 | r,g,b,a u8 | u,v f32, one glDrawArrays(TRIANGLES) per batch, Present = blitFramebuffer).
// window.__gl.arm = 1 records the next whole frame into __gl.last: every draw with its uniforms, blend state, texture
// (id, size, filters) and vertices. __gl.snapAt = [i, ...] reads the back buffer just before draw i (and 'end');
// __gl.snapTex = [id or 'WxH', ...] just before the first draw with that texture.
(() => {
  const G = WebGL2RenderingContext.prototype, S = window.__gl = { arm: 0, snapAt: [], snapTex: [], frame: 0, last: null, uploads: [] };
  const ids = new WeakMap(); let nid = 1; const id = o => o ? (ids.get(o) || (ids.set(o, nid++), ids.get(o))) : 0;
  const texInfo = new Map(), texObj = new Map(), locName = new WeakMap(), uni = {};
  let unit = 0, bound = {}, abuf = null, abufData = null, cur = null, blend = { on: false }, fb = null, ctx = null;
  const wrap = (n, f) => { const o = G[n]; G[n] = function (...a) { return f.call(this, o, a); }; };
  wrap('getUniformLocation', function (o, a) { const l = o.apply(this, a); if (l) locName.set(l, a[1]); return l; });
  for (const n of Object.getOwnPropertyNames(G).filter(n => /^uniform(\d|Matrix)/.test(n)))
    wrap(n, function (o, a) {   // WebGL2 emscripten passes the whole heap view + srcOffset/srcLength
      const k = locName.get(a[0]);
      if (k) {
        const vi = a.findIndex(v => ArrayBuffer.isView(v));
        if (vi < 0) uni[k] = a.slice(1);
        else { const v = a[vi], off = a[vi + 1] || 0, len = a[vi + 2] || (v.length - off); uni[k] = Array.from(v.subarray(off, off + Math.min(len, 16))); }
      }
      return o.apply(this, a);
    });
  wrap('activeTexture', function (o, a) { unit = a[0] - this.TEXTURE0; return o.apply(this, a); });
  wrap('bindTexture', function (o, a) { bound[unit] = a[1]; if (a[1]) texObj.set(id(a[1]), a[1]); return o.apply(this, a); });
  wrap('texImage2D', function (o, a) {
    if (a.length >= 8 && typeof a[3] === 'number') texInfo.set(id(bound[unit]), { w: a[3], h: a[4], params: {} });
    return o.apply(this, a);
  });
  wrap('texSubImage2D', function (o, a) {
    if (S.arm || S.logUploads) S.uploads.push({ frame: S.frame, tex: id(bound[unit]), x: a[2], y: a[3], w: a[4], h: a[5] });
    return o.apply(this, a);
  });
  wrap('texParameteri', function (o, a) { const t = texInfo.get(id(bound[unit])); if (t) t.params[a[1]] = a[2]; return o.apply(this, a); });
  wrap('bindBuffer', function (o, a) { if (a[0] === this.ARRAY_BUFFER) abuf = a[1]; return o.apply(this, a); });
  wrap('bufferData', function (o, a) {
    if (S.arm && a[0] === this.ARRAY_BUFFER && ArrayBuffer.isView(a[1])) {
      const v = a[1], off = (a[3] || 0) * v.BYTES_PER_ELEMENT, len = (a[4] !== undefined ? a[4] * v.BYTES_PER_ELEMENT : v.byteLength - off);
      abufData = new Uint8Array(v.buffer.slice ? new Uint8Array(v.buffer, v.byteOffset + off, len).slice().buffer : v.buffer);
    }
    return o.apply(this, a);
  });
  wrap('enable', function (o, a) { if (a[0] === this.BLEND) blend.on = true; return o.apply(this, a); });
  wrap('disable', function (o, a) { if (a[0] === this.BLEND) blend.on = false; return o.apply(this, a); });
  wrap('blendFunc', function (o, a) { blend.src = a[0]; blend.dst = a[1]; return o.apply(this, a); });
  wrap('blendEquation', function (o, a) { blend.eq = a[0]; return o.apply(this, a); });
  wrap('bindFramebuffer', function (o, a) { if (a[0] !== this.READ_FRAMEBUFFER) fb = a[1]; return o.apply(this, a); });
  const read = (gl, w, h) => { const p = new Uint8Array(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, p); return p; };
  const b64 = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
  wrap('drawArrays', function (o, a) {
    ctx = this;
    if (S.arm) {
      if (!cur) cur = { frame: S.frame, draws: [], snaps: {} };
      const i = cur.draws.length;
      const t = bound[0] ? id(bound[0]) : 0, ti = texInfo.get(t);
      if (S.snapAt.includes(i)) cur.snaps[i] = b64(read(this, 1024, 768));
      for (const k of [t, ti && ti.w + 'x' + ti.h]) if (S.snapTex.includes(k) && !cur.snaps['t' + k]) cur.snaps['t' + k] = b64(read(this, 1024, 768));
      const n = a[2], f = new Float32Array(abufData.buffer, 0, abufData.byteLength / 4), vs = [];
      for (let k = a[1]; k < a[1] + n; k++) { const b = k * 6; vs.push([f[b], f[b + 1], f[b + 2], abufData[b * 4 + 12], abufData[b * 4 + 13], abufData[b * 4 + 14], abufData[b * 4 + 15], f[b + 4], f[b + 5]]); }
      cur.draws.push({ tex: t, tw: ti?.w, th: ti?.h, filt: ti && ti.params[this.TEXTURE_MAG_FILTER], fb: id(fb), blend: { ...blend }, uni: JSON.parse(JSON.stringify(uni)), vs });
    }
    return o.apply(this, a);
  });
  wrap('blitFramebuffer', function (o, a) {
    if (S.arm && cur) { cur.snaps.end = b64(read(this, 1024, 768)); S.last = cur; cur = null; S.arm--; }
    S.frame++;
    return o.apply(this, a);
  });
  S.dumpTex = (tid) => {   // raw texels as stored (B,G,R,A for CPU textures), base64
    const gl = ctx, t = texObj.get(tid), ti = texInfo.get(tid);
    const prev = gl.getParameter(gl.READ_FRAMEBUFFER_BINDING), f = gl.createFramebuffer();
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, f);
    gl.framebufferTexture2D(gl.READ_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    const p = read(gl, ti.w, ti.h);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, prev); gl.deleteFramebuffer(f);
    return { w: ti.w, h: ti.h, data: b64(p) };
  };
})();
