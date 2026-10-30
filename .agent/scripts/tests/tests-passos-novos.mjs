/**
 * Os passos novos antes das suites (`lib/passos-novos.mjs`, #362), pela funcao pura.
 *
 * NAO e um entry point: o `test-guards.mjs` descobre este modulo e chama `registar()`. E o DONO do alvo na varredura
 * (`tests-<alvo>.mjs`): corre primeiro, e cada `novo(` desligado morre aqui em milissegundos — o gate de ponta a ponta
 * esta no `tests-surface-passos-novos.mjs`. Uma linha por caso, com o esperado num objeto no fim (#359).
 */
import { pathToFileURL } from "url";
import { registarResultado } from "./harness/test-harness.mjs";
import { passosNovos } from "../lib/passos-novos.mjs";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.error(
    "tests-passos-novos.mjs nao e um entry point: nao corre testes por si.\n" +
      "Correr `node .agent/scripts/tests/test-guards.mjs`."
  );
  process.exit(1);
}

/** Entry point a que este modulo pertence. */
export const entryPoint = "test-guards.mjs";

export function registar() {
  // Um job `g` que corre uma suite no fim; `antes` sao os passos antes dela, `depois` os de depois.
  const SUITE = "      - run: node .agent/scripts/tests/test-guards.mjs\n";
  const CO = "      - uses: actions/checkout@v4\n";
  const wf = (antes = "", depois = "") => `on: push\njobs:\n  g:\n    runs-on: y\n    steps:\n${CO}${antes}${SUITE}${depois}`;
  const CTX = {
    base: {},
    novo: { naBase: () => false },
    mudado: { mudado: () => true },
    ligacao: { ligacao: () => true },
  };
  const R = (l) => `      - run: ${l}\n`;
  const BLOCO = (...ls) => `      - run: |\n${ls.map((l) => `          ${l}\n`).join("")}`;

  // Um passo novo antes da suite, contra a base sem ele.
  for (const [nome, passo, ctx, { avisos }] of [
    ["`printf > .agent/.../test-guards.mjs` (cita a maquinaria) avisa", R("printf 'process.exit(0)' > .agent/scripts/tests/test-guards.mjs"), "base", { avisos: 1 }],
    ["`>> \"$GITHUB_ENV\"` avisa", R('echo "BASH_ENV=./x.sh" >> "$GITHUB_ENV"'), "base", { avisos: 1 }],
    ["`| tee` avisa", R("echo x | tee f"), "base", { avisos: 1 }],
    ["`sed -i` avisa", R("sed -i s/a/b/ f"), "base", { avisos: 1 }],
    ["`node -e` avisa", R('node -e "1"'), "base", { avisos: 1 }],
    ["`python -c` avisa", R('python -c "1"'), "base", { avisos: 1 }],
    ["um comando desconhecido avisa", R("make"), "base", { avisos: 1 }],
    ["`env: BASH_ENV` com `run: ls` avisa (a chave ao lado)", "      - env:\n          BASH_ENV: ./x.sh\n        run: ls\n", "base", { avisos: 1 }],
    ["`shell:` com `run: ls` avisa", "      - shell: bash\n        run: ls\n", "base", { avisos: 1 }],
    ["`${{ github.head_ref }}` no `run:` avisa (injeccao)", R("echo ${{ github.head_ref }}"), "base", { avisos: 1 }],
    ["`env node -e` avisa (`env` so sem argumentos)", R('env node -e "1"'), "base", { avisos: 1 }],
    ["`X=y ls` avisa (o prefixo)", R("LD_PRELOAD=./x.so ls"), "base", { avisos: 1 }],
    ["`cat <(...)` avisa", R("cat <(ls)"), "base", { avisos: 1 }],
    ["`git -c ... status` avisa", R("git -c core.fsmonitor=x status"), "base", { avisos: 1 }],
    ["`git diff --output=f` avisa (escreve)", R("git diff --output=f"), "base", { avisos: 1 }],
    ["`git log --ext-diff` avisa (corre um programa)", R("git log --ext-diff"), "base", { avisos: 1 }],
    ["um `run:` entre aspas (o `\\n` da shell) avisa", '      - run: "ls\\nnode -e 1"\n', "base", { avisos: 1 }],
    ["um `run: >` dobrado avisa", "      - run: >\n          ls\n", "base", { avisos: 1 }],
    ["um `run:` simples em varias linhas avisa", "      - run: ls\n          node -e 1\n", "base", { avisos: 1 }],
    ["`ls \\` + `# x` + `node -e` num bloco avisa (uma linha, um comando)", BLOCO("ls \\", "# x", 'node -e "1"'), "base", { avisos: 1 }],
    ["`echo \"a #\" ; node -e` num bloco avisa (o `#` em aspas e da shell)", BLOCO('echo "a #" ; node -e "1"'), "base", { avisos: 1 }],
    ["dois `run:` no mesmo passo avisam", "      - run: ls\n        run: node -e 1\n", "base", { avisos: 1 }],
    ["`uses: ./.github/actions/x` avisa", "      - uses: ./.github/actions/x\n", "base", { avisos: 1 }],
    ["`uses: actions/github-script` avisa", "      - uses: actions/github-script@v7\n", "base", { avisos: 1 }],
    ["`actions/checkout` com `ref:` avisa", "      - uses: actions/checkout@v4\n        with:\n          ref: main\n", "base", { avisos: 1 }],
    ["`actions/checkout` com `github-server-url:` avisa", "      - uses: actions/checkout@v4\n        with:\n          github-server-url: https://x\n", "base", { avisos: 1 }],
    ["um modulo novo da maquinaria chamado diretamente avisa (`lib/desliga.mjs`)", R("node .agent/scripts/lib/desliga.mjs"), "novo", { avisos: 1 }],
    ["um modulo da maquinaria mudado no PR avisa", R("node .agent/scripts/lib/x.mjs"), "mudado", { avisos: 1 }],
    ["uma ligacao simbolica com a forma de verificador avisa", R("node .agent/scripts/check-x.mjs"), "ligacao", { avisos: 1 }],
    ["`node vendor/.agent/scripts/x.mjs` avisa (nao esta ancorado)", R("node vendor/.agent/scripts/x.mjs"), "base", { avisos: 1 }],
    ["`node .agent/scripts/../../x.mjs` avisa", R("node .agent/scripts/../../x.mjs"), "base", { avisos: 1 }],
    ["`node --import=x .agent/scripts/check-x.mjs` avisa (uma opcao antes)", R("node --import=./x.mjs .agent/scripts/check-x.mjs"), "base", { avisos: 1 }],
    ["`working-directory:` com `node <maquinaria>` avisa", "      - working-directory: vendor\n        run: node .agent/scripts/check-x.mjs\n", "base", { avisos: 1 }],
    ["`ls` fica calado", R("ls"), "base", { avisos: 0 }],
    ["`cat x` e `echo ola` ficam calados", BLOCO("cat x", "echo ola"), "base", { avisos: 0 }],
    ["`node --version` fica calado", R("node --version"), "base", { avisos: 0 }],
    ["`git log --oneline` fica calado", R("git log --oneline"), "base", { avisos: 0 }],
    ["`set -euo pipefail` fica calado (so endurece)", BLOCO("set -euo pipefail", "ls"), "base", { avisos: 0 }],
    ["`set +e` fica calado (cada `run:` tem a sua shell)", R("set +e"), "base", { avisos: 0 }],
    ["um `with:` em flow (`{ ref: main }`) avisa", "      - uses: actions/checkout@v4\n        with: { fetch-depth: 0, ref: main }\n", "base", { avisos: 1 }],
    ["um `with:` que e um alias avisa", "      - uses: actions/setup-node@v4\n        with: *a\n", "base", { avisos: 1 }],
    ["`git log \"--output=x\"` entre aspas avisa", R('git log -1 "--output=x"'), "base", { avisos: 1 }],
    ["`git log --o*` (um glob) avisa", R("git log --o*"), "base", { avisos: 1 }],
    ["`git log \` + `ls --output=x` avisa (a continuacao)", BLOCO("git log -1 \\", "ls --output=x"), "base", { avisos: 1 }],
    ["uma linha com aspas por fechar avisa (o `#` dentro delas)", BLOCO('echo "', '#"; printf x > f; echo "', 'echo "'), "base", { avisos: 1 }],
    ["`node .agent/scripts/lib` (uma pasta) avisa", R("node .agent/scripts/lib"), "base", { avisos: 1 }],
    ["um `with:` sem `uses:` avisa", "      - with:\n          a: b\n        run: ls\n", "base", { avisos: 1 }],
    ["um passo em flow (`- { run: ls }`) avisa", "      - { run: ls }\n", "base", { avisos: 1 }],
    ["um comentario da shell num bloco fica calado", BLOCO("# so le", "ls"), "base", { avisos: 0 }],
    ["um verificador que ja existia fica calado", R("node .agent/scripts/check-x.mjs"), "base", { avisos: 0 }],
    ["um verificador NOVO (`check-*.mjs`) fica calado", R("node .agent/scripts/check-novo.mjs"), "novo", { avisos: 0 }],
    ["uma suite NOVA (`tests/test-*.mjs`) fica calada", R("node .agent/scripts/tests/test-novo.mjs"), "novo", { avisos: 0 }],
    ["`.agent/scripts/test-*.mjs` na raiz, novo, avisa (a descoberta nao o ve)", R("node .agent/scripts/test-novo.mjs"), "novo", { avisos: 1 }],
    ["a cadeia do runner em paralelo fica calada", BLOCO("exec node .agent/scripts/lib/suites-em-paralelo.mjs -- \\", "  node .agent/scripts/tests/test-a.mjs \\", "  node .agent/scripts/tests/test-b.mjs"), "base", { avisos: 0 }],
    ["`actions/setup-node` com `node-version-file` e `cache` fica calado", "      - uses: actions/setup-node@v4\n        with:\n          node-version-file: .nvmrc\n          cache: npm\n", "base", { avisos: 0 }],
  ]) {
    const a = passosNovos(wf(), wf(passo), CTX[ctx]);
    registarResultado(`passos novos: ${nome} (#362)`, a.length === avisos ? [] : [`esperava ${avisos} aviso(s), deu ${JSON.stringify(a)}`]);
  }

  // A identidade e o multiconjunto: base e agora inteiros.
  const ESCREVE = R("echo x >> f");
  const AQUI = "      - name: A\n        run: echo x >> f\n";
  for (const [nome, antes, agora, { avisos }] of [
    ["um passo que ja existia antes das suites fica calado", wf(ESCREVE), wf(ESCREVE), { avisos: 0 }],
    ["renomear um passo que ja existia fica calado (sem o `name:`)", wf(AQUI), wf(AQUI.replace("name: A", "name: B")), { avisos: 0 }],
    ["mover um passo de depois para antes das suites avisa", wf("", ESCREVE), wf(ESCREVE), { avisos: 1 }],
    ["um `run:` que ja existia e passa a escrever avisa", wf(R("ls")), wf(R("ls > f")), { avisos: 1 }],
    ["um passo novo DEPOIS das suites fica calado", wf(), wf("", ESCREVE), { avisos: 0 }],
    ["um job NOVO fica calado", "on: push\njobs:\n  o:\n    runs-on: y\n", wf(ESCREVE), { avisos: 0 }],
    ["subir a versao de um `uses:` fora da lista fica calado (o Dependabot)", wf("      - uses: actions/download-artifact@v7\n"), wf("      - uses: actions/download-artifact@v8\n"), { avisos: 0 }],
    ["um passo que ja existia, repetido, avisa (o multiconjunto)", wf(ESCREVE), wf(ESCREVE + ESCREVE), { avisos: 1 }],
    ["uma linha `name:` acrescentada dentro de um `run: |` avisa (nao e o `name:` do passo)", wf(BLOCO("ls")), wf(BLOCO("ls", "name: || node -e 1")), { avisos: 1 }],
    ["o ultimo passo da maquinaria mudado nao recua o limite", wf(), wf(ESCREVE).replace("tests/test-guards.mjs\n", "tests/test-guards.mjs --x\n"), { avisos: 1 }],
    ["`steps:` em flow num job da maquinaria avisa", wf(), "on: push\njobs:\n  g:\n    runs-on: y\n    steps: [{ run: 'node .agent/scripts/tests/test-guards.mjs' }]\n", { avisos: 1 }],
  ]) {
    const a = passosNovos(antes, agora);
    registarResultado(`passos novos: ${nome} (#362)`, a.length === avisos ? [] : [`esperava ${avisos} aviso(s), deu ${JSON.stringify(a)}`]);
  }
  const m = passosNovos(wf(), wf(R("printf x > f")))[0] ?? "";
  // A RAZAO de cada forma: um aviso pela razao errada (o prefixo lido como um comando desconhecido, o `>` de um
  // `run: >` lido como redireccao) tirava a mensagem que diz o que mudar (medido: os controlos c) e r) sobreviviam).
  const razao = (passo) => passosNovos(wf(), wf(passo))[0] ?? "";
  registarResultado("passos novos: a mensagem diz o job, a razao e o passo (#362)", [
    ...(m.startsWith("um passo novo antes das suites no job `g` expande ou redireciona (`run: printf x > f`)") ? [] : [`mensagem: "${m}"`]),
    ...(razao(R("LD_PRELOAD=./x.so ls")).includes("tem um prefixo X=y") ? [] : [`o prefixo: "${razao(R("LD_PRELOAD=./x.so ls"))}"`]),
    ...(razao("      - run: >\n          ls\n").includes("tem um `run:` dobrado, entre aspas ou que nao se le") ? [] : ["o `run: >` nao disse que e dobrado"]),
    ...(razao("      - run: 'ls'\n").includes("tem um `run:` dobrado, entre aspas ou que nao se le") ? [] : ["o `run:` entre aspas nao disse que e entre aspas"]),
  ]);
}
