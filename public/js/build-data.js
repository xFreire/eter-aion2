// Configuração das builds e dos pesos de atributos. Edite à vontade: é aqui que mora a "opinião" do site.
// Nomes de skills e atributos estão exatamente como a API oficial devolve em pt-BR.

// Peso de cada atributo para dano em PvE (0 = inútil para DPS, 10 = o melhor). Chave = id da API oficial.
export const STAT_WEIGHTS = {
  CombatSpeed: 10, // Velocidade de Combate
  AmplifyWeaponDamage: 10, // Amplificação de Dano de Arma
  AmplifyAllDamage: 9, // Amplificação de Dano
  DamageRatio: 9, // Aumento de Ataque (%)
  STR: 9, // Poder
  AGI: 8, // Exatidão
  Perfect: 8, // Acerto Perfeito
  AdditionalHitRate: 8, // Acerto de Golpes Múltiplos
  AmplifyCriticalDamage: 8, // Amplificação de Dano Crítico
  PvEAmplifyDamage: 8, // Amplificação de Dano em JvA
  WeaponFixingDamage: 7, // Ataque
  MoveSpeed: 6, // Velocidade de Movimento (qualidade de vida, muito usada em botas/brincos)
  DefensePierce: 5, // Penetração
  Critical: 4, // Acerto Crítico
  WeaponAccuracy: 4, // Precisão
  PvEDecreaseDamage: 4, // Tolerância a Dano em JvA
  Accuracy: 3, // Precisão Adicional
  SealStoneAddDamage: 3, // Dano Adicional do Fragmento de Poder
  // Atributos divinos (braceletes)
  Time: 7, Destruction: 7, Wisdom: 7, Illusion: 6, Justice: 5, Death: 5, Freedom: 4, Life: 3, Destiny: 3, Space: 3,
  // Defensivos / utilidade
  HPMax: 1, Restoration: 1, HpPotionRate: 1, PvPAddDamage: 1, PvPAccuracy: 1,
};

// Peso dos atributos de manastone (pedra de mana). Prioridade do Atreia Lens:
// Amp. Dano de Ataque Frontal ▸ Amp. Dano de Arma ≈ Amp. Dano Crítico ▸ Amp. Dano ▸ Ataque.
export const MANASTONE_WEIGHTS = {
  AmplifyWeaponDamage: 9,
  AmplifyCriticalDamage: 9,
  AmplifyAllDamage: 8,
  WeaponFixingDamage: 7,
  Critical: 4,
  Accuracy: 4,
  CombatSpeed: 8,
  STR: 6,
  AGI: 5,
  HPMax: 1,
};
// Manastones cujo id não conhecemos mas reconhecemos pelo nome
export const MANASTONE_NAME_WEIGHTS = [[/Ataque Frontal/i, 10]];

export const MANASTONE_TIP =
  "Amplificação de Dano de Ataque Frontal (se joga de frente) ▸ Amplificação de Dano de Arma ≈ Amplificação de Dano Crítico ▸ Amplificação de Dano ▸ Ataque";

// Linhas recomendadas por slot (o que procurar ao trocar/reajustar linhas)
export const SLOT_IDEAL = {
  MainHand: ["Velocidade de Combate", "Amplificação de Dano de Arma", "Poder", "Amplificação de Dano", "Exatidão", "Acerto de Golpes Múltiplos"],
  SubHand: ["Velocidade de Combate", "Amplificação de Dano de Arma", "Poder", "Amplificação de Dano", "Exatidão", "Acerto de Golpes Múltiplos"],
  Torso: ["Amplificação de Dano", "Ataque", "Acerto Perfeito", "+Preparar Ataque", "+Acerto de Impacto", "+Promessa do Vento"],
  Pants: ["Aumento de Ataque", "Tolerância a Dano", "Acerto Perfeito", "Ataque", "+Preparar Ataque", "+Acerto de Impacto"],
  Helmet: ["Chance de Golpe Duplo", "Aumento de Ataque", "Ataque", "+Preparar Ataque", "+Acerto de Impacto", "+Promessa do Vento"],
  Shoulder: ["Amplificação de Dano Crítico", "Chance de Golpe Duplo", "Ataque", "+Preparar Ataque", "+Acerto de Impacto", "+Promessa do Vento"],
  Gloves: ["Velocidade de Combate", "Acerto Perfeito", "Ataque", "+Preparar Ataque", "+Acerto de Impacto", "+Promessa do Vento"],
  Boots: ["Velocidade de Movimento", "Acerto Perfeito", "Ataque", "+Preparar Ataque", "+Acerto de Impacto", "+Promessa do Vento"],
  Cape: ["Chance de Golpe Duplo", "Aumento de Ataque", "Ataque", "+Preparar Ataque", "+Acerto de Impacto", "+Promessa do Vento"],
  Necklace: ["Velocidade de Combate", "Poder", "Ataque", "Exatidão", "+Preparar Ataque", "+Acerto de Impacto"],
  Earring1: ["Velocidade de Movimento", "Poder", "Ataque", "Exatidão", "Precisão", "+Preparar Ataque"],
  Earring2: ["Velocidade de Movimento", "Poder", "Ataque", "Exatidão", "Precisão", "+Preparar Ataque"],
  Ring1: ["Poder", "Exatidão", "Ataque", "+Esmagamento Sombrio", "+Golpe Estilhaçante", "+Feitiço da Convalescença"],
  Ring2: ["Poder", "Exatidão", "Ataque", "+Esmagamento Sombrio", "+Golpe Estilhaçante", "+Feitiço da Convalescença"],
  Bracelet1: ["Tempo [Siel]", "Destruição [Zikel]", "Sabedoria [Lumiel]", "Ilusão [Kaisinel]", "Justiça [Nezekan]"],
  Bracelet2: ["Tempo [Siel]", "Destruição [Zikel]", "Sabedoria [Lumiel]", "Ilusão [Kaisinel]", "Justiça [Nezekan]"],
};

// Builds por classe (chave = nome da classe em inglês, como a API devolve em pcdata)
export const BUILDS = {
  CHANTER: {
    title: "Encantador — PvE (Atreia Lens)",
    source: "https://atreialens.com/chanter",
    // Nível final desejado de cada skill ativa + especializações
    actives: [
      { name: "Golpe Estilhaçante", target: 20, spec: "3/4/5" },
      { name: "Golpe Incandescente", target: 16, spec: "3/5" },
      { name: "Esmagamento de Investida", target: 12, spec: "1/4" },
      { name: "Golpe Destruidor", target: 12, spec: "3/4" },
      { name: "Esmagamento Sombrio", target: 20, spec: "3/4/5" },
      { name: "Golpe da Onda Abrasadora", target: 12, spec: "3/4" },
      { name: "Feitiço da Convalescença", target: 16, spec: "1/4" },
      { name: "Esmagamento Vibrante", target: 12, spec: "2/3" },
      { name: "Golpe Ondulante", target: 12, spec: "1/4" },
      { name: "Golpe Giratório", target: 20, spec: "1/2/3" },
      { name: "Remoção de Impacto", target: 16, spec: "3/5" },
    ],
    stigmas: [
      { name: "Mantra do Imbatível", target: 20 },
      { name: "Soberania do Vendaval", target: 5 },
      { name: "Mantra da Disparada", target: 1 },
      { name: "Defesa Concentrada", target: 5 },
    ],
    stigmaAlternatives: ["Bênção da Guarda", "Soberania do Bloqueio", "Fúria de Marchutan"],
    passivePriority: ["Promessa do Vento", "Acerto de Impacto", "Preparar Ataque", "Promessa da Terra", "Feitiço da Inspiração"],
    // Peso das linhas de skill (+N) em equipamentos e arcanas
    skillLineWeights: {
      "Preparar Ataque": 10, "Acerto de Impacto": 10, "Promessa do Vento": 10,
      "Esmagamento Sombrio": 9, "Golpe Estilhaçante": 9,
      "Feitiço da Convalescença": 8, "Feitiço da Inspiração": 8, "Golpe Giratório": 8,
      "Golpe Incandescente": 6, "Promessa da Terra": 6, "Esmagamento de Investida": 5,
      "Golpe Destruidor": 4, "Vendaval Desenfreado": 3, "Bênção da Vida": 3,
    },
    titles: {
      Ofensivo: ["Livre das Amarras da Raça", "Guardião de Verteron", "Resplendor Dourado"],
      Defensivo: ["Santidade de Verteron", "Governar Todas as Coisas"],
      Utilidade: ["Do Inferno e de Volta", "Ai, Não Tenho Nada para Vestir"],
    },
    wings: ["Asas de Véu da Escuridão", "Asas do Espírito da Floresta", "Asas de Talisra do Vazio"],
    notes: [
      ["Arcana (atributos de deus)", "Cálice (Vigor): Tempo · Manuscrito (Vigor): Vida / Destino · Bússola (Magia): Morte / Liberdade · Sino (Magia): Destruição · Espelho (Magia): Ilusão / Sabedoria."],
      ["Prioridade de aprimoramento", "Bônus de Golpe Potente, depois Amplificação de Dano de Arma, Amplificação de Dano, Ataque, e por fim Precisão Adicional e Acerto Crítico."],
      ["Manastones", MANASTONE_TIP + "."],
      ["Teostones", "Veneno e Besta performam melhor no início; mais tarde todas ficam parecidas."],
      ["Colosso", "Prioridade em Zikel / Kromede."],
      ["Estátuas", "Prioridade em Liberdade, Morte e Espaço."],
      ["Pinturas", "Prioridade em Ilusão e Sabedoria, depois Vida."],
      ["Linhas 3, 6 e 9 do arcana", "Dano Adicional do Fragmento de Poder só se o limite dele ainda não foi atingido."],
      ["Macro", "Segure clique esquerdo + tecla de macro (botão direito recomendado). Gameplay › Macro = botão direito; Uso Rápido 1 = botão esquerdo / R; Tecla de Habilidade Especial Separada: DESLIGADO."],
    ],
  },
};

// Peso padrão de uma linha de skill quando a classe não tem build cadastrada
export const DEFAULT_SKILL_LINE_WEIGHT = 5;
