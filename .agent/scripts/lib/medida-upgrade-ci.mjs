/**
 * As notas da seccao 2b sobre a FORMA do `ci.yml` — {{PROJECT_NAME}}
 *
 * PORQUE EXISTE: sairam do `medida-upgrade.mjs` quando ele chegou as 499 linhas (#347, C0), e cada PR
 * estrutural do CI traz a sua nota (o #347 tem mais duas por vir). Sao as que dizem a um derivado que o
 * template mudou a forma do CI — um passo substituido, o passo em paralelo, os shards, os jobs da app num
 * só, o salto do push de um merge num privado — e que adotar e OPCIONAL.
 *
 * E PURO: recebe os textos ja lidos dos dois lados (o `medida-upgrade.mjs` le o disco), e so chama
 * `note()`. Os casos unitarios, nota a nota, vivem no dono `tests/tests-medida-upgrade-ci.mjs` (no
 * `test-guards`; a varredura corre-o primeiro, e cada `note()` desligada morre em milissegundos); os de ponta
 * a ponta, nas suites da 2b (`tests-medida-2b-config.mjs`, `test-simulate-upgrade.mjs`).
 */

/**
 * @param {object} o
 * @param {string} o.ciAqui   o `ci.yml` do projeto ("" se nao existe)
 * @param {string} o.ciLa     o `ci.yml` do template
 * @param {string} o.guardAqui o texto do job `guard-tests` do projeto
 * @param {string} o.guardLa   o mesmo, no template
 * @param {Record<string, string[]> | null} o.repetidos os comandos repetidos por job no projeto
 * @param {string[] | undefined} o.sweepAqui os comandos do job `sweep` do projeto
 * @param {(m: string) => void} o.note
 */
export function notasDaFormaDoCi({ ciAqui, ciLa, guardAqui, guardLa, repetidos, sweepAqui, note }) {
  // OS REPETIDOS no mesmo job (#337): um passo que o template SUBSTITUIU (as suites em paralelo, no lugar de um
  // passo por suite) trazido sem tirar os que substitui. Le-se DEPOIS de mexer no `ci.yml` (a 2b corre-se outra vez).
  for (const [job, cs] of Object.entries(repetidos ?? {})) {
    for (const c of cs) {
      note(
        `${c} corre 2x no job \`${job}\` deste projeto — um passo que o template SUBSTITUIU sai com os que substitui ` +
          "(#337: o `Suites — negative tests (em paralelo)` substitui um passo por suite; os antigos saem, e o commit leva o trailer `Test-Surface:`)"
      );
    }
  }
  // O PASSO EM PARALELO (#337), do lado de quem ainda nao o tem: os conjuntos de suites sao iguais (o despachante
  // esta no EXCLUIR), logo nada acima o via — e o derivado ficava em serie sem saber que havia escolha.
  // A linha do runner num `run: |` OU num `run:` de uma linha; nunca comentada.
  const emParalelo = (t) => /^[ \t]*(?:-[ \t]+)?(?:run:[ \t]*)?(?:exec[ \t]+)?node[ \t]+(?:\.\/)?\.agent\/scripts\/lib\/suites-em-paralelo\.mjs\b/m.test(t);
  if (emParalelo(guardLa) && !emParalelo(guardAqui)) {
    note(
      "o `guard-tests` do template corre as suites num so passo, em paralelo (`suites-em-paralelo.mjs`, #337), e o deste projeto nao — " +
        "OPCIONAL (so tempo: as mesmas suites); ao adotar, os passos de cada suite SAEM (senao correm 2x) e o commit leva o trailer `Test-Surface: .github/workflows/ci.yml — <porque>`"
    );
  }
  // Os SHARDS (#308): o comando da varredura e o mesmo dos dois lados, e nada acima o ve — um derivado
  // privado, para quem eles existem, ficava sem eles em silencio (leitor do #308). So a quem TEM o `sweep`.
  const reparte = (t) => /^[^#\n]*\bSWEEP_SHARD\b/m.test(t);
  if (reparte(ciLa) && !reparte(ciAqui) && sweepAqui?.some((c) => c.endsWith("mutation-sweep.mjs"))) {
    note("o `sweep` do template reparte a varredura completa em shards (`SWEEP_SHARD`, #308) e o deste projeto nao — trazer JUNTOS a matriz, o passo da varredura (o `env:` e o `nao_aplicavel`), o upload do relatorio e os passos do portao no `guard-gate` (a matriz sem o portao, o `check-test-surface` reprova-a)");
  }

  // Os jobs CURTOS da app (#347): num privado cada job e cobrado ao minuto, e o template juntou-os no `quality`.
  // Pelo menos DOIS dos tres ids: um `detect:` sozinho pode ser outra coisa (um `paths-filter`, leitura do PR A).
  const curtos = (t) => t.match(/^  (?:detect|unit-tests|security-audit):/gm)?.length ?? 0;
  // E o push de um merge num privado (#347, PR B): so o portao corre. "Ja tem" = o `if:` E o shell do portao (a meias, nota).
  const saltaMerge = (t) => /^[ \t]+if:.*committer\.username != 'web-flow'/m.test(t) && /"\$COMMITTER" = web-flow/.test(t);
  if (saltaMerge(ciLa) && !saltaMerge(ciAqui))
    note("o template salta o `Code Quality` e o `Guard Suites` no push de um merge num repo privado (#347) — OPCIONAL (so minutos); trazer JUNTOS os dois `if:` de job e o shell do portao `Guard Tests` que recalcula o salto e corre o `commit-msg` (os `if:` sem esse shell poem o push vermelho). O `Secret Scan` NAO salta (#372): um commit pela UI web no `main` tem o mesmo committer, e nunca era varrido");
  if (curtos(ciAqui) >= 2 && curtos(ciLa) === 0)
    note("o template corre a app (detect, testes unitarios, audit) como passos de UM job, `Code Quality` (#347), e o deste projeto em jobs separados — OPCIONAL (so minutos: num repo privado cada job e cobrado arredondado ao minuto); ao juntar, a maquinaria fica FORA desse job, e os checks `Detect Project`/`Unit Tests`/`Security Audit` saem dos obrigatorios");
}
