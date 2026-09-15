/**
 * Guard 16: a configuracao MCP respeita a politica — {{PROJECT_NAME}}
 *
 * PORQUE EXISTE: um servidor MCP le o repo (ou a BD, ou a rede) e devolve texto que entra no
 * contexto do agente. E a unica superficie por onde entra conteudo que ninguem deste lado
 * escreveu, e este projeto tinha regras para secrets, branches, commits e bytes — e nenhuma
 * para isto.
 *
 * O QUE VERIFICA (configuracao, nao comportamento):
 *   - segredo literal num `env` ou num `args` — um `.mcp.json` com um token dentro e um
 *     secret versionado, e o `.mcp.json` do repo e partilhado com quem clona;
 *   - servidor sem linha na tabela "Servidores aprovados" de `.agent/rules/mcp-policy.md` —
 *     e o que impede um servidor de entrar sem alguem ter respondido as perguntas da politica;
 *   - JSON invalido: "nao consegui ler" != "nao ha nada" (`TP2`).
 *
 * NO TEMPLATE NU NAO HA `.mcp.json`, logo isto salta com `SKIP` visivel. E por desenho: a
 * regra so tem trabalho a partir do primeiro servidor que o projeto derivado acrescente. Um
 * guard que nao corre tem de o DIZER — nunca desaparecer em silencio.
 *
 * LIMITE, dito por inteiro: verifica a configuracao. Um servidor honesto no ficheiro pode
 * servir conteudo hostil em runtime; contra isso a defesa e a regra de tratar o output como
 * dados, e essa e prosa. Ver `.agent/rules/mcp-policy.md`.
 */

/** Onde os agentes guardam a configuracao de servidores **no repo**. A config de utilizador
 *  (`~/.claude.json`, `~/.cursor/mcp.json`, ...) fica fora de proposito: e do utilizador, nao
 *  do projeto, e nao e partilhada com quem clona.
 *
 *  Cobrir so o `.mcp.json` era um **alvo estreito**: a politica declara-se para todos os
 *  agentes, e bastava o servidor entrar pelo ficheiro do Cursor, do VS Code ou do Gemini para
 *  o guard dizer `SKIP` e nao ver nada. Um allowlist de um item numa familia de quatro (TP6).
 *
 *  `chave`: o VS Code chama-lhe `servers`, os restantes `mcpServers`.
 *  `dedicado`: o ficheiro existe SO para MCP. Num ficheiro de definicoes gerais
 *  (`.gemini/settings.json`) a ausencia da chave e normal e nao e um achado. */
export const MCP_FILES = [
  { f: ".mcp.json", chave: "mcpServers", dedicado: true, agente: "Claude Code / Codex" },
  { f: ".cursor/mcp.json", chave: "mcpServers", dedicado: true, agente: "Cursor" },
  { f: ".vscode/mcp.json", chave: "servers", dedicado: true, agente: "VS Code / Copilot" },
  { f: ".gemini/settings.json", chave: "mcpServers", dedicado: false, agente: "Gemini CLI" },
];

/** A rule que guarda as decisoes. Sem tabela, nao ha aprovacao a comparar. */
const POLICY = ".agent/rules/mcp-policy.md";

/** Segredos literais. Deliberadamente estreito: um falso positivo aqui bloqueia trabalho
 *  legitimo, e o `gitleaks` do CI e a rede larga. O que se apanha e o descuido obvio —
 *  um token colado no ficheiro em vez de vir do ambiente. */
const SEGREDOS = [
  { re: /\bsk-[A-Za-z0-9_-]{16,}/, o: "chave de API (sk-...)" },
  { re: /\bgh[pousr]_[A-Za-z0-9]{20,}/, o: "token do GitHub" },
  { re: /\bgithub_pat_[A-Za-z0-9_]{20,}/, o: "token do GitHub (fine-grained)" },
  { re: /\bAKIA[0-9A-Z]{16}\b/, o: "chave da AWS" },
  { re: /\bAIza[0-9A-Za-z_-]{30,}/, o: "chave da Google" },
  { re: /\bxox[baprs]-[A-Za-z0-9-]{10,}/, o: "token do Slack" },
  { re: /\bsbp_[a-f0-9]{40}\b/, o: "token do Supabase (sbp_)" },
  { re: /\bglpat-[A-Za-z0-9_-]{20,}/, o: "token do GitLab" },
  { re: /\bnpm_[A-Za-z0-9]{36}\b/, o: "token do npm" },
  // Um JWT (`eyJ` e o `{"` em base64) e a forma canonica de uma service key do Supabase e de
  // meia duzia de servicos. Tres segmentos base64url e uma forma que texto normal nao tem.
  { re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/, o: "JWT (eyJ...)" },
  { re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/, o: "chave privada" },
  { re: /\b[a-z][a-z0-9+.-]*:\/\/[^\s:@/]+:[^\s:@/]+@/i, o: "URL com credencial embutida" },
];

/** `${VAR}`, `$VAR` e `env:NOME` sao referencias ao ambiente — a forma CERTA, nao um segredo. */
const REFERENCIA_AO_AMBIENTE = /^\s*(?:\$\{[^}]+\}|\$[A-Za-z_][A-Za-z0-9_]*|env:[A-Za-z_][A-Za-z0-9_]*)\s*$/;

/** Percorre todos os valores string de um objeto, com o caminho onde estao. */
function* valores(no, caminho = "") {
  if (typeof no === "string") {
    yield [caminho, no];
  } else if (Array.isArray(no)) {
    for (const [i, v] of no.entries()) yield* valores(v, `${caminho}[${i}]`);
  } else if (no && typeof no === "object") {
    for (const [k, v] of Object.entries(no)) yield* valores(v, caminho ? `${caminho}.${k}` : k);
  }
}

/** Os nomes de servidor que a tabela "Servidores aprovados" declara. A tabela e markdown, e
 *  a primeira celula de cada linha e o nome. */
function aprovados(texto) {
  if (texto === null) return null;
  const depois = texto.split(/^##\s+Servidores aprovados/m)[1];
  if (depois === undefined) return null;
  // Parar no proximo `## `. Ler ate ao fim do ficheiro fazia com que **qualquer** tabela
  // escrita a seguir — um exemplo, um historico, uma seccao de limites — concedesse
  // aprovacao a tudo o que tivesse na primeira coluna. Hoje esta seccao e a ultima do
  // ficheiro, o que torna o defeito invisivel ate alguem acrescentar uma seccao.
  const seccao = depois.split(/^##\s+/m)[0];
  const nomes = new Set();
  for (const linha of seccao.split("\n")) {
    const t = linha.trim();
    if (!t.startsWith("|")) continue;
    if (/^\|[\s|:-]+\|?$/.test(t)) continue; // separador
    const celula = t.replace(/^\|/, "").split("|")[0].trim().replace(/`/g, "");
    if (!celula || /^servidor$/i.test(celula)) continue; // cabecalho / linha vazia
    nomes.add(celula);
  }
  return nomes;
}

/**
 * @returns {number} guards executados
 */
export function guardMcp({ read, warn, ok, skip }) {
  // Um ficheiro so entra se existir E trouxer servidores. Num ficheiro de definicoes gerais
  // (`dedicado: false`) a ausencia da chave e o caso normal, nao um achado.
  const presentes = [];
  let problemas = 0;
  let ilegiveis = 0;

  for (const m of MCP_FILES) {
    const bruto = read(m.f);
    if (bruto === null) continue;
    let cfg;
    try {
      cfg = JSON.parse(bruto);
    } catch (err) {
      // "Nao consegui ler" != "esta bem" (TP2).
      warn(`${m.f}: JSON invalido (${err.message}) — nao consegui validar a politica MCP`);
      problemas++;
      ilegiveis++;
      continue;
    }
    const bloco = cfg?.[m.chave];
    const servidores = bloco && typeof bloco === "object" && !Array.isArray(bloco) ? bloco : null;
    if (servidores === null) {
      if (m.dedicado) {
        warn(`${m.f}: sem objeto \`${m.chave}\` — formato inesperado, nao consegui validar`);
        problemas++;
        ilegiveis++;
      }
      continue; // ficheiro de definicoes gerais sem MCP: nao ha nada a validar
    }
    presentes.push({ ...m, servidores, cfg });
  }

  if (presentes.length === 0 && ilegiveis === 0) {
    skip(
      `Guard 16 (politica MCP) — nenhum servidor configurado no repo ` +
        `(procurei em ${MCP_FILES.map((m) => m.f).join(", ")})`
    );
    return 1;
  }

  // A tabela le-se UMA vez: com quatro ficheiros possiveis, la dentro do ciclo a mesma
  // seccao em falta era reportada quatro vezes.
  const lista = presentes.length > 0 ? aprovados(read(POLICY)) : new Set();
  if (lista === null) {
    warn(`${POLICY}: sem a seccao "Servidores aprovados" — sem ela nao ha aprovacao a comparar`);
    problemas++;
  }

  for (const { f: ficheiro, agente, servidores, cfg } of presentes) {
    // --- segredos literais ---
    // Varre o ficheiro INTEIRO, e nao so o bloco de servidores. O `.vscode/mcp.json` tem uma
    // seccao `inputs` que existe precisamente para valores sensiveis, e o
    // `.gemini/settings.json` traz definicoes de tudo; um token colado la passava sem uma
    // palavra enquanto a linha de sucesso dizia "sem segredos literais, em <ficheiro>" — a
    // afirmar sobre o ficheiro tendo lido uma chave (`TP1`). A validacao de APROVACAO
    // continua restrita ao bloco de servidores, que e onde os nomes vivem.
    for (const [caminho, valor] of valores(cfg)) {
      if (REFERENCIA_AO_AMBIENTE.test(valor)) continue;
      for (const { re, o } of SEGREDOS) {
        if (re.test(valor)) {
          warn(
            `${ficheiro} (${agente}): ${o} literal em \`${caminho}\` — um ficheiro de configuracao MCP versionado ` +
              `e partilhado com quem clona. Passar por variavel de ambiente (\${VAR})`
          );
          problemas++;
          break;
        }
      }
    }

    // --- servidor sem aprovacao escrita ---
    if (lista !== null) {
      for (const nome of Object.keys(servidores)) {
        if (!lista.has(nome)) {
          warn(
            `${ficheiro} (${agente}): servidor \`${nome}\` nao esta em "Servidores aprovados" de ${POLICY} — ` +
              `acrescentar a linha (o que le, o que escreve, porque) antes de o usar`
          );
          problemas++;
        }
      }
    }
  }

  if (problemas === 0) {
    const n = presentes.reduce((t, p) => t + Object.keys(p.servidores).length, 0);
    ok(`politica MCP: ${n} servidor(es) aprovado(s) e sem segredos literais, em ${presentes.map((p) => p.f).join(", ")}`);
  }
  return 1;
}
