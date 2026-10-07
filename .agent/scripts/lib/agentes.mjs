/**
 * O frontmatter dos agentes em `.claude/agents/`, lido numa so copia (#238) — {{PROJECT_NAME}}
 *
 * PORQUE EXISTE: o `tools:` de um agente era lido por dois parsers — o do hook
 * `guard-subagent-bash` (`.claude/hooks/lib/ambito-agente.mjs`), que o IMPOE, e o do Guard 11
 * (`guards/settings.mjs`), que o documenta — e ja divergiam (`TP8`): um partia por `,` cego e
 * `Bash(git log --format=%h,%s:*)` desaparecia; o outro respeitava parenteses mas nao tirava
 * comentarios nem saltava linhas em branco numa lista. Medido na auditoria de 2026-10-07.
 *
 * VIVE AQUI, e nao em `.claude/hooks/lib/`, porque o Guard 11 corre em qualquer projeto, com ou sem
 * hooks. O hook importa daqui — a mesma direccao que o `stop-verify` ja usa com o `mapa-suites`.
 *
 * NAO e um entry point e nao avisa: devolve dados. Quem decide o que fazer com eles sao os dois
 * consumidores.
 */

/** O frontmatter de um ficheiro `.md`, ou `undefined`. Um BOM a frente e o CRLF nao o escondem. */
export function frontmatter(md) {
  return /^﻿?---\r?\n([\s\S]*?)\r?\n---/.exec(md ?? "")?.[1]?.replace(/\r\n/g, "\n");
}

/** Um valor de YAML sem comentario, sem aspas a volta, sem espacos. */
const limpa = (t) => t.replace(/\s+#.*$/, "").trim().replace(/^["']|["']$/g, "").trim();

/** O `name:` do frontmatter, ou `null`. */
export function nomeDe(md) {
  const v = /^name:[\t ]*(.+?)[\t ]*$/m.exec(frontmatter(md) ?? "")?.[1];
  return v === undefined ? null : limpa(v);
}

/** Parte uma lista por virgulas que NAO estejam dentro de parenteses: `Bash(git log --format=%h,%s:*)`
 *  e um item so. */
function partePorVirgulas(s) {
  const out = [];
  let prof = 0;
  let cur = "";
  for (const ch of s) {
    if (ch === "(") prof++;
    else if (ch === ")") prof = Math.max(0, prof - 1);
    if (ch === "," && prof === 0) { out.push(cur); cur = ""; } else cur += ch;
  }
  out.push(cur);
  return out;
}

/** As ferramentas declaradas no `tools:` de um agente.
 *
 *  As tres formas de YAML: em linha (`tools: A, B`), em fluxo (`tools: [A, B]`) e em lista
 *  (`tools:` e `- A` por baixo, com linhas em branco e comentarios pelo meio).
 *
 *  @param {string|null} md  o ficheiro do agente
 *  @returns {string[]|null}  os itens (`Read`, `Bash(git diff:*)`); `null` se nao ha `tools:` (o
 *    agente herda todas as ferramentas); `[]` se o `tools:` esta vazio */
export function ferramentasDe(md) {
  const fm = frontmatter(md);
  if (fm === undefined) return null;
  const linha = /^tools:[\t ]*(.*)$/m.exec(fm);
  if (!linha) return null;
  const valor = limpa(linha[1]).replace(/^\[([\s\S]*)\]$/, "$1");
  const itens = valor ? partePorVirgulas(valor) : [];
  if (!valor) {
    for (const l of fm.slice(linha.index + linha[0].length).split("\n").slice(1)) {
      if (!l.trim() || /^\s*#/.test(l)) continue;
      const m = /^\s*-\s*(.+)$/.exec(l);
      if (m) { itens.push(m[1]); continue; }
      // Uma linha INDENTADA que nao e item continua o valor (`tools:` e `  Read, Bash(...)` por
      // baixo): lia-se `[]` e o hook deixava o agente livre (leitura independente do #238).
      if (/^\s/.test(l) && !itens.length) { itens.push(...partePorVirgulas(limpa(l).replace(/^\[([\s\S]*)\]$/, "$1"))); continue; }
      break;
    }
  }
  return itens.map(limpa).filter(Boolean);
}
