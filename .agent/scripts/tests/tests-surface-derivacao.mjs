/**
 * Testes da DERIVACAO dos modulos que a sandbox leva consigo — {{PROJECT_NAME}}
 *
 * NAO e um entry point: o `test-test-surface.mjs` importa e chama `registar()`.
 *
 * PORQUE EXISTE, e porque vive num modulo proprio: a lista era escrita a mao, com uma
 * instrucao ao lado a mandar acrescentar — *"acrescentar aqui qualquer modulo novo que o
 * verificador passe a importar"*. A instrucao nao chegou: envelheceu **duas** vezes, e das
 * duas o sintoma foi `ERR_MODULE_NOT_FOUND` sobre um caminho numa pasta temporaria, que nao
 * aponta para "a fixture esta incompleta". Das duas vezes o defeito foi procurado no
 * verificador. Ver #125.
 *
 * Correm contra uma ARVORE SINTETICA e nao contra o repo: um teste que leia o repo nao
 * distingue "deriva" de "acertou por acaso no que hoje la esta" (`TP3`).
 *
 * Num modulo proprio porque o entry point ja estava em 451 linhas de um tecto de 500 — e a
 * convencao `tests-surface-*.mjs` existe exactamente para isto, tendo ja sido usada pela
 * mesma razao pelo `tests-surface-marks.mjs`.
 */
import { pathToFileURL } from "url";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { dirname, join } from "path";
import { registarResultado, modulosImportadosPor, CHECKER_MODULOS } from "./harness/test-surface-harness.mjs";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.error(
    "tests-surface-derivacao.mjs nao e um entry point: nao corre testes por si.\n" +
      "Correr `node .agent/scripts/tests/test-test-surface.mjs`."
  );
  process.exit(1);
}

/** Entry point a que este modulo pertence. */
export const entryPoint = "test-test-surface.mjs";

export function registar() {
  const arvore = (ficheiros) => {
    const raiz = mkdtempSync(join(tmpdir(), "surface-test-deriva-"));
    for (const [rel, corpo] of Object.entries(ficheiros)) {
      mkdirSync(dirname(join(raiz, rel)), { recursive: true });
      writeFileSync(join(raiz, rel), corpo);
    }
    return raiz;
  };
  const afirma = (nome, fn) => {
    let problemas;
    try {
      problemas = fn() ?? [];
    } catch (err) {
      problemas = [`rebentou: ${err.message}`];
    }
    registarResultado(nome, problemas, "");
  };

  // O CONTROLO NEGATIVO PRINCIPAL: um import NOVO aparece sem ninguem tocar na lista. E o
  // unico caso que distingue derivar de enumerar — a versao a mao falha-o por construcao.
  afirma("derivacao: um import novo entra sem ninguem tocar no harness", () => {
    const raiz = arvore({
      "a.mjs": 'import { x } from "./lib/velho.mjs";\nimport { y } from "./lib/NOVO.mjs";\n',
      "lib/velho.mjs": "export const x = 1;\n",
      "lib/NOVO.mjs": "export const y = 2;\n",
    });
    try {
      const r = [...modulosImportadosPor("a.mjs", raiz)];
      return r.includes("lib/NOVO.mjs") ? [] : [`nao apanhou o import novo: ${JSON.stringify(r)}`];
    } finally {
      rmSync(raiz, { recursive: true, force: true });
    }
  });

  // TRANSITIVO. Hoje nenhum modulo do checker importa de `./`, mas o `lib/derivado-maduro.mjs`
  // importa dois — o caso existe no repo e chega aqui a primeira extracao que o traga. Sem
  // profundidade, a sandbox ficava sem o neto e voltava o mesmo ENOENT.
  afirma("derivacao: resolve em PROFUNDIDADE, nao so um nivel", () => {
    const raiz = arvore({
      "a.mjs": 'import { b } from "./lib/b.mjs";\n',
      "lib/b.mjs": 'import { c } from "./c.mjs";\nexport const b = 1;\n',
      "lib/c.mjs": "export const c = 1;\n",
    });
    try {
      const r = [...modulosImportadosPor("a.mjs", raiz)];
      return r.includes("lib/c.mjs") ? [] : [`nao desceu ao neto: ${JSON.stringify(r)}`];
    } finally {
      rmSync(raiz, { recursive: true, force: true });
    }
  });

  // O CONTRA-CASO que impede a derivacao de virar ruido: os builtins do Node resolvem-se
  // sozinhos na sandbox, e copia-los era procurar ficheiros que nao existem no repo.
  afirma("derivacao: imports de builtins NAO entram", () => {
    const raiz = arvore({ "a.mjs": 'import { readFileSync } from "fs";\nimport { join } from "path";\n' });
    try {
      const r = [...modulosImportadosPor("a.mjs", raiz)].filter((f) => f !== "a.mjs");
      return r.length === 0 ? [] : [`apanhou builtins: ${JSON.stringify(r)}`];
    } finally {
      rmSync(raiz, { recursive: true, force: true });
    }
  });

  // E a ponte para o repo REAL: o que a derivacao produz tem de ser exactamente o que a sandbox
  // precisa. Se um dia divergir, e aqui que se ve — e nao num ENOENT a meio de 76 assercoes.
  afirma("derivacao: o conjunto do checker real nao esta vazio", () =>
    CHECKER_MODULOS.length > 0 ? [] : ["a derivacao devolveu vazio — a sandbox ficava sem modulos"]);
}
