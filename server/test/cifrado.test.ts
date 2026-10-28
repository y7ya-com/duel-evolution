import { expect, it } from "vitest";
import { accountId, encrypt, legacyId } from "../src/util/cifrado.ts";
import { hex } from "../src/net/proto.ts";

// expected values from py research/cuentas/cifrado.py
it("matches py cifrado", () => {
  const b = encrypt("duenoprueba", "clave-inventada1");
  expect(hex(b)).toBe("9c8b2ba5531af647af87b65d09ab6ed07ad8491fe23a110074f8069633ad6221");
  expect(accountId(b)).toBe("759f201a2214991f");
  const x = Uint8Array.from({ length: 32 }, (_, i) => i);
  expect([accountId(x), legacyId(x)]).toEqual(["630dcd2966c43366", "630dcd2966c43366"]);
});
