/**
 * Os casos dos MODOS da linha de comando do `test-mutation-sweep.mjs`: o `--list` (que nao engole o veredicto), o
 * `--diff` (varrer so o que o branch tocou), e a baseline corrida uma vez por suite — {{PROJECT_NAME}}
 *
 * Sairam do `test-mutation-sweep.mjs` quando ele chegou as 500 linhas (o Guard 17, #400). NAO e uma suite nem um modulo
 * descoberto: a suite importa-o e chama cada funcao NO SITIO de onde o bloco saiu, com o `test` dela (os contadores sao
 * dela). Sem sitios de recusa: so regista casos.
 */
import { readFileSync } from "fs";
import { join } from "path";

/** @param {Function} test  o `test` do `test-sweep-harness.mjs` */
export function casosDoList(test) {
  // --- `--list` nao pode engolir o veredicto (achado da Fase 4) -----------------
  // Os testes cobriam cada flag isolada; a COMBINACAO saia 0 a reportar um problema.
  test("--list com --only sem correspondencia continua a reprovar", {}, ["--list", "--only=nao-existe"], {
    code: 1,
    includes: ["nao casa nenhum alvo"],
  });

  test("--list com SEM SUITE continua a reprovar", { suite: null }, ["--list"], {
    code: 1,
    includes: ["SEM SUITE"],
  });
}

/** @param {Function} test  o `test` do `test-sweep-harness.mjs` */
export function casosDoDiff(test) {
  // --- `--diff`: varrer so o que este branch tocou -----------------------------------
  // E o ESPELHO, nao o portao. Cada caso aqui mede um dos quatro comportamentos que a decisao
  // do `/grill` fixou, e o quarto e o contra-caso sem o qual os outros nao valem nada.

  // Sem repo nao ha base, e sem base nao ha medicao. Cair para "varrer tudo" ou para "varrer
  // nada" seria escolher por conta propria o que medir — e uma medicao ausente nao e um OK.
  test("--diff sem baseline resoluvel REPROVA, em vez de escolher por si", {}, ["--diff"], {
    code: 1,
    includes: ["SEM BASELINE", "uma medicao ausente nao e um OK"],
  });

  // Nada a varrer e resposta LEGITIMA — mas nunca silenciosa. O que nao casou vai para o ecra:
  // se um deles DEVIA levar a um alvo, a lacuna do mapa fica visivel em vez de absorvida.
  test("--diff sem alvos LISTA o que nao casou e sai 0", { comGit: true, alterado: "README-x.md" }, ["--diff"], {
    code: 0,
    includes: ["Nada a varrer", "sem regra no mapa: README-x.md", "falta-lhe regra em lib/mapa-suites.mjs"],
  });

  // O caso util: um alvo tocado -> varre-se esse.
  test("--diff com um alvo tocado varre esse alvo", { comGit: true, alterado: ".agent/scripts/fake-check.mjs" }, ["--diff", "--list"], {
    code: 0,
    includes: ["fake-check.mjs"],
  });

  // O CONTRA-CASO, e e ele que faz os outros valerem: **sem flags varre tudo**. O `ci.yml`
  // invoca sem flags, e se o diff passasse a ser o default o portao virava parcial sem ninguem
  // ter decidido isso. Este teste e o que impede essa alteracao de passar despercebida.
  test("SEM flags varre tudo, mesmo num repo com diff", { comGit: true, parSao: true, alterado: ".agent/scripts/fake-check.mjs" }, ["--list"], {
    code: 0,
    includes: ["fake-check.mjs", "fake-check-2.mjs"],
  });

  // --- A baseline corre uma vez por SUITE, nao por alvo ------------------------
  // Optimizacao que so vale se ACONTECER, e o resultado nao a denuncia: a cobertura sai igual
  // com ou sem ela. O que muda e quantas vezes a suite corre — por isso a fixture tem dois alvos
  // a partilhar UMA suite, e a suite conta as suas proprias corridas num ficheiro.
  //
  // Com dedup: 1 baseline + 2 mutacoes = 3. Sem dedup: 2 baselines + 2 mutacoes = 4. No repo real
  // sao 28 alvos para 10 suites distintas — 18 corridas a medir o que ja tinha sido medido, das
  // quais 10 do `test-guards.mjs` a ~28s cada.
  test("a baseline corre UMA vez por suite partilhada, nao uma por alvo", { contaCorridas: true }, [], {
    code: 0,
    includes: ["Cobertura de mutacao completa — 2 sitios medidos"],
    extra: (dir) => {
      const n = readFileSync(join(dir, "corridas.log"), "utf8").trim().split("\n").length;
      return n === 3 ? [] : [`a suite correu ${n} vezes, esperado 3 (1 baseline + 2 mutacoes)`];
    },
  });
}
