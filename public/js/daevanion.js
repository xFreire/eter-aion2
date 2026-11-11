// Daevanion: valor de cada nó para a sua build e o caminho de melhor custo-benefício a partir do que já está aberto.
//
// Regras do painel (conferidas com os dados da API): os nós se ligam pelos 4 lados, a partir do nó central
// (Start). Só dá para abrir um nó vizinho de um nó já aberto. Custo em pontos pela raridade: Comum 1,
// Raro 2, Lendário 3, Único 4.
import { DAEVANION_WEIGHTS, DAEVANION_DEFAULT, DAEVANION_COST } from "./build-data.js";

export const GRADE_PT = { Common: "Comum", Rare: "Raro", Legend: "Lendário", Unique: "Único" };
const cost = (n) => DAEVANION_COST[n.grade] || 1;
const statName = (desc) => desc.replace(/\s*[+-][\d.]+%?\s*$/, "").trim();
const skillOf = (n) => (n.type === "SkillLevel" ? statName(n.effects[0] || "") : null);

// Valor (0-10) de 1 ponto gasto no nó, para o foco e as skills do personagem
export function nodeWeight(n, ctx) {
  if (n.type === "Stat") {
    const w = n.effects.map((e) => ctx.weights[statName(e)] ?? DAEVANION_DEFAULT);
    return w.length ? Math.max(...w) : 0;
  }
  if (n.type === "SkillLevel") return ctx.skillValue(skillOf(n));
  return 0;
}

// Monta o contexto: pesos do foco + quanto vale +1 em cada skill para este personagem
export function makeContext({ build, skills, focus = "pve" }) {
  const have = Object.fromEntries((skills || []).map((s) => [s.name, s]));
  const targets = Object.fromEntries((build?.actives || []).concat(build?.stigmas || []).map((b) => [b.name, b.target]));
  const reasons = {};
  const skillValue = (name) => {
    if (!name) return 0;
    const s = have[name];
    let v;
    if (build) {
      v = build.skillLineWeights[name] ?? (targets[name] ? 5 : 1);
    } else {
      v = s && (s.equip || s.category === "Passive") ? 6 : 2; // sem build: valoriza o que está equipado
    }
    let why = build?.skillLineWeights[name] >= 8 ? "prioridade da build" : "";
    if (targets[name] && s && s.skillLevel < targets[name]) {
      v += 2;
      why = `abaixo da meta (${s.skillLevel}/${targets[name]})`;
    }
    if (s && s.category !== "Passive" && s.equip === 0) {
      v = Math.min(v, 2);
      why = "skill não equipada";
    }
    reasons[name] = why;
    return Math.min(10, v);
  };
  return { weights: DAEVANION_WEIGHTS[focus] || DAEVANION_WEIGHTS.pve, skillValue, reasons, focus };
}

// Planeja os próximos nós de um painel. Algoritmo guloso: a cada rodada, procura (Dijkstra pelo custo)
// o caminho a partir dos nós abertos cujo valor/ponto é o maior, abre esse caminho inteiro e repete.
export function planBoard(board, ctx, { maxPoints = 40 } = {}) {
  const at = new Map(board.nodes.map((n) => [`${n.row},${n.col}`, n]));
  const open = new Set(board.nodes.filter((n) => n.open || n.type === "Start").map((n) => n.id));
  const value = (n) => nodeWeight(n, ctx) * cost(n);
  const neighbors = (n) => [[1, 0], [-1, 0], [0, 1], [0, -1]]
    .map(([dr, dc]) => at.get(`${n.row + dr},${n.col + dc}`)).filter(Boolean);

  const steps = [];
  let spent = 0;
  while (spent < maxPoints) {
    // Dijkstra multi-origem a partir de todos os nós abertos
    const dist = new Map(), gain = new Map(), prev = new Map();
    const queue = [];
    for (const n of board.nodes) {
      if (!open.has(n.id)) continue;
      for (const m of neighbors(n)) {
        if (open.has(m.id)) continue;
        const d = cost(m), g = value(m);
        if (!dist.has(m.id) || d < dist.get(m.id) || (d === dist.get(m.id) && g > gain.get(m.id))) {
          dist.set(m.id, d); gain.set(m.id, g); prev.set(m.id, null); queue.push(m);
        }
      }
    }
    const done = new Set();
    while (queue.length) {
      queue.sort((a, b) => dist.get(a.id) - dist.get(b.id) || gain.get(b.id) - gain.get(a.id));
      const n = queue.shift();
      if (done.has(n.id)) continue;
      done.add(n.id);
      for (const m of neighbors(n)) {
        if (open.has(m.id) || done.has(m.id)) continue;
        const d = dist.get(n.id) + cost(m), g = gain.get(n.id) + value(m);
        if (!dist.has(m.id) || d < dist.get(m.id) || (d === dist.get(m.id) && g > gain.get(m.id))) {
          dist.set(m.id, d); gain.set(m.id, g); prev.set(m.id, n.id); queue.push(m);
        }
      }
    }
    // melhor alvo = maior valor por ponto do caminho até ele
    let best = null, bestRatio = 0;
    for (const id of done) {
      const r = gain.get(id) / dist.get(id);
      if (r > bestRatio + 1e-9 || (Math.abs(r - bestRatio) < 1e-9 && best && dist.get(id) < dist.get(best))) {
        best = id; bestRatio = r;
      }
    }
    if (!best || bestRatio <= 0) break;
    const byId = new Map(board.nodes.map((n) => [n.id, n]));
    const path = [];
    for (let id = best; id != null; id = prev.get(id)) path.unshift(byId.get(id));
    const target = path.at(-1);
    for (const n of path) {
      open.add(n.id);
      spent += cost(n);
      steps.push({ node: n, cost: cost(n), weight: nodeWeight(n, ctx), isTarget: n === target, reason: reasonFor(n, ctx) });
    }
  }
  const points = steps.reduce((a, s) => a + s.cost, 0);
  const totalValue = steps.reduce((a, s) => a + s.weight * s.cost, 0);
  // eficiência dos primeiros ~10 pontos: usada para dizer em qual painel investir primeiro
  let acc = 0, accV = 0;
  for (const s of steps) { if (acc >= 10) break; acc += s.cost; accV += s.weight * s.cost; }
  return { steps, points, totalValue, efficiency: acc ? accV / acc : 0 };
}

function reasonFor(n, ctx) {
  if (n.type === "SkillLevel") return ctx.reasons[skillOf(n)] || "";
  const w = nodeWeight(n, ctx);
  if (w >= 9) return "atributo top para dano";
  if (w <= 1) return "só passagem";
  return "";
}

// Soma os bônus já abertos em todos os painéis: { skills: [[nome, total]], stats: [[nome, total, "%"|""]] }
export function totals(boards) {
  const skills = new Map(), stats = new Map();
  const add = (map, desc) => {
    const m = desc.match(/^(.*?)\s*([+-][\d.]+)(%?)\s*$/);
    if (!m) return;
    const [, name, v, pct] = m;
    const cur = map.get(name) || [0, pct];
    map.set(name, [cur[0] + parseFloat(v), pct]);
  };
  for (const b of boards) {
    b.skillEffects.forEach((d) => add(skills, d));
    b.statEffects.forEach((d) => add(stats, d));
  }
  const round = (x) => Math.round(x * 100) / 100;
  return {
    skills: [...skills].map(([k, [v]]) => [k, round(v)]).sort((a, b) => b[1] - a[1]),
    stats: [...stats].map(([k, [v, p]]) => [k, round(v), p]),
  };
}
