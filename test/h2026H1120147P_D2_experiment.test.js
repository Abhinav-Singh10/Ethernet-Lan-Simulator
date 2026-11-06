import assert from "node:assert/strict";
import test from "node:test";
import { createExperiment } from "../src/h2026H1120147P_D2_experiment.ts";

const hosts = ["A", "B", "C"].map((name, index) => ({
  name, mac: `02:00:00:00:00:0${index + 1}`, mbps: 10, delayMs: 0.2,
}));

function frame(source, destination, timeMs = 0) {
  return { source, destination, timeMs, bytes: 1000 };
}

function start(overrides = {}) {
  const result = createExperiment({
    hosts,
    traffic: [frame("A", "B"), frame("C", "B")],
    capacity: 1,
    policy: "learning",
    ...overrides,
  });
  assert.ok(result.experiment, JSON.stringify(result.errors));
  return result.experiment;
}

function run(overrides) {
  const experiment = start(overrides);
  experiment.run();
  return experiment.snapshot();
}

function events(state, kind) {
  return state.trace.filter(event => event.kind === kind);
}

test("one frame is delivered in 2 ms and only the addressed host accepts it", () => {
  const state = run({ traffic: [frame("A", "B")], policy: "flooding" });
  assert.deepEqual(events(state, "Delivered").map(event => [event.location, event.delay]), [["B", 2_000_000]]);
  assert.deepEqual(events(state, "Ignored").map(event => event.location), ["C"]);
  assert.deepEqual(state.statistics, { generated: 1, delivered: 1, drops: 0, meanDelay: 2_000_000 });
});

test("one switch waiting slot gives FIFO delivery at 2 ms and 2.8 ms", () => {
  const state = run();
  assert.deepEqual(events(state, "Queued").map(event => event.location), ["Switch → B"]);
  assert.deepEqual(events(state, "Delivered").map(event => [event.frameId, event.time]), [
    [1, 2_000_000], [2, 2_800_000],
  ]);
  assert.equal(state.statistics.meanDelay, 2_400_000);
  assert.ok(state.links.every(link => !link.fromHost.busy && !link.fromSwitch.busy));
});

test("zero waiting slots drops a busy output copy", () => {
  const state = run({ capacity: 0 });
  assert.deepEqual(events(state, "Dropped").map(event => [event.frameId, event.location]), [[2, "Switch → B"]]);
  assert.equal(state.statistics.drops, 1);
  assert.equal(state.statistics.delivered, 1);
});

test("a completion frees the output before a previously scheduled arrival at the same time", () => {
  const state = run({ capacity: 0, traffic: [frame("A", "B"), frame("C", "B", 0.8)] });
  const tied = state.trace.filter(event => event.time === 1_800_000);
  assert.equal(tied[0].kind, "Completed");
  assert.equal(events(state, "Arrived")[1].time, 1_800_000);
  assert.equal(state.statistics.drops, 0);
  assert.equal(state.statistics.delivered, 2);
});

test("a link transmits independently in both directions", () => {
  const experiment = start({ traffic: [frame("B", "A"), frame("A", "B", 1)] });
  for (let i = 0; i < 4; i++) assert.ok(experiment.step());

  const state = experiment.snapshot();
  const link = state.links.find(link => link.name === "A");
  assert.equal(state.time, 1_000_000);
  assert.equal(link.fromHost.busy, true);
  assert.equal(link.fromSwitch.busy, true);
  experiment.run();
  assert.equal(experiment.snapshot().statistics.delivered, 2);
});

test("a frame remains on the link between transmission completion and arrival", () => {
  const experiment = start({ traffic: [frame("A", "B")] });
  experiment.step();
  experiment.step();
  const fromHost = () => experiment.snapshot().links[0].fromHost;

  assert.equal(fromHost().busy, false);
  assert.deepEqual(fromHost().inFlight, [1]);
  experiment.step();
  assert.deepEqual(fromHost().inFlight, []);
});

test("learning floods unknown destinations and unicasts to learned ports", () => {
  const traffic = [frame("A", "B"), frame("B", "A", 3), frame("A", "B", 6)];
  const learned = run({ traffic });
  const flooded = run({ traffic, policy: "flooding" });

  assert.deepEqual(events(learned, "Sending").filter(event => event.location === "Switch → C")
    .map(event => event.frameId), [1]);
  assert.deepEqual(events(flooded, "Sending").filter(event => event.location === "Switch → C")
    .map(event => event.frameId), [1, 2, 3]);
  assert.deepEqual(learned.macTable, [[hosts[0].mac, "A"], [hosts[1].mac, "B"]]);
  assert.deepEqual(flooded.macTable, []);
});

test("Run, repeated Step, and a fresh experiment agree", () => {
  const completed = run();
  const stepped = start();
  while (stepped.step()) {}
  assert.deepEqual(stepped.snapshot(), completed);

  const fresh = start();
  const initial = fresh.snapshot();
  assert.equal(initial.time, 0);
  assert.deepEqual(initial.trace, []);
  assert.deepEqual(initial.macTable, []);
  assert.equal(initial.statistics.generated, 0);
  fresh.run();
  assert.deepEqual(fresh.snapshot(), completed);
});

test("empty traffic and invalid settings are handled before scheduling", () => {
  const empty = run({ traffic: [] });
  assert.equal(empty.done, true);
  assert.deepEqual(empty.trace, []);
  assert.equal(empty.statistics.meanDelay, null);

  const { errors } = createExperiment({
    hosts: [{ ...hosts[0], mbps: 0 }, { ...hosts[1], mac: hosts[0].mac }],
    traffic: [{ ...frame("A", "D"), bytes: 0 }],
    capacity: -1,
    policy: "learning",
  });
  for (const field of ["host-0-mbps", "host-1-mac", "traffic-0-destination", "traffic-0-bytes", "capacity"]) {
    assert.ok(errors[field], field);
  }
});
