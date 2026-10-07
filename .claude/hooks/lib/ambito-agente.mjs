/**
 * O ambito do Bash de um subagente, lido do seu `tools:` (S-01 do #195) — {{PROJECT_NAME}}
 *
 * PORQUE EXISTE: o `code-reviewer` declara `tools: ..., Bash(git diff:*)`, e mesmo assim correu
 * `git -C <dir> diff --stat`, o `test-guards.mjs` e o `test-simulate-upgrade.mjs` — medido a
 * 2026-10-07. O padrao no frontmatter nao restringia nada: so o `Bash` contava. Um leitor
 * independente que pode escrever deixa de ser leitor.
 *
 * O QUE O TORNA POSSIVEL: o payload do `PreToolUse` traz `agent_type` (e `agent_id`) quando quem
 * chama e um subagente, e nao os traz quando e o agente principal — medido no mesmo dia, com um
 * hook que registava o payload. Sem esse campo nao havia como distinguir, e o S-01 ficava em espera.
 *
 * A REGRA SAI DO FRONTMATTER, nao de uma lista escrita aqui: um agente com `Bash` nu corre o que
 * quiser (o `debugger`, de proposito); um com `Bash(<prefixo>:*)` ou `Bash(<prefixo> *)` so corre
 * comandos que comecem por um desses prefixos, e um com `Bash(<comando>)` so esse comando exacto;
 * um que declara `tools:` sem Bash nenhum nao corre Bash. Sem `tools:` (ou com ele vazio), o
 * agente herda tudo, e nao ha nada a impor.
 *
 * FALHA FECHADA, so para os agentes restritos: um comando composto (`;`, `&&`, `|`, `$(`,
 * redireccao, varias linhas) nega, mesmo que o primeiro segmento caiba. Analisar a composicao
 * era reabrir o parser do guard inteiro; quem tem um ambito estreito corre um comando de cada vez.
 * Tambem nega `--output`/`--ext-diff`: um `git diff --output=f` cabe no prefixo e escreve. E as
 * opcoes do UGREP, que e o `grep` do Claude Code (medido: `grep --version` da `ugrep 7.8.4`):
 * `--filter=` corre um comando por ficheiro, `--save-config` escreve um. Palavra a palavra, como a
 * shell as entrega (`palavras`): `"--output=f"`, `--out"put"=f` e `\-\-output=f` chegam ao git
 * iguais (#237). Um `-e "--output"` (o padrao de um grep) nega: falha fechada, aceite.
 *
 * O QUE ISTO NAO E: a mesma barreira contra o descuido que o resto dos hooks. Um subagente que o
 * queira contornar escreve um script com outra ferramenta, se a tiver — o `code-reviewer` nao tem.
 */

import { ferramentasDe, nomeDe } from "../../../.agent/scripts/lib/agentes.mjs";

/** O comando e mais do que um comando? Lido COMO A SHELL (#238): fora de aspas, `;`, `&`, `|`, `<`,
 *  `>`, uma mudanca de linha, a crase e o `$(` compoem; entre aspas SIMPLES nada compoe; entre aspas
 *  DUPLAS so a crase e o `$(`, que a shell executa la dentro. Antes negava-se o `|` mesmo entre aspas,
 *  e os greps de detecao dos anti-padroes (`git grep -nE "a|b"`) — que o `/review` manda o leitor
 *  correr — eram todos negados. Uma aspa por fechar compoe: falha fechada.
 *
 *  Tambem compoem, fora de aspas (leitura independente do #238, medidos a passar pelo hook): o
 *  `$'...'`/`$"..."`, onde `\'` e um escape e desalinhava as aspas (`grep $'\'' f ; cmd #'`); e
 *  o `(`/`)`, porque a shell do Bash tool e o zsh, e `=(cmd)` e os qualificadores de glob
 *  `*(e:...:)` executam. Nenhum grep de detecao os usa fora de aspas. */
//  NAO se modelam as expansoes da shell — nega-se a porta (segunda leitura do #238, todas medidas a
//  escrever um ficheiro pelo hook): fora de aspas simples, QUALQUER `$` (o `${(e)...}` do zsh corre
//  um comando dentro de aspas duplas; `$X--output=f` com `X` vazio e `--output=f`), o `{`/`}` fora de
//  aspas (`{--output=f,HEAD}` desdobra-se), e o `\` antes de uma mudanca de linha (a shell junta as
//  linhas: `--out\<nl>put=f`). Nenhum grep de detecao do catalogo os usa fora de aspas simples.
export function composto(c) {
  let q = null;
  for (let i = 0; i < c.length; i++) {
    const ch = c[i];
    if (q === "'") { if (ch === "'") q = null; continue; }
    if (ch === "\\") { if (/[\n\r]/.test(c[i + 1] ?? "")) return true; i++; continue; }
    if (ch === "`" || ch === "$") return true;
    if (q === '"') { if (ch === '"') q = null; continue; }
    if (ch === "'" || ch === '"') q = ch;
    else if (/[;&|<>(){}\n\r]/.test(ch)) return true;
  }
  return q !== null;
}
/** Uma PALAVRA que e uma opcao de leitor que escreve ou executa: o `git` (`--output=f`, `--ext-diff`)
 *  e o ugrep (`--filter=cmd`, `--filter-magic-label`, `--save-config`). */
const ESCREVE = /^--(?:output|ext-diff|filter|filter-magic-label|save-config)(?:=|$)/;

/** O comando partido em palavras COMO A SHELL o entrega: aspas simples literais, aspas duplas com
 *  `\` a escapar, `\` fora de aspas a escapar o caractere seguinte, e aspas coladas que se juntam a
 *  palavra. Duas versoes com regex falharam na leitura independente do #237: tirar todas as aspas
 *  negava `grep -rn "git diff --output" dir` (um padrao), e esvaziar as strings citadas deixava uma
 *  aspa escapada (`can\'t`) desemparelhar as outras e esconder um `--output` SEM aspas. Uma aspa
 *  por fechar fica na palavra — e o comando nao corre na shell. */
export function palavras(c) {
  const out = [];
  let cur = null;
  let q = null;
  for (let i = 0; i < c.length; i++) {
    const ch = c[i];
    if (q === "'") { if (ch === "'") q = null; else cur += ch; continue; }
    if (q === '"') {
      if (ch === '"') q = null;
      else if (ch === "\\" && /["\\$`]/.test(c[i + 1] ?? "")) cur += c[++i];
      else cur += ch;
      continue;
    }
    if (/\s/.test(ch)) { if (cur !== null) out.push(cur); cur = null; continue; }
    cur ??= "";
    if (ch === "'" || ch === '"') q = ch;
    else if (ch === "\\") cur += c[++i] ?? "";
    else cur += ch;
  }
  if (cur !== null) out.push(cur);
  return out;
}

/** As regras de um `tools:` como `Read, Bash(git diff:*), Bash(git log *)`. A leitura do `tools:`
 *  vive numa so copia, `ferramentasDe` (`.agent/scripts/lib/agentes.mjs`), partilhada com o Guard 11
 *  (#238): os dois parsers que havia ja divergiam.
 *
 *  @param {string|null} md  o ficheiro do agente, com frontmatter
 *  @returns {{livre: true} | {livre: false, regras: {texto: string, prefixo: boolean}[]}}
 *    `livre` quando nao ha nada a impor */
export function ambitoBash(md) {
  const itens = ferramentasDe(md);
  // Sem `tools:`, ou com ele vazio: o agente nao declarou restricao nenhuma.
  if (itens === null || !itens.length || itens.includes("Bash")) return { livre: true };
  const regras = [];
  for (const t of itens) {
    const m = /^Bash\((.*)\)$/.exec(t);
    if (!m) continue;
    const p = m[1].trim();
    const prefixo = /(?::\*| \*)$/.test(p);
    regras.push({ texto: prefixo ? p.replace(/(?::\*| \*)$/, "").trim() : p, prefixo });
  }
  return { livre: false, regras };
}

/** O comando cabe no ambito? So um comando simples que comece por um dos prefixos, com fronteira
 *  de palavra (`git diff` cabe em `git diff --stat`, nao em `git diffx` nem em `git -C x diff`),
 *  ou que seja exactamente um dos comandos exactos. */
export function cabeNoAmbito(cmd, regras) {
  const c = cmd.trim();
  const ps = palavras(c);
  if (composto(c) || ps.some((p) => ESCREVE.test(p))) return false;
  // `git grep -O<cmd>` (`--open-files-in-pager`) corre o comando com os ficheiros encontrados —
  // medido pela leitura independente do #238, que o tinha acabado de declarar (`TP13`). Tambem
  // agrupado (`-nO`) e abreviado (`--op`): o parse-options do git aceita prefixos unicos.
  if (ps[0] === "git" && ps[1] === "grep" && ps.slice(2).some((p) => /^-[^-]*O/.test(p) || /^--op/.test(p))) return false;
  return regras.some(({ texto, prefixo }) => texto && (c === texto || (prefixo && /^[\t ]/.test(c.slice(texto.length)) && c.startsWith(texto))));
}

/** O ficheiro do agente cujo `name:` e `tipo`, entre os `.md` dados como `[nome, conteudo]`. */
export function agenteChamado(tipo, ficheiros) {
  for (const [, md] of ficheiros) if (nomeDe(md) === tipo) return md;
  return null;
}

/** A razao da negacao, ou `null` se o comando pode correr. */
export function razaoAmbito(tipo, cmd, md) {
  const a = ambitoBash(md);
  if (a.livre) return null;
  if (cabeNoAmbito(cmd, a.regras)) return null;
  const quais = a.regras.length
    ? a.regras.map((r) => `\`${r.texto}${r.prefixo ? " ..." : ""}\``).join(", ")
    : "nenhum (o agente nao declara Bash)";
  return (
    `O subagente \`${tipo}\` so pode correr os comandos que o seu \`tools:\` declara: ${quais} — ` +
    "um de cada vez, sem `;`, `&&`, `|`, `$(`, redireccoes nem `--output`. Um leitor independente le, nao executa. " +
    "Alargar o ambito e editar o `tools:` em `.claude/agents/` (S-01 do #195)."
  );
}
