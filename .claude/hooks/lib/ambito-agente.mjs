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
 * Tambem nega `--output`/`--ext-diff`: um `git diff --output=f` cabe no prefixo e escreve.
 *
 * O QUE ISTO NAO E: a mesma barreira contra o descuido que o resto dos hooks. Um subagente que o
 * queira contornar escreve um script com outra ferramenta, se a tiver — o `code-reviewer` nao tem.
 */

/** Caracteres que fazem de um comando mais do que um comando. Mesmo dentro de aspas: falha fechada. */
const COMPOSTO = /[;&|<>`\n\r]|\$\(/;
/** Opcoes de leitores que escrevem ou executam (`git diff --output=f`, `--ext-diff`). */
const ESCREVE = /(?:^|\s)--(?:output|ext-diff)(?:[=\s]|$)/;

/** O frontmatter de um ficheiro de agente, ou `undefined`. Um BOM a frente nao o esconde. */
function frontmatter(md) {
  return /^﻿?---\r?\n([\s\S]*?)\r?\n---/.exec(md ?? "")?.[1];
}

/** Um item de YAML sem aspas, sem comentario, sem espacos. */
const limpa = (t) => t.replace(/\s+#.*$/, "").trim().replace(/^["']|["']$/g, "");

/** As regras de um `tools:` como `Read, Bash(git diff:*), Bash(git log *)`.
 *
 *  @param {string|null} md  o ficheiro do agente, com frontmatter
 *  @returns {{livre: true} | {livre: false, regras: {texto: string, prefixo: boolean}[]}}
 *    `livre` quando nao ha nada a impor */
export function ambitoBash(md) {
  const fm = frontmatter(md);
  if (fm === undefined) return { livre: true };
  const linha = /^tools:[\t ]*(.*)$/m.exec(fm);
  if (!linha) return { livre: true };
  // As tres formas de YAML: em linha (`tools: A, B`), em fluxo (`tools: [A, B]`) e em lista
  // (`tools:` e `- A` por baixo, com linhas em branco pelo meio).
  const valor = limpa(linha[1]).replace(/^\[([\s\S]*)\]$/, "$1");
  let itens = valor ? valor.split(",") : [];
  if (!itens.length) {
    for (const l of fm.slice(linha.index + linha[0].length).split(/\r?\n/).slice(1)) {
      if (!l.trim()) continue;
      const m = /^\s*-\s*(.+)$/.exec(l);
      if (!m) break;
      itens.push(m[1]);
    }
  }
  itens = itens.map(limpa).filter(Boolean);
  // `tools:` vazio e o mesmo que nao o ter: o agente nao declarou restricao nenhuma.
  if (!itens.length || itens.includes("Bash")) return { livre: true };
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
  if (COMPOSTO.test(c) || ESCREVE.test(c)) return false;
  return regras.some(({ texto, prefixo }) => texto && (c === texto || (prefixo && /^[\t ]/.test(c.slice(texto.length)) && c.startsWith(texto))));
}

/** O ficheiro do agente cujo `name:` e `tipo`, entre os `.md` dados como `[nome, conteudo]`. */
export function agenteChamado(tipo, ficheiros) {
  for (const [, md] of ficheiros) {
    const nome = /^name:[\t ]*(.+?)[\t ]*$/m.exec(frontmatter(md) ?? "")?.[1];
    if (nome !== undefined && limpa(nome) === tipo) return md;
  }
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
