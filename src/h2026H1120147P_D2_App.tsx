import { useEffect, useRef, useState } from "react";
import {
  Activity, ArrowRight, Cable, Check, Clock3, FastForward,
  List, Network, Pause, Play, RotateCcw, SkipForward, X,
} from "lucide-react";
import { createExperiment, type Experiment } from "./h2026H1120147P_D2_experiment.ts";
import { nsPerMs } from "./h2026H1120147P_D2_lan.ts";
import { initialSettings, newHost, newTraffic, Setup, type Draft } from "./h2026H1120147P_D2_Setup.tsx";
import type { Observation } from "./h2026H1120147P_D2_simulator.ts";
import { Topology } from "./h2026H1120147P_D2_Topology.tsx";
import { Button } from "./h2026H1120147P_D2_Button.tsx";

type View = {
  snapshot: ReturnType<Experiment["snapshot"]>;
  recent: Observation[];
};

function updateView(experiment: Experiment, action: "run" | "step"): View {
  const before = action === "step" ? experiment.snapshot().trace.length : 0;
  experiment[action]();
  const snapshot = experiment.snapshot();
  return { snapshot, recent: action === "step" ? snapshot.trace.slice(before) : snapshot.trace.slice(-1) };
}

function ms(time: number) {
  return (time / nsPerMs).toLocaleString("en", { maximumFractionDigits: 6, useGrouping: false });
}

export function App() {
  const [settings, setSettings] = useState(initialSettings);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [view, setView] = useState<View>();
  const [playing, setPlaying] = useState(false);
  const experiment = useRef<Experiment | null>(null);
  const nextHost = useRef(4);
  const nextFrame = useRef(3);

  const snapshot = view?.snapshot;
  const done = snapshot?.done ?? false;
  const links = snapshot?.links ?? [];
  const trace = snapshot?.trace ?? [];
  const statistics = snapshot?.statistics;
  const recent = view?.recent ?? [];
  const status = done ? "Complete" : playing ? "Playing" : view ? "Paused" : "Ready";

  function changeSettings(value: Draft) {
    setErrors({});
    setSettings(value);
  }

  function start() {
    if (experiment.current) return experiment.current;
    const result = createExperiment(settings);
    if ("errors" in result) {
      setErrors(result.errors);
      return null;
    }
    setErrors({});
    experiment.current = result.experiment;
    return result.experiment;
  }

  function advance(action: "run" | "step") {
    const current = start();
    if (current) setView(updateView(current, action));
  }

  function playOrPause() {
    if (playing) {
      setPlaying(false);
      return;
    }
    const current = start();
    if (!current) return;
    const next = updateView(current, "step");
    setView(next);
    setPlaying(!next.snapshot.done);
  }

  function reset() {
    setPlaying(false);
    setView(undefined);
    experiment.current = null;
  }

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      if (!experiment.current) return;
      const next = updateView(experiment.current, "step");
      setView(next);
      if (next.snapshot.done) setPlaying(false);
    }, 520);
    return () => window.clearInterval(timer);
  }, [playing]);

  const metrics = [
    { label: "Generated", value: statistics?.generated ?? 0, icon: ArrowRight, tone: "text-accent" },
    { label: "Delivered", value: statistics?.delivered ?? 0, icon: Check, tone: "text-success" },
    { label: "Dropped copies", value: statistics?.drops ?? 0, icon: X, tone: "text-red" },
    { label: "Mean delay", value: statistics?.meanDelay == null ? "—" : `${ms(statistics.meanDelay)} ms`, icon: Clock3, tone: "text-muted" },
  ];

  const statusClassName = done ? "bg-success-soft text-success" : playing ? "bg-accent-soft text-accent" : view ? "bg-warning-soft text-amber" : "bg-control text-muted";

  return (
    <div>
      <main className="mx-auto w-[min(100%-64px,1280px)] pt-[30px] pb-11 max-[810px]:w-[calc(100%-32px)] max-[490px]:pt-[22px]">
        <div>
          <h1 className="my-1.5 text-[clamp(27px,4vw,37px)] leading-[1.14] font-bold tracking-[-.045em]">Ethernet LAN Simulator</h1>
          <p className="leading-normal text-muted">Send frames across a switch and watch forwarding, queuing, and drops as they happen.</p>
        </div>

        <div className="mt-[23px] mb-[17px] flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-[7px]">
              <Button variant="primary" disabled={done} onClick={playOrPause} aria-describedby="play-help">{playing ? <Pause size={16} /> : <Play size={16} />}{playing ? "Pause" : "Play"}</Button>
              <Button disabled={done || playing} onClick={() => advance("step")} aria-describedby="play-help"><SkipForward size={16} /> Step</Button>
              <Button disabled={done || playing} onClick={() => advance("run")}><FastForward size={16} /> Run all</Button>
              <Button variant="quiet" disabled={!view} onClick={reset}><RotateCcw size={15} /> Reset</Button>
            </div>
            <ol id="play-help" className="mt-2 list-decimal space-y-1 pl-4 text-xs leading-relaxed text-muted">
              <li>Scroll down to Experiment settings and adjust the hosts, traffic, forwarding policy, and waiting slots.</li>
              <li>Press Play to watch the simulation, Step to advance one event, or Run all to finish.</li>
              <li>Watch the topology, Event log, and Switch state. Press Reset to change settings and try again.</li>
            </ol>
          </div>
          <div className="flex items-center gap-3 max-[490px]:w-full" role="status">
            <span className={`inline-flex items-center gap-[7px] rounded-full px-2.5 py-[5px] text-xs font-bold ${statusClassName}`}><i className="size-[7px] rounded-full bg-current" />{status}</span>
          </div>
        </div>
        {Object.keys(errors).length > 0 && <p role="alert" className="mb-3.5 text-red">{errors.configuration ?? "Fix the highlighted experiment settings to start the simulation."}</p>}

        <div className="grid grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)] gap-4 max-[810px]:grid-cols-1">
          <section className="min-w-0 overflow-hidden rounded-xl border border-line bg-panel" aria-labelledby="topology-heading">
            <div className="flex min-h-[54px] flex-wrap items-center justify-between gap-2.5 border-b border-line px-4 py-2.5">
              <div className="inline-flex flex-wrap items-center gap-[9px] font-bold [&>svg]:shrink-0 [&>svg]:text-accent">
                <Cable size={17} /><h2 className="text-sm font-[750]" id="topology-heading">Network topology</h2>
                <span className="rounded bg-accent-soft px-2 py-1 text-xs text-accent">{settings.policy === "learning" ? "MAC learning" : "Flooding"}</span>
              </div>
              <span className="text-xs text-muted">{settings.hosts.length} hosts · 1 switch</span>
            </div>
            <Topology hosts={settings.hosts} links={links} recent={recent} playing={playing} />
            <div className="flex flex-wrap items-center gap-4 border-t border-line px-4 py-3 text-xs text-muted max-[490px]:gap-2.5">
              <span className="inline-flex items-center gap-[7px]"><i className="size-[7px] rounded-full bg-current text-accent" /> To switch</span>
              <span className="inline-flex items-center gap-[7px]"><i className="size-[7px] rounded-full bg-current text-foreground" /> From switch</span>
              <span className="inline-flex items-center gap-[7px]"><i className="size-[7px] rounded-full bg-current text-red" /> Drop on this step</span>
            </div>
          </section>

          <section className="min-w-0 overflow-hidden rounded-xl border border-line bg-panel" aria-labelledby="log-heading">
            <div className="flex min-h-[54px] items-center justify-between gap-2.5 border-b border-line px-4 py-2.5">
              <div className="inline-flex items-center gap-[9px] font-bold [&>svg]:shrink-0 [&>svg]:text-accent"><List size={17} /><h2 className="text-sm font-[750]" id="log-heading">Event log</h2></div>
              <span className="text-xs text-muted">{trace.length} records</span>
            </div>
            {trace.length ? <ol className="m-0 h-[344px] list-none overflow-auto px-[13px]" aria-label="Event log, newest first">
              {trace.slice().reverse().map((event, index) => (
                <li key={trace.length - index} className="grid grid-cols-[62px_1fr] gap-2 border-b border-line px-[3px] py-2.5 text-xs last:border-b-0">
                  <time className="text-muted tabular-nums [overflow-wrap:anywhere]">{ms(event.time)} ms</time>
                  <div>
                    <div className="mb-0.5 flex flex-wrap items-baseline gap-[7px]"><span className={`font-[750] ${event.kind === "Delivered" ? "text-success" : event.kind === "Dropped" ? "text-red" : event.kind === "Queued" ? "text-amber" : "text-accent"}`}>{event.kind}</span><span>#{event.frameId} · {event.location}</span></div>
                    <p className="text-muted [overflow-wrap:anywhere]">{event.detail}</p>
                  </div>
                </li>
              ))}
            </ol> : <div className="grid h-[344px] content-center px-5 text-center text-muted"><List size={23} className="mx-auto" /><strong className="mt-1.5 mb-1 block text-foreground">No events yet</strong><p className="text-[13px] leading-normal">Frame activity will appear here once the simulation starts.</p></div>}
          </section>

          <section className="col-span-full min-w-0 overflow-hidden rounded-xl border border-line bg-panel" aria-labelledby="switch-heading">
            <div className="flex min-h-[54px] items-center gap-[9px] border-b border-line px-4 py-2.5">
              <Network size={17} className="shrink-0 text-accent" />
              <h2 className="text-sm font-[750]" id="switch-heading">Switch state</h2>
            </div>
            <div className="h-[168px] overflow-auto px-4 pb-3" tabIndex={0}>
              <table className="w-full border-collapse text-left text-xs">
                <thead className="sticky top-0"><tr><th className="border-b border-line p-1.5 align-top font-[650] whitespace-nowrap text-muted">Host</th><th className="border-b border-line p-1.5 align-top font-[650] whitespace-nowrap text-muted">To switch</th><th className="border-b border-line p-1.5 align-top font-[650] whitespace-nowrap text-muted">From switch</th><th className="border-b border-line p-1.5 align-top font-[650] whitespace-nowrap text-muted">Learned MAC</th></tr></thead>
                <tbody>{links.map(link => (
                  <tr className="group" key={link.name}>
                    <th className="border-b border-line p-1.5 align-top group-last:border-b-0 font-bold" scope="row">{link.name}</th>
                    <td className="border-b border-line p-1.5 align-top group-last:border-b-0">{link.fromHost.busy ? "Sending" : "Idle"} · {link.fromHost.waiting} waiting</td>
                    <td className="border-b border-line p-1.5 align-top group-last:border-b-0">{link.fromSwitch.busy ? "Sending" : "Idle"} · {link.fromSwitch.waiting} waiting</td>
                    <td className="border-b border-line p-1.5 align-top group-last:border-b-0">{snapshot?.macTable.find(([, port]) => port === link.name)?.[0] ?? "—"}</td>
                  </tr>
                ))}</tbody>
              </table>
              {!links.length && <p className="mt-3 text-xs text-muted">Start a simulation to inspect live queues and MAC addresses.</p>}
            </div>
          </section>
        </div>

        <div className="mt-4">
          <Setup settings={settings} errors={errors} locked={Boolean(view)} onChange={changeSettings}
            addHost={() => changeSettings({ ...settings, hosts: [...settings.hosts, newHost(nextHost.current++)] })}
            addTraffic={() => changeSettings({ ...settings, traffic: [...settings.traffic, newTraffic(nextFrame.current++)] })} />
        </div>

        <section className="mt-4 min-w-0 overflow-hidden rounded-xl border border-line bg-panel" aria-labelledby="results-heading">
          <div className="flex min-h-[54px] items-center justify-between gap-2.5 border-b border-line px-4 py-2.5">
            <div className="inline-flex items-center gap-[9px] font-bold [&>svg]:shrink-0 [&>svg]:text-accent"><Activity size={17} /><h2 className="text-sm font-[750]" id="results-heading">Run overview</h2></div>
          </div>
          <div className="grid grid-cols-2 gap-2.5 p-3.5 min-[491px]:grid-cols-4">{metrics.map(({ label, value, icon: Icon, tone }) => (
            <div key={label} className="rounded-lg border border-line bg-control p-3">
              <span className={`flex items-center gap-1.5 text-xs font-[650] ${tone}`}><Icon size={15} className="shrink-0" /> {label}</span>
              <strong className="mt-1.5 block text-[clamp(19px,2.2vw,27px)] tracking-[-.035em] tabular-nums">{value}</strong>
            </div>
          ))}</div>
        </section>
      </main>
    </div>
  );
}
