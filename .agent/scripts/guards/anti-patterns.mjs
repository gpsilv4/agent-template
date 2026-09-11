/**
 * Guard 15: as referencias a anti-padroes RESOLVEM — {{PROJECT_NAME}}
 *
 * PORQUE EXISTE: uma citacao de anti-padrao errada e pior do que nenhuma. Manda o leitor a
 * uma entrada REAL, que confirma uma leitura que nao e a do autor, e nada no ecra a denuncia.
 * Copiar prosa entre repos volta a acontecer — um `/upgrade` traz dezenas de citacoes de uma
 * vez, e os numeros de um projeto derivado nao sao os do template. Aconteceu de facto: num
 * consumidor deste template, mais de vinte citacoes trazidas pelos scripts passaram a apontar
 * para entradas existentes com outro significado.
 *
 * No template este guard esta sempre verde (todas resolvem). O valor dele e nos derivados —
 * que e para quem o template existe.
 *
 * PORQUE ESTA NUM MODULO PROPRIO: o `check-doc-versions.mjs` passou o flag das 500 linhas, e
 * este guard e o maior bloco de la. A extracao obriga a uma entrada em `PARES` no
 * `mutation-sweep.mjs` — sem ela a varredura cobriria o ficheiro de entrada e reportaria 100%
 * a mentir, porque os avisos passaram a viver aqui.
 *
 * Nota para quem editar estes comentarios: eles **entram na varredura** deste proprio guard.
 * Nao citar numeros de anti-padrao concretos aqui, ou o guard reprova-se a si mesmo.
 */

export const AP_FILE = ".agent/rules/anti-patterns.md";

/** Comentarios HTML fora. Os `\n` sao PRESERVADOS (o corpo do comentario vira espacos, nao
 *  desaparece): os avisos deste guard citam o numero de linha, e um `replace(…, "")`
 *  encurtava o ficheiro e fazia a citacao apontar para a linha errada de tudo o que vem
 *  depois de um comentario. Um numero de linha errado num aviso custa mais do que aviso
 *  nenhum, porque manda o leitor ao sitio errado com confianca.
 *
 *  `(?:-->|$)`: um `<!--` sem fecho comenta ate ao fim do ficheiro, e e assim que o markdown
 *  o le. Sem o `$`, apagar a linha `-->` (o que acontece a quem remove o exemplo ilustrativo
 *  a meio) trazia de volta avisos sobre texto comentado. */
const semHtml = (t) => t.replace(/<!--[\s\S]*?(?:-->|$)/g, (m) => m.replace(/[^\n]/g, " "));

/** UM padrao de cabecalho de definicao, usado pelos dois lados da contagem. Esteve escrito
 *  duas vezes, e alterar so um (um derivado que passe a usar `####`, por exemplo) devolvia em
 *  silencio o codigo morto que este guard fechou: os cabecalhos voltavam a contar como
 *  citacoes de si mesmos, e nenhum teste via.
 *
 *  `#{2,3}`: as entradas deste repo usam `##`, e um derivado pode usar `###`. */
const CABECALHO_AP = /^#{2,3}\s+AP(\d+)\b/;

/** Onde vive CODIGO em vez de documentacao. A distincao nao e cosmetica: decide o ramo do
 *  "ninguem cita" la baixo. */
const ehCodigo = (rel) => rel.startsWith(".agent/scripts/") || rel.startsWith(".claude/");

/** Todos os sitios onde uma citacao morta engana alguem. `.claude/` entra: os hooks, as
 *  suites deles e os subagentes tambem citam anti-padroes, e deixa-los de fora era medir a
 *  maioria das citacoes em vez de todas — a lacuna silenciosa que este guard existe para nao
 *  ter. O `README.md` entra por medicao: tinha uma citacao fora do alcance da primeira versao
 *  desta lista, e e o ficheiro mais lido do repo. */
function alvosDe(listDir) {
  return [
    ...(listDir(".agent/rules", ".md") ?? []).map((n) => `.agent/rules/${n}.md`),
    ...(listDir(".agent/workflows", ".md") ?? []).map((n) => `.agent/workflows/${n}.md`),
    ...(listDir(".agent/scripts", ".mjs") ?? []).map((n) => `.agent/scripts/${n}.mjs`),
    ...(listDir(".agent/scripts/guards", ".mjs") ?? []).map((n) => `.agent/scripts/guards/${n}.mjs`),
    ...(listDir(".agent/context", ".md") ?? []).map((n) => `.agent/context/${n}.md`),
    ...(listDir("src/docs", ".md") ?? []).map((n) => `src/docs/${n}.md`),
    ...(listDir(".claude/agents", ".md") ?? []).map((n) => `.claude/agents/${n}.md`),
    ...(listDir(".claude/hooks", ".mjs") ?? []).map((n) => `.claude/hooks/${n}.mjs`),
    ...(listDir(".claude/hooks/tests", ".mjs") ?? []).map((n) => `.claude/hooks/tests/${n}.mjs`),
    "CLAUDE.md",
    "GEMINI.md",
    "AGENTS.md",
    ".agent/BOOTSTRAP.md",
    "README.md",
    "CONTRIBUTING.md",
  ];
}

/**
 * @returns {number} guards executados
 */
export function guardAntiPatternRefs({ read, warn, ok, skip, note, listDir }) {
  const ap = read(AP_FILE);
  if (ap === null) {
    skip(`Guard 15 (referencias a anti-padroes) — sem ${AP_FILE}`);
    return 0;
  }

  // O exemplo ilustrativo do template esta dentro de `<!-- -->` e nao e uma definicao.
  const existentes = new Set(
    [...semHtml(ap).matchAll(new RegExp(CABECALHO_AP.source, "gm"))].map((m) => m[1])
  );

  let citacoes = 0;
  // Citacoes em DOCUMENTACAO, separadas das que vivem em codigo. Ver o ramo do "ninguem cita".
  let citacoesDoc = 0;
  let mortas = 0;

  for (const alvo of alvosDe(listDir)) {
    const bruto = read(alvo);
    if (bruto === null) continue;
    // As definicoes ja ignoravam os comentarios HTML e as citacoes NAO. A assimetria batia em
    // quem acabou de bootstrapar e ainda nao apagou o exemplo ilustrativo: `existentes` era 0
    // (correcto, esta comentado) e a mesma linha contava como citacao morta — aviso sobre uma
    // linha dentro de `<!-- -->`. Um aviso sobre codigo comentado ensina a ignorar avisos, e e
    // esse o custo real.
    //
    // **So em markdown.** Em `.mjs` o `<!--` nao e comentario: e texto dentro de literais —
    // este proprio ficheiro tem um desses escrito — e aplicar o strip la abria um vao onde o
    // guard ficava cego. Medido: duas citacoes de uma suite desapareciam por viverem entre os
    // literais de abertura e fecho da fixture, e uma citacao morta plantada nesse vao passava
    // com exit 0.
    const c = alvo.endsWith(".md") ? semHtml(bruto) : bruto;
    c.split("\n").forEach((linha, i) => {
      // Um cabecalho de DEFINICAO nao e uma citacao de si mesmo. So no `anti-patterns.md`: um
      // `## APn` em QUALQUER outro alvo e uma citacao como as outras (um cabecalho copiado
      // por `/upgrade` e precisamente o caso que este guard existe para apanhar), logo
      // excluir cabecalhos em todo o lado abriria um ponto cego novo.
      //
      // Sem esta linha o ramo do "ninguem cita" era inalcancavel em QUALQUER projeto, e nao
      // so neste: cada definicao contribuia com a sua propria linha para a contagem, logo
      // `citacoes >= existentes.size` sempre.
      if (alvo === AP_FILE && CABECALHO_AP.test(linha)) return;
      for (const m of linha.matchAll(/\bAP(\d+)\b/g)) {
        citacoes++;
        if (!ehCodigo(alvo)) citacoesDoc++;
        if (!existentes.has(m[1])) {
          warn(`${alvo}:${i + 1}: cita AP${m[1]}, que nao existe em anti-patterns.md`);
          mortas++;
        }
      }
    });
  }

  // Projeto sem anti-padroes ainda (acabado de arrancar) e legitimo: SKIP visivel.
  if (existentes.size === 0 && citacoes === 0) {
    skip("Guard 15 — sem anti-padroes definidos e sem citacoes");
    return 0;
  }

  // O ramo do "ninguem cita" conta so a DOCUMENTACAO, e a razao e o que o tornava inutil
  // quando contava tudo: a maioria das citacoes deste repo vive nos comentarios dos proprios
  // verificadores, que sao alvos de si mesmos. Qualquer projeto que mantenha `.agent/scripts/`
  // tinha citacoes por construcao, logo o ramo nunca disparava la e o unico caminho ate ele
  // era um teste a reescrever o codigo-fonte do guard. Com a contagem restrita aos documentos,
  // ele passa a dizer o que promete: **o catalogo existe e a documentacao do projeto ignora-o**,
  // logo nao previne nada. As citacoes em codigo continuam a contar para tudo o resto — e o
  // `mortas` varre-as todas.
  //
  // `note` e nao `warn`: um projeto que acabou de escrever o seu primeiro anti-padrao tem zero
  // citacoes **legitimamente**, e um gate ali seria falso positivo no dia 1. Informa sem
  // bloquear.
  if (citacoesDoc === 0) {
    note("nenhum documento varrido cita um anti-padrao — verificar se as referencias se perderam");
    return 1;
  }

  if (mortas === 0) {
    ok(`${citacoes} referencia(s) a anti-padroes resolvem (${existentes.size} definidos, ${citacoesDoc} em docs)`);
  }
  return 1;
}
