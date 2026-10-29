/**
 * Testes do proprio harness da superficie — {{PROJECT_NAME}}
 *
 * Espelha a funcao `avaliar()` de `test-surface-harness.mjs`.
 * NAO e um entry point: o `test-test-surface.mjs` importa e chama `registar()`.
 *
 * PORQUE EXISTE: a varredura de mutacao mediu **0 de 3** sitios no harness da superficie.
 * Desligar qualquer uma das suas assercoes so torna os 66 testes mais permissivos — nenhum
 * fica vermelho, e o ecra continua a dizer "todos passaram". E o mesmo buraco que o
 * `tests-test-harness.mjs` fecha do outro lado, e fecha-se da mesma maneira: o veredicto foi
 * isolado como funcao pura, e aqui chama-se com entradas fabricadas, uma por assercao.
 */
import { pathToFileURL } from "url";
import { rmSync } from "fs";
import { avaliar, registarResultado, sandbox, git, apagaObjetoSolto, seAContagemExistir } from "./harness/test-surface-harness.mjs";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.error(
    "tests-surface-self.mjs nao e um entry point: nao corre testes por si.\n" +
      "Correr `node .agent/scripts/tests/test-test-surface.mjs`."
  );
  process.exit(1);
}

/** Entry point a que este modulo pertence. */
export const entryPoint = "test-test-surface.mjs";

export function registar() {
  const caso = (nome, entrada, esperado, proibido = []) => {
    let problemas;
    try {
      problemas = avaliar(entrada);
    } catch (err) {
      registarResultado(nome, [`avaliar() rebentou: ${err.message}`], "");
      return;
    }
    const juntos = problemas.join(" | ");
    const faltam = esperado.filter((t) => !juntos.includes(t)).map((t) => `devia reportar "${t}"; reportou: [${juntos}]`);
    const sobram = proibido.filter((t) => juntos.includes(t)).map((t) => `NAO devia reportar "${t}"; reportou: [${juntos}]`);
    registarResultado(nome, [...faltam, ...sobram], "");
  };

  // O contra-caso primeiro: sem ele, um `avaliar()` que devolvesse sempre tudo passava o resto.
  caso(
    "surface-harness: cenario sao devolve ZERO problemas",
    { code: 0, out: "  OK    superficie intacta\n", expect: { code: 0, includes: ["superficie intacta"] } },
    [],
    ["exit", "devia conter"]
  );

  // A invariante do veredicto: o exit code do verificador tem de ser o esperado.
  caso(
    "surface-harness: exit code diferente do esperado e reportado",
    { code: 0, out: "  OK    nada\n", expect: { code: 1 } },
    ["exit 0, esperado 1"]
  );

  // Afirmar contra as linhas WARN, e nao contra o output todo: uma linha `OK` com o mesmo
  // nome de ficheiro satisfazia o `includes` de um teste que espera reprovacao (`TP1`).
  caso(
    "surface-harness: includes nao e satisfeito por uma linha OK",
    { code: 1, out: "  OK    x.mjs alterado, sem marcas\n  WARN  outra coisa\n", expect: { code: 1, includes: ["x.mjs"] } },
    ['linhas WARN devia conter "x.mjs"']
  );

  caso(
    "surface-harness: excludes presente no output e reportado",
    { code: 0, out: "  OK    tudo\n  NOTE  proibido\n", expect: { code: 0, excludes: ["proibido"] } },
    ['output NAO devia conter "proibido"']
  );

  // O controlo da fixture (#379): com o objeto EMPACOTADO a forca, apagar o ficheiro solto nao faz nada — e o
  // `apagaObjetoSolto` tem de o dizer, em vez de deixar os casos da baseline ilegivel falharem (ou passarem)
  // como se fosse o verificador.
  {
    const { dir } = sandbox();
    let problemas;
    try {
      git(dir, ["repack", "-a", "-d", "-q"]);
      apagaObjetoSolto(dir, git(dir, ["rev-parse", "HEAD^{tree}"]));
      problemas = ["um objeto empacotado passou por apagado"];
    } catch (err) {
      problemas = /fixture invalida/.test(err.message) ? [] : [`rebentou por outra razao: ${err.message}`];
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
    registarResultado("surface-harness: a fixture deteta um objeto empacotado em vez de o dar por apagado (controlo, #379)", problemas);
  }

  // A guarda de uma entrada das CONTAGENS (#359), nos tres ramos. Chamada com dependencias fabricadas: o ramo
  // `falta` no template real reprovava esta suite, e o `skip` so se ve num derivado. Uma linha da tabela por caso,
  // com o esperado num objeto no fim: e a forma que a propria entrada conta (apagar uma linha avisa).
  {
    const ramo = (contagens, derivado) => {
      const visto = { corre: 0, falha: 0, log: 0 };
      const r = seAContagemExistir("x", "n", () => visto.corre++, {
        contagens, ler: () => null, derivado: () => derivado,
        falha: (_n, p) => { visto.falha += p.length; }, log: () => visto.log++,
      });
      return `${r} ${visto.corre}/${visto.falha}/${visto.log}`;
    };
    const X = [{ re: /\bx\(/, msg: "x" }];
    for (const [nome, contagens, derivado, { esperado }] of [
      ["presente: os testes correm", X, false, { esperado: "corre 1/0/0" }],
      ["presente num derivado: correm", X, true, { esperado: "corre 1/0/0" }],
      ["ausente no template: FAIL", [], false, { esperado: "falta 0/1/0" }],
      ["ausente num derivado: SKIP visivel", [], true, { esperado: "skip 0/0/1" }],
      ["outra msg com a mesma regex, no template: FAIL", [{ re: /\bx\(/, msg: "y" }], false, { esperado: "falta 0/1/0" }],
      // O neutro da varredura (`/(?!)/ || /.../`) muda a regex e mantem a msg: os casos tem de CORRER, para o
      // matarem — num derivado tambem (a 1.a versao chaveava pela regex, e ali o mutante sobrevivia em SKIP).
      ["a regex neutralizada pela varredura, num derivado: correm", [{ re: /(?!)/, msg: "x" }], true, { esperado: "corre 1/0/0" }],
      ["a regex neutralizada pela varredura, no template: correm", [{ re: /(?!)/, msg: "x" }], false, { esperado: "corre 1/0/0" }],
    ]) {
      const visto = ramo(contagens, derivado);
      registarResultado(`surface-harness: seAContagemExistir — ${nome}`, visto === esperado ? [] : [`esperado "${esperado}", deu "${visto}"`]);
    }
  }
}
