# Éter — Aion 2 em português

Site para você e seus amigos consultarem personagens do **Aion 2** em pt-BR:

- **Busca** de personagens em todas as regiões globais (América Latina, NA, Europa, Ásia).
- **Resumo**: CP, nível do item, atributos, atributos divinos, painéis Daevanion, títulos, asas.
- **Equipamento**: cada item com suas linhas, manastones, uma **nota (S+ a D)** baseada no que importa para dano,
  as linhas ideais do slot e o **próximo upgrade** (próximo tier/nível do item).
- **Build**: compara suas skills, estigmas e passivas com a build recomendada (Encantador PvE, do Atreia Lens).
- **O que fazer**: lista de ações ordenada por impacto no CP (encantar, superar, trocar itens, manastones,
  linhas ruins, skills, Daevanion, títulos…) com checklist que fica salvo no navegador.
- **Grupo**: adicione os personagens dos amigos, compare CP lado a lado e compartilhe o grupo por link.

## De onde vêm os dados

| Dado | Fonte |
|---|---|
| Personagem, equipamento, skills, Daevanion | API do armory oficial da NCSoft (`aion2.plaync.com`, `api-search.plaync.com`), já em pt-BR. É a mesma fonte do kisk.app. |
| Build do Encantador e dicas | [Atreia Lens](https://atreialens.com/chanter) |
| Banco de itens (caminho de upgrade) | `public/data/gear.json`, gerado dos dados públicos do Atreia Lens |
| Ícones e retratos | CDN oficial da NCSoft |

O navegador não pode chamar a NCSoft direto (CORS), por isso há um pequeno servidor (`server.js`) que repassa
as chamadas, guarda cache de 10 minutos e limita a ~8 chamadas/segundo para não sobrecarregar a API deles.

## Rodar no seu PC

Precisa do [Node.js](https://nodejs.org) 18 ou mais novo. Não há dependências para instalar.

```bash
npm start
```

Abra http://localhost:3000.

## Colocar online para os amigos (grátis)

**Render.com** (mais simples):

1. Suba esta pasta para um repositório no GitHub.
2. No Render: *New → Blueprint*, escolha o repositório (o `render.yaml` já configura tudo).
   Ou *New → Web Service*, com Build Command vazio e Start Command `node server.js`.
3. Mande o link `https://<seu-app>.onrender.com` para os amigos.

No plano grátis o Render "dorme" depois de 15 min sem acesso; a primeira visita depois disso demora ~30 s.
Railway, Fly.io ou qualquer VPS com Node também funcionam (`PORT` vem da variável de ambiente).

## Personalizar

- **Pesos dos atributos, linhas ideais por slot e builds**: `public/js/build-data.js`.
  Para adicionar a build de outra classe, crie uma entrada em `BUILDS` com a chave em inglês
  (`GLADIATOR`, `TEMPLAR`, `ASSASSIN`, `RANGER`, `SORCERER`, `ELEMENTALIST`, `CLERIC`, `CHANTER`).
- **Regras das sugestões**: `public/js/analysis.js` (função `suggestions`).
- **Atualizar o banco de itens** depois de um patch:

  ```bash
  curl -o /tmp/items.json https://atreialens.com/build/data/items.json
  curl -o /tmp/names.json https://atreialens.com/data/build-names.pt.json
  python3 scripts/gerar-dados.py /tmp/items.json /tmp/names.json
  ```

## Observações

- A API da NCSoft não é documentada oficialmente; se ela mudar, o site pode precisar de ajuste em `server.js`.
- O "impacto no CP" das sugestões é uma estimativa: a NCSoft não publica a fórmula do CP.
- Site de fãs, sem vínculo com a NCSoft.
