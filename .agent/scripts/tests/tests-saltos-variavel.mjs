/**
 * Os passos que saltam por uma variavel (`lib/saltos-variavel.mjs`, #353), pela funcao pura.
 *
 * NAO e um entry point: o `test-guards.mjs` descobre este modulo e chama `registar()`. E o DONO do alvo na varredura
 * (`tests-<alvo>.mjs`): corre primeiro, e cada `suspeito(` desligado morre aqui em milissegundos — o gate de ponta a
 * ponta esta no `tests-surface-saltos.mjs`. Uma linha por caso, com o esperado num objeto no fim (a forma que a
 * superficie conta, #359).
 */
import { pathToFileURL } from "url";
import { registarResultado } from "./harness/test-harness.mjs";
import { saltosPorVariavel, saltosNovos } from "../lib/saltos-variavel.mjs";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.error(
    "tests-saltos-variavel.mjs nao e um entry point: nao corre testes por si.\n" +
      "Correr `node .agent/scripts/tests/test-guards.mjs`."
  );
  process.exit(1);
}

/** Entry point a que este modulo pertence. */
export const entryPoint = "test-guards.mjs";

export function registar() {
  // Um workflow com um job `j` e um passo `P` que salta por `K`. `env` e o `env:` do passo; `job` e `topo` os outros.
  const OUT = "${{ steps.c.outputs.x }}";
  const CASE = '        run: case "$K" in true) ;; false) exit 0;; esac\n';
  const passo = (env = `        env:\n          K: ${OUT}\n`, run = CASE, nome = "P") => `      - name: ${nome}\n${env}${run}`;
  const wf = ({ topo = "", job = "", passos = [passo()] } = {}) => `on: push\n${topo}jobs:\n  j:\n    runs-on: y\n${job}    steps:\n${passos.join("")}`;
  const env = (v) => `        env:\n          K: ${v}\n`;
  const n = (t) => saltosPorVariavel(t).get("j\u0000K")?.n ?? 0;

  for (const [nome, texto, { suspeitos }] of [
    ["o valor de um output e seguro", wf(), { suspeitos: 0 }],
    ["o literal `true` e seguro (forca o passo a correr)", wf({ passos: [passo(env("true"))] }), { suspeitos: 0 }],
    ["o literal `'true'` entre aspas e seguro", wf({ passos: [passo(env("'true'"))] }), { suspeitos: 0 }],
    ["`'false'` e suspeito", wf({ passos: [passo(env("'false'"))] }), { suspeitos: 1 }],
    ["`false` sem aspas e suspeito", wf({ passos: [passo(env("false"))] }), { suspeitos: 1 }],
    ["`\"0\"` nao cai em nenhum ramo do `case`: o passo corre (seguro)", wf({ passos: [passo(env('"0"'))] }), { suspeitos: 0 }],
    ["`true` num `case` que salta com `true` e suspeito (o sentido do `case`)", wf({ passos: [passo(env("true"), '        run: case "$K" in true) echo salta; exit 0;; esac\n')] }), { suspeitos: 1 }],
    ["um literal cujo ramo faz o trabalho (o deploy) e seguro", wf({ passos: [passo(env("staging"), '        run: case "$K" in staging) ./deploy.sh;; *) exit 0;; esac\n')] }), { suspeitos: 0 }],
    ["um literal que cai num `exit 1` reprova, e nao salta: seguro", wf({ passos: [passo(env("x"), '        run: case "$K" in true) ;; *) exit 1;; esac\n')] }), { suspeitos: 0 }],
    ["uma comparacao (`${{ secrets.T != '' }}`) e segura", wf({ passos: [passo(env("${{ secrets.T != '' }}"))] }), { suspeitos: 0 }],
    ["um padrao (`${{ inputs.t || 'staging' }}`) e seguro", wf({ passos: [passo(env("${{ inputs.t || 'staging' }}"))] }), { suspeitos: 0 }],
    ["`${{ env.X }}` com um `false` no job e suspeito", wf({ job: "    env:\n      X: false\n", passos: [passo(env("${{ env.X }}"))] }), { suspeitos: 1 }],
    ["`${{ env.X }}` com um output no job e seguro", wf({ job: `    env:\n      X: ${OUT}\n`, passos: [passo(env("${{ env.X }}"))] }), { suspeitos: 0 }],
    ["a chave reatribuida no `run` antes do `case` e suspeita", wf({ passos: [passo(undefined, '        run: |\n          K=false\n          case "$K" in true) ;; false) exit 0;; esac\n')] }), { suspeitos: 1 }],
    ["`case \"${K,,}\" in` le", wf({ passos: [passo(env("false"), '        run: case "${K,,}" in true) ;; *) exit 0;; esac\n')] }), { suspeitos: 1 }],
    ["o `env:` como primeira chave do passo (`- env:`) le", wf({ passos: ['      - env:\n          K: false\n' + CASE] }), { suspeitos: 1 }],
    ["os passos com o `-` a coluna de `steps:` leem", `on: push\njobs:\n  j:\n    runs-on: y\n    steps:\n    - name: P\n      env:\n        K: false\n      run: case "$K" in true) ;; false) exit 0;; esac\n`, { suspeitos: 1 }],
    ["um `env:` de job que nao se le, e o passo sem o seu, e suspeito", wf({ job: "    env: ${{ fromJSON(x) }}\n", passos: [passo("")] }), { suspeitos: 1 }],
    ["um `env:` em flow que nao fecha e suspeito", wf({ passos: [passo("        env: { K: true, {\n")] }), { suspeitos: 1 }],
    ["um `case` que nao se le (sem `esac`) e suspeito", wf({ passos: [passo(env("true"), '        run: case "$K" in true) ;;\n')] }), { suspeitos: 1 }],
    ["`${{ 'false' }}` e suspeito", wf({ passos: [passo(env("${{ 'false' }}"))] }), { suspeitos: 1 }],
    ["`${{ x && 'false' }}` e suspeito (da sempre o mesmo)", wf({ passos: [passo(env("${{ steps.c.outputs.x && 'false' }}"))] }), { suspeitos: 1 }],
    ["`${{ 'false' || x }}` e suspeito", wf({ passos: [passo(env("${{ 'false' || steps.c.outputs.x }}"))] }), { suspeitos: 1 }],
    ["sem `env:` no passo, `false` no job: suspeito (passo > job > workflow)", wf({ job: "    env:\n      K: false\n", passos: [passo("")] }), { suspeitos: 1 }],
    ["sem `env:` no passo, um output no job: seguro", wf({ job: `    env:\n      K: ${OUT}\n`, passos: [passo("")] }), { suspeitos: 0 }],
    ["sem `env:` no passo nem no job, `false` no workflow: suspeito", wf({ topo: "env:\n  K: false\n", passos: [passo("")] }), { suspeitos: 1 }],
    ["o output do passo manda sobre o `false` do job", wf({ job: "    env:\n      K: false\n" }), { suspeitos: 0 }],
    ["o `env:` em flow com `'false'` e suspeito", wf({ passos: [passo("        env: { K: 'false' }\n")] }), { suspeitos: 1 }],
    ["o `env:` em flow com um output e seguro", wf({ passos: [passo(`        env: { K: ${OUT} }\n`)] }), { suspeitos: 0 }],
    ["um `env:` que e uma expressao nao se le: suspeito", wf({ passos: [passo("        env: ${{ fromJSON(x) }}\n")] }), { suspeitos: 1 }],
    ["um valor em bloco (`>-`) e suspeito", wf({ passos: [passo("        env:\n          K: >-\n            false\n")] }), { suspeitos: 1 }],
    ["um alias (`*f`) e suspeito", wf({ passos: [passo(env("*f"))] }), { suspeitos: 1 }],
    ["uma chave que nenhum `env:` define e da shell: nao conta", wf({ passos: [passo("")] }), { suspeitos: 0 }],
    ["um comentario no fim do valor (`${OUT} # 'false'`) nao conta: seguro", wf({ passos: [passo(`        env:\n          K: ${OUT} # 'false'\n`)] }), { suspeitos: 0 }],
    ["um `case` so num comentario nao le nada", wf({ passos: [passo(env("false"), "        run: echo ok # case \"$K\" in\n")] }), { suspeitos: 0 }],
    ["`case $K in` sem aspas le", wf({ passos: [passo(env("false"), "        run: case $K in true) ;; *) exit 0;; esac\n")] }), { suspeitos: 1 }],
    ["`case \"${K}\" in` le", wf({ passos: [passo(env("false"), '        run: case "${K}" in true) ;; *) exit 0;; esac\n')] }), { suspeitos: 1 }],
    ["`case \"${K:-false}\" in` le", wf({ passos: [passo(env("false"), '        run: case "${K:-false}" in true) ;; *) exit 0;; esac\n')] }), { suspeitos: 1 }],
    ["o `case` num `run: |` le", wf({ passos: [passo(env("false"), '        run: |\n          echo a\n          case "$K" in true) ;; *) exit 0;; esac\n')] }), { suspeitos: 1 }],
    ["o `case` num `run: >`, partido por linhas, le", wf({ passos: [passo(env("false"), '        run: >\n          case "$K"\n          in true) ;; *) exit 0;; esac\n')] }), { suspeitos: 1 }],
    ["um passo com `continue-on-error` tambem conta", wf({ passos: [passo(env("false") + "        continue-on-error: true\n")] }), { suspeitos: 1 }],
    ["dois passos suspeitos no mesmo job contam dois", wf({ passos: [passo(env("false")), passo(env("false"), CASE, "Q")] }), { suspeitos: 2 }],
    ["`steps:` em flow com um `case` conta (falha fechada)", `on: push\njobs:\n  j:\n    runs-on: y\n    steps: [{ run: 'case "$K" in true) ;; esac' }]\n`, { suspeitos: 1 }],
  ]) {
    registarResultado(`saltos: ${nome} (#353)`, n(texto) === suspeitos ? [] : [`esperava ${suspeitos} suspeito(s), deu ${n(texto)}`]);
  }

  // Os avisos do PR, por `(job, chave)` como multiconjunto: mais suspeitos agora do que na base.
  const F = passo(env("false"));
  for (const [nome, antes, agora, { avisos }] of [
    ["o output trocado por `'false'` avisa", wf(), wf({ passos: [passo(env("'false'"))] }), { avisos: 1 }],
    ["`true` trocado por `'false'` avisa", wf({ passos: [passo(env("true"))] }), wf({ passos: [passo(env("'false'"))] }), { avisos: 1 }],
    ["`'0'` (corre) trocado por `'false'` (salta) avisa", wf({ passos: [passo(env("'0'"))] }), wf({ passos: [passo(env("'false'"))] }), { avisos: 1 }],
    ["`'false'` trocado por `'no'` fica calado (de suspeito para suspeito)", wf({ passos: [passo(env("'false'"), '        run: case "$K" in true) ;; *) exit 0;; esac\n')] }), wf({ passos: [passo(env("'no'"), '        run: case "$K" in true) ;; *) exit 0;; esac\n')] }), { avisos: 0 }],
    ["um suspeito que ja estava na base fica calado", wf({ passos: [F] }), wf({ passos: [F] }), { avisos: 0 }],
    ["renomear o passo suspeito fica calado", wf({ passos: [F] }), wf({ passos: [passo(env("false"), CASE, "Outro")] }), { avisos: 0 }],
    ["reordenar os passos fica calado", wf({ passos: [F, passo()] }), wf({ passos: [passo(), F] }), { avisos: 0 }],
    ["um passo novo suspeito avisa", wf(), wf({ passos: [passo(), F] }), { avisos: 1 }],
    ["um passo repetido com o mesmo nome e suspeito avisa", wf({ passos: [F] }), wf({ passos: [F, F] }), { avisos: 1 }],
    ["o `env:` tirado dos passos e posto no job: uma linha so, com o numero de passos", wf({ passos: [passo(), passo(undefined, CASE, "Q")] }), wf({ job: "    env:\n      K: false\n", passos: [passo(""), passo("", CASE, "Q")] }), { avisos: 1 }],
  ]) {
    const a = saltosNovos(antes, agora);
    registarResultado(`saltos: ${nome} (#353)`, a.length === avisos ? [] : [`esperava ${avisos} aviso(s), deu ${JSON.stringify(a)}`]);
  }
  const m = saltosNovos(wf({ passos: [passo(), passo(undefined, CASE, "Q")] }), wf({ job: "    env:\n      K: false\n", passos: [passo(""), passo("", CASE, "Q")] }))[0] ?? "";
  registarResultado("saltos: a mensagem diz o numero de passos, o job, a chave e o valor (#353)",
    m.startsWith("2 passo(s) a mais (0 -> 2) do job `j` saltam por `K` num `case` com um valor que nao vem de um output (`false`)") ? [] : [`mensagem: "${m}"`]);
}
