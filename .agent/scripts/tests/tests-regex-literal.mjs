/**
 * O escape de um texto LITERAL numa regex (`lib/regex-literal.mjs`, #400): estava escrito cinco vezes, letra a letra.
 * Ficam a fonte e duas copias de proposito (a folha da fronteira, e a lib dos nomes que dois hooks carregam por
 * `import()`); este modulo prende-as ao texto da fonte, e reprova uma copia NOVA noutro sitio.
 *
 * NAO e um entry point: o `test-guards.mjs` descobre este modulo e chama `registar()`.
 *
 * O padrao procura-se pelo TEXTO da fonte, lido do ficheiro, e nunca escrito aqui (`TP8`): escrito, a propria guarda
 * apanhava este ficheiro. Limite: so se veem copias letra a letra (as cinco medidas eram); uma forma equivalente escrita
 * de outra maneira escapa. Os escapes de GLOB (`lib/permissoes.mjs`, `lib/saltos-variavel.mjs`,
 * `.claude/hooks/lib/caminhos.mjs`) sao outro escape, e nao casam.
 */
import { pathToFileURL } from "url";
import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { registarResultado, ROOT } from "./harness/test-harness.mjs";
import { leOuNull } from "../lib/ficheiros.mjs";
import { literalEmRegex } from "../lib/regex-literal.mjs";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.error(
    "tests-regex-literal.mjs nao e um entry point: nao corre testes por si.\n" +
      "Correr `node .agent/scripts/tests/test-guards.mjs`."
  );
  process.exit(1);
}

/** Entry point a que este modulo pertence. */
export const entryPoint = "test-guards.mjs";

const FONTE = ".agent/scripts/lib/regex-literal.mjs";
/** As copias de proposito (o porque, no cabecalho da fonte). */
const COPIAS = [".claude/hooks/lib/fronteira-dados.mjs", ".agent/scripts/lib/nomes-proibidos.mjs"];
const PASTAS = [".agent/scripts", ".claude/hooks", ".githooks"];

/** O escape, como a fonte o escreve: `.replace(/<classe>/g, "<troca>")`. `null` se a fonte nao tiver exatamente um. */
function escapeDaFonte(texto) {
  const ms = [...texto.matchAll(/\.replace\((\/\[[^\n]*?\]\/g), ("[^"\n]*")\)/g)];
  return ms.length === 1 ? `.replace(${ms[0][1]}, ${ms[0][2]})` : null;
}
const quantas = (texto, agulha) => texto.split(agulha).length - 1;

/** Os ficheiros (caminho relativo -> texto) que escrevem o `escape`, fora da fonte e das copias conhecidas. */
export function copiasNovas(ficheiros, escape) {
  return Object.entries(ficheiros).filter(([rel, t]) => rel !== FONTE && !COPIAS.includes(rel) && t.includes(escape)).map(([rel]) => rel);
}

function ficheirosDe(pastas) {
  const out = {};
  const anda = (rel) => {
    for (const n of readdirSync(join(ROOT, rel))) {
      const r = `${rel}/${n}`;
      if (statSync(join(ROOT, r)).isDirectory()) anda(r);
      else if (/\.mjs$/.test(n) || rel === ".githooks") out[r] = readFileSync(join(ROOT, r), "utf8");
    }
  };
  for (const p of pastas) anda(p);
  return out;
}

export function registar() {
  const fonte = leOuNull(join(ROOT, FONTE)) ?? "";
  const escape = escapeDaFonte(fonte);
  // Sem o escape lido, as afirmacoes abaixo comparavam `null` com `null` e passavam (`TP2`).
  registarResultado("regex-literal: a fonte tem exatamente um escape, e le-se (#400)", escape === null ? [`nao li o escape de ${FONTE}`] : []);
  if (escape === null) return;
  registarResultado("regex-literal: o escape trata os especiais como texto (#400)", [
    ...(new RegExp(`^${literalEmRegex(".a+b")}$`).test(".aab") ? ["o `+` foi lido como quantificador"] : []),
    ...["x(1)[2]{3}\\$|^*?", "a.b"].filter((s) => !new RegExp(`^${literalEmRegex(s)}$`).test(s)).map((s) => `"${s}" nao se casou a si proprio`),
  ]);
  registarResultado("regex-literal: as duas copias de proposito tem o texto da fonte, uma vez cada (#400)", COPIAS.map((rel) => {
    const n = quantas(leOuNull(join(ROOT, rel)) ?? "", escape);
    return n === 1 ? null : `${rel}: o escape da fonte aparece ${n} vez(es) (esperava 1)`;
  }).filter(Boolean));
  const novas = copiasNovas(ficheirosDe(PASTAS), escape);
  registarResultado("regex-literal: nenhuma copia nova do escape fora da fonte e das duas conhecidas (#400)",
    novas.map((rel) => `${rel} copia o escape: importar \`literalEmRegex\` de ${FONTE}`));
  // O controlo: uma copia nova, montada a partir do texto da fonte, e vista; a fonte e as conhecidas nao.
  registarResultado("regex-literal: a guarda ve uma copia nova (controlo) e nao conta a fonte nem as conhecidas (#400)", [
    ...(copiasNovas({ "x/nova.mjs": `const e = (s) => s${escape};` }, escape).length === 1 ? [] : ["a copia nova nao foi vista"]),
    ...(copiasNovas({ [FONTE]: escape, [COPIAS[0]]: escape }, escape).length === 0 ? [] : ["a fonte ou uma copia conhecida contou"]),
  ]);
}
