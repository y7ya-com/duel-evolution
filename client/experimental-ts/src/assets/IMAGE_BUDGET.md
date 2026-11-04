# Image bounds and cache integration

`imageBudget(bytes, mime, limits?)` from `./image-bounds` synchronously checks
dimensions before any browser decode and returns
`{ format, width, height, pixels, decodedBytes }`. It reads the supplied view
without copying it, creating a Blob, allocating pixel storage, using canvas,
or decoding the image. Imports are extensionless for the browser TS build.

Call this after archive extraction but **before** `new Blob`,
`URL.createObjectURL`, `img.src`, or `createImageBitmap`. Do not decode once to
obtain dimensions and again to display. The manager integration belongs in
`assets/index.ts`; this module does not change manager behavior by itself.

For supported images, charge retained source bytes + Blob backing estimate +
`decodedBytes` in the cache. With the existing two-source-copy accounting this
is `bytes.byteLength * 2 + budget.decodedBytes`. Check that this sum is a safe
integer and within the cache budget **before** creating the URL. Reject a
load when validation fails; do not fall back to the old compressed-only charge.
Pass any configured `Partial<ImageLimits>` through to the helper. Keep a
lease while the UI displays the image, detach the image before releasing it,
and preserve the existing URL cleanup on insertion failure/eviction/disposal.
Dimension validation and lease integration must also cover card fallback,
mini and scene paths. Existing manager tests use fake three-byte JPEGs and
one-byte PNGs; integration will require replacing those fixtures in the
parent-owned tests.

`decodedBytes` is exactly `width * height * 4`, checked for safe-integer
overflow. It estimates **one RGBA surface**. It is not measured browser memory
or guaranteed GPU accounting. Browser decoder scratch space, higher precision
buffers, color conversion, mipmaps, device textures, duplicate elements and
delayed reclamation may require additional storage. The retained source count
also assumes whole owned arrays; a subarray may retain a larger backing buffer.
Rejecting observed APNG/WebP animation headers reduces one source of extra
surfaces, but this header inspector is not a complete animation or bitstream
validator. Budget headroom remains necessary.

## Policy and bounds

Defaults: width/height at most 8192 each, 16,777,216 pixels, 64 MiB per RGBA
surface, 1 MiB of pre-pixel PNG/JPEG headers, and 1024 JPEG markers or WebP
chunks. Limits must be positive safe integers. Configured traversal bounds
cannot exceed 16 MiB / 65,536 markers. Dimension and byte caps apply independently.

Only `image/png`, `image/jpeg`, `image/bmp`, and `image/webp` are accepted,
ignoring surrounding whitespace and case. MIME parameters and aliases such
as `image/jpg` are rejected. Each format must match its actual signature.
Unknown image formats, GIF, SVG and octet-stream inputs fail closed rather
than being assigned a zero decoded charge. The parent should only invoke this
API for images, and must explicitly decide whether non-image scene payloads
may be returned as opaque bytes. Do not MIME-sniff unknown data into a browser
image. The current manager MIME mapper names PNG/JPEG/BMP; WebP support here
requires a corresponding explicit parent-side mapping if used.

- PNG: requires the signature and a 13-byte first IHDR, verifies IHDR CRC,
  legal bit depth/color/compression/filter/interlace fields and format dimension
  range. Traverses complete bounded pre-IDAT chunks, rejects duplicate IHDR,
  early IEND and pre-IDAT `acTL`, and requires an IDAT chunk. It does not inflate
  pixels, validate other CRCs or validate the tail after the first IDAT.
- JPEG: requires SOI, bounded marker/fill traversal with checked segment lengths,
  one supported 8-bit SOF0/SOF1/SOF2 frame and a structurally consistent first
  SOS. Rejects zero dimensions, DNL-dependent height, unsupported coding frames,
  duplicate frames, bad component tables and premature standalone markers.
  Stops at the first SOS; entropy data, later scans, EOI and embedded metadata
  are not decoded or fully validated.
- BMP: requires BM, matching declared file size, a supported 12/40/52/56/108/124
  byte DIB, valid planes/depth/offset and positive width/nonzero signed height.
  Supports uncompressed RGB and 16/32-bit bitfields with nonzero disjoint masks;
  rejects RLE, embedded JPEG/PNG and other encodings. Checks padded row storage
  against available bytes. Does not validate palettes, color profiles or pixels.
- WebP: requires matching RIFF/WEBP length and complete bounded chunks/padding,
  one VP8 keyframe or VP8L header, and matching VP8X canvas when present.
  Rejects animation, duplicate image chunks, reserved header fields and
  unsupported lossless versions. Does not decode compressed pixel data or fully
  validate metadata/feature flags.

Passing these checks means dimensions are available for admission accounting;
the browser can still reject corrupt pixel data. Handle decode failures by
releasing the UI lease. This helper does not sanitize arbitrary image files.

## Evidence

`tests/assets-image-bounds.test.ts` uses synthetic format headers and payloads
to exercise truncation, malformed fields, MIME mismatches, oversized dimensions,
independent budget limits, overflow and bounded traversal. These tests do not
establish successful browser decoding or archive parity. Original game archives
were not available and no real archive assets were checked or downloaded.

Run the focused suite with:

```sh
node tools/run.mjs vitest run tests/assets-image-bounds.test.ts
```
