// Servidor do Éter (Aion 2 BR): serve o site e repassa as consultas para a API oficial da NCSoft
// (a mesma usada pelo armory oficial, kisk.app e afins). O navegador não pode chamar a NCSoft
// direto (CORS), por isso este proxy. Sem dependências: Node 18+.
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const PORT = Number(process.env.PORT) || 3000;
const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "public");
const SITE = "https://aion2.plaync.com";
const SEARCH = "https://api-search.plaync.com/aion2global/search/v2";
const LANG = "pt-BR";
const REGIONS = { la: "América Latina", nae: "NA Leste", naw: "NA Oeste", eu: "Europa", as: "Ásia" };
const CACHE_TTL = 10 * 60_000; // personagens: 10 min
const STATIC_TTL = 24 * 60 * 60_000; // classes/servidores: 1 dia
const MIN_REFRESH = 60_000; // "Atualizar" no máximo 1x/min por personagem

// ---------- cache e limite de requisições ----------
const cache = new Map();
function cached(key, ttl) {
  const hit = cache.get(key);
  return hit && Date.now() - hit.at < ttl ? hit : null;
}
function remember(key, value) {
  cache.set(key, { at: Date.now(), value });
  if (cache.size > 2000) cache.delete(cache.keys().next().value);
  return value;
}

// Fila simples: no máximo ~8 chamadas por segundo para a NCSoft, para não sobrecarregar a API deles.
let nextSlot = 0;
async function throttle() {
  const now = Date.now();
  const wait = Math.max(0, nextSlot - now);
  nextSlot = Math.max(now, nextSlot) + 120;
  if (wait) await new Promise((r) => setTimeout(r, wait));
}

async function nc(url) {
  await throttle();
  const res = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw Object.assign(new Error(`NCSoft respondeu ${res.status}`), { status: res.status === 404 ? 404 : 502 });
  return res.json();
}

const q = (params) => new URLSearchParams({ lang: LANG, ...params }).toString();

// ---------- dados de referência ----------
async function classes(region) {
  const key = `classes:${region}`;
  const hit = cached(key, STATIC_TTL);
  if (hit) return hit.value;
  const data = await nc(`${SITE}/pt-br/api/gameinfo/pcdata?${q({ region })}`);
  const byPcId = {};
  for (const p of data.pcDataList || []) byPcId[p.id] = { className: p.className, classText: p.classText };
  return remember(key, byPcId);
}

async function servers(region) {
  const key = `servers:${region}`;
  const hit = cached(key, STATIC_TTL);
  if (hit) return hit.value;
  const data = await nc(`${SITE}/pt-br/api/gameinfo/servers?${q({ region })}`);
  return remember(key, data.serverList || []);
}

// ---------- endpoints ----------
async function search(params) {
  const name = (params.get("q") || "").trim();
  const region = params.get("region") || "la";
  if (name.length < 2) return { list: [] };
  const key = `search:${region}:${name.toLowerCase()}`;
  const hit = cached(key, 5 * 60_000);
  if (hit) return hit.value;
  const [data, cls] = await Promise.all([
    nc(`${SEARCH}/character?${new URLSearchParams({ keyword: name, region, localeInfo: LANG, page: "1", size: "30" })}`),
    classes(region).catch(() => ({})),
  ]);
  const list = (data.list || []).map((c) => ({
    characterId: decodeURIComponent(c.characterId),
    name: c.name.replace(/<\/?strong>/g, ""),
    level: c.level,
    raceId: c.race,
    serverId: c.serverId,
    serverName: c.serverName,
    className: cls[c.pcId]?.classText || "",
    classKey: cls[c.pcId]?.className || "",
    image: c.profileImageUrl ? `https://profileimg.plaync.com${c.profileImageUrl}` : "",
  }));
  return remember(key, { list });
}

// Junta perfil, equipamento e o detalhe de cada item numa resposta só.
async function character(params) {
  const region = params.get("region") || "la";
  const serverId = params.get("serverId");
  const characterId = params.get("characterId");
  if (!REGIONS[region] || !/^\d+$/.test(serverId || "") || !characterId) {
    throw Object.assign(new Error("Parâmetros inválidos"), { status: 400 });
  }
  const key = `char:${region}:${serverId}:${characterId}`;
  const hit = cache.get(key);
  const refresh = params.has("refresh");
  if (hit && Date.now() - hit.at < (refresh ? MIN_REFRESH : CACHE_TTL)) return hit.value;

  const base = { region, serverId, characterId };
  const [info, equip, cls] = await Promise.all([
    nc(`${SITE}/api/character/info?${q(base)}`),
    nc(`${SITE}/api/character/equipment?${q(base)}`),
    classes(region).catch(() => ({})),
  ]);
  if (!info.profile?.characterId) throw Object.assign(new Error("Personagem não encontrado"), { status: 404 });

  const slots = equip.equipment?.equipmentList || [];
  const details = await Promise.all(
    slots.map((s) =>
      nc(`${SITE}/api/character/equipment/item?${q({ ...base, id: s.id, enchantLevel: s.enchantLevel, slotPos: s.slotPos })}`)
        .catch(() => null),
    ),
  );

  const value = {
    fetchedAt: new Date().toISOString(),
    region,
    profile: { ...info.profile, classKey: cls[info.profile.pcId]?.className || "" },
    stats: (info.stat?.statList || []).map((s) => (s.type === "ItemLevel" ? { ...s, name: "Nível do item" } : s)),
    titles: info.title?.titleList || [],
    daevanion: info.daevanion?.boardList || [],
    equipment: slots.map((s, i) => ({ ...s, detail: details[i] })),
    pet: equip.petwing?.pet || null,
    wing: equip.petwing?.wing || null,
    skills: equip.skill?.skillList || [],
  };
  return remember(key, value);
}

// Todos os painéis Daevanion do personagem, com cada nó (posição, efeito, raridade e se está aberto).
async function daevanion(params) {
  const char = await character(params); // usa o cache do personagem para saber quais painéis existem
  const { region, profile } = char;
  const key = `dv:${region}:${profile.serverId}:${profile.characterId}`;
  const hit = cache.get(key);
  if (hit && hit.at >= Date.parse(char.fetchedAt)) return hit.value; // mesmo "retrato" do personagem

  const base = { region, serverId: profile.serverId, characterId: profile.characterId };
  const boards = await Promise.all(
    char.daevanion.map(async (b) => {
      const d = await nc(`${SITE}/api/character/daevanion/detail?${q({ ...base, boardId: b.id })}`).catch(() => null);
      return {
        id: b.id, name: b.name, icon: b.icon, open: b.open,
        openNodeCount: b.openNodeCount, totalNodeCount: b.totalNodeCount, openPercent: b.openPercent,
        nodes: (d?.nodeList || [])
          .filter((n) => n.type !== "None")
          .map((n) => ({
            id: n.nodeId, row: n.row, col: n.col, type: n.type, grade: n.grade, open: n.open,
            name: n.name, effects: (n.effectList || []).map((e) => e.desc),
          })),
        skillEffects: (d?.openSkillEffectList || []).map((e) => e.desc),
        statEffects: (d?.openStatEffectList || []).map((e) => e.desc),
      };
    }),
  );
  return remember(key, { fetchedAt: char.fetchedAt, boards });
}

const routes = {
  "/api/search": search,
  "/api/character": character,
  "/api/daevanion": daevanion,
  "/api/servers": (p) => servers(p.get("region") || "la"),
  "/api/regions": async () => REGIONS,
};

// ---------- arquivos estáticos ----------
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon",
  ".webmanifest": "application/manifest+json",
};

async function serveStatic(pathname, res) {
  let file = normalize(join(ROOT, decodeURIComponent(pathname)));
  if (!file.startsWith(ROOT)) return send(res, 403, "Proibido");
  try {
    if ((await stat(file)).isDirectory()) file = join(file, "index.html");
  } catch {
    file = join(ROOT, "index.html"); // rotas do site caem no index
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, {
      "Content-Type": TYPES[extname(file)] || "application/octet-stream",
      "Cache-Control": file.endsWith("index.html") ? "no-cache" : "public, max-age=300",
    });
    res.end(body);
  } catch {
    send(res, 404, "Não encontrado");
  }
}

function send(res, status, body, type = "text/plain; charset=utf-8") {
  res.writeHead(status, { "Content-Type": type });
  res.end(body);
}

createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const handler = routes[url.pathname];
  if (!handler) return serveStatic(url.pathname, res);
  try {
    const data = await handler(url.searchParams);
    send(res, 200, JSON.stringify(data), "application/json; charset=utf-8");
  } catch (err) {
    const status = err.status || 502;
    if (status >= 500) console.error(url.pathname, err.message);
    send(res, status, JSON.stringify({ error: err.message }), "application/json; charset=utf-8");
  }
}).listen(PORT, () => console.log(`Éter rodando em http://localhost:${PORT}`));
