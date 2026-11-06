import { Plus, Settings2, Trash2 } from "lucide-react";
import type { Settings } from "./h2026H1120147P_D2_experiment.ts";
import { Button } from "./h2026H1120147P_D2_Button.tsx";

type TrafficRow = Settings["traffic"][number] & { id: number };
export type Draft = Omit<Settings, "traffic"> & { traffic: TrafficRow[] };

export function newHost(id: number) {
  const name = id <= 26 ? String.fromCharCode(64 + id) : `Host ${id}`;
  const suffix = id.toString(16).padStart(10, "0").match(/../g)!.join(":");
  return { name, mac: `02:${suffix}`, mbps: 10, delayMs: 0.2 };
}

export function newTraffic(id: number, source = "", destination = "") {
  return { id, source, destination, bytes: 1000, timeMs: 0 };
}

export const initialSettings: Draft = {
  hosts: [newHost(1), newHost(2), newHost(3)],
  traffic: [newTraffic(1, "A", "B"), newTraffic(2, "C", "B")],
  capacity: 1,
  policy: "learning",
};

export function Setup({ settings, errors, locked, onChange, addHost, addTraffic }: {
  settings: Draft;
  errors: Record<string, string>;
  locked: boolean;
  onChange: (settings: Draft) => void;
  addHost: () => void;
  addTraffic: () => void;
}) {
  const { hosts, traffic } = settings;
  const inputClassName = "min-h-[29px] max-w-full rounded-[5px] border border-line bg-control px-1.5 py-1 text-foreground disabled:text-muted aria-invalid:border-red";

  function field(key: string, className = "", description?: string) {
    return {
      className: `${inputClassName} ${className}`,
      "aria-invalid": Boolean(errors[key]),
      "aria-describedby": [description, errors[key] && `${key}-error`].filter(Boolean).join(" ") || undefined,
    };
  }

  function error(key: string) {
    return errors[key] && <small className="block max-w-[22ch] pt-1 text-[11px] text-red" id={`${key}-error`}>{errors[key]}</small>;
  }

  function changeHost(name: string, update: Partial<Draft["hosts"][number]>) {
    onChange({ ...settings, hosts: hosts.map(host => host.name === name ? { ...host, ...update } : host) });
  }

  function removeHost(name: string) {
    onChange({
      ...settings,
      hosts: hosts.filter(host => host.name !== name),
      traffic: traffic.map(rule => ({
        ...rule,
        source: rule.source === name ? "" : rule.source,
        destination: rule.destination === name ? "" : rule.destination,
      })),
    });
  }

  function changeTraffic(id: number, update: Partial<TrafficRow>) {
    onChange({ ...settings, traffic: traffic.map(rule => rule.id === id ? { ...rule, ...update } : rule) });
  }

  function numberField(key: string, label: string, value: number, change: (value: number) => void, description?: string) {
    return (
      <>
        <input type="number" step="any" aria-label={label} value={Number.isNaN(value) ? "" : value}
          onChange={event => change(event.currentTarget.valueAsNumber)} {...field(key, "w-[8ch]", description)} />
        {error(key)}
      </>
    );
  }

  return (
    <section className="min-w-0 overflow-hidden rounded-xl border border-line bg-panel" aria-labelledby="setup-heading">
      <div className="flex min-h-[54px] items-center justify-between gap-2.5 border-b border-line px-4 py-2.5">
        <div className="inline-flex items-center gap-[9px] font-bold [&>svg]:shrink-0 [&>svg]:text-accent"><Settings2 size={17} /><h2 className="text-sm font-[750]" id="setup-heading">Experiment settings</h2></div>
        {locked && <span className="text-xs text-muted">Reset to edit</span>}
      </div>
      <fieldset className="m-0 min-w-0 border-0 p-0" disabled={locked} aria-label="Experiment settings">
        <div className="px-4 pt-3.5 pb-[9px]">
          <div className="mb-[7px] flex items-center justify-between"><h3 className="text-[13px] font-bold">Hosts &amp; links</h3><Button type="button" size="compact" onClick={addHost}><Plus size={14} /> Add host</Button></div>
          {error("hosts")}
          <div className="relative overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead><tr><th className="border-b border-line p-1.5 align-top font-[650] whitespace-nowrap text-muted first:pl-0">Host</th><th className="border-b border-line p-1.5 align-top font-[650] whitespace-nowrap text-muted first:pl-0">MAC address</th><th className="border-b border-line p-1.5 align-top font-[650] whitespace-nowrap text-muted first:pl-0">Mbps</th><th className="border-b border-line p-1.5 align-top font-[650] whitespace-nowrap text-muted first:pl-0">Delay (ms)</th><th className="border-b border-line p-1.5 align-top font-[650] whitespace-nowrap text-muted first:pl-0"><span className="sr-only">Remove</span></th></tr></thead>
              <tbody>{hosts.map((host, index) => {
                const key = `host-${index}`;
                return (
                  <tr className="group" key={host.name}>
                    <th className="border-b border-line p-1.5 align-top group-last:border-b-0 first:pl-0 font-bold" scope="row"><span className="inline-flex min-h-[29px] items-center font-[750] whitespace-nowrap text-accent">{host.name}</span></th>
                    <td className="border-b border-line p-1.5 align-top group-last:border-b-0 first:pl-0"><input aria-label={`Host ${host.name} MAC address`} value={host.mac}
                      onChange={event => changeHost(host.name, { mac: event.currentTarget.value })} {...field(`${key}-mac`, "w-[calc(17ch+16px)] font-mono")} />{error(`${key}-mac`)}</td>
                    <td className="border-b border-line p-1.5 align-top group-last:border-b-0 first:pl-0">{numberField(`${key}-mbps`, `Host ${host.name} link speed`, host.mbps, mbps => changeHost(host.name, { mbps }))}</td>
                    <td className="border-b border-line p-1.5 align-top group-last:border-b-0 first:pl-0">{numberField(`${key}-delay`, `Host ${host.name} link delay`, host.delayMs, delayMs => changeHost(host.name, { delayMs }))}</td>
                    <td className="border-b border-line p-1.5 align-top group-last:border-b-0 first:pl-0"><Button type="button" variant="quiet" size="icon" aria-label={`Remove host ${host.name}`} onClick={() => removeHost(host.name)}><Trash2 size={15} /></Button></td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        </div>
        <div className="border-t border-line px-4 pt-3.5 pb-[9px]">
          <div className="mb-[7px] flex items-center justify-between"><h3 className="text-[13px] font-bold">Traffic schedule</h3><Button type="button" size="compact" onClick={addTraffic}><Plus size={14} /> Add frame</Button></div>
          <div className="relative overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead><tr><th className="border-b border-line p-1.5 align-top font-[650] whitespace-nowrap text-muted first:pl-0">Source</th><th className="border-b border-line p-1.5 align-top font-[650] whitespace-nowrap text-muted first:pl-0">Destination</th><th className="border-b border-line p-1.5 align-top font-[650] whitespace-nowrap text-muted first:pl-0">Size (bytes)</th><th className="border-b border-line p-1.5 align-top font-[650] whitespace-nowrap text-muted first:pl-0">Time (ms)</th><th className="border-b border-line p-1.5 align-top font-[650] whitespace-nowrap text-muted first:pl-0"><span className="sr-only">Remove</span></th></tr></thead>
              <tbody>{traffic.map((rule, index) => {
                const key = `traffic-${index}`;
                return (
                  <tr className="group" key={rule.id}>
                    {(["source", "destination"] as const).map(endpoint => (
                      <td className="border-b border-line p-1.5 align-top group-last:border-b-0 first:pl-0" key={endpoint}>
                        <select aria-label={`Frame ${index + 1} ${endpoint}`} value={rule[endpoint]}
                          onChange={event => changeTraffic(rule.id, { [endpoint]: event.currentTarget.value })} {...field(`${key}-${endpoint}`)}>
                          <option value="">Select host</option>
                          {hosts.map(host => <option key={host.name} value={host.name}>{host.name}</option>)}
                        </select>
                        {error(`${key}-${endpoint}`)}
                      </td>
                    ))}
                    <td className="border-b border-line p-1.5 align-top group-last:border-b-0 first:pl-0">{numberField(`${key}-bytes`, `Frame ${index + 1} size`, rule.bytes, bytes => changeTraffic(rule.id, { bytes }))}</td>
                    <td className="border-b border-line p-1.5 align-top group-last:border-b-0 first:pl-0">{numberField(`${key}-time`, `Frame ${index + 1} generation time`, rule.timeMs, timeMs => changeTraffic(rule.id, { timeMs }))}</td>
                    <td className="border-b border-line p-1.5 align-top group-last:border-b-0 first:pl-0"><Button type="button" variant="quiet" size="icon" aria-label={`Remove frame ${index + 1}`}
                      onClick={() => onChange({ ...settings, traffic: traffic.filter(item => item.id !== rule.id) })}><Trash2 size={15} /></Button></td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
          {traffic.length === 0 && <p className="text-xs text-muted">No frames scheduled.</p>}
        </div>
        <div className="grid grid-cols-2 gap-5 border-t border-line px-4 pt-3.5 pb-4 max-[490px]:grid-cols-1">
          <div>
            <label className="grid justify-items-start gap-1.5 text-xs text-muted">Forwarding policy
              <select value={settings.policy} onChange={event => onChange({ ...settings, policy: event.currentTarget.value as Settings["policy"] })} {...field("policy", "", "policy-help")}>
                <option value="learning">MAC learning</option>
                <option value="flooding">Flooding</option>
              </select>
              {error("policy")}
            </label>
            <div id="policy-help" className="mt-2 space-y-1.5 text-xs leading-relaxed text-muted">
              <p><strong>MAC learning</strong> remembers each sender’s port and forwards to the destination’s port when known. Unknown destinations are flooded.</p>
              <p><strong>Flooding</strong> sends a copy through every port except the arrival port.</p>
            </div>
          </div>
          <div>
            <label className="grid justify-items-start gap-1.5 text-xs text-muted">Waiting slots per switch output
              {numberField("capacity", "Waiting slots per switch output", settings.capacity, capacity => onChange({ ...settings, capacity }), "capacity-help")}
            </label>
            <p id="capacity-help" className="mt-2 text-xs leading-relaxed text-muted">
              Each switch output can send one frame and hold this many waiting copies. When its waiting slots are full, new copies are dropped. With 0 slots, copies are accepted only when the output is idle.
            </p>
          </div>
        </div>
      </fieldset>
    </section>
  );
}
