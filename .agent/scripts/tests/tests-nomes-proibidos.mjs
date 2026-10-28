/**
 * A lista de NOMES PROIBIDOS (`lib/nomes-proibidos.mjs`, #375): os cinco estados, o caminho por omissao, e o
 * que casa e o que nao casa.
 *
 * NAO e um entry point: o `test-guards.mjs` descobre este modulo e chama `registar()`.
 *
 * Cada caso monta a sua lista num tmpdir proprio e passa `env`/`home` explicitos (`TP3`): a lista real de quem
 * corre nunca entra. Os nomes sao inventados — um nome real aqui era o defeito que a lib existe para impedir.
 * A pasta ilegivel e uma PASTA no lugar do ficheiro, e nao um `chmod 000`: como root, o `chmod` nao impede ler.
 */
import { pathToFileURL } from "url";
import { execFileSync } from "child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { registarResultado } from "./harness/test-harness.mjs";
import { VARIAVEL, INTERRUPTOR, caminhoDaLista, carregaLista, desligadoNoRepo, padroes, encontra } from "../lib/nomes-proibidos.mjs";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.error(
    "tests-nomes-proibidos.mjs nao e um entry point: nao corre testes por si.\n" +
      "Correr `node .agent/scripts/tests/test-guards.mjs`."
  );
  process.exit(1);
}

/** Entry point a que este modulo pertence. */
export const entryPoint = "test-guards.mjs";

/** Um tmpdir proprio por caso, com uma `raiz` (o repo) e uma `fora` (a home), apagado no fim. */
function comDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), "nomes-proibidos-test-"));
  try {
    const raiz = join(dir, "repo");
    const fora = join(dir, "home");
    mkdirSync(raiz);
    mkdirSync(fora);
    return fn({ raiz, fora });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Carrega a lista do `caminho`, pela variavel, com uma `home` que nao tem nenhuma. O interruptor fica de fora
 *  (`desligado: () => false`): lido de verdade, dependia do repo onde o `TMPDIR` de quem corre esta (`TP3`). */
const carrega = (raiz, fora, caminho, desligado = () => false) => carregaLista({ env: { [VARIAVEL]: caminho }, home: fora, raiz, desligado });

/** O git das fixtures sem o `GIT_*` de quem corre: com um `GIT_DIR` no ambiente, o `config --local` escrevia la. */
const GIT_ISOLADO = { ...Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^GIT_/.test(k))), GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" };

/** O estado que se esperava, e o que veio. */
const estadoE = (r, esperado) => (r.estado === esperado ? [] : [`estado "${r.estado}", esperado "${esperado}"`]);

export function registar() {
  // --- Os estados ------------------------------------------------------------------------------------
  registarResultado("nomes-proibidos: sem ficheiro no caminho por omissao e `sem-lista`, sem nomes (#375)", comDir(({ raiz, fora }) => {
    const r = carregaLista({ env: {}, home: fora, raiz });
    return [...estadoE(r, "sem-lista"), ...(r.nomes.length ? ["devolveu nomes sem lista"] : [])];
  }), "");

  registarResultado("nomes-proibidos: com a VARIAVEL definida, um ficheiro em falta e `ilegivel`, nao `sem-lista` (#375)", comDir(({ raiz, fora }) =>
    estadoE(carrega(raiz, fora, join(fora, "nao-existe")), "ilegivel")), "");

  // Pelo caminho POR OMISSAO, sem a variavel: so ai um `stat` (que segue o link) dava `sem-lista` em vez de `ilegivel`.
  registarResultado("nomes-proibidos: um symlink SEM ALVO no caminho por omissao e `ilegivel`, nao `sem-lista` (#375)", comDir(({ raiz, fora }) => {
    mkdirSync(join(fora, ".config", "agent-template"), { recursive: true });
    symlinkSync(join(fora, "alvo-que-nao-existe"), join(fora, ".config", "agent-template", "nomes-proibidos"));
    return estadoE(carregaLista({ env: {}, home: fora, raiz }), "ilegivel");
  }), "");

  registarResultado("nomes-proibidos: o repo DESLIGADO (`git config --local`) e `desligado`, mesmo com uma lista boa (#375)", comDir(({ raiz, fora }) => {
    const p = join(fora, "lista");
    writeFileSync(p, "projeto-secreto\n");
    const problemas = [];
    const git = (...a) => execFileSync("git", ["-C", raiz, ...a], { stdio: "ignore", env: GIT_ISOLADO });
    const desligadoAqui = (env = GIT_ISOLADO) => desligadoNoRepo(raiz, env);
    if (desligadoAqui()) problemas.push("uma pasta que nao e repo deu desligado");
    git("init", "-q");
    if (desligadoAqui()) problemas.push("um repo sem a chave deu desligado");
    // Uma config GLOBAL com a chave nao conta: desligava a lista em todos os repos de uma vez.
    const global = join(fora, "gitconfig-global");
    writeFileSync(global, `[agent-template]\n\tnomesProibidos = desligado\n`);
    if (desligadoAqui({ ...GIT_ISOLADO, GIT_CONFIG_GLOBAL: global })) problemas.push("a chave na config GLOBAL desligou o repo");
    git("config", "--local", INTERRUPTOR, "ligado");
    if (desligadoAqui()) problemas.push("um valor que nao e `desligado` desligou");
    git("config", "--local", INTERRUPTOR, "desligado");
    if (!desligadoAqui()) problemas.push("a chave local `desligado` nao desligou");
    return [...problemas, ...estadoE(carrega(raiz, fora, p, (r) => desligadoNoRepo(r, GIT_ISOLADO)), "desligado")];
  }), "");

  registarResultado("nomes-proibidos: uma PASTA no lugar do ficheiro e `ilegivel`, nao `sem-lista` (#375)", comDir(({ raiz, fora }) => {
    const p = join(fora, "lista");
    mkdirSync(p);
    return estadoE(carrega(raiz, fora, p), "ilegivel");
  }), "");

  registarResultado("nomes-proibidos: um symlink em CICLO (sem caminho real) e `ilegivel`, nao `sem-lista` (#375)", comDir(({ raiz, fora }) => {
    symlinkSync(join(fora, "b"), join(fora, "a"));
    symlinkSync(join(fora, "a"), join(fora, "b"));
    return estadoE(carrega(raiz, fora, join(fora, "a")), "ilegivel");
  }), "");

  registarResultado("nomes-proibidos: so comentarios e linhas em branco e `vazia` (#375)", comDir(({ raiz, fora }) => {
    const p = join(fora, "lista");
    writeFileSync(p, "# um comentario\n\n   \n  # outro, indentado\n");
    return estadoE(carrega(raiz, fora, p), "vazia");
  }), "");

  registarResultado("nomes-proibidos: uma lista DENTRO do repo e `dentro-do-repo`, e nao se le (#375)", comDir(({ raiz, fora }) => {
    const p = join(raiz, "sub", "lista");
    mkdirSync(join(raiz, "sub"));
    writeFileSync(p, "projeto-secreto\n");
    const r = carrega(raiz, fora, p);
    return [...estadoE(r, "dentro-do-repo"), ...(r.nomes.length ? ["leu os nomes de uma lista dentro do repo"] : [])];
  }), "");

  registarResultado("nomes-proibidos: um symlink FORA do repo para uma lista dentro dele continua `dentro-do-repo` (#375)", comDir(({ raiz, fora }) => {
    writeFileSync(join(raiz, "lista"), "projeto-secreto\n");
    symlinkSync(join(raiz, "lista"), join(fora, "atalho"));
    return estadoE(carrega(raiz, fora, join(fora, "atalho")), "dentro-do-repo");
  }), "");

  // #397 (M1): fora de um repo o hook passa `raiz: null`. A mesma lista que DENTRO da `raiz` seria `dentro-do-repo` e
  // lida, e o interruptor nem e perguntado (o `desligado` que diz sempre "sim" nao conta).
  registarResultado("nomes-proibidos: `raiz: null` (fora de um repo) le a lista e nao pergunta o interruptor (#397)", comDir(({ raiz, fora }) => {
    const p = join(raiz, "lista");
    writeFileSync(p, "projeto-secreto\n");
    const r = carregaLista({ env: { [VARIAVEL]: p }, home: fora, raiz: null, desligado: () => true });
    return [...estadoE(r, "ok"), ...(r.nomes.length === 1 ? [] : [`leu ${r.nomes.length} nomes, esperado 1`])];
  }), "");
  // E so o `null`: um consumidor que se esqueca da `raiz` (`undefined`) nao pode saltar o `dentro-do-repo` calado.
  registarResultado("nomes-proibidos: `raiz: undefined` continua a lancar, e nao e tratado como fora de um repo (#397)", comDir(({ raiz, fora }) => {
    const p = join(raiz, "lista");
    writeFileSync(p, "projeto-secreto\n");
    try {
      const r = carregaLista({ env: { [VARIAVEL]: p }, home: fora, raiz: undefined, desligado: () => false });
      return [`nao lancou: estado "${r.estado}"`];
    } catch (err) {
      // Pela razao certa: o `realpathSync` da raiz, e nao outro erro qualquer.
      return err && err.code === "ERR_INVALID_ARG_TYPE" ? [] : [`lancou outro erro: ${err instanceof Error ? err.message : String(err)}`];
    }
  }), "");

  registarResultado("nomes-proibidos: uma lista boa e `ok`, com a LINHA de cada nome, sem comentarios, e com CRLF (#375)", comDir(({ raiz, fora }) => {
    const p = join(fora, "lista");
    writeFileSync(p, "# privados\r\nprojeto-secreto\r\n\r\n  Cliente Alfa  \r\n");
    const r = carrega(raiz, fora, p);
    const visto = JSON.stringify(r.nomes);
    const esperado = JSON.stringify([{ nome: "projeto-secreto", linha: 2 }, { nome: "Cliente Alfa", linha: 4 }]);
    return [...estadoE(r, "ok"), ...(visto === esperado ? [] : [`nomes ${visto}, esperado ${esperado}`])];
  }), "");

  registarResultado("nomes-proibidos: sem a variavel, o caminho e o da `home`; com ela vazia, tambem (#375)", (() => {
    const esperado = join("/casa", ".config", "agent-template", "nomes-proibidos");
    const problemas = [];
    for (const env of [{}, { [VARIAVEL]: "" }]) {
      const c = caminhoDaLista({ env, home: "/casa" });
      if (c !== esperado) problemas.push(`com ${JSON.stringify(env)}: ${c}, esperado ${esperado}`);
    }
    if (caminhoDaLista({ env: { [VARIAVEL]: "/outro" }, home: "/casa" }) !== "/outro") problemas.push("a variavel nao mudou o caminho");
    return problemas;
  })(), "");

  // --- O que casa ------------------------------------------------------------------------------------
  const re = padroes([{ nome: "projeto-secreto", linha: 3 }, { nome: "a.b", linha: 7 }]);
  const CASOS = [
    // [texto, linhas esperadas, porque]
    ["o projeto-secreto ficou", [3], "a forma da lista"],
    ["no Projeto Secreto", [3], "espaco e maiusculas"],
    ["PROJETO_SECRETO=1", [3], "sublinhado"],
    ["projeto -  secreto", [3], "separadores repetidos"],
    ["(projeto-secreto).", [3], "pontuacao a volta"],
    ["o projeto-secretos", [], "dentro de uma palavra maior, no fim"],
    ["subprojeto-secreto", [], "dentro de uma palavra maior, no inicio"],
    ["çprojeto-secreto", [], "uma letra acentuada antes (nao e fronteira de palavra)"],
    ["projetosecreto", [], "sem separador nenhum"],
    ["axb", [], "o ponto do nome e literal"],
    ["ver a.b e projeto secreto", [3, 7], "os dois, por ordem da lista"],
  ];
  registarResultado("nomes-proibidos: as variantes casam, e uma palavra maior ou um ponto solto nao (#375)", CASOS.flatMap(([texto, esperado, porque]) => {
    const visto = encontra(texto, re);
    return JSON.stringify(visto) === JSON.stringify(esperado) ? [] : [`${porque}: "${texto}" deu ${JSON.stringify(visto)}, esperado ${JSON.stringify(esperado)}`];
  }), "");

  registarResultado("nomes-proibidos: `..lista` dentro do repo e `dentro-do-repo` (so `..` e `../` saem dele) (#375)", comDir(({ raiz, fora }) => {
    writeFileSync(join(raiz, "..lista"), "projeto-secreto\n");
    return estadoE(carrega(raiz, fora, join(raiz, "..lista")), "dentro-do-repo");
  }), "");

  registarResultado("nomes-proibidos: uma linha so de separadores nao e um nome (casava tudo) (#375)", comDir(({ raiz, fora }) => {
    const p = join(fora, "lista");
    writeFileSync(p, "-\n_ _\nprojeto-secreto\n");
    const r = carrega(raiz, fora, p);
    writeFileSync(p, "-\n");
    return [
      ...(JSON.stringify(r.nomes) === JSON.stringify([{ nome: "projeto-secreto", linha: 3 }]) ? [] : [`nomes ${JSON.stringify(r.nomes)}`]),
      ...(encontra("um texto qualquer", padroes(r.nomes)).length ? ["um texto sem o nome casou"] : []),
      ...estadoE(carrega(raiz, fora, p), "vazia"),
    ];
  }), "");

  registarResultado("nomes-proibidos: NFC nos dois lados (um texto colado no macOS vem em NFD), e os acentos contam (#375)", (() => {
    const nfc = padroes([{ nome: "João Alfa", linha: 1 }]);
    const nfd = padroes([{ nome: "João Alfa", linha: 2 }]);
    return [
      ...(encontra("o João Alfa", nfc).length ? [] : ["lista NFC nao casou texto NFD"]),
      ...(encontra("o João Alfa", nfd).length ? [] : ["lista NFD nao casou texto NFC"]),
      ...(encontra("o Joao Alfa", nfc).length ? ["sem o acento casou (os acentos contam)"] : []),
    ];
  })(), "");

  registarResultado("nomes-proibidos: um texto ausente (`null`) nao casa nem lanca (#375)", (() => {
    try {
      return encontra(null, re).length ? ["um texto nulo casou"] : [];
    } catch (err) {
      return [`lancou: ${err instanceof Error ? err.message : String(err)}`];
    }
  })(), "");
}
