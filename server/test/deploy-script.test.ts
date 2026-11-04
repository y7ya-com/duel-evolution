// Execute the actual deployment script with local command stubs: never contact production.
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { expect, it } from "vitest";

function deployment(mode = "ready") {
  const root = mkdtempSync(join(tmpdir(), "duel-deploy-test-")), scripts = join(root, "scripts"), bin = join(root, "bin"), log = join(root, "events");
  mkdirSync(scripts); mkdirSync(bin);
  writeFileSync(join(scripts, "deploy.sh"), readFileSync(join(import.meta.dirname, "../scripts/deploy.sh")));
  const stub = (path: string, body: string) => writeFileSync(path, "#!/usr/bin/env bash\nset -eu\n" + body, { mode: 0o700 });
  stub(join(bin, "curl"), `action="\${!#}"; action="\${action##*/}"
printf '%s\\n' "$action" >> "$DEPLOY_TEST_LOG"
case "$action" in
online)
  if [ "$DEPLOY_TEST_MODE" = busy ]; then echo '{"online":2,"duels":1}'; else echo '{"online":2,"duels":0}'; fi;;
announce) echo '{}';;
prepare-restart)
  if [ "$DEPLOY_TEST_MODE" = unavailable ]; then exit 22; fi
  if [ "$DEPLOY_TEST_MODE" = unconfirmed ]; then echo '{"ready":true}'; else echo '{"ready":true,"duelsVoided":true}'; fi;;
shutdown)
  if [ "$DEPLOY_TEST_MODE" = shutdown-unconfirmed ]; then echo '{"closed":2}'; else echo '{"closed":2,"duelsVoided":true}'; fi;;
version) echo '{"v":"test-version"}';;
*) exit 1;;
esac
`);
  stub(join(bin, "npx"), `echo deploy >> "$DEPLOY_TEST_LOG"; echo 'Uploaded'; echo 'Current Version ID: test-version'\n`);
  for (const step of ["post_deploy.sh", "prod_check.sh"]) stub(join(scripts, step), `echo ${step} >> "$DEPLOY_TEST_LOG"\n`);
  const result = spawnSync("bash", [join(scripts, "deploy.sh"), "0"], { encoding: "utf8", env: { ...process.env, PATH: bin + ":" + process.env.PATH, DEPLOY_TOKEN: "test-only", DEPLOY_TEST_LOG: log, DEPLOY_TEST_MODE: mode } });
  const events = readFileSync(log, "utf8").trim().split("\n");
  rmSync(root, { recursive: true, force: true });
  return { result, events };
}
it("voids and flushes the old world before shutdown and code deployment", () => {
  const { result, events } = deployment();
  expect(result.status).toBe(0);
  expect(events).toEqual(["online", "online", "prepare-restart", "shutdown", "deploy", "version", "post_deploy.sh", "prod_check.sh"]);
});
it.each(["unavailable", "unconfirmed"])("refuses shutdown and deploy when restart preparation is %s", mode => {
  const { result, events } = deployment(mode);
  expect(result.status).not.toBe(0);
  expect(events).toEqual(["online", "online", "prepare-restart"]);
});

it("preserves main's refusal to deploy while a duel remains after the countdown", () => {
  const { result, events } = deployment("busy");
  expect(result.status).toBe(3);
  expect(events).toEqual(["online", "online", "announce"]);
});
it("refuses upload when shutdown does not confirm duel exemption", () => {
  const { result, events } = deployment("shutdown-unconfirmed");
  expect(result.status).not.toBe(0);
  expect(events).toEqual(["online", "online", "prepare-restart", "shutdown"]);
});
