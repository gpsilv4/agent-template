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
 *   - JSON invalido: "nao consegui ler" != "nao ha nada" (`AP2`).
 *
 * NO TEMPLATE NU NAO HA `.mcp.json`, logo isto salta com `SKIP` visivel. E por desenho: a
 * regra so tem trabalho a partir do primeiro servidor que o projeto derivado acrescente. Um
 * guard que nao corre tem de o DIZER — nunca desaparecer em silencio.
 *
 * LIMITE, dito por inteiro: verifica a configuracao. Um servidor honesto no ficheiro pode
 * servir conteudo hostil em runtime; contra isso a defesa e a regra de tratar o output como
 * dados, e essa e prosa. Ver `.agent/rules/mcp-policy.md`.
 */

/** Onde os agentes guardam a configuracao de servidores no REPO. A config de utilizador fica
 *  fora de proposito: e do utilizador, nao do projeto, e nao e partilhada com quem clona. */
export const MCP_FILES = [".mcp.json"];

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
  const seccao = texto.split(/^##\s+Servidores aprovados/m)[1];
  if (seccao === undefined) return null;
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
  const presentes = MCP_FILES.filter((f) => read(f) !== null);
  if (presentes.length === 0) {
    skip(`Guard 16 (politica MCP) — sem ${MCP_FILES.join(" nem ")} (nenhum servidor configurado no repo)`);
    return 1;
  }

  let problemas = 0;
  for (const ficheiro of presentes) {
    let cfg;
    try {
      cfg = JSON.parse(read(ficheiro));
    } catch (err) {
      // "Nao consegui ler" != "esta bem" (AP2).
      warn(`${ficheiro}: JSON invalido (${err.message}) — nao consegui validar a politica MCP`);
      problemas++;
      continue;
    }

    const servidores = cfg?.mcpServers && typeof cfg.mcpServers === "object" ? cfg.mcpServers : null;
    if (servidores === null) {
      warn(`${ficheiro}: sem objeto \`mcpServers\` — formato inesperado, nao consegui validar`);
      problemas++;
      continue;
    }

    // --- segredos literais ---
    for (const [caminho, valor] of valores(servidores)) {
      if (REFERENCIA_AO_AMBIENTE.test(valor)) continue;
      for (const { re, o } of SEGREDOS) {
        if (re.test(valor)) {
          warn(
            `${ficheiro}: ${o} literal em \`${caminho}\` — um .mcp.json versionado e partilhado ` +
              `com quem clona. Passar por variavel de ambiente (\${VAR})`
          );
          problemas++;
          break;
        }
      }
    }

    // --- servidor sem aprovacao escrita ---
    const lista = aprovados(read(POLICY));
    if (lista === null) {
      warn(`${POLICY}: sem a seccao "Servidores aprovados" — sem ela nao ha aprovacao a comparar`);
      problemas++;
    } else {
      for (const nome of Object.keys(servidores)) {
        if (!lista.has(nome)) {
          warn(
            `${ficheiro}: servidor \`${nome}\` nao esta em "Servidores aprovados" de ${POLICY} — ` +
              `acrescentar a linha (o que le, o que escreve, porque) antes de o usar`
          );
          problemas++;
        }
      }
    }
  }

  if (problemas === 0) {
    const n = Object.keys(JSON.parse(read(presentes[0]))?.mcpServers ?? {}).length;
    ok(`politica MCP: ${n} servidor(es) aprovado(s) e sem segredos literais`);
  }
  return 1;
}
