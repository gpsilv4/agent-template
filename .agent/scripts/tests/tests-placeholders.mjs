/**
 * Testes do Guard 13 (placeholders apos o bootstrap) — {{PROJECT_NAME}}
 *
 * Espelha `guards/placeholders.mjs`. NAO e um entry point: o `test-guards.mjs` importa e
 * chama `registar()`.
 *
 * A fixture tem de simular um projeto JA bootstrapado, senao o guard salta — e um teste que
 * passa por o guard nao correr nao afirma nada.
 */
import { rmSync } from "fs";
import { pathToFileURL } from "url";
import { test, readF, writeF, file } from "./harness/test-harness.mjs";
// A receita do "bootstrap concluido" — os placeholders substituidos E o marcador escrito, que
// andam sempre juntos. Estava aqui e no `tests-context-virgem.mjs`, a concordar a mao: a lista
// de extensoes ja divergiu uma vez (faltava o `.mdc` nas DUAS, e a regra do Cursor ficava com o
// placeholder para sempre). Agora e uma so (`TP8`).
import { bootstrapado } from "./harness/projeto-derivado.mjs";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.error(
    "tests-placeholders.mjs nao e um entry point: nao corre testes por si.\n" +
      "Correr `node .agent/scripts/tests/test-guards.mjs`."
  );
  process.exit(1);
}

// Os literais sao construidos, nao escritos: a Fase 2.1 do bootstrap substitui placeholders
// tambem em `.mjs`, logo um placeholder escrito literalmente aqui seria reescrito num projeto
// derivado e estas asserções passariam a esperar "VALOR". Achado a simular o bootstrap.
const ph = (nome) => "{" + "{" + nome + "}" + "}";


/** Entry point a que este modulo pertence. Obrigatorio: dois entry points partilham
 *  a pasta `.agent/scripts/`, e a descoberta em disco precisa de saber de quem e
 *  cada modulo. Ver `lib/registo.mjs`. */
export const entryPoint = "test-guards.mjs";

export function registar() {
  // --- Guard 13: placeholders esquecidos -------------------------------------
  // O teste controla a sua PROPRIA pre-condicao: garante que o marcador de bootstrap NAO
  // existe. A versao anterior passava `null` como mutacao e assumia o estado do repo —
  // verdade no template nu, **falsa em qualquer projeto derivado**. Resultado: a suite
  // passava aqui e falhava no primeiro dia de cada consumidor. Um teste que depende do
  // ambiente em vez de o montar nao esta a afirmar o que diz.
  test("G13: sem bootstrap da SKIP visivel (placeholders sao esperados)", (dir) => {
    // `ehDerivado()` tem DOIS sinais: o marcador presente, ou o `BOOTSTRAP.md` ausente. Para
    // montar o estado "ainda nao houve bootstrap" e preciso negar os dois — apagar so o
    // marcador deixava a fixture a depender de o repo ainda ter o `BOOTSTRAP.md`, que e
    // falso em todo projeto derivado. Montar metade da pre-condicao e o TP3.
    try {
      rmSync(file(dir, ".agent/.template-version"));
    } catch {
      /* no template nu ainda nao existe — e o estado que este teste quer */
    }
  }, {
    // `synthetic: true`: a fixture sintetica monta um `BOOTSTRAP.md` proprio, com as
    // contagens DERIVADAS do que acabou de escrever. E o que fecha o segundo sinal do
    // `ehDerivado()` sem escrever numeros a mao — escreve-los aqui fazia disparar os
    // guards 12d/12e, que existem precisamente para apanhar numeros escritos a mao.
    synthetic: true,
    code: 0,
    includes: ["SKIP  Guard 13 (placeholders) — bootstrap ainda nao correu"],
  });

  test("G13: projeto bootstrapado com placeholder esquecido avisa", (dir) => {
    bootstrapado(dir);
    // Deixar um de proposito num ficheiro que nao documenta placeholders.
    writeF(dir, ".agent/rules/core-rules.md",
      readF(dir, ".agent/rules/core-rules.md") + `\n\nHosting: ${ph("HOSTING")}\n`);
  }, { code: 1,
       includes: [`.agent/rules/core-rules.md: placeholder(s) nao substituido(s) apos o bootstrap — ${ph("HOSTING")}`],
       excludes: ["SKIP  Guard 13"] });

  // Sete ficheiros com `{{ PROJECT_NAME }}` estavam FORA da lista de alvos: os hooks, os
  // modulos de `lib/` (um nivel abaixo, que o `listDir` de `.agent/scripts/` nao alcanca) e
  // os subagentes. O sweep do bootstrap substitui-os por EXTENSAO, logo na pratica saiam bem
  // — o que faltava era a rede que apanha um sweep FALHADO. Um guard que so cobre o caminho
  // feliz nao e uma rede.
  for (const alvo of [
    ".claude/hooks/stop-verify.mjs",
    ".claude/hooks/lib/fronteira.mjs",
    ".claude/hooks/tests/tests-bypasses.mjs",
    ".claude/agents/code-reviewer.md",
    ".agent/scripts/lib/registo.mjs",
  ]) {
    test(`G13: placeholder esquecido em ${alvo} avisa`, (dir) => {
      bootstrapado(dir);
      writeF(dir, alvo, readF(dir, alvo) + `\n// ${ph("HOSTING")}\n`);
    }, { code: 1, includes: [`${alvo}: placeholder(s) nao substituido(s)`], excludes: ["SKIP  Guard 13"] });
  }

  test("G13: varios placeholders no mesmo ficheiro sao nomeados todos", (dir) => {
    bootstrapado(dir);
    writeF(dir, ".agent/rules/core-rules.md",
      readF(dir, ".agent/rules/core-rules.md") + `\n\n${ph("YEAR")} ${ph("COPYRIGHT_HOLDER")}\n`);
  }, { code: 1, includes: [`${ph("YEAR")}, ${ph("COPYRIGHT_HOLDER")}`] });

  test("G13: `${{ }}` do GitHub Actions nao e falso positivo", (dir) => {
    bootstrapado(dir);
    writeF(dir, ".agent/rules/core-rules.md",
      readF(dir, ".agent/rules/core-rules.md") + "\n\nCI: ${{ secrets.TOKEN }} e ${{ github.ref }}\n");
  }, { code: 0, includes: ["sem placeholders esquecidos"], excludes: ["  WARN  "] });

  test("G13: o placeholder de argumentos do Gemini nao e falso positivo", (dir) => {
    bootstrapado(dir);
    writeF(dir, ".agent/rules/core-rules.md",
      readF(dir, ".agent/rules/core-rules.md") + `\n\nprompt = "corre com ${ph("args")}"\n`);
  }, { code: 0, includes: ["sem placeholders esquecidos"], excludes: ["  WARN  "] });

  test("G13: BOOTSTRAP.md e README.md documentam placeholders e nao contam", (dir) => {
    bootstrapado(dir);
    // Estes dois citam `{{...}}` por design; se contassem, todo projeto derivado avisaria.
    // ACRESCENTAR, nao substituir: reescrever o `BOOTSTRAP.md` apagava as citacoes que os
    // guards 12d/12e verificam, e o teste falhava por um aviso sem relacao com o Guard 13.
    for (const f of [".agent/BOOTSTRAP.md", "README.md"]) {
      try { writeF(dir, f, readF(dir, f) + `\n\nSubstituir ${ph("HOSTING")} e ${ph("YEAR")}.\n`); } catch {}
    }
  }, { code: 0, includes: ["sem placeholders esquecidos"], excludes: ["  WARN  "] });
}
