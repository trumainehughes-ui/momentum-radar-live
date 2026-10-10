import test from "node:test";
import assert from "node:assert/strict";
import { filterCurrentRoleEvidence } from "../lib/ai-mechanics/role-evidence.js";
const record={name:"Sample Player",team:"PHI",authority:"NFL_OFFICIAL",status:"CONFIRMED_STARTER",source:"Official report",checkedAt:"2026-10-09T12:00:00Z"};
const now=Date.parse("2026-10-09T14:00:00Z"),kickoff=Date.parse("2026-10-10T00:00:00Z");
test("fresh official starter evidence passes",()=>assert.equal(filterCurrentRoleEvidence([record],{now,kickoff}).length,1));
test("old starter report is excluded",()=>assert.equal(filterCurrentRoleEvidence([{...record,checkedAt:"2026-09-28T12:00:00Z"}],{now,kickoff}).length,0));
test("future-dated reports are excluded",()=>assert.equal(filterCurrentRoleEvidence([{...record,checkedAt:"2026-10-10T12:00:00Z"}],{now,kickoff}).length,0));
test("untrusted report authority excluded",()=>assert.equal(filterCurrentRoleEvidence([{...record,authority:"UNKNOWN"}],{now,kickoff}).length,0));
test("missing kickoff fails closed",()=>assert.deepEqual(filterCurrentRoleEvidence([record],{now,kickoff:NaN}),[]));
test("post-kickoff role evidence excluded",()=>assert.equal(filterCurrentRoleEvidence([{...record,checkedAt:"2026-10-09T12:00:00Z"}],{now:Date.parse("2026-10-11T00:00:00Z"),kickoff}).length,1));


test("NFL endpoint ignores caller-supplied starter authority claims", async () => {
  const { readFileSync } = await import("node:fs");
  const source = readFileSync(new URL("../api/nfl-game.js", import.meta.url), "utf8");
  assert.ok(!source.includes("req.body?.roleEvidence"), "client-provided roleEvidence must never become trusted");
  assert.ok(source.includes("filterCurrentRoleEvidence(verifiedGameEvidence(gameId)"), "only server-controlled game evidence can enter official role filter");
});
