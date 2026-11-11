// Análise do personagem: nota de cada item, comparação com a build e lista de sugestões para subir o CP.
import {
  STAT_WEIGHTS, MANASTONE_WEIGHTS, MANASTONE_NAME_WEIGHTS, MANASTONE_TIP, SLOT_IDEAL, BUILDS,
  DEFAULT_SKILL_LINE_WEIGHT,
} from "./build-data.js";

export const SLOT_NAMES = {
  MainHand: "Arma principal", SubHand: "Mão secundária", Helmet: "Elmo", Shoulder: "Ombreiras", Torso: "Peitoral",
  Pants: "Calças", Gloves: "Luvas", Boots: "Botas", Cape: "Capa", Belt: "Cinto", Necklace: "Colar",
  Earring1: "Brinco 1", Earring2: "Brinco 2", Ring1: "Anel 1", Ring2: "Anel 2", Bracelet1: "Bracelete 1",
  Bracelet2: "Bracelete 2", Amulet: "Amuleto", Rune1: "Runa 1", Rune2: "Runa 2",
  Arcana1: "Arcana 1", Arcana2: "Arcana 2", Arcana3: "Arcana 3", Arcana4: "Arcana 4", Arcana5: "Arcana 5",
};
export const SLOT_ORDER = Object.keys(SLOT_NAMES);
export const GRADE_NAMES = { Common: "Comum", Rare: "Raro", Legend: "Lendário", Unique: "Único", Epic: "Épico", Special: "Especial", Mythic: "Mítico" };
const GRADE_RANK = { Common: 1, Rare: 2, Special: 2, Legend: 3, Unique: 4, Epic: 5, Mythic: 6 };
const WEAPON_SLOTS = new Set(["MainHand", "SubHand"]);
const ARMOR_SLOTS = new Set(["Helmet", "Shoulder", "Torso", "Pants", "Gloves", "Boots", "Cape"]);
const ACCESSORY_SLOTS = new Set(["Necklace", "Earring1", "Earring2", "Ring1", "Ring2", "Bracelet1", "Bracelet2"]);
const isArcana = (slot) => slot.startsWith("Arcana");

export const IMPACT = { 3: "Alto", 2: "Médio", 1: "Baixo" };

export function buildFor(profile) {
  const key = (profile.classKey || "").toUpperCase();
  return BUILDS[key] || null;
}

function skillWeight(build, name) {
  if (!build) return DEFAULT_SKILL_LINE_WEIGHT;
  return build.skillLineWeights[name] ?? 1;
}

const num = (v) => parseFloat(String(v).replace(/[^\d.-]/g, "")) || 0;

// ---------- nota de cada item ----------
export function scoreItem(slot, build) {
  const d = slot.detail;
  if (!d) return null;
  const lines = [];
  for (const s of d.subStats || []) {
    lines.push({ kind: "stat", name: s.name, value: s.value, weight: STAT_WEIGHTS[s.id] ?? 0 });
  }
  for (const s of d.subSkills || []) {
    lines.push({ kind: "skill", name: s.name, value: `+${s.level}`, weight: skillWeight(build, s.name), icon: s.icon });
  }
  // O "ideal" considerado é 6 linhas boas por item (4 em arcanas, que só têm skills); itens sem linhas aleatórias não recebem nota.
  const possible = (d.subStatCount || 0) + (d.subSkillCountMax || 0);
  const maxLines = possible ? Math.max(lines.length, Math.min(6, possible)) : 0;
  const stones = (d.magicStoneStat || []).map((m) => {
    let weight = MANASTONE_WEIGHTS[m.id];
    if (weight == null) weight = MANASTONE_NAME_WEIGHTS.find(([re]) => re.test(m.name))?.[1] ?? 0;
    return { ...m, weight };
  });
  if (!maxLines) return { lines, stones, maxLines: 0, score: null, grade: "—" };
  const score = Math.round((lines.reduce((a, l) => a + l.weight, 0) / (maxLines * 10)) * 100);
  return { lines, stones, maxLines, score, grade: letter(score) };
}

export function letter(score) {
  if (score == null) return "—";
  if (score >= 75) return "S+";
  if (score >= 55) return "S";
  if (score >= 40) return "A";
  if (score >= 25) return "B";
  if (score >= 10) return "C";
  return "D";
}

// ---------- caminho de upgrade (banco de itens do Atreia Lens) ----------
const TIER = { t1: 1, t2: 2, t3: 3, t4: 4, t5: 5, t6: 6 };
const SLOT_KIND = {
  Helmet: ["armor", "helmet"], Shoulder: ["armor", "shoulder"], Torso: ["armor", "torso"], Pants: ["armor", "pants"],
  Gloves: ["armor", "gloves"], Boots: ["armor", "boots"], Cape: ["armor", "cape"], Necklace: ["accessory", "necklace"],
  Earring1: ["accessory", "earring"], Earring2: ["accessory", "earring"], Ring1: ["accessory", "ring"], Ring2: ["accessory", "ring"],
  Bracelet1: ["accessory", "bracelet"], Bracelet2: ["accessory", "bracelet"],
};
export function upgradePath(slot, gearDb, raceId) {
  let cur = gearDb.byId.get(slot.id);
  // Item fora do banco (ex.: itens antigos de missão): usa o tipo do slot e o nível do item
  if (!cur && SLOT_KIND[slot.slotPosName] && slot.detail?.level) {
    const [c, s] = SLOT_KIND[slot.slotPosName];
    cur = { c, s, lv: slot.detail.level, t: "t1" };
  }
  if (!cur) return [];
  const race = raceId === 2 ? "dark" : "light";
  const seen = new Set();
  return gearDb.list
    .filter((x) => x.s === cur.s && x.c === cur.c && (x.r === "all" || x.r === race))
    .filter((x) => x.lv > cur.lv || (x.lv === cur.lv && TIER[x.t] > TIER[cur.t]))
    .sort((a, b) => a.lv - b.lv || TIER[a.t] - TIER[b.t])
    .filter((x) => (seen.has(x.n) ? false : seen.add(x.n)))
    .slice(0, 3);
}

// ---------- sugestões ----------
// Cada sugestão: { cat, title, detail, impact (1-3), effort (1-3), items? }
export function suggestions(data, gearDb) {
  const { profile, equipment, skills, daevanion, titles, wing } = data;
  const build = buildFor(profile);
  const out = [];
  const bySlot = Object.fromEntries(equipment.map((e) => [e.slotPosName, e]));
  const name = (e) => `${SLOT_NAMES[e.slotPosName] || e.slotPosName}: ${e.name}`;

  // 1) Encantamento (o que mais mexe no CP no dia a dia)
  const toEnchant = equipment.filter((e) => e.detail?.enchantable && e.enchantLevel < (e.detail.maxEnchantLevel || 15));
  const weapons = toEnchant.filter((e) => WEAPON_SLOTS.has(e.slotPosName));
  const gear = toEnchant.filter((e) => ARMOR_SLOTS.has(e.slotPosName) || ACCESSORY_SLOTS.has(e.slotPosName));
  const arcanas = toEnchant.filter((e) => isArcana(e.slotPosName));
  const other = toEnchant.filter((e) => !weapons.includes(e) && !gear.includes(e) && !arcanas.includes(e));
  const enchantList = (list) => list.map((e) => `${name(e)} — +${e.enchantLevel} → +${e.detail.maxEnchantLevel}`);
  if (weapons.length) out.push({
    cat: "Encantamento", impact: 3, effort: 2,
    title: `Encantar arma${weapons.length > 1 ? "s" : ""} até +${weapons[0].detail.maxEnchantLevel}`,
    detail: "A arma é o item que mais dá Ataque por nível de encantamento. É o primeiro lugar para gastar pedras de encantamento.",
    items: enchantList(weapons),
  });
  if (gear.length) {
    const missing = gear.reduce((a, e) => a + (e.detail.maxEnchantLevel - e.enchantLevel), 0);
    out.push({
      cat: "Encantamento", impact: 3, effort: 3,
      title: `Encantar ${gear.length} peças de armadura/acessório (${missing} níveis no total)`,
      detail: "Comece pelas peças com menor encantamento: os primeiros níveis são mais baratos e cada nível soma atributo base e CP.",
      items: enchantList(gear.sort((a, b) => a.enchantLevel - b.enchantLevel)),
    });
  }
  if (arcanas.length) out.push({
    cat: "Encantamento", impact: 2, effort: 2,
    title: `Encantar arcanas (${arcanas.length})`,
    detail: "Arcanas encantadas aumentam os níveis das skills e atributos de deus que elas dão.",
    items: enchantList(arcanas),
  });
  if (other.length) out.push({ cat: "Encantamento", impact: 1, effort: 1, title: "Encantar runas, cinto e amuleto", detail: "Ganho menor, mas barato.", items: enchantList(other) });

  // 2) Superação (exceed) para itens já no máximo
  const toExceed = equipment.filter((e) => e.detail?.surpassable && e.enchantLevel >= (e.detail.maxEnchantLevel || 15)
    && (e.exceedLevel || 0) < (e.detail.maxExceedEnchantLevel || 0));
  if (toExceed.length) out.push({
    cat: "Encantamento", impact: 3, effort: 3, title: "Superar (exceed) itens que já estão no encantamento máximo",
    detail: "Depois do +15 o item ainda pode ser superado, o que dá um salto grande de atributo.",
    items: toExceed.map((e) => `${name(e)} — superação ${e.exceedLevel || 0} → ${e.detail.maxExceedEnchantLevel}`),
  });

  // 3) Itens fracos / desatualizados
  const mainGear = equipment.filter((e) => e.detail && (WEAPON_SLOTS.has(e.slotPosName) || ARMOR_SLOTS.has(e.slotPosName) || ACCESSORY_SLOTS.has(e.slotPosName)));
  const topLevel = Math.max(0, ...mainGear.map((e) => e.detail.level || 0));
  const outdated = mainGear.filter((e) => (e.detail.level || 0) < topLevel - 10 || GRADE_RANK[e.grade] < GRADE_RANK.Unique);
  if (outdated.length) out.push({
    cat: "Equipamento", impact: 3, effort: 2,
    title: `Trocar ${outdated.length} ${outdated.length > 1 ? "itens desatualizados" : "item desatualizado"}`,
    detail: `Seu equipamento principal é nível ${topLevel}. Estes itens estão bem abaixo disso (nível ou raridade) e puxam o CP para baixo.`,
    items: outdated.map((e) => {
      const next = upgradePath(e, gearDb, profile.raceId)[0];
      return `${name(e)} (nv ${e.detail.level}, ${GRADE_NAMES[e.grade] || e.grade})${next ? ` → ${next.n} (nv ${next.lv})` : ""}`;
    }),
  });

  // 4) Próximo tier de equipamento
  const nextTier = mainGear
    .filter((e) => !outdated.includes(e))
    .map((e) => ({ e, next: upgradePath(e, gearDb, profile.raceId)[0] }))
    .filter((x) => x.next);
  if (nextTier.length) out.push({
    cat: "Equipamento", impact: 3, effort: 3, title: "Próximo tier de equipamento",
    detail: "Itens de tier/nível acima do que você usa hoje. Vale farmar quando o encantamento atual estiver alto.",
    items: nextTier.map(({ e, next }) => `${SLOT_NAMES[e.slotPosName]}: ${e.name} → ${next.n} (nv ${next.lv}, ${next.t.toUpperCase()})`),
  });

  // 5) Linhas de atributo ruins
  const badLines = [];
  for (const e of mainGear) {
    const sc = scoreItem(e, build);
    const bad = sc?.lines.filter((l) => l.weight <= 1) || [];
    if (bad.length) {
      const ideal = SLOT_IDEAL[e.slotPosName];
      badLines.push(`${name(e)}: ${bad.map((l) => l.name).join(", ")}${ideal ? ` → procure ${ideal.slice(0, 3).join(" / ").replace(/\+/g, "+1 ")}` : ""}`);
    }
  }
  if (badLines.length) out.push({
    cat: "Atributos", impact: 2, effort: 2, title: `Substituir ${badLines.length} itens com linhas defensivas/inúteis para dano`,
    detail: "Estas linhas não ajudam o DPS (defesa, regeneração, PM, resistências). Na hora de trocar a peça ou reajustar as linhas, mire nas linhas recomendadas do slot.",
    items: badLines,
  });

  // 6) Manastones
  const badStones = [];
  let emptyStones = 0, badCount = 0;
  for (const e of equipment) {
    if (!e.detail?.magicStoneSlotCount) continue;
    const stones = scoreItem(e, build)?.stones || [];
    emptyStones += Math.max(0, e.detail.magicStoneSlotCount - stones.length);
    const bad = stones.filter((s) => s.weight <= 3);
    badCount += bad.length;
    if (bad.length) badStones.push(`${name(e)}: ${bad.map((s) => `${s.name} ${s.value}`).join(", ")}`);
  }
  if (emptyStones) out.push({
    cat: "Manastones", impact: 2, effort: 1, title: `Preencher ${emptyStones} encaixe(s) de manastone vazio(s)`,
    detail: `Encaixe vazio é CP de graça perdido. Prioridade: ${MANASTONE_TIP}.`,
  });
  if (badStones.length) {
    out.push({
      cat: "Manastones", impact: 2, effort: 1, title: `Trocar ${badCount} manastones defensivas por ofensivas`,
      detail: `Manastones são baratas e fáceis de trocar. Prioridade: ${MANASTONE_TIP}.`,
      items: badStones,
    });
  }

  // 7) Skills x build
  if (build) {
    const have = Object.fromEntries(skills.map((s) => [s.name, s]));
    const low = build.actives
      .map((b) => ({ b, s: have[b.name] }))
      .filter(({ b, s }) => !s || s.skillLevel < b.target);
    if (low.length) out.push({
      cat: "Skills", impact: 2, effort: 2, title: `Subir ${low.length} skill(s) até o nível da build`,
      detail: "Níveis de skill vêm de linhas +N em equipamentos/arcanas e do próprio upgrade de skill. Comece pelas primeiras da lista (maior prioridade).",
      items: low.map(({ b, s }) => `${b.name}: ${s ? s.skillLevel : 0} → ${b.target} (espec. ${b.spec})`),
    });
    const unequipped = build.actives.filter((b) => have[b.name] && !have[b.name].equip);
    if (unequipped.length) out.push({
      cat: "Skills", impact: 2, effort: 1, title: "Equipar skills da build que estão fora da barra",
      detail: "Estas skills fazem parte da build recomendada mas não estão equipadas.",
      items: unequipped.map((b) => b.name),
    });
    const stig = build.stigmas
      .map((b) => ({ b, s: have[b.name] }))
      .filter(({ b, s }) => !s || !s.equip || s.skillLevel < b.target);
    if (stig.length) out.push({
      cat: "Skills", impact: 2, effort: 2, title: "Ajustar estigmas",
      detail: `Estigmas recomendados e nível alvo. Alternativas boas: ${build.stigmaAlternatives.join(", ")}.`,
      items: stig.map(({ b, s }) => `${b.name}: ${s ? `nv ${s.skillLevel}${s.equip ? "" : " (não equipado)"}` : "não tem"} → nv ${b.target}+`),
    });
    const passives = build.passivePriority.map((n, i) => ({ n, i, s: have[n] }));
    const maxPassive = Math.max(...passives.map((p) => p.s?.skillLevel || 0));
    const lagging = passives.filter((p) => (p.s?.skillLevel || 0) < maxPassive - 4);
    if (lagging.length) out.push({
      cat: "Skills", impact: 2, effort: 2, title: "Passivas prioritárias atrasadas",
      detail: `Ordem de prioridade: ${build.passivePriority.join(" › ")}. Procure linhas +N delas em armaduras e arcanas.`,
      items: lagging.map((p) => `${p.i + 1}º ${p.n}: nv ${p.s?.skillLevel || 0} (sua maior passiva prioritária está nv ${maxPassive})`),
    });
  }

  // 8) Daevanion
  const boards = daevanion.filter((b) => b.openPercent < 100);
  if (boards.length) out.push({
    cat: "Daevanion", impact: 2, effort: 3, title: "Completar painéis Daevanion",
    detail: "Cada nó aberto dá atributo permanente (e CP). Veja na aba Daevanion qual painel rende mais por ponto e a ordem exata dos nós para a sua build.",
    items: boards.sort((a, b) => b.openPercent - a.openPercent)
      .map((b) => `${b.name}: ${b.openNodeCount}/${b.totalNodeCount} nós (${b.openPercent}%)`),
  });

  // 9) Títulos e asas
  if (build) {
    const equippedTitles = new Set(titles.map((t) => t.name));
    const wanted = Object.entries(build.titles).filter(([, list]) => !list.some((n) => equippedTitles.has(n)));
    if (wanted.length) out.push({
      cat: "Coleção", impact: 1, effort: 2, title: "Títulos recomendados",
      detail: "Títulos equipados dão atributos. Recomendação da build:",
      items: wanted.map(([cat, list]) => `${cat}: ${list.join(" › ")}`),
    });
    if (wing && !build.wings.includes(wing.name)) out.push({
      cat: "Coleção", impact: 1, effort: 2, title: "Asas",
      detail: `Você usa ${wing.name}. As mais usadas pela classe: ${build.wings.join(", ")}.`,
    });
  }

  // 10) Nível
  if (profile.characterLevel < 45) out.push({
    cat: "Progressão", impact: 3, effort: 2, title: `Subir para o nível 45 (você está no ${profile.characterLevel})`,
    detail: "Nível baixo limita o equipamento que você pode usar.",
  });

  return out.sort((a, b) => b.impact - a.impact || a.effort - b.effort);
}

// Resumo da fase de progressão
export function stage(data, gearDb) {
  const main = data.equipment.filter((e) => e.detail && (WEAPON_SLOTS.has(e.slotPosName) || ARMOR_SLOTS.has(e.slotPosName)));
  if (!main.length) return null;
  const levels = main.map((e) => e.detail.level || 0);
  const tiers = main.map((e) => gearDb.byId.get(e.id)?.t).filter(Boolean);
  const avgEnchant = main.reduce((a, e) => a + e.enchantLevel, 0) / main.length;
  const lv = Math.round(levels.reduce((a, b) => a + b, 0) / levels.length);
  const tier = tiers.sort().at(Math.floor(tiers.length / 2)) || "?";
  let next;
  if (avgEnchant < 13) next = `Seu foco agora é encantamento: média de +${avgEnchant.toFixed(1)} nas peças principais. Leve tudo para +13~15 antes de trocar de tier.`;
  else next = "Encantamento está bom: hora de buscar o próximo tier de equipamento e superar (exceed) a arma.";
  return { lv, tier: tier.toUpperCase(), avgEnchant, next };
}

export { num };
