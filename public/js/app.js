import {
  SLOT_NAMES, SLOT_ORDER, GRADE_NAMES, IMPACT, buildFor, scoreItem, upgradePath, suggestions, stage, letter,
} from "./analysis.js";
import { SLOT_IDEAL } from "./build-data.js";
import { tabDaevanion } from "./daevanion-ui.js";

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

const TABS = [["", "Resumo"], ["equipamento", "Equipamento"], ["build", "Build"], ["daevanion", "Daevanion"], ["progressao", "O que fazer"]];

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
  document.title = `${p.characterName} · Éter`;
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
  ({ "": tabSummary, equipamento: tabGear, build: tabBuild, progressao: tabProgress, daevanion: (e, d, _db, r) => tabDaevanion(e, d, r) }[tab] || tabSummary)(el, data, db, ref);
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
        <div class="toolbar"><h2 style="margin:0">Painéis Daevanion</h2><span class="spacer"></span><a href="${charPath(ref, 'daevanion')}">Ver caminho recomendado →</a></div><div style="height:10px"></div>
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
    <div class="gear-head">
      <div class="legend">
        <span><i style="background:var(--good)"></i>Ótima para dano</span>
        <span><i style="background:var(--mid)"></i>Ok</span>
        <span><i style="background:var(--bad)"></i>Inútil para dano</span>
      </div>
      <span class="spacer"></span>
      <button class="ghost" id="flip-all">↻ Ver todos os ideais</button>
    </div>
    <p class="muted small" style="margin:-6px 0 16px">% = relevância da linha para dano (${build ? "build do " + esc(data.profile.className) : "pesos genéricos de DPS"}).
      Nota = linhas do item comparadas a 6 linhas perfeitas. Toque em <b>Ideal</b> para virar o card.</p>
    <div class="grid items">${items.map((e) => itemCard(e, build, db, data.profile.raceId)).join("")}</div>`;
  bindCards(el);
  let all = false;
  el.querySelector("#flip-all").onclick = (ev) => {
    all = !all;
    el.querySelectorAll(".flip").forEach((f) => f.classList.toggle("flipped", all));
    ev.currentTarget.textContent = all ? "↻ Ver meus itens" : "↻ Ver todos os ideais";
  };
}

// Efeito holográfico (inclinação + brilho seguindo o ponteiro) e virar o card
function bindCards(root) {
  root.addEventListener("click", (e) => {
    const t = e.target.closest(".turn");
    if (t) t.closest(".flip").classList.toggle("flipped");
  });
  if (!matchMedia("(hover: hover) and (prefers-reduced-motion: no-preference)").matches) return;
  root.addEventListener("pointermove", (e) => {
    const c = e.target.closest(".tcard");
    if (!c) return;
    const r = c.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    c.style.setProperty("--mx", `${x * 100}%`);
    c.style.setProperty("--my", `${y * 100}%`);
    c.style.setProperty("--ry", `${(x - 0.5) * 8}deg`);
    c.style.setProperty("--rx", `${(0.5 - y) * 8}deg`);
  });
  root.addEventListener("pointerout", (e) => {
    const c = e.target.closest(".tcard");
    if (c && !c.contains(e.relatedTarget)) { c.style.setProperty("--rx", "0deg"); c.style.setProperty("--ry", "0deg"); }
  });
}

// Linhas ideais do slot. Arcanas e slots sem tabela usam as skills de maior peso da build.
function idealFor(e, build) {
  if (SLOT_IDEAL[e.slotPosName]) return SLOT_IDEAL[e.slotPosName];
  if (e.slotPosName.startsWith("Arcana") && build) {
    return Object.entries(build.skillLineWeights).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([n]) => "+" + n);
  }
  return null;
}

function itemCard(e, build, db, raceId) {
  const d = e.detail || {};
  const sc = scoreItem(e, build);
  const next = upgradePath(e, db, raceId)[0];
  const ideal = idealFor(e, build);
  const slot = SLOT_NAMES[e.slotPosName] || e.slotPosName;
  const gradeName = d.gradeName || GRADE_NAMES[e.grade] || e.grade;
  const scored = sc?.score != null;
  const gradeCls = scored ? `grade-${sc.grade.replace("+", "plus")}` : "";
  const emptyStones = Math.max(0, (d.magicStoneSlotCount || 0) - (sc?.stones.length || 0));
  const has = (x) => (x.startsWith("+")
    ? sc?.lines.some((l) => l.kind === "skill" && l.name === x.slice(1))
    : sc?.lines.some((l) => l.kind === "stat" && l.name === x));
  const matched = ideal ? ideal.filter(has).length : 0;

  const mainStats = (d.mainStats || []).slice(0, 4).map((s) =>
    `<span>${esc(s.name)} <b>${esc(s.value)}</b>${s.extra && s.extra !== "0" ? ` <span class="plus">+${esc(s.extra)}</span>` : ""}</span>`).join("");
  const lines = (sc?.lines || []).map((l) => `
    <div class="line ${weightClass(l.weight)}">
      <span>${l.kind === "skill" ? '<span class="kind">SKILL</span>' : ""}${esc(l.name)}<span class="val">${esc(l.value)}</span></span>
      <span class="pct" title="Relevância para dano">${l.weight * 10}%</span>
      <div class="bar"><i style="width:${l.weight * 10}%"></i></div>
    </div>`).join("");
  const stones = (sc?.stones || []).map((s) => `<span class="gem ${weightClass(s.weight)}" title="${esc(s.name)} (${esc(GRADE_NAMES[s.grade] || s.grade)})">${esc(s.name)} ${esc(s.value)}</span>`).join("")
    + `<span class="gem empty">encaixe vazio</span>`.repeat(emptyStones);

  const front = `
    <article class="tcard g-${esc(e.grade)} ${gradeCls}">
      <div class="foil" aria-hidden="true"></div>
      <div class="face">
        <div class="slotname"><span>${esc(slot)}</span><span class="lvl">Nv ${d.level ?? "?"} · ${esc(gradeName)}</span></div>
        <header>
          <span class="picture"><img src="${esc(e.icon)}" alt="" loading="lazy" draggable="false" />
            ${e.exceedLevel ? `<span class="exceed" title="Superação ${e.exceedLevel}">★${e.exceedLevel}</span>` : ""}
            <span class="enchant" title="+${e.enchantLevel} de ${d.maxEnchantLevel || "?"}">+${e.enchantLevel}</span></span>
          <div><b>${esc(e.name)}</b>${scored ? `<span class="facet"><small>Nota</small>${sc.score}</span>` : `<span class="note">máx +${d.maxEnchantLevel ?? "?"}</span>`}</div>
          ${scored ? `<span class="letter ${sc.grade}">${sc.grade}</span>` : ""}
        </header>
        ${mainStats ? `<div class="mainstats">${mainStats}</div>` : ""}
        ${lines ? `<div class="section-t"><span>Linhas</span><span>relevância</span></div>${lines}` : `<div class="unscored">Sem linhas aleatórias: item sem nota.</div>`}
        ${stones ? `<div class="section-t"><span>Manastones</span></div><div class="gems">${stones}</div>` : ""}
        ${ideal ? `<button class="turn" type="button"><span>${matched} de ${ideal.length} linhas ideais</span><span>↻ Ideal</span></button>` : ""}
      </div>
      <div class="glare" aria-hidden="true"></div>
    </article>`;
  if (!ideal) return `<div class="flip"><div class="flip-inner"><div class="side front">${front}</div></div></div>`;

  const idealLines = ideal.map((x) => {
    const ok = has(x);
    const label = x.startsWith("+") ? `<span class="kind">SKILL</span>${esc(x.slice(1))} +1` : esc(x);
    return `<div class="line ideal ${ok ? "has" : "lacking"}"><i class="mark" title="${ok ? "Seu item tem" : "Seu item não tem"}">${ok ? "✓" : ""}</i><span>${label}</span><span class="pct">${ok ? "tem" : ""}</span></div>`;
  }).join("");
  const back = `
    <article class="tcard bis">
      <div class="foil" aria-hidden="true"></div>
      <div class="face">
        <div class="slotname"><span>${esc(slot)}</span><span class="lvl">Ideal${build ? " · " + esc(build.title.split(" — ")[0]) : ""}</span></div>
        <header>
          <span class="picture star" aria-hidden="true">★</span>
          <div><b>Ideal para ${esc(slot.toLowerCase())}</b><span class="note">Melhor no slot</span></div>
          <span class="letter bis">BiS</span>
        </header>
        <div class="section-t"><span>Linhas a buscar</span></div>
        ${idealLines}
        ${next ? `<div class="upgrade"><small>Próximo upgrade</small>${esc(next.n)} · nv ${next.lv} ${next.t.toUpperCase()}</div>` : ""}
        <button class="turn" type="button"><span>Seu item tem ${matched} de ${ideal.length}</span><span>↻ Seu item</span></button>
      </div>
      <div class="glare" aria-hidden="true"></div>
    </article>`;
  return `<div class="flip" data-slot="${esc(e.slotPosName)}"><div class="flip-inner"><div class="side front">${front}</div><div class="side back">${back}</div></div></div>`;
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
  document.title = "Éter · Aion 2";
  return home();
}

setupQuickSearch();
window.addEventListener("hashchange", route);
route();
