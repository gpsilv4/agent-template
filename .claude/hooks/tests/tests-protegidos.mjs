/**
 * Os branches protegidos numa so fonte (`lib/protegidos.mjs`, #257) — {{PROJECT_NAME}}
 *
 * PORQUE EXISTE: a lista e do PROJETO (`.claude/hooks/protegidos.json`), e o hook tem de FALHAR
 * FECHADO quando ela falta ou esta partida — um hook sem lista ficava a proteger nada. Afirma-se a
 * leitura contra ficheiros montados numa sandbox, nunca o deste repo (`TP3`).
 */
import { mkdtempSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { pathToFileURL } from "url";
import { leProtegidos, leProtegidosComEstado, PROTEGIDOS_POR_OMISSAO } from "../lib/protegidos.mjs";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.error(
    "tests-protegidos.mjs nao e um entry point: nao corre testes por si.\n" +
      "Correr `node .claude/hooks/tests/test-hooks.mjs`."
  );
  process.exit(1);
}

/** Entry point a que este modulo pertence. */
export const entryPoint = "test-hooks.mjs";

/** O que `leProtegidosComEstado` le de um `protegidos.json` com este conteudo (`null`: sem ficheiro):
 *  a lista, em JSON, e o estado. */
function le(conteudo) {
  const dir = mkdtempSync(join(tmpdir(), "hook-protegidos-"));
  try {
    const f = join(dir, "protegidos.json");
    if (conteudo !== null) writeFileSync(f, conteudo);
    const { lista: l, estado } = leProtegidosComEstado(pathToFileURL(f));
    return { lista: JSON.stringify(l), estado, soLista: JSON.stringify(leProtegidos(pathToFileURL(f))) };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
const lista = (c) => le(c).lista;

const D = JSON.stringify(PROTEGIDOS_POR_OMISSAO);

export function registar({ test, eq }) {
  test("protegidos: sem o ficheiro, o default (falha fechada)", () => {
    eq(lista(null), D, "um hook sem lista continua a proteger main/master/develop");
  });

  test("protegidos: a lista do projeto e a que vale, normalizada", () => {
    eq(lista('["main", "staging"]'), JSON.stringify(["main", "staging"]), "o `staging` acrescentado pelo projeto");
    eq(lista('[" refs/heads/staging "]'), JSON.stringify(["staging"]), "sem espacos nem `refs/heads/`, como o git o reporta");
  });

  test("protegidos: uma lista VAZIA respeita-se (decisao do projeto)", () => {
    eq(lista("[]"), "[]", "um repo sem PRs pode nao proteger nenhum");
  });

  test("protegidos: o que nao e uma lista de nomes cai no default", () => {
    eq(lista("[1, 2]"), D, "numeros nao sao branches");
    eq(lista('["main", ""]'), D, "um nome vazio");
    eq(lista('{"main": true}'), D, "um objecto");
    eq(lista("[main"), D, "JSON partido nao desliga o guard");
    eq(lista("process.exit(0)"), D, "codigo nao corre: o ficheiro e lido como dados");
    eq(lista('["release/*"]'), D, "um glob nao protegeria nada: a comparacao e literal");
  });

  // Da segunda leitura do #257: um BOM (editores no Windows) fazia o parse falhar, e a lista do
  // projeto caia no default sem ninguem saber. E o estado distingue "nao ha" de "ha e esta mal".
  test("protegidos: o BOM sai, e o estado diz ok / ausente / invalido", () => {
    eq(lista('\uFEFF["main", "staging"]'), JSON.stringify(["main", "staging"]), "BOM a frente");
    eq(le('["main"]').estado, "ok", "lido");
    eq(le(null).estado, "ausente", "sem ficheiro: o default, e legitimo");
    eq(le("[main").estado, "invalido", "partido: o default, e o `session-context` di-lo");
    eq(le('["main"]').soLista, JSON.stringify(["main"]), "`leProtegidos` e so a lista");
  });
}
