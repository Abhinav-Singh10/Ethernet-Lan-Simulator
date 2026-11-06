import { LANTopology, nsPerMs, serializationTime, SWITCH, type HostSettings } from "./h2026H1120147P_D2_lan.ts";
import { Simulator, type Observation } from "./h2026H1120147P_D2_simulator.ts";

type TrafficRule = { source: string; destination: string; bytes: number; timeMs: number };

export type Settings = {
  hosts: HostSettings[];
  traffic: TrafficRule[];
  capacity: number;
  policy: "learning" | "flooding";
};

class TraceRecorder {
  private records: Observation[] = [];

  record = (observation: Observation) => {
    this.records.push(observation);
  };

  snapshot() {
    return this.records.slice();
  }
}

class StatisticsCollector {
  private generated = 0;
  private delivered = new Set<number>();
  private drops = 0;
  private totalDelay = 0;

  record = (observation: Observation) => {
    if (observation.kind === "Generated") this.generated++;
    if (observation.kind === "Dropped") this.drops++;
    if (observation.delay !== undefined && !this.delivered.has(observation.frameId)) {
      this.delivered.add(observation.frameId);
      this.totalDelay += observation.delay;
    }
  };

  snapshot() {
    const delivered = this.delivered.size;
    return {
      generated: this.generated,
      delivered,
      drops: this.drops,
      meanDelay: delivered ? this.totalDelay / delivered : null,
    };
  }
}

function isTime(value: number) {
  return value >= 0 && Number.isSafeInteger(Math.round(value * nsPerMs));
}

function validate(settings: Settings) {
  const errors: Record<string, string> = {};
  const { hosts, traffic, capacity, policy } = settings;
  const names = new Set<string>();
  const macs = new Set<string>();

  if (hosts.length < 2) errors.hosts = "Add at least two hosts.";
  if (!Number.isSafeInteger(capacity) || capacity < 0) {
    errors.capacity = "Enter a nonnegative whole number.";
  }
  if (policy !== "learning" && policy !== "flooding") errors.policy = "Choose a forwarding policy.";

  hosts.forEach(({ name, mac, mbps, delayMs }, index) => {
    const field = `host-${index}`;
    if (!name || name === SWITCH || names.has(name)) errors.hosts = "Host names must be unique.";
    names.add(name);

    if (!/^([0-9a-f]{2}:){5}[0-9a-f]{2}$/i.test(mac)) {
      errors[`${field}-mac`] = "Use six hex pairs, such as 02:00:00:00:00:01.";
    } else if (macs.has(mac)) {
      errors[`${field}-mac`] = "This MAC address is already used.";
    }
    macs.add(mac);

    if (!Number.isFinite(mbps) || mbps <= 0) errors[`${field}-mbps`] = "Enter a positive speed.";
    if (!isTime(delayMs)) errors[`${field}-delay`] = "Enter a nonnegative delay within the clock range.";
  });

  traffic.forEach(({ source, destination, bytes, timeMs }, index) => {
    const field = `traffic-${index}`;
    if (!names.has(source)) errors[`${field}-source`] = "Select a host.";
    if (!names.has(destination)) {
      errors[`${field}-destination`] = "Select a host.";
    } else if (destination === source) {
      errors[`${field}-destination`] = "Choose a different destination.";
    }
    if (!Number.isSafeInteger(bytes) || bytes < 1) errors[`${field}-bytes`] = "Enter a positive whole number.";
    if (!isTime(timeMs)) errors[`${field}-time`] = "Enter a nonnegative time within the clock range.";
  });

  if (Object.keys(errors).length === 0 && traffic.length > 0) {
    // Each frame can use each link at most once. Summing those times bounds the run even with queues.
    let latestGeneration = 0;
    let totalLinkTime = 0;
    for (const rule of traffic) {
      latestGeneration = Math.max(latestGeneration, Math.round(rule.timeMs * nsPerMs));
      for (const host of hosts) {
        totalLinkTime += serializationTime(rule.bytes, host.mbps) + Math.round(host.delayMs * nsPerMs);
      }
    }
    if (!Number.isSafeInteger(latestGeneration + totalLinkTime)) {
      errors.configuration = "This run exceeds the clock range. Reduce the times or increase the link speeds.";
    }
  }

  return errors;
}

class Experiment {
  private simulator = new Simulator();
  private trace = new TraceRecorder();
  private statistics = new StatisticsCollector();
  private topology: LANTopology;

  constructor(settings: Settings) {
    this.simulator.subscribe(this.trace.record);
    this.simulator.subscribe(this.statistics.record);
    this.topology = new LANTopology(settings.hosts, settings.capacity, settings.policy, this.simulator);

    const addresses = new Map(settings.hosts.map(host => [host.name, host.mac]));
    settings.traffic.forEach((rule, index) => {
      this.simulator.schedule({
        kind: "generate",
        time: Math.round(rule.timeMs * nsPerMs),
        target: rule.source,
        id: index + 1,
        destination: addresses.get(rule.destination)!,
        bytes: rule.bytes,
      });
    });
  }

  step() {
    return this.simulator.step();
  }

  run() {
    this.simulator.run();
  }

  snapshot() {
    return {
      time: this.simulator.time,
      done: this.simulator.done,
      ...this.topology.snapshot(),
      statistics: this.statistics.snapshot(),
      trace: this.trace.snapshot(),
    };
  }
}

export function createExperiment(settings: Settings): { errors: Record<string, string> } | { experiment: Experiment } {
  const normalized = {
    ...settings,
    hosts: settings.hosts.map(host => ({ ...host, mac: host.mac.trim().toLowerCase() })),
  };
  const errors = validate(normalized);
  if (Object.keys(errors).length) return { errors };
  return { experiment: new Experiment(normalized) };
}

export type { Experiment };
