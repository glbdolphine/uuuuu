import React, { useEffect, useRef } from 'react';

/*
 * Login stage: a living network of the 13 upazilas Pace IT covers.
 *
 *  - Nodes sit roughly where each upazila lies in Sylhet district (placements are approximate and
 *    meant as a schematic - adjust lon/lat in NODES to taste).
 *  - Packets in the colours of the logo's hands travel along the links. Sylhet Sadar is the hub.
 *  - Moving the cursor over the stage wakes nearby nodes.
 *  - While a login is being checked (`busy`), packets rush to the hub.
 *  - With "reduce motion" turned on, a single still frame is drawn instead.
 */

interface NodeDef {
  name: string;
  lon: number;
  lat: number;
  at: 'r' | 'l' | 't' | 'b';
  atSm?: 'r' | 'l' | 't' | 'b';
}

const NODES: NodeDef[] = [
  { name: 'Companiganj', lon: 91.78, lat: 25.07, at: 'l' },
  { name: 'Gowainghat', lon: 92.0, lat: 25.08, at: 't' },
  { name: 'Jaintiapur', lon: 92.14, lat: 25.12, at: 'r' },
  { name: 'Kanaighat', lon: 92.28, lat: 24.98, at: 'r' },
  { name: 'Zakiganj', lon: 92.38, lat: 24.86, at: 'r' },
  { name: 'Beanibazar', lon: 92.21, lat: 24.78, at: 'r' },
  { name: 'Golapganj', lon: 92.03, lat: 24.87, at: 't' },
  { name: 'Sylhet Sadar', lon: 91.87, lat: 24.9, at: 't' },
  { name: 'Dakshin Surma', lon: 91.84, lat: 24.81, at: 'b' },
  { name: 'Bishwanath', lon: 91.73, lat: 24.78, at: 'l' },
  { name: 'Osmani Nagar', lon: 91.99, lat: 24.78, at: 'r', atSm: 'b' },
  { name: 'Fenchuganj', lon: 92.12, lat: 24.69, at: 'r' },
  { name: 'Balaganj', lon: 91.97, lat: 24.66, at: 'b' },
];
const HUB = 'Sylhet Sadar';

// Taken from the hands in the logo.
const PALETTE = ['#ee5aa6', '#f7ee3c', '#4ba6e2', '#d6a171', '#f4b3cf', '#8fd0f2'];

const MINT = '191, 243, 210';

interface Props {
  busy?: boolean;
  className?: string;
}

interface RNode {
  name: string;
  at: NodeDef['at'];
  atSm?: NodeDef['at'];
  ux: number;
  uy: number;
  x: number;
  y: number;
  ox: number;
  oy: number;
  glow: number;
  ping: number; // 0..1 ring progress, -1 = idle
  pingBig: boolean;
  delay: number;
  hub: boolean;
}
interface REdge {
  a: number;
  b: number;
  delay: number;
}
interface Packet {
  edge: number;
  from: number;
  to: number;
  t: number;
  speed: number; // edge fractions per second
  color: string;
  chain: number;
}
interface Floater {
  x: number;
  y: number;
  t: number;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const easeOut = (v: number) => 1 - Math.pow(1 - v, 3);

export const LoginStage: React.FC<Props> = ({ busy = false, className = '' }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const busyRef = useRef(busy);
  busyRef.current = busy;

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = canvas?.parentElement;
    if (!canvas || !host) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // ---- geometry in "unit" space (km-like: longitude is shortened by cos(25deg)) ----
    const minLon = Math.min(...NODES.map((n) => n.lon));
    const maxLat = Math.max(...NODES.map((n) => n.lat));
    const pts = NODES.map((n) => ({ ux: (n.lon - minLon) * 0.906, uy: maxLat - n.lat }));
    const W = Math.max(...pts.map((p) => p.ux));
    const H = Math.max(...pts.map((p) => p.uy));
    const hubIndex = NODES.findIndex((n) => n.name === HUB);

    const nodes: RNode[] = NODES.map((n, i) => ({
      name: n.name,
      at: n.at,
      atSm: n.atSm,
      ux: pts[i].ux,
      uy: pts[i].uy,
      x: 0,
      y: 0,
      ox: 0,
      oy: 0,
      glow: 0,
      ping: -1,
      pingBig: false,
      delay: 0,
      hub: i === hubIndex,
    }));
    const dist = (i: number, j: number) => Math.hypot(nodes[i].ux - nodes[j].ux, nodes[i].uy - nodes[j].uy);
    nodes.forEach((n, i) => {
      n.delay = 0.2 + dist(i, hubIndex) * 3.2;
    });

    // ---- links: every node to its 3 nearest neighbours, then join any separate groups ----
    const edgeKey = new Set<string>();
    const edges: REdge[] = [];
    const addEdge = (a: number, b: number) => {
      const k = a < b ? `${a}-${b}` : `${b}-${a}`;
      if (edgeKey.has(k)) return;
      edgeKey.add(k);
      edges.push({ a, b, delay: 0.9 + Math.max(nodes[a].delay, nodes[b].delay) });
    };
    nodes.forEach((_, i) => {
      nodes
        .map((__, j) => j)
        .filter((j) => j !== i)
        .sort((p, q) => dist(i, p) - dist(i, q))
        .slice(0, 3)
        .forEach((j) => addEdge(i, j));
    });
    addEdge(hubIndex, NODES.findIndex((n) => n.name === 'Golapganj'));
    addEdge(hubIndex, NODES.findIndex((n) => n.name === 'Gowainghat'));
    // connect components
    const group = nodes.map((_, i) => i);
    const find = (x: number): number => (group[x] === x ? x : (group[x] = find(group[x])));
    edges.forEach((e) => (group[find(e.a)] = find(e.b)));
    for (;;) {
      const roots = new Set(nodes.map((_, i) => find(i)));
      if (roots.size <= 1) break;
      let best: [number, number] | null = null;
      for (let i = 0; i < nodes.length; i++)
        for (let j = i + 1; j < nodes.length; j++)
          if (find(i) !== find(j) && (!best || dist(i, j) < dist(best[0], best[1]))) best = [i, j];
      if (!best) break;
      addEdge(best[0], best[1]);
      group[find(best[0])] = find(best[1]);
    }

    const neighbours: { node: number; edge: number }[][] = nodes.map(() => []);
    edges.forEach((e, ei) => {
      neighbours[e.a].push({ node: e.b, edge: ei });
      neighbours[e.b].push({ node: e.a, edge: ei });
    });

    // next hop towards the hub (breadth-first), used when busy
    const towardHub: ({ node: number; edge: number } | null)[] = nodes.map(() => null);
    {
      const seen = new Set([hubIndex]);
      const queue = [hubIndex];
      while (queue.length) {
        const cur = queue.shift()!;
        for (const nb of neighbours[cur]) {
          if (seen.has(nb.node)) continue;
          seen.add(nb.node);
          towardHub[nb.node] = { node: cur, edge: nb.edge };
          queue.push(nb.node);
        }
      }
    }

    // ---- sizing ----
    let w = 0;
    let h = 0;
    let dpr = 1;
    let compact = false;
    let rw = 0; // width/height of the region the network occupies
    let rh = 0;
    const layout = () => {
      const rect = host.getBoundingClientRect();
      w = Math.max(1, rect.width);
      h = Math.max(1, rect.height);
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;

      // The canvas covers the whole page, but the network only occupies the area the form leaves free:
      // the left column on wide screens, a banner across the top on narrow ones.
      const wide = w >= 1024;
      rw = wide ? w * 0.575 : w;
      rh = wide ? h : Math.min(h, w < 640 ? 240 : 288);
      compact = rh < 340;

      // leave room for the slogan at the bottom-left on large stages
      const pad = compact
        ? { l: 86, r: 66, t: 24, b: 36 }
        : { l: rw * 0.09, r: rw * 0.12, t: rh * 0.1, b: rh * 0.3 };
      const aw = Math.max(40, rw - pad.l - pad.r);
      const ah = Math.max(40, rh - pad.t - pad.b);
      const s = Math.min(aw / W, ah / H);
      const offX = pad.l + (aw - W * s) / 2;
      const offY = pad.t + (ah - H * s) / 2;
      nodes.forEach((n) => {
        n.x = offX + n.ux * s;
        n.y = offY + n.uy * s;
      });
    };

    // ---- pointer ----
    let pointer: { x: number; y: number } | null = null;
    const onMove = (e: PointerEvent) => {
      const r = host.getBoundingClientRect();
      pointer = { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const onLeave = () => {
      pointer = null;
    };
    host.addEventListener('pointermove', onMove);
    host.addEventListener('pointerleave', onLeave);

    // ---- simulation ----
    const packets: Packet[] = [];
    const floaters: Floater[] = [];
    let spawnAcc = 0;
    let hubPulseAcc = 0;
    let time = reduced ? 99 : 0;
    const colour = () => PALETTE[Math.floor(Math.random() * PALETTE.length)];

    const launch = (from: number, edge: number, chain = 0, speed?: number) => {
      const e = edges[edge];
      const to = e.a === from ? e.b : e.a;
      packets.push({
        edge,
        from,
        to,
        t: 0,
        speed: speed ?? 0.42 + Math.random() * 0.3,
        color: colour(),
        chain,
      });
    };

    const spawn = () => {
      if (busyRef.current) {
        const candidates = nodes.map((_, i) => i).filter((i) => i !== hubIndex);
        const from = candidates[Math.floor(Math.random() * candidates.length)];
        const hop = towardHub[from];
        if (hop) launch(from, hop.edge, 0, 0.95 + Math.random() * 0.4);
      } else {
        const ei = Math.floor(Math.random() * edges.length);
        launch(Math.random() < 0.5 ? edges[ei].a : edges[ei].b, ei);
      }
    };

    const arrive = (p: Packet) => {
      const n = nodes[p.to];
      n.ping = 0;
      n.pingBig = n.hub;
      if (busyRef.current && p.to !== hubIndex) {
        const hop = towardHub[p.to];
        if (hop) launch(p.to, hop.edge, p.chain + 1, 0.95 + Math.random() * 0.4);
        return;
      }
      if (!busyRef.current) {
        if (Math.random() < 0.12) floaters.push({ x: n.x + n.ox, y: n.y + n.oy - 12, t: 0 });
        if (p.chain < 3 && Math.random() < 0.38) {
          const opts = neighbours[p.to].filter((o) => o.node !== p.from);
          if (opts.length) {
            const o = opts[Math.floor(Math.random() * opts.length)];
            launch(p.to, o.edge, p.chain + 1);
          }
        }
      }
    };

    const step = (dt: number) => {
      time += dt;
      const busyNow = busyRef.current;

      spawnAcc += dt * (busyNow ? 10 : 2.1);
      while (spawnAcc >= 1 && time > 1.6) {
        spawnAcc -= 1;
        spawn();
      }
      if (spawnAcc > 3) spawnAcc = 0;

      if (busyNow) {
        hubPulseAcc += dt;
        if (hubPulseAcc > 0.55) {
          hubPulseAcc = 0;
          nodes[hubIndex].ping = 0;
          nodes[hubIndex].pingBig = true;
        }
      }

      for (let i = packets.length - 1; i >= 0; i--) {
        const p = packets[i];
        p.t += dt * p.speed;
        if (p.t >= 1) {
          packets.splice(i, 1);
          arrive(p);
        }
      }
      for (let i = floaters.length - 1; i >= 0; i--) {
        floaters[i].t += dt;
        if (floaters[i].t > 1.6) floaters.splice(i, 1);
      }

      for (const n of nodes) {
        if (n.ping >= 0) {
          n.ping += dt / (n.pingBig ? 1.3 : 0.9);
          if (n.ping >= 1) n.ping = -1;
        }
        let targetGlow = 0;
        let tx = 0;
        let ty = 0;
        if (pointer) {
          const d = Math.hypot(pointer.x - n.x, pointer.y - n.y);
          targetGlow = clamp01(1 - d / 150);
          tx = (pointer.x - n.x) * 0.07 * targetGlow;
          ty = (pointer.y - n.y) * 0.07 * targetGlow;
        }
        const k = 1 - Math.exp(-dt * 8);
        n.glow += (targetGlow - n.glow) * k;
        n.ox += (tx - n.ox) * k;
        n.oy += (ty - n.oy) * k;
      }
    };

    // ---- drawing ----
    const draw = () => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      // faint dot grid
      ctx.fillStyle = 'rgba(191, 243, 210, 0.07)';
      for (let gx = 20; gx < w; gx += 32)
        for (let gy = 20; gy < h; gy += 32) ctx.fillRect(gx, gy, 1.5, 1.5);

      const hub = nodes[hubIndex];
      const hubA = easeOut(clamp01((time - hub.delay) / 0.6));

      // soft light behind the hub
      if (hubA > 0) {
        const r = Math.min(rw, rh) * 0.5;
        const g = ctx.createRadialGradient(hub.x, hub.y, 0, hub.x, hub.y, r);
        g.addColorStop(0, `rgba(120, 220, 160, ${0.2 * hubA})`);
        g.addColorStop(1, 'rgba(120, 220, 160, 0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
      }

      // links
      ctx.lineWidth = 1;
      for (const e of edges) {
        const a = nodes[e.a];
        const b = nodes[e.b];
        const grow = easeOut(clamp01((time - e.delay) / 0.7));
        if (grow <= 0) continue;
        const ax = a.x + a.ox;
        const ay = a.y + a.oy;
        const bx = b.x + b.ox;
        const by = b.y + b.oy;
        const lit = Math.max(a.glow, b.glow);
        ctx.strokeStyle = `rgba(${MINT}, ${0.17 + lit * 0.3})`;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(ax + (bx - ax) * grow, ay + (by - ay) * grow);
        ctx.stroke();
      }

      // packets: a glowing head with a fading tail (additive blending)
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      for (const p of packets) {
        const from = nodes[p.from];
        const to = nodes[p.to];
        const fx = from.x + from.ox;
        const fy = from.y + from.oy;
        const tx = to.x + to.ox;
        const ty = to.y + to.oy;
        const hx = fx + (tx - fx) * p.t;
        const hy = fy + (ty - fy) * p.t;
        const tailT = clamp01(p.t - 0.22);
        const sx = fx + (tx - fx) * tailT;
        const sy = fy + (ty - fy) * tailT;

        const grad = ctx.createLinearGradient(sx, sy, hx, hy);
        grad.addColorStop(0, 'rgba(255,255,255,0)');
        grad.addColorStop(1, p.color);
        ctx.strokeStyle = grad;
        ctx.lineWidth = 2.6;
        ctx.globalAlpha = 0.9;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(hx, hy);
        ctx.stroke();

        ctx.fillStyle = p.color;
        ctx.globalAlpha = 0.28;
        ctx.beginPath();
        ctx.arc(hx, hy, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.arc(hx, hy, 2.8, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';

      // nodes + labels
      const fs = compact ? 9.5 : 11.5;
      for (const n of nodes) {
        const appear = easeOut(clamp01((time - n.delay) / 0.5));
        if (appear <= 0) continue;
        const x = n.x + n.ox;
        const y = n.y + n.oy;
        const base = n.hub ? 6 : 3.6;
        const r = base * (0.4 + 0.6 * appear) + n.glow * 1.6;

        if (n.ping >= 0) {
          const ringR = r + n.ping * (n.pingBig ? 46 : 24);
          ctx.strokeStyle = n.pingBig ? `rgba(247, 238, 60, ${(1 - n.ping) * 0.7})` : `rgba(${MINT}, ${(1 - n.ping) * 0.55})`;
          ctx.lineWidth = n.pingBig ? 1.6 : 1.2;
          ctx.beginPath();
          ctx.arc(x, y, ringR, 0, Math.PI * 2);
          ctx.stroke();
        }

        ctx.fillStyle = `rgba(${MINT}, ${(0.12 + n.glow * 0.2) * appear})`;
        ctx.beginPath();
        ctx.arc(x, y, r + 5 + n.glow * 5, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = n.hub ? '#fff7b0' : `rgb(${MINT})`;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();

        ctx.font = `${n.hub ? 700 : 500} ${n.hub ? fs + 1 : fs}px 'Fustat', 'Nikosh', system-ui, sans-serif`;
        ctx.fillStyle = `rgba(226, 247, 234, ${(0.7 + n.glow * 0.3 + (n.hub ? 0.2 : 0)) * appear})`;
        const gap = r + 8;
        const side = compact && n.atSm ? n.atSm : n.at;
        if (side === 'r') {
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText(n.name, x + gap, y);
        } else if (side === 'l') {
          ctx.textAlign = 'right';
          ctx.textBaseline = 'middle';
          ctx.fillText(n.name, x - gap, y);
        } else if (side === 't') {
          ctx.textAlign = 'center';
          ctx.textBaseline = 'alphabetic';
          ctx.fillText(n.name, x, y - gap);
        } else {
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          ctx.fillText(n.name, x, y + gap);
        }
      }

      // "+1" for a record landing
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.font = `600 ${fs}px 'Fustat', 'Nikosh', system-ui, sans-serif`;
      for (const f of floaters) {
        const k = f.t / 1.6;
        ctx.fillStyle = `rgba(247, 238, 60, ${(1 - k) * 0.9})`;
        ctx.fillText('+1', f.x, f.y - k * 18);
      }
    };

    layout();
    let raf = 0;
    let last = performance.now();
    let ro: ResizeObserver | null = null;

    if (reduced) {
      draw();
      ro = new ResizeObserver(() => {
        layout();
        draw();
      });
    } else {
      const frame = (now: number) => {
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        step(dt);
        draw();
        raf = requestAnimationFrame(frame);
      };
      raf = requestAnimationFrame(frame);
      ro = new ResizeObserver(layout);
    }
    ro.observe(host);

    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
      host.removeEventListener('pointermove', onMove);
      host.removeEventListener('pointerleave', onLeave);
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden="true" className={`block ${className}`} />;
};
