import {
  SLOT_NAMES, SLOT_ORDER, GRADE_NAMES, IMPACT, buildFor, scoreItem, upgradePath, suggestions, stage, letter,
} from "./analysis.js";
import { SLOT_IDEAL } from "./build-data.js";

const app = document.getElementById("app");
const REGIONS = { la: "América Latina", nae: "NA Leste", naw: "NA Oeste", eu: "Europa", as: "Ásia" };
const RACES = { 1: ["Elyseano", "elyos"], 2: ["Asmodiano", "asmo"] };

// ---------- utilidades ----------
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const fmt = (n) => Number(n || 0).toLocaleString("pt-BR");
const store = {
  get(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* sem storage */ } },
};
function toast(msg) {
  const t = Object.assign(document.createElement("div"), { className: "toast", textContent: msg });
  document.body.append(t);
  setTimeout(() => t.remove(), 2200);
}
async function api(path) {
  const res = await fetch(path);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Erro ${res.status}`);
  return body;
}
const charPath = (c, tab = "") => `#/p/${c.region}/${c.serverId}/${encodeURIComponent(c.characterId)}${tab ? `/${tab}` : ""}`;
const regionOptions = (sel) => Object.entries(REGIONS).map(([k, v]) => `<option value="${k}"${k === sel ? " selected" : ""}>${v}</option>`).join("");

let gearDbPromise;
function gearDb() {
  gearDbPromise ??= fetch("/data/gear.json").then((r) => r.json()).then((list) => ({ list, byId: new Map(list.map((x) => [x.id, x])) }));
  return gearDbPromise;
}

// ---------- grupo (amigos) ----------
const group = {
  list: () => store.get("grupo", []),
  has: (c) => group.list().some((g) => g.characterId === c.characterId && g.serverId == c.serverId),
  add(c) {
    if (group.has(c)) return;
    store.set("grupo", [...group.list(), { region: c.region, serverId: Number(c.serverId), characterId: c.characterId, name: c.name }]);
  },
  remove(c) { store.set("grupo", group.list().filter((g) => !(g.characterId === c.characterId && g.serverId == c.serverId))); },
  encode: (list) => btoa(unescape(encodeURIComponent(JSON.stringify(list.map((g) => [g.region, g.serverId, g.characterId, g.name])))))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""),
  decode(s) {
    const json = decodeURIComponent(escape(atob(s.replace(/-/g, "+").replace(/_/g, "/"))));
    return JSON.parse(json).map(([region, serverId, characterId, name]) => ({ region, serverId, characterId, name }));
  },
};

// ---------- busca ----------
const lastRegion = () => store.get("regiao", "la");
function setupQuickSearch() {
  const sel = document.getElementById("quick-region");
  sel.innerHTML = regionOptions(lastRegion());
  document.getElementById("quick-search").addEventListener("submit", (e) => {
    e.preventDefault();
    const name = document.getElementById("quick-name").value.trim();
    if (name) location.hash = `#/busca/${sel.value}/${encodeURIComponent(name)}`;
  });
}

function home() {
  app.innerHTML = `
    <section class="hero">
      <h1>Seu <span>Aion 2</span> em português</h1>
      <p>Busque qualquer personagem, veja equipamento e build traduzidos, a nota de cada item e uma lista do que fazer para subir o CP.</p>
      <form class="bigsearch" id="big-search">
        <select id="big-region" aria-label="Região">${regionOptions(lastRegion())}</select>
        <input id="big-name" placeholder="Nome do personagem" autocomplete="off" autofocus aria-label="Nome do personagem" />
        <button>Buscar</button>
      </form>
    </section>
    <section id="home-group"></section>`;
  document.getElementById("big-search").addEventListener("submit", (e) => {
    e.preventDefault();
    const name = document.getElementById("big-name").value.trim();
    if (name) location.hash = `#/busca/${document.getElementById("big-region").value}/${encodeURIComponent(name)}`;
  });
  if (group.list().length) renderGroupTable(document.getElementById("home-group"), group.list(), { title: "Meu grupo" });
}

async function searchPage(region, name) {
  store.set("regiao", region);
  document.getElementById("quick-region").value = region;
  app.innerHTML = `<h2>Resultados para “${esc(name)}” <span class="muted small">· ${esc(REGIONS[region] || region)}</span></h2><div class="loading">Buscando…</div>`;
  try {
    const { list } = await api(`/api/search?region=${region}&q=${encodeURIComponent(name)}`);
    if (!list.length) {
      app.lastElementChild.outerHTML = `<div class="empty-state">Nenhum personagem encontrado. Confira o nome e a região.</div>`;
      return;
    }
    // Se só tem um com o nome exato, vai direto
    const exact = list.filter((c) => c.name.toLowerCase() === name.toLowerCase());
    app.lastElementChild.outerHTML = `<div class="results">${list.map((c) => `
      <a class="result" href="${charPath({ ...c, region })}">
        <img src="${esc(c.image)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'" />
        <div>
          <b>${esc(c.name)}</b>
          <div class="muted small">Nv ${c.level} · ${esc(c.className)} · ${esc(c.serverName)} · ${RACES[c.raceId]?.[0] || ""}</div>
        </div>
      </a>`).join("")}</div>
      ${exact.length === 1 && list.length > 1 ? `<p class="muted small">Dica: há só um “${esc(exact[0].name)}” com o nome exato.</p>` : ""}`;
  } catch (err) {
    app.lastElementChild.outerHTML = `<div class="error">${esc(err.message)}</div>`;
  }
}

// ---------- perfil ----------
const charCache = new Map();
async function loadChar(region, serverId, characterId, refresh = false) {
  const key = `${region}/${serverId}/${characterId}`;
  if (!refresh && charCache.has(key)) return charCache.get(key);
  const p = api(`/api/character?region=${region}&serverId=${serverId}&characterId=${encodeURIComponent(characterId)}${refresh ? "&refresh" : ""}`);
  charCache.set(key, p);
  p.catch(() => charCache.delete(key));
  return p;
}

const TABS = [["", "Resumo"], ["equipamento", "Equipamento"], ["build", "Build"], ["progressao", "O que fazer"]];

async function profilePage(region, serverId, characterId, tab = "", refresh = false) {
  const ref = { region, serverId, characterId };
  if (!app.querySelector(`[data-char="${CSS.escape(characterId)}"]`) || refresh) {
    app.innerHTML = `<div class="loading">Carregando personagem na armory oficial…</div>`;
  }
  let data, db;
  try {
    [data, db] = await Promise.all([loadChar(region, serverId, characterId, refresh), gearDb()]);
  } catch (err) {
    app.innerHTML = `<div class="error">Não foi possível carregar: ${esc(err.message)}</div>`;
    return;
  }
  const p = data.profile;
  document.title = `${p.characterName} · Atreia BR`;
  const level = data.stats.find((s) => s.type === "ItemLevel")?.value;
  const scored = data.equipment.map((e) => scoreItem(e, buildFor(p))).filter((s) => s?.score != null);
  const avg = scored.length ? Math.round(scored.reduce((a, s) => a + s.score, 0) / scored.length) : null;
  const inGroup = group.has({ ...ref, characterId: p.characterId });
  const [raceName, raceCls] = RACES[p.raceId] || [p.raceName, ""];

  app.innerHTML = `
    <section class="hero-char" data-char="${esc(characterId)}">
      <img class="portrait" src="${esc(p.profileImage)}" alt="" onerror="this.style.visibility='hidden'" />
      <div>
        <div class="pills">
          <span class="pill ${raceCls}">${esc(raceName)}</span>
          <span class="pill">Nv ${p.characterLevel} ${esc(p.className)}</span>
          <span class="pill">${esc(p.serverName)} · ${esc(REGIONS[region])}</span>
          ${p.regionName ? `<span class="pill">Legião ${esc(p.regionName)}</span>` : ""}
        </div>
        <h1>${esc(p.characterName)}</h1>
        ${p.titleName ? `<div class="muted small">«${esc(p.titleName)}»</div>` : ""}
      </div>
      <div class="right">
        <div class="cp"><small>Poder de combate</small>${fmt(p.combatPower)}</div>
        <div class="cp"><small>Nível do item</small>${fmt(level)}</div>
        <div class="cp"><small>Nota do equip.</small><span class="grade ${letter(avg)}">${letter(avg)}</span></div>
      </div>
    </section>
    <div class="toolbar" style="margin-top:14px">
      <button class="ghost" id="btn-group">${inGroup ? "✓ No meu grupo" : "+ Adicionar ao grupo"}</button>
      <button class="ghost" id="btn-refresh">↻ Atualizar</button>
      <button class="ghost" id="btn-share">Copiar link</button>
      <span class="spacer"></span>
      <span class="muted small">Dados de ${new Date(data.fetchedAt).toLocaleString("pt-BR")}</span>
    </div>
    <nav class="tabs">${TABS.map(([t, label]) => `<a href="${charPath(ref, t)}"${t === tab ? ' aria-current="page"' : ""}>${label}</a>`).join("")}</nav>
    <section id="tab"></section>`;

  document.getElementById("btn-group").onclick = (e) => {
    const c = { ...ref, characterId: p.characterId, name: p.characterName };
    if (group.has(c)) { group.remove(c); e.target.textContent = "+ Adicionar ao grupo"; toast("Removido do grupo"); }
    else { group.add(c); e.target.textContent = "✓ No meu grupo"; toast("Adicionado ao grupo"); }
  };
  document.getElementById("btn-refresh").onclick = () => profilePage(region, serverId, characterId, tab, true);
  document.getElementById("btn-share").onclick = () => copy(location.href);

  const el = document.getElementById("tab");
  ({ "": tabSummary, equipamento: tabGear, build: tabBuild, progressao: tabProgress }[tab] || tabSummary)(el, data, db, ref);
}

async function copy(text) {
  try { await navigator.clipboard.writeText(text); toast("Link copiado!"); }
  catch { prompt("Copie o link:", text); }
}

// --- aba Resumo
function tabSummary(el, data, db, ref) {
  const st = stage(data, db);
  const sug = suggestions(data, db).slice(0, 4);
  const base = data.stats.filter((s) => ["STR", "DEX", "INT", "CON", "AGI", "WIS"].includes(s.type));
  const divine = data.stats.filter((s) => s.name.includes("["));
  const statCard = (s) => `<div class="stat"><div class="row"><span>${esc(s.name)}</span><span>${fmt(s.value)}</span></div>
    ${(s.statSecondList || []).map((x) => `<div class="sub">${esc(x)}</div>`).join("")}</div>`;
  el.innerHTML = `
    <div class="grid two">
      <div class="card stack">
        <h2>Onde você está</h2>
        ${st ? `<div class="kpis">
          <div class="kpi"><b>Nv ${st.lv}</b><span>Nível médio do equipamento</span></div>
          <div class="kpi"><b>${st.tier}</b><span>Tier do equipamento</span></div>
          <div class="kpi"><b>+${st.avgEnchant.toFixed(1)}</b><span>Encantamento médio</span></div>
        </div><p>${esc(st.next)}</p>` : ""}
        <h3>Principais ações para subir o CP</h3>
        ${sug.map((s) => `<div class="small"><span class="tag i${s.impact}">${IMPACT[s.impact]}</span> ${esc(s.title)}</div>`).join("")}
        <a href="${charPath(ref, "progressao")}">Ver lista completa →</a>
      </div>
      <div class="card">
        <h2>Painéis Daevanion</h2>
        ${data.daevanion.map((b) => `<div class="board"><img src="${esc(b.icon)}" alt="" />
          <div><div class="small"><b>${esc(b.name)}</b> <span class="muted">${b.openNodeCount}/${b.totalNodeCount} nós</span></div>
          <div class="bar"><i style="width:${b.openPercent}%"></i></div></div><b>${b.openPercent}%</b></div>`).join("")}
      </div>
    </div>
    <div class="card" style="margin-top:14px"><h2>Atributos</h2><div class="stats">${base.map(statCard).join("")}</div>
      <h3 style="margin:14px 0 8px">Atributos divinos</h3><div class="stats">${divine.map(statCard).join("")}</div></div>
    <div class="grid two" style="margin-top:14px">
      <div class="card"><h2>Títulos equipados</h2>${data.titles.map((t) => `<div style="margin-bottom:8px"><b class="t-${esc(t.grade)}">${esc(t.name)}</b>
        <span class="muted small">· ${esc(t.equipCategory)}</span><div class="muted small">${(t.equipStatList || []).map((x) => esc(x.desc || x.name || x)).join(" · ")}</div></div>`).join("") || '<p class="muted">Nenhum.</p>'}</div>
      <div class="card"><h2>Asas e mascote</h2>
        ${data.wing ? `<div class="item-head"><img class="icon g-${esc(data.wing.grade)}" src="${esc(data.wing.icon)}" alt="" /><div><div class="item-name">${esc(data.wing.name)}</div><div class="muted small">+${data.wing.enchantLevel}</div></div></div>` : ""}
        ${data.pet ? `<div class="item-head" style="margin-top:10px"><img class="icon" src="${esc(data.pet.icon)}" alt="" /><div><div class="item-name">${esc(data.pet.name)}</div><div class="muted small">Nv ${data.pet.level}</div></div></div>` : ""}
      </div>
    </div>`;
}

// --- aba Equipamento
function weightClass(w) { return w >= 7 ? "w-hi" : w >= 3 ? "w-mid" : "w-lo"; }
function tabGear(el, data, db) {
  const build = buildFor(data.profile);
  const items = [...data.equipment].sort((a, b) => SLOT_ORDER.indexOf(a.slotPosName) - SLOT_ORDER.indexOf(b.slotPosName));
  el.innerHTML = `
    <div class="legend">
      <span><i style="background:var(--good)"></i>Linha ótima para dano</span>
      <span><i style="background:var(--mid)"></i>Linha ok</span>
      <span><i style="background:var(--bad)"></i>Linha inútil para dano</span>
      <span>Nota = valor das linhas do item comparado a 6 linhas perfeitas (${build ? "pesos da build do " + esc(data.profile.className) : "pesos genéricos de DPS"})</span>
    </div>
    <div class="grid items">${items.map((e) => itemCard(e, build, db, data.profile.raceId)).join("")}</div>`;
}

function itemCard(e, build, db, raceId) {
  const d = e.detail || {};
  const sc = scoreItem(e, build);
  const next = upgradePath(e, db, raceId)[0];
  const ideal = SLOT_IDEAL[e.slotPosName];
  const main = (d.mainStats || []).map((s) => `${esc(s.name)} ${esc(s.value)}${s.extra && s.extra !== "0" ? ` <span class="ok">+${esc(s.extra)}</span>` : ""}`).join(" · ");
  const emptyStones = Math.max(0, (d.magicStoneSlotCount || 0) - (sc?.stones.length || 0));
  return `<article class="item">
    <div class="item-head">
      <img class="icon g-${esc(e.grade)}" src="${esc(e.icon)}" alt="" loading="lazy" />
      <div>
        <div class="label">${esc(SLOT_NAMES[e.slotPosName] || e.slotPosName)}</div>
        <div class="item-name t-${esc(e.grade)}">+${e.enchantLevel}${e.exceedLevel ? ` <span class="ok">★${e.exceedLevel}</span>` : ""} ${esc(e.name)}</div>
        <div class="muted small">Nv ${d.level ?? "?"} · ${esc(d.gradeName || GRADE_NAMES[e.grade] || e.grade)}${d.maxEnchantLevel ? ` · máx +${d.maxEnchantLevel}` : ""}</div>
      </div>
      ${sc?.score != null ? `<span class="grade ${sc.grade}" title="${sc.score}/100">${sc.grade}</span>` : ""}
    </div>
    ${main ? `<div class="small muted">${main}</div>` : ""}
    ${sc?.lines.length ? `<div><div class="label">Linhas</div><ul class="lines">
      ${sc.lines.map((l) => `<li class="${weightClass(l.weight)}"><span>${l.kind === "skill" ? "Skill: " : ""}${esc(l.name)}</span><b>${esc(l.value)}</b></li>`).join("")}
    </ul></div>` : ""}
    ${sc?.stones.length || emptyStones ? `<div><div class="label">Manastones</div><ul class="lines">
      ${sc.stones.map((s) => `<li class="${weightClass(s.weight)}"><span class="t-${esc(s.grade)}">${esc(s.name)}</span><b>${esc(s.value)}</b></li>`).join("")}
      ${"<li class='empty'><span>encaixe vazio</span></li>".repeat(emptyStones)}
    </ul></div>` : ""}
    ${ideal ? `<div class="ideal"><b>Ideal no slot:</b> ${ideal.map((x) => esc(x.startsWith("+") ? `+1 ${x.slice(1)}` : x)).join(" · ")}</div>` : ""}
    ${next ? `<div class="next">Próximo upgrade: ${esc(next.n)} (nv ${next.lv}, ${next.t.toUpperCase()})</div>` : ""}
  </article>`;
}

// --- aba Build
function tabBuild(el, data) {
  const build = buildFor(data.profile);
  const have = Object.fromEntries(data.skills.map((s) => [s.name, s]));
  const byCat = (c) => data.skills.filter((s) => s.category === c);
  const skillCell = (s, name) => `<span class="skill">${s?.icon ? `<img src="${esc(s.icon)}" alt="" />` : ""}${esc(name)}</span>`;
  const status = (lv, target, equip) => {
    if (equip === 0) return `<span class="warn">não equipada</span>`;
    if (lv >= target) return `<span class="ok">✓ ok</span>`;
    return `<span class="no">faltam ${target - lv}</span>`;
  };
  if (!build) {
    el.innerHTML = `<div class="card"><p class="muted">Ainda não há build cadastrada para ${esc(data.profile.className)}. Abaixo estão as skills atuais.
      (Para cadastrar, edite <code>public/js/build-data.js</code>.)</p>${skillTable(data.skills)}</div>`;
    return;
  }
  el.innerHTML = `
    <div class="card stack">
      <div class="toolbar"><h2 style="margin:0">${esc(build.title)}</h2><span class="spacer"></span><a href="${esc(build.source)}" target="_blank" rel="noopener">Fonte ↗</a></div>
      <h3>Skills ativas (nível final)</h3>
      <div class="table-wrap"><table>
        <tr><th>Skill</th><th class="num">Seu nível</th><th class="num">Meta</th><th>Especialização</th><th>Status</th></tr>
        ${build.actives.map((b) => { const s = have[b.name]; return `<tr><td>${skillCell(s, b.name)}</td><td class="num">${s?.skillLevel ?? 0}</td>
          <td class="num">${b.target}</td><td>${esc(b.spec)}</td><td>${status(s?.skillLevel ?? 0, b.target, s?.equip)}</td></tr>`; }).join("")}
      </table></div>
      <h3>Estigmas</h3>
      <div class="table-wrap"><table>
        <tr><th>Estigma</th><th class="num">Seu nível</th><th class="num">Meta</th><th>Status</th></tr>
        ${build.stigmas.map((b) => { const s = have[b.name]; return `<tr><td>${skillCell(s, b.name)}</td><td class="num">${s?.skillLevel ?? 0}</td>
          <td class="num">${b.target}+</td><td>${status(s?.skillLevel ?? 0, b.target, s?.equip)}</td></tr>`; }).join("")}
      </table></div>
      <p class="muted small">Também bons: ${build.stigmaAlternatives.map(esc).join(", ")}.
        Equipados agora: ${byCat("Dp").filter((s) => s.equip).map((s) => `${esc(s.name)} (${s.skillLevel})`).join(", ")}.</p>
      <h3>Passivas por prioridade</h3>
      <div class="table-wrap"><table>
        <tr><th>#</th><th>Passiva</th><th class="num">Seu nível</th></tr>
        ${build.passivePriority.map((n, i) => `<tr><td>${i + 1}</td><td>${skillCell(have[n], n)}</td><td class="num">${have[n]?.skillLevel ?? 0}</td></tr>`).join("")}
      </table></div>
    </div>
    <div class="card" style="margin-top:14px"><h2>Dicas da build</h2><dl class="notes">
      ${build.notes.map(([t, d]) => `<dt>${esc(t)}</dt><dd>${esc(d)}</dd>`).join("")}
      <dt>Títulos</dt><dd>${Object.entries(build.titles).map(([c, l]) => `${esc(c)}: ${l.map(esc).join(" › ")}`).join("<br>")}</dd>
      <dt>Asas mais usadas</dt><dd>${build.wings.map(esc).join(" · ")}</dd>
    </dl></div>
    <div class="card" style="margin-top:14px"><h2>Todas as suas skills</h2>${skillTable(data.skills)}</div>`;
}

function skillTable(skills) {
  const cats = { Active: "Ativa", Passive: "Passiva", Dp: "Estigma" };
  return `<div class="table-wrap"><table><tr><th>Skill</th><th>Tipo</th><th class="num">Nível</th><th>Equipada</th></tr>
    ${skills.map((s) => `<tr><td><span class="skill"><img src="${esc(s.icon)}" alt="" loading="lazy" />${esc(s.name)}</span></td>
    <td>${cats[s.category] || esc(s.category)}</td><td class="num">${s.skillLevel}</td><td>${s.category === "Passive" ? "—" : s.equip ? "sim" : "não"}</td></tr>`).join("")}
  </table></div>`;
}

// --- aba Progressão
function tabProgress(el, data, db, ref) {
  const list = suggestions(data, db);
  const key = `feito:${ref.serverId}:${data.profile.characterId}`;
  const done = new Set(store.get(key, []));
  el.innerHTML = `
    <p class="muted">Ordenado por impacto estimado no CP e esforço. Marque o que já fez — fica salvo neste navegador.
      O impacto é uma estimativa (a NCSoft não publica a fórmula do CP).</p>
    <div class="stack">${list.map((s, i) => `
      <article class="card sugg i${s.impact}${done.has(s.title) ? " done" : ""}">
        <div class="sugg-head">
          <input type="checkbox" data-title="${esc(s.title)}" ${done.has(s.title) ? "checked" : ""} aria-label="Marcar como feito" />
          <h3>${i + 1}. ${esc(s.title)}</h3>
          <span class="tag">${esc(s.cat)}</span>
          <span class="tag i${s.impact}">Impacto ${IMPACT[s.impact].toLowerCase()}</span>
        </div>
        <p>${esc(s.detail)}</p>
        ${s.items?.length ? `<ul>${s.items.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
      </article>`).join("") || '<div class="empty-state">Nada óbvio para melhorar. Está forte!</div>'}</div>`;
  el.addEventListener("change", (e) => {
    const t = e.target.dataset.title;
    if (!t) return;
    e.target.checked ? done.add(t) : done.delete(t);
    store.set(key, [...done]);
    e.target.closest(".sugg").classList.toggle("done", e.target.checked);
  });
}

// ---------- grupo ----------
function groupPage(encoded) {
  let list, shared = false;
  try {
    if (encoded) { list = group.decode(encoded); shared = true; } else list = group.list();
  } catch {
    app.innerHTML = `<div class="error">Link de grupo inválido.</div>`;
    return;
  }
  app.innerHTML = `<section id="grp"></section>`;
  renderGroupTable(document.getElementById("grp"), list, { title: shared ? "Grupo compartilhado" : "Meu grupo", shared });
}

async function renderGroupTable(el, list, { title, shared = false }) {
  el.innerHTML = `
    <div class="toolbar" style="margin-bottom:12px">
      <h2 style="margin:0">${esc(title)}</h2><span class="spacer"></span>
      ${shared ? `<button id="g-import">Salvar no meu grupo</button>` : list.length ? `<button class="ghost" id="g-share">Compartilhar grupo</button>` : ""}
    </div>
    ${list.length ? `<div class="card table-wrap"><table>
      <thead><tr><th>Personagem</th><th>Classe</th><th>Servidor</th><th class="num">CP</th><th class="num">Nível do item</th><th class="num">Encant. médio</th><th>Nota</th><th>Ação nº 1</th>${shared ? "" : "<th></th>"}</tr></thead>
      <tbody>${list.map((c, i) => `<tr data-i="${i}"><td><a href="${charPath(c)}">${esc(c.name)}</a></td><td colspan="7" class="muted">carregando…</td>${shared ? "" : `<td><button class="ghost" data-rm="${i}" aria-label="Remover">✕</button></td>`}</tr>`).join("")}</tbody>
    </table></div>` : `<div class="card empty-state">Seu grupo está vazio. Abra um personagem e clique em “Adicionar ao grupo”.
      Depois use “Compartilhar grupo” para mandar o link aos amigos.</div>`}`;

  el.querySelector("#g-share")?.addEventListener("click", () => copy(`${location.origin}${location.pathname}#/grupo/${group.encode(group.list())}`));
  el.querySelector("#g-import")?.addEventListener("click", () => { list.forEach(group.add); toast("Grupo salvo!"); location.hash = "#/grupo"; });
  el.querySelectorAll("[data-rm]").forEach((b) => b.addEventListener("click", () => { group.remove(list[b.dataset.rm]); renderGroupTable(el, group.list(), { title }); }));

  const db = await gearDb();
  const rows = await Promise.all(list.map(async (c, i) => {
    const tr = el.querySelector(`tr[data-i="${i}"]`);
    try {
      const data = await loadChar(c.region, c.serverId, c.characterId);
      const p = data.profile;
      const build = buildFor(p);
      const sc = data.equipment.map((e) => scoreItem(e, build)).filter((s) => s?.score != null);
      const avg = sc.length ? Math.round(sc.reduce((a, s) => a + s.score, 0) / sc.length) : null;
      const st = stage(data, db);
      const top = suggestions(data, db)[0];
      tr.innerHTML = `<td><a href="${charPath(c)}">${esc(p.characterName)}</a> <span class="muted small">Nv ${p.characterLevel}</span></td>
        <td>${esc(p.className)}</td><td>${esc(p.serverName)}</td><td class="num"><b>${fmt(p.combatPower)}</b></td>
        <td class="num">${fmt(data.stats.find((s) => s.type === "ItemLevel")?.value)}</td><td class="num">${st ? "+" + st.avgEnchant.toFixed(1) : "—"}</td>
        <td><span class="grade ${letter(avg)}">${letter(avg)}</span></td><td class="small">${top ? `<a href="${charPath(c, "progressao")}">${esc(top.title)}</a>` : "—"}</td>
        ${shared ? "" : `<td><button class="ghost" data-rm="${i}" aria-label="Remover">✕</button></td>`}`;
      tr.querySelector("[data-rm]")?.addEventListener("click", () => { group.remove(c); renderGroupTable(el, group.list(), { title }); });
      return { tr, cp: p.combatPower };
    } catch (err) {
      tr.children[1].textContent = `erro: ${err.message}`;
      return { tr, cp: -1 };
    }
  }));
  // ordena por CP
  const tbody = el.querySelector("tbody");
  rows.sort((a, b) => b.cp - a.cp).forEach((r) => tbody?.append(r.tr));
}

// ---------- roteador ----------
function route() {
  const parts = location.hash.replace(/^#\/?/, "").split("/").map(decodeURIComponent);
  window.scrollTo(0, 0);
  if (parts[0] === "busca" && parts[2]) return searchPage(parts[1], parts[2]);
  if (parts[0] === "p" && parts[3]) return profilePage(parts[1], parts[2], parts[3], parts[4] || "");
  if (parts[0] === "grupo") return groupPage(parts[1]);
  document.title = "Atreia BR · Aion 2";
  return home();
}

setupQuickSearch();
window.addEventListener("hashchange", route);
route();
