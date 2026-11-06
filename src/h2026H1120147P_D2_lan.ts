import type { Frame, SimulationEvent, SimulationModule, Simulator } from "./h2026H1120147P_D2_simulator.ts";

export const SWITCH = "Switch";
export const nsPerMs = 1_000_000;

export type HostSettings = { name: string; mac: string; mbps: number; delayMs: number };

export function serializationTime(bytes: number, mbps: number) {
  return Math.max(1, Math.round(bytes * 8000 / mbps));
}

type Direction = "fromHost" | "fromSwitch";

class OutputQueue {
  private current: Frame | undefined;
  private waiting: Frame[] = [];
  private readonly capacity: number;
  private readonly startTransmission: (frame: Frame) => void;

  constructor(capacity: number, startTransmission: (frame: Frame) => void) {
    this.capacity = capacity;
    this.startTransmission = startTransmission;
  }

  submit(frame: Frame) {
    if (!this.current) {
      this.start(frame);
      return "Sending";
    }

    if (this.waiting.length >= this.capacity) return "Dropped";

    this.waiting.push(frame);
    return "Queued";
  }

  complete(onComplete: (frame: Frame) => void) {
    if (!this.current) throw new Error("Completion without an active transmission");

    onComplete(this.current);
    this.current = undefined;

    const next = this.waiting.shift();
    if (next) this.start(next);
  }

  snapshot() {
    return { busy: this.current !== undefined, waiting: this.waiting.length };
  }

  private start(frame: Frame) {
    this.current = frame;
    this.startTransmission(frame);
  }
}

class Link {
  private readonly outputs: Record<Direction, OutputQueue>;
  private readonly inFlight = { fromHost: new Set<number>(), fromSwitch: new Set<number>() };
  private readonly host: HostSettings;
  private readonly simulator: Simulator;

  constructor(host: HostSettings, switchCapacity: number, simulator: Simulator) {
    this.host = host;
    this.simulator = simulator;
    this.outputs = {
      fromHost: new OutputQueue(Infinity, frame => this.transmit("fromHost", frame)),
      fromSwitch: new OutputQueue(switchCapacity, frame => this.transmit("fromSwitch", frame)),
    };
  }

  get port() {
    return this.host.name;
  }

  send(direction: Direction, frame: Frame) {
    const outcome = this.outputs[direction].submit(frame);
    if (outcome === "Sending") return;

    this.simulator.publish({
      kind: outcome,
      frameId: frame.id,
      location: this.path(direction),
      detail: outcome === "Queued" ? "Waiting for the link" : "Waiting buffer is full",
      port: this.port,
    });
  }

  complete(direction: Direction) {
    this.outputs[direction].complete(frame => this.simulator.publish({
      kind: "Completed",
      frameId: frame.id,
      location: this.path(direction),
      detail: "Frame finished transmitting",
    }));
  }

  arrive(direction: Direction, frame: Frame) {
    this.inFlight[direction].delete(frame.id);
  }

  snapshot() {
    return {
      ...this.host,
      fromHost: this.directionSnapshot("fromHost"),
      fromSwitch: this.directionSnapshot("fromSwitch"),
    };
  }

  private directionSnapshot(direction: Direction) {
    return { ...this.outputs[direction].snapshot(), inFlight: [...this.inFlight[direction]] };
  }

  private path(direction: Direction) {
    return direction === "fromHost" ? `${this.port} → ${SWITCH}` : `${SWITCH} → ${this.port}`;
  }

  private transmit(direction: Direction, frame: Frame) {
    const duration = serializationTime(frame.bytes, this.host.mbps);
    const complete = this.simulator.time + duration;
    const arrival = complete + Math.round(this.host.delayMs * nsPerMs);
    const [sender, receiver] = direction === "fromHost" ? [this.port, SWITCH] : [SWITCH, this.port];

    this.inFlight[direction].add(frame.id);
    this.simulator.schedule({ kind: "complete", target: sender, port: this.port, time: complete });
    this.simulator.schedule({ kind: "arrive", target: receiver, port: this.port, time: arrival, frame });
    this.simulator.publish({
      kind: "Sending",
      frameId: frame.id,
      location: this.path(direction),
      detail: `TX ${duration / nsPerMs} ms, arrival at ${arrival / nsPerMs} ms`,
    });
  }
}

interface ForwardingPolicy {
  selectOutputs(frame: Frame, incomingPort: string, ports: string[]): string[];
  learnedAddresses(): Array<[string, string]>;
}

function otherPorts(incomingPort: string, ports: string[]) {
  return ports.filter(port => port !== incomingPort);
}

class LearningSwitchPolicy implements ForwardingPolicy {
  private macTable = new Map<string, string>();

  selectOutputs(frame: Frame, incomingPort: string, ports: string[]) {
    this.macTable.set(frame.source, incomingPort);
    const destination = this.macTable.get(frame.destination);
    if (destination === incomingPort) return [];
    return destination ? [destination] : otherPorts(incomingPort, ports);
  }

  learnedAddresses(): Array<[string, string]> {
    return [...this.macTable];
  }
}

class FloodingPolicy implements ForwardingPolicy {
  selectOutputs(_frame: Frame, incomingPort: string, ports: string[]) {
    return otherPorts(incomingPort, ports);
  }

  learnedAddresses(): Array<[string, string]> {
    return [];
  }
}

class Host implements SimulationModule {
  private readonly mac: string;
  private readonly link: Link;
  private readonly simulator: Simulator;

  constructor(mac: string, link: Link, simulator: Simulator) {
    this.mac = mac;
    this.link = link;
    this.simulator = simulator;
  }

  handleEvent(event: SimulationEvent) {
    if (event.kind === "complete") {
      this.link.complete("fromHost");
      return;
    }

    if (event.kind === "generate") {
      const frame: Frame = Object.freeze({
        id: event.id,
        source: this.mac,
        destination: event.destination,
        bytes: event.bytes,
        createdAt: event.time,
      });
      this.simulator.publish({
        kind: "Generated",
        frameId: frame.id,
        location: this.link.port,
        detail: `${frame.bytes} bytes to ${frame.destination}`,
      });
      this.link.send("fromHost", frame);
      return;
    }

    const { frame } = event;
    this.link.arrive("fromSwitch", frame);
    const addressed = frame.destination === this.mac;
    this.simulator.publish({
      kind: addressed ? "Delivered" : "Ignored",
      frameId: frame.id,
      location: this.link.port,
      detail: addressed ? "Destination accepted the frame" : "Destination MAC belongs to another host",
      delay: addressed ? event.time - frame.createdAt : undefined,
    });
  }
}

class EthernetSwitch implements SimulationModule {
  private readonly links: Map<string, Link>;
  private readonly policy: ForwardingPolicy;
  private readonly simulator: Simulator;

  constructor(links: Map<string, Link>, policy: ForwardingPolicy, simulator: Simulator) {
    this.links = links;
    this.policy = policy;
    this.simulator = simulator;
  }

  handleEvent(event: SimulationEvent) {
    if (event.kind === "complete") {
      this.links.get(event.port)!.complete("fromSwitch");
    }

    if (event.kind === "arrive") {
      const { frame, port } = event;
      this.links.get(port)!.arrive("fromHost", frame);
      const outputs = this.policy.selectOutputs(frame, port, [...this.links.keys()]);
      this.simulator.publish({
        kind: "Arrived",
        frameId: frame.id,
        location: SWITCH,
        detail: `From ${port}; outputs: ${outputs.join(", ") || "none"}`,
      });
      for (const output of outputs) this.links.get(output)!.send("fromSwitch", frame);
    }
  }
}

export class LANTopology {
  private links = new Map<string, Link>();
  private policy: ForwardingPolicy;

  constructor(hosts: HostSettings[], capacity: number, policy: "learning" | "flooding", simulator: Simulator) {
    this.policy = policy === "learning" ? new LearningSwitchPolicy() : new FloodingPolicy();
    for (const host of hosts) {
      const link = new Link(host, capacity, simulator);
      this.links.set(host.name, link);
      simulator.register(host.name, new Host(host.mac, link, simulator));
    }
    simulator.register(SWITCH, new EthernetSwitch(this.links, this.policy, simulator));
  }

  snapshot() {
    return {
      links: [...this.links.values()].map(link => link.snapshot()),
      macTable: this.policy.learnedAddresses(),
    };
  }
}
