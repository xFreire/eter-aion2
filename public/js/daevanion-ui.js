// Aba Daevanion: painéis em grid, bônus já abertos e caminho recomendado.
import { makeContext, planBoard, totals, nodeWeight, GRADE_PT } from "./daevanion.js";
import { buildFor } from "./analysis.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const fmt = (n) => Number(n || 0).toLocaleString("pt-BR");
const getPref = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const setPref = (k, v) => { try { localStorage.setItem(k, v); } catch { /* sem storage */ } };

const cache = new Map();
function loadDaevanion(ref, fetchedAt) {
  const key = `${ref.region}/${ref.serverId}/${ref.characterId}/${fetchedAt}`;
  if (!cache.has(key)) {
    const p = fetch(`/api/daevanion?region=${ref.region}&serverId=${ref.serverId}&characterId=${encodeURIComponent(ref.characterId)}`)
      .then(async (r) => { const b = await r.json(); if (!r.ok) throw new Error(b.error || `Erro ${r.status}`); return b; });
    cache.set(key, p);
    p.catch(() => cache.delete(key));
  }
  return cache.get(key);
}

export async function tabDaevanion(el, data, ref) {
  el.innerHTML = `<div class="loading">Carregando os painéis Daevanion…</div>`;
  let dv;
  try {
    dv = await loadDaevanion(ref, data.fetchedAt);
  } catch (err) {
    el.innerHTML = `<div class="error">Não foi possível carregar o Daevanion: ${esc(err.message)}</div>`;
    return;
  }
  const boards = dv.boards.filter((b) => b.nodes.length);
  if (!boards.length) { el.innerHTML = `<div class="empty-state">Nenhum painel Daevanion liberado.</div>`; return; }

  const state = {
    focus: getPref("dv-foco", "pve"),
    board: Number(getPref("dv-painel", "")) || null,
    budget: Number(getPref("dv-pontos", "20")) || 20,
  };
  const build = buildFor(data.profile);

  const render = () => {
    const ctx = makeContext({ build, skills: data.skills, focus: state.focus });
    const plans = new Map(boards.map((b) => [b.id, planBoard(b, ctx, { maxPoints: state.budget })]));
    const ranking = [...boards].sort((a, b) => plans.get(b.id).efficiency - plans.get(a.id).efficiency);
    if (!boards.some((b) => b.id === state.board)) state.board = ranking[0].id;
    const board = boards.find((b) => b.id === state.board);
    const plan = plans.get(board.id);
    const t = totals(boards);
    const maxEff = Math.max(...ranking.map((b) => plans.get(b.id).efficiency), 1);

    el.innerHTML = `
      <div class="toolbar" style="margin-bottom:14px">
        <div class="seg" role="group" aria-label="Foco">
          <button data-focus="pve" class="${state.focus === "pve" ? "on" : ""}">Foco PvE</button>
          <button data-focus="pvp" class="${state.focus === "pvp" ? "on" : ""}">Foco PvP</button>
        </div>
        <label class="small muted">Planejar
          <select id="dv-budget">${[10, 20, 30, 40, 60].map((n) => `<option ${n === state.budget ? "selected" : ""}>${n}</option>`).join("")}</select>
          pontos por painel</label>
        <span class="spacer"></span>
        <span class="muted small">Custo por nó: Comum 1 · Raro 2 · Lendário 3 · Único 4</span>
      </div>

      <div class="grid two">
        <div class="card">
          <h2>Onde investir primeiro</h2>
          <p class="muted small" style="margin-top:-6px">Valor médio por ponto nos próximos ~10 pontos de cada painel, considerando a sua build e o foco ${state.focus === "pve" ? "PvE" : "PvP"}.</p>
          ${ranking.map((b, i) => { const p = plans.get(b.id); return `
            <button class="rank-row${b.id === board.id ? " on" : ""}" data-board="${b.id}">
              <span class="rank-n">${i + 1}º</span>
              <span class="rank-name"><b>${esc(b.name)}</b> <span class="muted small">${b.openNodeCount}/${b.totalNodeCount} nós · ${b.openPercent}%</span>
                <span class="bar"><i style="width:${Math.round((p.efficiency / maxEff) * 100)}%"></i></span></span>
              <span class="rank-v">${p.efficiency.toFixed(1)}<small>/pt</small></span>
            </button>`; }).join("")}
        </div>
        <div class="card">
          <h2>O que você já ganhou</h2>
          <div class="label">Níveis de skill (todos os painéis)</div>
          <div class="chips">${t.skills.map(([n, v]) => `<span class="chip">${esc(n)} <b>+${v}</b></span>`).join("") || '<span class="muted small">nenhum</span>'}</div>
          <div class="label" style="margin-top:12px">Atributos</div>
          <div class="chips">${t.stats.map(([n, v, p]) => `<span class="chip">${esc(n)} <b>+${fmt(v)}${p}</b></span>`).join("")}</div>
        </div>
      </div>

      <div class="card" style="margin-top:14px">
        <div class="board-tabs">${boards.map((b) => `<button data-board="${b.id}" class="${b.id === board.id ? "on" : ""}">${esc(b.name)} <small>${b.openPercent}%</small></button>`).join("")}</div>
        <div class="dv-layout">
          <div>
            ${gridHtml(board, plan, ctx)}
            <div class="legend" style="margin-top:10px">
              <span><i class="lg open"></i>Aberto</span><span><i class="lg next"></i>Recomendado (nº = ordem)</span>
              <span><i class="lg closed"></i>Fechado</span><span><i class="lg skill"></i>Nó de skill</span>
            </div>
          </div>
          <div>
            <h3>Caminho recomendado em ${esc(board.name)}</h3>
            <p class="muted small">${plan.steps.length} nós · ${plan.points} pontos. ★ = nó-alvo; os outros são passagem até ele.</p>
            ${plan.steps.length ? `<ol class="dv-steps">${plan.steps.map((s) => `
              <li class="${s.isTarget ? "target" : ""}">
                <span>${s.isTarget ? "★ " : ""}${esc(s.node.effects.join(" / ") || s.node.name)}</span>
                <span class="muted small">${GRADE_PT[s.node.grade] || ""} · ${s.cost} pt${s.reason ? ` · ${esc(s.reason)}` : ""}</span>
              </li>`).join("")}</ol>` : `<p class="muted">Nada que valha a pena abrir com este foco${board.openPercent === 100 ? " (painel completo)" : ""}.</p>`}
            ${board.skillEffects.length || board.statEffects.length ? `<details style="margin-top:10px"><summary class="small">Bônus já abertos neste painel</summary>
              <div class="chips" style="margin-top:8px">${[...board.skillEffects, ...board.statEffects].map((d) => `<span class="chip">${esc(d)}</span>`).join("")}</div></details>` : ""}
          </div>
        </div>
      </div>`;
  };

  el.addEventListener("click", (e) => {
    const b = e.target.closest("[data-board]");
    const f = e.target.closest("[data-focus]");
    if (b) { state.board = Number(b.dataset.board); setPref("dv-painel", state.board); render(); }
    if (f) { state.focus = f.dataset.focus; setPref("dv-foco", state.focus); render(); }
  });
  el.addEventListener("change", (e) => {
    if (e.target.id === "dv-budget") { state.budget = Number(e.target.value); setPref("dv-pontos", state.budget); render(); }
  });
  render();
}

function gridHtml(board, plan, ctx) {
  const rows = Math.max(...board.nodes.map((n) => n.row));
  const cols = Math.max(...board.nodes.map((n) => n.col));
  const minR = Math.min(...board.nodes.map((n) => n.row));
  const minC = Math.min(...board.nodes.map((n) => n.col));
  const order = new Map(plan.steps.map((s, i) => [s.node.id, { i: i + 1, target: s.isTarget }]));
  const cells = board.nodes.map((n) => {
    const step = order.get(n.id);
    const cls = [
      "dv", `dv-${n.grade}`, n.type === "Start" ? "start" : n.open ? "open" : step ? "next" : "closed",
      n.type === "SkillLevel" ? "skill" : "", step?.target ? "target" : "",
    ].join(" ");
    const w = nodeWeight(n, ctx);
    const tip = n.type === "Start" ? "Início" :
      `${n.effects.join(" / ") || n.name}\n${GRADE_PT[n.grade] || ""}${n.open ? " · aberto" : ""}${step ? ` · passo ${step.i}` : ""} · valor ${w}/10`;
    return `<div class="${cls}" style="grid-row:${n.row - minR + 1};grid-column:${n.col - minC + 1}" title="${esc(tip)}">${step ? step.i : ""}</div>`;
  }).join("");
  return `<div class="dv-grid" style="grid-template-columns:repeat(${cols - minC + 1},1fr);grid-template-rows:repeat(${rows - minR + 1},auto)">${cells}</div>`;
}
