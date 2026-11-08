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
import { PLANO_DO_SWEEP, PLANO_JOB_DO_PORTAO, NAO_CANCELADO, VERIFICACOES_DA_APP } from "./marcas-yaml.mjs";
import { concurrencyDeTopo, problemasDaConcurrency } from "./concurrency-ci.mjs";
import { jobsDe, passosDe } from "./estrutura-workflow.mjs";

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
  // O PACOTE de um job (`src/docs/exemplos/ci-sem-maquinaria.yml`, #472/#477): o projeto troca o CI de 10 jobs por um
  // job `ci`, e a maquinaria por um `guard-tests` com `needs: ci` que so arranca num PR que a toca. As notas que mandam
  // trazer pecas do portao (o plano, o salto do merge, o titulo no `Guard Tests`) reconstruiam o CI que ele tira: nele
  // nao se aplicam. O sinal e POSITIVO — um CI completo de qualquer versao (tambem o de antes do `guard-gate`, #308)
  // continua a receber as notas; o template nunca teve um job `ci` (`git log -G "^  ci:"`). So a forma do exemplo
  // (`needs: ci` ou `needs: [ci]`): um `needs:` em lista de bloco, ou com mais jobs, nao e reconhecido, e as notas
  // voltam (o lado seguro).
  const pacote = /^  ci:[ \t]*(?:#.*)?$/m.test(ciAqui) && /^[ \t]+needs:[ \t]*\[?[ \t]*ci[ \t]*\]?[ \t]*(?:#.*)?$/m.test(guardAqui);
  if (pacote)
    note(
      "CI do pacote de um job (`src/docs/exemplos/ci-sem-maquinaria.yml`): as notas da forma do CI de 10 jobs (o plano da varredura, o salto do merge, o titulo no portao) nao se aplicam — " +
        "a varredura de mutacao fica no CI do template, de proposito; do `ci.yml` do template trazer SO a lista de suites do `guard-tests` e os passos do exemplo novo, e NAO os jobs `quality`, `sweep`, `guard-gate` nem `secret-scan` (`src/docs/upgrade-derivados-privados.md` §6)"
    );
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
    note("o `sweep` do template reparte a varredura completa em shards (`SWEEP_SHARD`, #308) e o deste projeto nao — trazer JUNTOS a matriz, o passo da varredura (o `env:`), o upload do relatorio e os passos do portao no `guard-gate` (a matriz sem o portao, o `check-test-surface` reprova-a)");
  }
  // O PLANO da varredura (#347, C2): os shards so arrancam quando o plano da base diz que se aplica. "Ja tem" = o `if:`
  // do `sweep` na forma EXACTA (a da isencao, importada: uma terceira copia envelhecia, `TP8`) E o portao a ler o
  // output do job. A meias — so o `if:`, ou so o portao — tambem da a nota: e o caso que fica vermelho.
  const temPlano = (t) => t.split(/\r?\n/).some((l) => PLANO_DO_SWEEP.test(l)) && t.split(/\r?\n/).some((l) => PLANO_JOB_DO_PORTAO.test(l));
  if (!pacote && temPlano(ciLa) && !temPlano(ciAqui))
    note(
      "o template so arranca os shards da varredura quando o plano da base diz que ela se aplica (#347, C2) e o deste projeto nao — OPCIONAL (so minutos: num repo privado cada shard de um PR sem maquinaria e um minuto cobrado); " +
        "trazer JUNTOS o passo `Plano da varredura` e o `outputs:` do `guard-tests`, o `if:` do `sweep` e o shell do portao `Guard Tests`, " +
        "e TIRAR do passo da varredura o corpo antigo (o `tocados=`, o `grep` e o `nao_aplicavel`): o plano le o diff sem renomeacoes e o `grep` com elas, discordam num PR que move ou renomeia um ficheiro da maquinaria, e o portao reprova. " +
        "O `if:` tem de ser a forma EXACTA do template: outra forma e uma marca de enfraquecimento que o `check-test-surface` reprova sem trailer que a aceite. " +
        "O `if:` sem o shell do portao poe VERMELHO cada PR sem maquinaria (o portao antigo le um `sweep` saltado num PR como \"nao mediu\"); " +
        "e o shell sem o passo e o `if:` poe VERMELHO cada PR (le um `PLANO_JOB` vazio, ou um `sweep` que nao saltou). " +
        "Se este projeto tirou o `if:` do `sweep` para varrer tambem em `push`, o C2 acaba com isso (o plano e so de PR): manter a sua forma, ou aceitar a varredura so em PR"
    );

  // Os jobs CURTOS da app (#347): num privado cada job e cobrado ao minuto, e o template juntou-os no `quality`.
  // Pelo menos DOIS dos tres ids: um `detect:` sozinho pode ser outra coisa (um `paths-filter`, leitura do PR A).
  const curtos = (t) => t.match(/^  (?:detect|unit-tests|security-audit):/gm)?.length ?? 0;
  // E o push de um merge num privado (#347, PR B): so o portao corre. "Ja tem" = o `if:` E o shell do portao (a meias, nota).
  const saltaMerge = (t) => /^[ \t]+if:.*committer\.username != 'web-flow'/m.test(t) && /"\$COMMITTER" = web-flow/.test(t);
  if (!pacote && saltaMerge(ciLa) && !saltaMerge(ciAqui))
    note("o template salta o `Code Quality` e o `Guard Suites` no push de um merge num repo privado (#347) — OPCIONAL (so minutos); trazer JUNTOS os dois `if:` de job e o shell do portao `Guard Tests` que recalcula o salto e corre o `commit-msg` (os `if:` sem esse shell poem o push vermelho). O shell do portao de hoje traz TAMBEM o plano da varredura (C2, a nota dele): adotam-se os dois, ou copia-se o shell sem o bloco do plano (o `if [ \"$EVENTO\" = pull_request ]` antes do `varredura-shards`) — senao cada PR fica vermelho. O `Secret Scan` NAO salta (#372): um commit pela UI web no `main` tem o mesmo committer, e nunca era varrido");
  // O TITULO do PR e a mensagem FINAL (#394): o hook novo verifica o prefixo, mas o `ci.yml` e do projeto. "Ja tem" = o
  // `PR_TITULO` do evento E tantos `COMMIT_MSG_FINAL: "1"` como o template (o passo e o portao); a meias, a nota.
  const titulo = (t) => /^[ \t]*PR_TITULO:[ \t]*\$\{\{[ \t]*github\.event\.pull_request\.title[ \t]*\}\}/m.test(t);
  const finais = (t) => t.match(/^[ \t]*COMMIT_MSG_FINAL:[ \t]*"1"/gm)?.length ?? 0;
  if (!pacote && titulo(ciLa) && (!titulo(ciAqui) || finais(ciAqui) < finais(ciLa)))
    note(
      "o template verifica o TITULO do PR (num squash, a 1.a linha do commit no `main`) e le a mensagem final no CI (#394), e o deste projeto nao — " +
        "trazer JUNTOS o passo `Mensagens de commit` (o nome novo, o `env:` com `COMMIT_MSG_FINAL` e `PR_TITULO`, e o bloco do titulo no fim do `run:`) " +
        "e o `COMMIT_MSG_FINAL: \"1\"` no `env:` do portao `Guard Tests`; o commit leva o trailer `Test-Surface: .github/workflows/ci.yml — <porque>`. " +
        "Sem eles o hook verifica os commits, mas um titulo `Update foo` so reprova no push para o `main`, ja imutavel"
    );
  // O `concurrency:` de TOPO (#427): e do projeto, e o `/upgrade` nao o reescreve. Le-se so o bloco de topo (o de um job,
  // um `deploy` com `cancel-in-progress: true`, e legitimo). Sem bloco nada se agrupa nem se cancela: nao ha nota.
  const blocoAqui = concurrencyDeTopo(ciAqui);
  const blocoLa = concurrencyDeTopo(ciLa);
  const faltam = blocoAqui === null ? [] : problemasDaConcurrency(blocoAqui);
  if (blocoLa !== null && problemasDaConcurrency(blocoLa).length === 0 && faltam.length)
    note(
      "o `concurrency:` do template da a cada push o seu grupo (`github.sha`) e so cancela num PR (`cancel-in-progress: ${{ github.event_name == 'pull_request' }}`, #427), e o deste projeto nao — " +
        `trocar as duas linhas: ${faltam.join("; ")}`
    );
  // As verificacoes da app correm TODAS numa corrida vermelha (#428): passo a passo, pelo nome (o leitor de jobs e passos
  // do `estrutura-workflow.mjs`), so as que o template tem e o projeto tambem (um passo tirado nao e "a meias"). Nota a
  // quem tem uma sem o `if:`, ou o `if:` sem o gate do `Install` (corria sem `node_modules`: a adocao a meias perigosa).
  const verificacoes = (t) => {
    const q = jobsDe(t).find((j) => j.id === "quality");
    const ps = q ? passosDe(q.ls, q.todas) : null;
    if (!ps) return null;
    const m = new Map();
    for (const p of ps) {
      const nome = p.cru.map((l) => /^[ \t]*(?:-[ \t]+)?name[ \t]*:[ \t]*["']?(.*?)["']?[ \t]*$/.exec(l)?.[1]).find(Boolean);
      if (VERIFICACOES_DA_APP.includes(nome)) m.set(nome, { comIf: p.cru.some((l) => NAO_CANCELADO.test(l)), comGate: p.cru.some((l) => /steps\.install\.conclusion/.test(l)) });
    }
    return m;
  };
  const vLa = verificacoes(ciLa);
  const vAqui = verificacoes(ciAqui);
  const doTemplate = [...(vLa ?? new Map())].filter(([, v]) => v.comIf).map(([n]) => n);
  const semIf = doTemplate.filter((n) => vAqui?.has(n) && !vAqui.get(n).comIf);
  const semGate = doTemplate.filter((n) => n !== "Audit" && vAqui?.get(n)?.comIf && !vAqui.get(n).comGate);
  if (semIf.length || semGate.length)
    note(
      "o template corre todas as verificacoes do `Code Quality` numa corrida vermelha (`if: ${{ !cancelled() }}` em cada uma, #428), e o deste projeto nao " +
        `(${[semIf.length ? `sem o \`if:\`: ${semIf.join(", ")}` : "", semGate.length ? `com o \`if:\` e sem o gate do \`Install\`: ${semGate.join(", ")}` : ""].filter(Boolean).join("; ")}) — ` +
        "OPCIONAL (so minutos: ves todas as falhas numa corrida); trazer JUNTOS o `if:`, o `id: install` no `Install` e o `case \"$INSTALOU\"` em cada verificacao (sem ele, com o `Install` vermelho, as verificacoes correm sem `node_modules`). " +
        "So a forma EXACTA, e so nestas verificacoes do job `quality` do `ci.yml`, nao conta para o `check-test-surface`: outra forma e uma marca de enfraquecimento que reprova sem trailer que a aceite"
    );
  if (curtos(ciAqui) >= 2 && curtos(ciLa) === 0)
    note("o template corre a app (detect, testes unitarios, audit) como passos de UM job, `Code Quality` (#347), e o deste projeto em jobs separados — OPCIONAL (so minutos: num repo privado cada job e cobrado arredondado ao minuto); ao juntar, a maquinaria fica FORA desse job, e os checks `Detect Project`/`Unit Tests`/`Security Audit` saem dos obrigatorios");
}
