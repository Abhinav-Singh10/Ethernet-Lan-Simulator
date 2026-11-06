import {
  Background, Controls, Handle, Position, ReactFlow, getBezierPath,
  type Edge, type EdgeProps, type Node, type NodeProps,
} from "@xyflow/react";
import { Monitor, Network } from "lucide-react";
import { useEffect, useState } from "react";
import type { Experiment, Settings } from "./h2026H1120147P_D2_experiment.ts";
import type { Observation } from "./h2026H1120147P_D2_simulator.ts";

type LinkState = ReturnType<Experiment["snapshot"]>["links"][number];
type Device = Node<{
  name: string;
  handle?: Position;
  vertical?: boolean;
  speed?: number;
  waiting: number;
  dropped?: boolean;
}, "device">;
type Wire = Edge<{
  toSwitch: number[];
  fromSwitch: number[];
  dropped?: boolean;
}, "wire">;

function DeviceNode({ data }: NodeProps<Device>) {
  if (!data.handle) {
    return (
      <div className="flex h-[63px] w-[157px] items-center gap-[9px] rounded-[9px] border border-accent bg-accent-soft p-2.5 shadow-sm">
        <Handle className="invisible" id="first" type="target" position={data.vertical ? Position.Top : Position.Left} isConnectable={false} />
        <Handle className="invisible" id="second" type="target" position={data.vertical ? Position.Bottom : Position.Right} isConnectable={false} />
        <span className="grid size-8 shrink-0 place-items-center rounded-[7px] bg-panel text-accent"><Network size={20} /></span>
        <span><strong className="block text-[13px] whitespace-nowrap">Switch</strong><small className="mt-0.5 block text-[11px] text-muted">{data.waiting} waiting</small></span>
      </div>
    );
  }

  return (
    <div className={`flex h-[63px] w-[139px] items-center gap-[9px] rounded-[9px] border bg-panel p-2.5 shadow-sm ${data.dropped ? "border-red" : "border-line"}`}>
      <Handle className="invisible" type="source" position={data.handle} isConnectable={false} />
      <span className="grid size-8 shrink-0 place-items-center rounded-[7px] bg-control text-muted"><Monitor size={19} /></span>
      <span><strong className="block text-[13px] whitespace-nowrap">Host {data.name}</strong><small className="mt-0.5 block text-[11px] text-muted">{data.speed || "—"} Mbps</small></span>
      {data.waiting > 0 && <span className="absolute right-1.5 -bottom-[7px] rounded bg-warning-soft px-[5px] py-0.5 text-[10px] font-[750] text-amber">{data.waiting} queued</span>}
      {data.dropped && <span className="absolute right-1.5 -top-[7px] rounded bg-danger-soft px-[5px] py-0.5 text-[10px] font-[750] text-red">Drop</span>}
    </div>
  );
}

function WireEdge({ data, ...geometry }: EdgeProps<Wire>) {
  const [path, x, y] = getBezierPath(geometry);
  const vertical = geometry.sourcePosition === Position.Top || geometry.sourcePosition === Position.Bottom;
  const forward = vertical ? geometry.sourceY < geometry.targetY : geometry.sourceX < geometry.targetX;
  const [arrow, reverseArrow] = vertical ? ["↓", "↑"] : ["→", "←"];
  const directions = [
    { frames: data?.toSwitch ?? [], className: "text-accent", arrow: forward ? arrow : reverseArrow, side: -1 },
    { frames: data?.fromSwitch ?? [], className: "text-foreground", arrow: forward ? reverseArrow : arrow, side: 1 },
  ];

  return (
    <>
      <path d={path} className={`fill-none ${data?.dropped ? "stroke-red stroke-[3]" : "stroke-wire stroke-2"}`} />
      {directions.map(({ frames, className, arrow, side }) => {
        if (frames.length === 0) return null;
        const text = `#${frames[0]}${frames.length > 1 ? ` +${frames.length - 1}` : ""} ${arrow}`;
        const width = text.length * 6 + 13;
        const wireShift = vertical ? `${side * 4} 0` : `0 ${side * 4}`;
        const badgeX = vertical ? x + side * (width / 2 + 6) : x;
        const badgeY = vertical ? y : y + side * 13;
        return (
          <g key={className} className={className}>
            <path d={path} className={`fill-none stroke-current stroke-[2.5] [stroke-dasharray:6_4] ${side === 1 ? "motion-safe:group-data-[playing=true]:animate-packet-flow-reverse" : "motion-safe:group-data-[playing=true]:animate-packet-flow"}`} transform={`translate(${wireShift})`} />
            <g transform={`translate(${badgeX} ${badgeY})`}>
              <rect x={-width / 2} y={-9} width={width} height={18} rx={5} className="fill-panel stroke-current" />
              <text textAnchor="middle" dominantBaseline="central" className="fill-current font-mono text-[10px] font-[750]">{text}</text>
            </g>
          </g>
        );
      })}
    </>
  );
}

const nodeTypes = { device: DeviceNode };
const edgeTypes = { wire: WireEdge };

export function Topology({ hosts, links, recent, playing }: {
  hosts: Settings["hosts"];
  links: LinkState[];
  recent: Observation[];
  playing: boolean;
}) {
  const [vertical, setVertical] = useState(() => window.matchMedia("(max-width: 490px)").matches);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 490px)");
    const change = (event: MediaQueryListEvent) => setVertical(event.matches);
    query.addEventListener("change", change);
    return () => query.removeEventListener("change", change);
  }, []);

  const nodes: Device[] = [];
  const edges: Wire[] = [];
  const linkByHost = new Map(links.map(link => [link.name, link]));
  const droppedPorts = new Set(recent.filter(event => event.kind === "Dropped").map(event => event.port));
  const rows = Math.ceil(hosts.length / 2);

  hosts.forEach((host, index) => {
    const first = index % 2 === 0;
    const sideRows = first ? rows : Math.floor(hosts.length / 2);
    const row = Math.floor(index / 2) + (rows - sideRows) / 2;
    const handle = vertical
      ? (first ? Position.Bottom : Position.Top)
      : (first ? Position.Right : Position.Left);
    const link = linkByHost.get(host.name);
    const dropped = droppedPorts.has(host.name);
    nodes.push({
      id: host.name, type: "device",
      position: vertical ? { x: row * 156, y: first ? 0 : 246 } : { x: first ? 0 : 510, y: row * 108 },
      data: { name: host.name, speed: host.mbps, handle, waiting: link?.fromSwitch.waiting ?? 0, dropped },
    });
    edges.push({
      id: `link-${host.name}`, type: "wire", source: host.name, target: "switch", targetHandle: first ? "first" : "second",
      data: { toSwitch: link?.fromHost.inFlight ?? [], fromSwitch: link?.fromSwitch.inFlight ?? [], dropped },
    });
  });

  nodes.push({
    id: "switch", type: "device",
    position: vertical ? { x: Math.max(0, rows - 1) * 78 - 9, y: 123 } : { x: 243, y: Math.max(0, rows - 1) * 54 },
    data: { name: "Switch", vertical, waiting: links.reduce((total, link) => total + link.fromSwitch.waiting, 0) },
  });

  return (
    <div className="group h-[304px] bg-canvas max-[490px]:h-[310px]" data-playing={playing} role="region" aria-label="Live Ethernet topology">
      <ReactFlow
        className="[--xy-background-color:var(--color-canvas)] [--xy-controls-button-background-color:var(--color-panel)] [--xy-controls-button-background-color-hover:var(--color-hover)] [--xy-controls-button-border-color:var(--color-line)] [--xy-controls-button-color:var(--color-foreground)]"
        key={`${vertical}:${hosts.map(host => host.name).join(",")}`}
        nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes}
        fitView fitViewOptions={{ padding: vertical ? 0.1 : 0.18, maxZoom: 1.25 }}
        minZoom={0.15} maxZoom={2} nodesDraggable={false} nodesConnectable={false}
        elementsSelectable={false} zoomOnScroll={false} colorMode="light"
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={21} size={1} color="var(--color-line)" />
        <Controls className="[&_button:disabled]:opacity-100" position="bottom-right" showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
