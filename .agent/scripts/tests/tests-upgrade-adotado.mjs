/**
 * Testes do motor do `/upgrade` num projeto ADOTADO (#290) — {{PROJECT_NAME}}
 *
 * Um projeto que adotou o template (`adotar-template.mjs`, #288) tem `.agent/adocao.json` com as
 * `colisoes`: ficheiros DELE com o caminho de um do template. A medicao corria por cima deles —
 * copiava o do template (`.githooks/commit-msg` do projeto trocado pelo ponteiro), listava-os como
 * "ALTERADOS, vao ser substituidos" e, se o template deixasse de ter o caminho, propunha apaga-los
 * e apagava-os na copia antes de medir. Media um upgrade que nao vai acontecer.
 *
 * Cada caso tem o seu contra-caso: o MESMO cenario sem o manifesto mostra o comportamento antigo.
 * Sem ele, um teste que passasse por o motor nunca tocar no ficheiro nao afirmava nada.
 *
 * NAO e um entry point. O `test-simulate-upgrade.mjs` importa-o e chama `registar()`.
 */
import { lstatSync, mkdirSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "fs";
import { join } from "path";
import { pathToFileURL } from "url";
import { cenario, limpa, test } from "./harness/test-upgrade-harness.mjs";
import { blocosAntesDeAprovar } from "../lib/saida-upgrade.mjs";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.error(
    "tests-upgrade-adotado.mjs nao e um entry point: nao corre testes por si.\n" +
      "Correr `node .agent/scripts/tests/test-simulate-upgrade.mjs`."
  );
  process.exit(1);
}

/** Entry point a que este modulo pertence. */
export const entryPoint = "test-simulate-upgrade.mjs";

const HOOK = ".githooks/commit-msg";
const SAI = ".agent/scripts/sai.mjs";
const FICA = ".agent/scripts/fica.mjs";
const AP = ".agent/rules/anti-patterns.md";
const APT = ".agent/rules/anti-patterns-template.md";
// O hook do projeto traz um token de chavetas duplas que e DELE: a passagem de placeholders nao
// lhe pode tocar.
// Montado em tempo de execucao: escrito colado, o bootstrap de um derivado substitui-lo-ia aqui
// (a regra do `tests-upgrade-motor.mjs`), e o teste passava a medir outra coisa.
const HOOK_DO_PROJETO = `#!/bin/sh\n# ${"{{"}MEU_TOKEN${"}}"}: o commitlint do projeto\n`;

/** O template mudou o hook, deixou de ter `sai.mjs` e mudou `fica.mjs`; o projeto tinha um hook,
 *  um `sai.mjs`, um `CONTRIBUTING.md` e os dois `anti-patterns*` SEUS (colisoes — o `anti-patterns.md`
 *  sem o `---` que o motor usa para o cortar) e o `fica.mjs` intacto. `manifesto`: o adocao.json. */
const adotado = (manifesto, prepara = null) => ({
  ontem: { [HOOK]: "// hook do template v1\n", [SAI]: "// sai v1\n", [FICA]: "// fica v1\n" },
  hoje: { [HOOK]: "// hook do template v2\n", [SAI]: null, [FICA]: "// fica v2\n" },
  consumidor: {
    [HOOK]: HOOK_DO_PROJETO,
    [SAI]: "// do projeto\n",
    [FICA]: "// fica v1\n",
    "CONTRIBUTING.md": "# as regras do projeto\n",
    ...(manifesto === undefined ? {} : { [AP]: "# os anti-padroes do projeto, sem separador\n", [APT]: "# do projeto\n", ".agent/adocao.json": manifesto }),
  },
  prepara,
});
const manifesto = (extra = {}) =>
  JSON.stringify({ estado: "commitado", copiados: [], colisoes: [HOOK, SAI, "CONTRIBUTING.md", AP, APT], iguais: [], perguntar: [], template: { commit: "x" }, ...extra });
const MANIFESTO = manifesto();

/** Corre o cenario e devolve os problemas que `fn(c)` encontrar, limpando sempre. */
function mede(opcoes, fn) {
  let c;
  try {
    c = cenario(opcoes);
    return fn(c);
  } finally {
    limpa(c);
  }
}

/** A razao do `fatal` com que o cenario parou, ou `null`. */
function paragem(opcoes) {
  let c;
  try {
    c = cenario(opcoes);
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  } finally {
    limpa(c);
  }
}

export function registar() {
  test("adotado: a copia MANTEM os ficheiros do projeto que colidem (placeholders e anti-padroes incluidos); o resto atualiza", () =>
    mede(adotado(MANIFESTO), (c) => [
      ...(c.ler(HOOK) === HOOK_DO_PROJETO ? [] : [`o hook do projeto foi tocado: ${JSON.stringify(c.ler(HOOK))}`]),
      ...(c.ler(AP) === "# os anti-padroes do projeto, sem separador\n" ? [] : ["o anti-patterns.md do projeto foi tocado"]),
      ...(c.ler(APT) === "# do projeto\n" ? [] : ["o anti-patterns-template.md do projeto foi tocado"]),
      ...(c.ler(FICA) === "// fica v2\n" ? [] : ["um ficheiro do template que NAO colide deixou de ser atualizado"]),
    ]));

  test("adotado: as colisoes nao saem como 'substituidos' nem como 'removidos'; doProjeto so as que ainda contam", () =>
    mede(adotado(MANIFESTO), (c) => [
      ...(c.medido.substituidos.includes(HOOK) ? [`substituidos tem ${HOOK}`] : []),
      ...(c.medido.removidos.some((r) => r.caminho === SAI) ? [`removidos tem ${SAI}`] : []),
      // So o hook: o `sai.mjs` ja nao existe no template (nao e noticia), o CONTRIBUTING.md e os
      // anti-padroes estao fora do que o motor copia por prefixo.
      ...(JSON.stringify(c.medido.doProjeto) === JSON.stringify([HOOK]) ? [] : [`doProjeto = ${JSON.stringify(c.medido.doProjeto)}`]),
    ]));

  // O contra-caso: sem o manifesto, o motor faz o que fazia — e e isso que prova que os testes de
  // cima medem o manifesto, e nao um cenario em que o motor nunca tocava nos ficheiros.
  test("sem manifesto: o mesmo cenario troca o hook, lista-o como substituido e propoe apagar o sai.mjs", () =>
    mede(adotado(undefined), (c) => [
      ...(c.ler(HOOK) === "// hook do template v2\n" ? [] : ["sem manifesto, o hook devia chegar do template"]),
      ...(c.medido.substituidos.includes(HOOK) ? [] : ["sem manifesto, o hook devia estar em substituidos"]),
      ...(c.medido.removidos.some((r) => r.caminho === SAI) ? [] : ["sem manifesto, o sai.mjs devia estar em removidos"]),
      ...(c.medido.doProjeto.length === 0 ? [] : [`sem manifesto, doProjeto devia vir vazio: ${c.medido.doProjeto}`]),
    ]));

  test("adotado: o que se le antes de aprovar diz que as colisoes sao do projeto", () =>
    mede(adotado(MANIFESTO), (c) => {
      const texto = blocosAntesDeAprovar({ medido: c.medido, agentes: [], desde: "v1.0.0" }).flat().join("\n");
      return /do PROJETO/.test(texto) && texto.includes(HOOK) ? [] : [`o bloco nao as mostra:\n${texto}`];
    }));

  // `.githooks` -> `.husky` (o projeto usava o husky): a pasta inteira e do projeto. O `cpSync`
  // rebentava, ou escrevia no alvo do link.
  test("adotado: um .githooks que e SYMLINK fica intacto, e nada e escrito no alvo dele", () =>
    mede(
      adotado(MANIFESTO, (dir) => {
        rmSync(join(dir, ".githooks"), { recursive: true, force: true });
        mkdirSync(join(dir, ".husky"));
        writeFileSync(join(dir, ".husky/pre-commit"), "npx lint-staged\n");
        symlinkSync(".husky", join(dir, ".githooks"));
      }),
      (c) => [
        ...(lstatSync(join(c.dir, ".githooks")).isSymbolicLink() ? [] : ["o symlink foi substituido"]),
        ...(readdirSync(join(c.dir, ".husky")).join() === "pre-commit" ? [] : [`escreveu no alvo: ${readdirSync(join(c.dir, ".husky"))}`]),
      ]
    ));

  // Um manifesto que nao se le nao e "nao ha colisoes": e nao saber o que e do projeto (`TP2`).
  for (const [nome, txt, re] of [
    ["JSON invalido", "{nao e json", /ilegivel/],
    ["sem colisoes", JSON.stringify({ estado: "commitado" }), /ilegivel/],
    ["colisoes que nao sao texto", manifesto({ colisoes: [1] }), /ilegivel/],
    ["adocao interrompida (a copiar)", manifesto({ estado: "a copiar" }), /a copiar/],
  ]) {
    test(`adotado: um manifesto ${nome} PARA a medicao, em vez de o ignorar`, () => {
      const r = paragem(adotado(txt));
      return r !== null && r.includes("adocao.json") && re.test(r) ? [] : [`devia parar com a razao, deu: ${r}`];
    });
  }
}
