/**
 * Caminho tocado -> o que o verifica — {{PROJECT_NAME}}
 *
 * PORQUE VIVE AQUI: esta tabela nasceu dentro do `.claude/hooks/stop-verify.mjs`, que e
 * **so-Claude-Code**. Mas o conhecimento nao e dele: "mexer em X obriga a correr Y" vale para
 * qualquer agente, e o `mutation-sweep.mjs` — que so precisa de `node` — precisa do mesmo mapa
 * para derivar o que varrer a partir de um diff.
 *
 * Escrever um segundo mapa la dentro eram **dois campos a ter de concordar a mao, sem nada a
 * verifica-los** — o `TP1` que este repo documenta. Um mapa, dois consumidores.
 *
 * O COMANDO E DERIVADO e nao escrito: cada regra diz **o que verifica** (`verifica`) e, se for
 * caso disso, que fatia da varredura lhe corresponde (`only`). A string que o `stop-verify`
 * mostra sai daqui montada. Guardar as duas coisas lado a lado era a mesma duplicacao a entrar
 * outra vez, um nivel abaixo.
 *
 * CONFIGURAR AO PROJETO: e esta a tabela que um projeto derivado adapta. A **ordem importa** —
 * a primeira regra que casa e a que vale.
 */

const S = (n) => `.agent/scripts/${n}`;

export const SUITES = [
  { re: /^\.agent\/scripts\/guards\//, verifica: [S("test-guards.mjs")], only: "guards" },
  { re: /^\.agent\/scripts\/check-doc-versions\.mjs$/, verifica: [S("test-guards.mjs")], only: "check-doc" },
  { re: /^\.agent\/scripts\/check-backlog\.mjs$/, verifica: [S("test-backlog.mjs")], only: "check-backlog" },
  // O simulador do `/upgrade` e o motor dele. O motor vive em `lib/` e e o que ESCREVE por
  // cima dos ficheiros de um consumidor: mexer nele sem correr a suite e a divida mais cara
  // que este mapa pode deixar passar.
  {
    re: /^\.agent\/scripts\/(simulate-upgrade\.mjs|lib\/upgrade-mecanico\.mjs)$/,
    verifica: [S("test-simulate-upgrade.mjs")],
    only: "upgrade",
  },
  // O `surface-patterns.mjs` e os dois harnesses nao casavam nenhuma regra: mexer neles nao
  // gerava divida nenhuma, ao contrario de mexer no `check-test-surface.mjs`. E sao eles que
  // DECIDEM — as tabelas de padroes e o veredicto de ~280 testes.
  //
  // E a razao pela qual o varredor NAO deriva este mapa do `PARES`: estes tres nao sao alvos
  // nem suites, logo uma derivacao a partir do `PARES` ficava cega a eles. Ja aconteceu uma vez.
  { re: /^\.agent\/scripts\/(?:check-test-surface|surface-patterns|test-surface-harness)\.mjs$/, verifica: [S("test-test-surface.mjs")] },
  { re: /^\.agent\/scripts\/test-harness\.mjs$/, verifica: [S("test-guards.mjs")] },
  // O harness do simulador de `/upgrade`, extraido quando a suite passou as 500 linhas. Sem
  // esta regra nao casava nada e mexer nele nao gerava obrigacao nenhuma — a mesma classe do
  // `pares.mjs` acima, e um harness DECIDE o veredicto de toda a suite que o usa.
  { re: /^\.agent\/scripts\/test-upgrade-harness\.mjs$/, verifica: [S("test-simulate-upgrade.mjs")] },
  // O harness do verificador de bundles, extraido pela mesma catraca. E a `config/` do
  // projeto: mexer na configuracao obriga a correr quem a le.
  { re: /^\.agent\/scripts\/(test-bundle-harness\.mjs|config\/bundles\.mjs)$/, verifica: [S("test-bundle-sizes.mjs")] },
  { re: /^\.agent\/scripts\/check-bundle-sizes\.mjs$/, verifica: [S("test-bundle-sizes.mjs")] },
  { re: /^\.agent\/scripts\/(mutation-sweep\.mjs|test-sweep-harness\.mjs)$/, verifica: [S("test-mutation-sweep.mjs")] },
  // ESTE ficheiro, e a regra vem ANTES da generica de `lib/` — a ordem da tabela e a
  // semantica. Sem ela, mexer no mapa mandava correr a suite do registo, que nao o mede.
  { re: /^\.agent\/scripts\/(lib\/mapa-suites|test-mapa-suites)\.mjs$/, verifica: [S("test-mapa-suites.mjs")] },
  // O `pares.mjs` decide **o que a varredura mede de todo**, e caia na generica de `lib/` — ia
  // para o `test-registo.mjs`, que nao lhe toca (menciona `PARES` zero vezes; o
  // `test-mutation-sweep.mjs` menciona-o vinte). Exactamente a armadilha que a regra de cima
  // evita, escrita ali, e nao aplicada aqui.
  //
  // E mais grave do que parecer: uma entrada perdida no `PARES` nao produz vermelho nenhum —
  // a varredura passa a medir um conjunto mais pequeno e **reporta 100% sobre ele**.
  { re: /^\.agent\/scripts\/(lib\/pares|test-mutation-sweep)\.mjs$/, verifica: [S("test-mutation-sweep.mjs")] },
  // Os modulos `tests-*.mjs` nao casavam regra NENHUMA: edita-los nao gerava obrigacao de
  // verificacao. O `registo.mjs` falha fechado num modulo sem `registar()` e o CI descobre-os
  // todos, logo o custo era so nao haver aviso local — mas duas linhas fecham-no. O entry point
  // de cada um esta declarado no proprio ficheiro; estas regras espelham-no.
  { re: /^\.agent\/scripts\/tests-surface-[\w-]+\.mjs$/, verifica: [S("test-test-surface.mjs")] },
  { re: /^\.agent\/scripts\/tests-[\w-]+\.mjs$/, verifica: [S("test-guards.mjs")] },

  // Uma suite de entry point verifica-se A SI PROPRIA. Oito das dez nao casavam regra nenhuma:
  // mexer no `test-guards.mjs` — 245 testes — nao gerava obrigacao de o correr. Escapou porque
  // as regras foram escritas a pensar em "o que verifica ESTE ficheiro de producao", e uma suite
  // e produto de si mesma.
  //
  // Vem DEPOIS das especificas de proposito: o `test-mutation-sweep` e o `test-mapa-suites` ja
  // tem regra propria acima, e a ordem da tabela e a semantica.
  //
  // Apanhado pelo aviso dos ficheiros sem regra, um minuto depois de esse aviso deixar de ser
  // engolido — que e o argumento inteiro a favor de o tornar visivel.
  { re: /^\.agent\/scripts\/(test-[\w-]+)\.mjs$/, verifica: [], suiteDeSi: true },
  { re: /^\.agent\/scripts\/lib\//, verifica: [S("test-registo.mjs")] },
  { re: /^\.githooks\//, verifica: [S("test-commit-msg.mjs")] },
  { re: /^\.agent\/scripts\/simulate-derived\.mjs$/, verifica: [S("test-simulate-derived.mjs")] },
  { re: /^\.claude\/hooks\//, verifica: [".claude/hooks/tests/test-hooks.mjs"] },
  { re: /^\.agent\/(rules|workflows)\//, verifica: [S("check-doc-versions.mjs")] },
  // Qualquer `.md` na RAIZ de `.agent/` — hoje so o `BOOTSTRAP.md`, e ele e lido por tres
  // guards (12, 13 e 15). A regra e por pasta e nao pelo nome do ficheiro de proposito: escrita
  // a nome, um `.agent/QUALQUER.md` novo voltava a nao gerar obrigacao nenhuma, que e o mesmo
  // buraco outra vez.
  { re: /^\.agent\/[^/]+\.md$/, verifica: [S("check-doc-versions.mjs")] },
  { re: /^(CLAUDE|GEMINI|AGENTS|README)\.md$/, verifica: [S("check-doc-versions.mjs")] },
  // `src/docs/` e a casa da evidencia, e DOIS guards a varrem por inteiro, nao ficheiro a
  // ficheiro: o Guard 12 (`listDir("src/docs", ".md")`, numeros citados na prosa) e o Guard 15
  // (citacoes de anti-padroes que tem de resolver). Mexer aqui podia partir qualquer um deles e
  // nao gerava obrigacao nenhuma — o `--diff` apontou-o com `sem regra no mapa` ao ver o
  // `upgrade-why.md` a ser tocado.
  { re: /^src\/docs\/.+\.md$/, verifica: [S("check-doc-versions.mjs")] },
  { re: /^\.agent\/context\/backlog/, verifica: [S("check-backlog.mjs")] },
  { re: /^\.claude\/settings\.json$/, verifica: [S("test-guards.mjs")] },
];

/** A linha de comando de uma regra, montada a partir do que ela declara. */
export function comandoDe(regra, ficheiro) {
  // `suiteDeSi`: a regra nao sabe QUAL suite e, so que e ela propria. O ficheiro tocado e que
  // o diz — e por isso o comando so se pode montar com ele a mao.
  const alvos = regra.suiteDeSi ? [ficheiro] : regra.verifica;
  const partes = alvos.map((v) => `node ${v}`);
  if (regra.only) partes.push(`node ${S("mutation-sweep.mjs")} --only=${regra.only}`);
  return partes.join(" && ");
}

/** A primeira regra que casa `ficheiro`, ou `null`. A ORDEM da tabela e a semantica. */
export const regraDe = (ficheiro) => SUITES.find((s) => s.re.test(ficheiro)) ?? null;

/** Os caminhos que verificam `ficheiros`, sem repetidos, com os ficheiros que motivam cada um.
 *
 *  Devolve tambem os que **nao casaram nenhuma regra**: quem chama precisa deles para os poder
 *  mostrar. Engoli-los era transformar uma lacuna do mapa em silencio — e uma lacuna silenciosa
 *  num mapa de cobertura e pior do que nao ter mapa, porque parece cobertura. */
export function verificadoresDe(ficheiros) {
  const porVerificador = new Map(); // caminho -> ficheiros que o motivam
  const semRegra = [];
  for (const f of ficheiros) {
    const regra = regraDe(f);
    if (regra === null) {
      semRegra.push(f);
      continue;
    }
    for (const v of (regra.suiteDeSi ? [f] : regra.verifica)) {
      if (!porVerificador.has(v)) porVerificador.set(v, []);
      porVerificador.get(v).push(f);
    }
  }
  return { porVerificador, semRegra };
}
