/**
 * Guard 13: placeholders esquecidos apos o bootstrap — {{PROJECT_NAME}}
 *
 * PORQUE EXISTE: o `BOOTSTRAP.md` manda correr um `git grep` a mao para confirmar que nao
 * ficou nenhum `{{...}}`. Era a UNICA verificacao que todo o projeto derivado precisa e a
 * unica sem rede — exatamente o que o template diz nao querer ("prosa nao e garantia").
 * Um placeholder de hosting esquecido no `/deploy` instrui o agente com texto literal, em
 * silencio. (Nao se escreve o literal aqui: o bootstrap substitui placeholders tambem em
 * `.mjs`, logo cita-lo faria este ficheiro reescrever-se e marcar-se a si proprio.)
 *
 * Encontrado a USAR: criar um projeto a partir do template e correr o bootstrap revelou-o.
 * Nenhuma das rondas de review o viu, porque no template puro nao ha nada de errado.
 *
 * COMO SABE SE O BOOTSTRAP JA CORREU: pela existencia de `.agent/rules/business-logic.md`,
 * que a Fase 2.2 do bootstrap GERA e o template nu nao tem. E um sinal POSITIVO de bootstrap
 * concluido — ao contrario de "o CLAUDE.md ja nao tem `{{PROJECT_NAME}}`", que a primeira
 * versao usava e que qualquer fixture de teste com um `CLAUDE.md` minimo satisfazia por
 * acidente, fazendo o guard disparar em meia suite.
 */

// `.agent/BOOTSTRAP.md` e `README.md` DOCUMENTAM os placeholders — citam-nos por design.
const DOCUMENTAM = new Set([".agent/BOOTSTRAP.md", "README.md"]);

// Falsos positivos: expressoes do GitHub Actions, `${{ ... }}`. O caso que importa e
// `${{VAR}}` — maiusculas, sem espacos e sem ponto — porque e o unico que o padrao de
// placeholder abaixo tambem casaria. Formas como `${{ secrets.TOKEN }}` nunca casariam
// (tem ponto e espacos), logo nao dependem desta constante.
// A alternativa `{{args}}` dos command templates do Gemini foi removida por ser morta:
// `PLACEHOLDER` so casa `[A-Z_]+` e `args` e minusculo.
const FALSOS = /\$\{\{[^}]*\}\}/g;

const PLACEHOLDER = /\{\{([A-Z_]+)\}\}/g;

/**
 * @returns {number} guards executados
 */
export function guardPlaceholders({ read, warn, ok, skip, listDir }) {
  if (read(".agent/rules/business-logic.md") === null) {
    skip("Guard 13 (placeholders) — bootstrap ainda nao correu (sem .agent/rules/business-logic.md)");
    return 0;
  }

  const alvos = [
    "CLAUDE.md",
    "GEMINI.md",
    "AGENTS.md",
    "CONTRIBUTING.md",
    "SECURITY.md",
    "CODE_OF_CONDUCT.md",
    "LICENSE",
    ".github/CODEOWNERS",
    ".github/pull_request_template.md",
    // Estes dois entram nos alvos DE PROPOSITO: sem eles na lista, o filtro `DOCUMENTAM`
    // nunca corria (0 execucoes em 146 testes) e o teste que dizia cobri-lo passava porque
    // os ficheiros nunca eram lidos — AP1. Agora o filtro e que os exclui, e isso e testavel.
    ".agent/BOOTSTRAP.md",
    "README.md",
    // Pontos de entrada que o Copilot e o Cursor carregam. Nao estavam aqui quando foram
    // criados, logo um placeholder esquecido neles passava — e sao os primeiros ficheiros
    // que essas ferramentas leem.
    ".github/copilot-instructions.md",
    ...(listDir(".cursor/rules", ".mdc") || []).map((f) => `.cursor/rules/${f}.mdc`),
    ".github/dependabot.yml",
    ".github/workflows/ci.yml",
    ".github/workflows/e2e.yml",
    "src/docs/agent-guide.md",
    "src/docs/CHANGELOG.md",
    ...(listDir(".agent/rules", ".md") || []).map((f) => `.agent/rules/${f}.md`),
    ...(listDir(".agent/workflows", ".md") || []).map((f) => `.agent/workflows/${f}.md`),
    ...(listDir(".agent/context", ".md") || []).map((f) => `.agent/context/${f}.md`),
    ...(listDir(".agent/scripts", ".mjs") || []).map((f) => `.agent/scripts/${f}.mjs`),
    ...(listDir(".agent/scripts/guards", ".mjs") || []).map((f) => `.agent/scripts/guards/${f}.mjs`),
    ...(listDir(".claude/commands", ".md") || []).map((f) => `.claude/commands/${f}.md`),
    ...(listDir(".gemini/commands", ".toml") || []).map((f) => `.gemini/commands/${f}.toml`),
    // Os hooks do git. Nao tem extensao — o git exige o nome exacto do evento — e por isso
    // escaparam a Fase 2.1 do bootstrap **e** a esta lista quando foram criados: um
    // `{{PROJECT_NAME}}` ficava la para sempre num projeto derivado. Apanhado pela varredura
    // do `simulate-derived.mjs`, no dia em que ela passou a olhar para alem das extensoes que
    // ela propria substitui.
    ...(listDir(".githooks", "") || []).map((f) => `.githooks/${f}`),
  ];

  let ficheirosComSobras = 0;
  let lidos = 0; // >= 1 garantido: ver a nota no fim
  for (const f of alvos) {
    if (DOCUMENTAM.has(f)) continue;
    const c = read(f);
    if (c === null) continue;
    lidos++;
    const nomes = new Set();
    for (const m of c.replace(FALSOS, "").matchAll(PLACEHOLDER)) nomes.add(m[1]);
    if (nomes.size > 0) {
      warn(`${f}: placeholder(s) nao substituido(s) apos o bootstrap — ${[...nomes].map((n) => `{{${n}}}`).join(", ")}`);
      ficheirosComSobras++;
    }
  }

  // Nao ha ramo para "nenhum ficheiro lido": o discriminador exige
  // `.agent/rules/business-logic.md`, e esse ficheiro esta na propria lista de alvos, logo
  // `lidos` e sempre >= 1 quando se chega aqui. A varredura de mutacao apanhou-o como ramo
  // morto — um `warn` inalcancavel da a aparencia de uma rede que nao existe.
  if (ficheirosComSobras === 0) {
    ok(`sem placeholders esquecidos (${lidos} ficheiros verificados)`);
  }
  return 1;
}
