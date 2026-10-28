import { expect, it } from "vitest";
import { PyRandom } from "../src/util/pyrandom.ts";

// expected values from CPython 3.12
it("matches CPython random", () => {
  const r = new PyRandom(1);
  expect([r.random(), r.random(), r.random()]).toEqual([0.13436424411240122, 0.8474337369372327, 0.763774618976614]);
  r.seed(1);
  expect(Array.from({ length: 10 }, () => r.randint(1, 6))).toEqual([2, 5, 1, 3, 1, 4, 4, 4, 6, 4]);
  expect([r.getrandbits(40), r.randrange(1000)]).toEqual([231020807702, 96]);
  const l = Array.from({ length: 20 }, (_, i) => i); r.shuffle(l);
  expect(l).toEqual([2, 10, 8, 17, 16, 6, 19, 5, 1, 9, 3, 14, 4, 7, 11, 18, 13, 12, 0, 15]);
  expect(r.sample(Array.from({ length: 100 }, (_, i) => i), 10)).toEqual([54, 92, 3, 67, 28, 97, 56, 63, 70, 29]);
  expect(r.sample([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], 4)).toEqual([5, 3, 8, 6]);
  expect(r.choice([..."abcdef"])).toBe("d");
  const r2 = new PyRandom(2n ** 40n + 12345n);
  expect(r2.random()).toBe(0.31036222241287226);
  expect(r2.getrandbitsBig(64)).toBe(71892023542129199n);
});
