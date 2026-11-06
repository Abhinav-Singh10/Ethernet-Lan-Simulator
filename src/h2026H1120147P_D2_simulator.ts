export type Frame = Readonly<{
  id: number;
  source: string;
  destination: string;
  bytes: number;
  createdAt: number;
}>;

type EventData =
  | { kind: "generate"; id: number; destination: string; bytes: number }
  | { kind: "complete"; port: string }
  | { kind: "arrive"; port: string; frame: Frame };

export type SimulationEvent = EventData & { time: number; target: string };

export interface SimulationModule {
  handleEvent(event: SimulationEvent): void;
}

export type Observation = Readonly<{
  time: number;
  kind: "Generated" | "Sending" | "Queued" | "Dropped" | "Completed" | "Arrived" | "Delivered" | "Ignored";
  frameId: number;
  location: string;
  detail: string;
  delay?: number;
  port?: string;
}>;

const priority = { complete: 0, arrive: 1, generate: 2 };

export class Simulator {
  private clock = 0;
  private order = 0;
  private events: Array<SimulationEvent & { order: number }> = [];
  private modules = new Map<string, SimulationModule>();
  private observers: Array<(observation: Observation) => void> = [];

  get time() {
    return this.clock;
  }

  get done() {
    return this.events.length === 0;
  }

  register(name: string, module: SimulationModule) {
    this.modules.set(name, module);
  }

  subscribe(observer: (observation: Observation) => void) {
    this.observers.push(observer);
  }

  publish(observation: Omit<Observation, "time">) {
    const record = Object.freeze({ time: this.clock, ...observation });
    for (const observer of this.observers) observer(record);
  }

  schedule(event: SimulationEvent) {
    if (!Number.isSafeInteger(event.time) || event.time < this.clock) {
      throw new Error("Invalid event time");
    }

    this.events.push({ ...event, order: this.order++ });
    this.events.sort((a, b) =>
      a.time - b.time || priority[a.kind] - priority[b.kind] || a.order - b.order,
    );
  }

  step() {
    const event = this.events.shift();
    if (!event) return false;

    this.clock = event.time;
    const module = this.modules.get(event.target);
    if (!module) throw new Error(`Unknown simulation module: ${event.target}`);
    module.handleEvent(event);
    return true;
  }

  run() {
    while (this.step()) {
      // The event list drives both Run and Step.
    }
  }
}
