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
 * OS MODULOS `tests-*.mjs` NAO CASAM REGRA, e e deliberado. Reportado duas rondas seguidas
 * (T-J, observacao secundaria): mexer num deles nao gera obrigacao de verificar nada. Fica
 * assim, e a razao e que as tres saidas sao piores do que a lacuna:
 *   - uma regra unica para o `test-guards.mjs` manda **3 dos 14** para uma suite que nao os
 *     mede (o `tests-upgrade-motor` e os dois `tests-surface-*` pertencem a outras) — que e
 *     exactamente o defeito que a regra do `pares.mjs` aqui em cima existe para evitar;
 *   - a lista a mao e uma segunda copia do `export const entryPoint` que cada modulo ja
 *     declara (`TP8`), e envelhece: cresceu de 9 para 12 entre a ronda 4 e hoje;
 *   - deriva-la obrigava este mapa a LER ficheiros. Ele e puro de proposito — `comandoDe()`
 *     recebe o caminho e nao o conteudo — e e importado por um hook que tem de ser barato.
 * O que se perde e so o aviso LOCAL: a rede mecanica ja existe, porque o `lib/registo.mjs`
 * falha fechado num modulo sem `registar()` e o CI corre os entry points que os descobrem
 * todos. Custo `M` para um lembrete — nao se paga. Escrito para nao voltar a ser levantado.
 *
 * CONFIGURAR AO PROJETO: e esta a tabela que um projeto derivado adapta. A **ordem importa** —
 * a primeira regra que casa e a que vale.
 */

// As suites vivem em `tests/`, os harnesses em `tests/harness/`, e os verificadores na raiz.
// O helper decide pelo NOME em vez de obrigar cada regra a escrever a pasta: assim uma suite que
// mude de sitio muda aqui, num sitio so.
const S = (n) => (/^tests?-/.test(n) ? `.agent/scripts/tests/${/harness\.mjs$/.test(n) ? "harness/" : ""}${n}` : `.agent/scripts/${n}`);

export const SUITES = [
  { re: /^\.agent\/scripts\/guards\//, verifica: [S("test-guards.mjs")], only: "guards" },
  { re: /^\.agent\/scripts\/check-doc-versions\.mjs$/, verifica: [S("test-guards.mjs")], only: "check-doc" },
  { re: /^\.agent\/scripts\/check-backlog\.mjs$/, verifica: [S("test-backlog.mjs")], only: "check-backlog" },
  // O simulador do `/upgrade` e o motor dele. O motor vive em `lib/` e e o que ESCREVE por
  // cima dos ficheiros de um consumidor: mexer nele sem correr a suite e a divida mais cara
  // que este mapa pode deixar passar.
  // A `medida-upgrade.mjs` e a `projeto-de-ontem.mjs` entram aqui e nao na generica de `lib/`:
  // a primeira e o instrumento que responde a seccao 2b (dos DOIS lados, template e derivado),
  // a segunda e a fixture do modo template. Quem lhes mexe tem de correr esta suite, que e a
  // unica que as exercita.
  {
    re: /^\.agent\/scripts\/(simulate-upgrade\.mjs|lib\/(?:upgrade-mecanico|medida-upgrade|projeto-de-ontem)\.mjs)$/,
    verifica: [S("test-simulate-upgrade.mjs")],
    only: "upgrade",
  },
  // O `surface-patterns.mjs` e os dois harnesses nao casavam nenhuma regra: mexer neles nao
  // gerava divida nenhuma, ao contrario de mexer no `check-test-surface.mjs`. E sao eles que
  // DECIDEM — as tabelas de padroes e o veredicto de ~280 testes.
  //
  // E a razao pela qual o varredor NAO deriva este mapa do `PARES`: estes tres nao sao alvos
  // nem suites, logo uma derivacao a partir do `PARES` ficava cega a eles. Ja aconteceu uma vez.
  { re: /^\.agent\/scripts\/(check-test-surface|tests\/harness\/test-surface-harness)\.mjs$/, verifica: [S("test-test-surface.mjs")] },
  // O harness dos doc guards e o construtor de fixture que o Guard 21 obriga a ter. O segundo
  // nao casa a convencao `test-*` (nao e uma suite, e um construtor), logo precisa de nome
  // proprio aqui — sem ele, mexer-lhe nao gerava obrigacao nenhuma e ele DECIDE se uma fixture
  // esta bem montada.
  { re: /^\.agent\/scripts\/tests\/harness\/(test-harness|recongelar-contexto|projeto-derivado)\.mjs$/, verifica: [S("test-guards.mjs")] },
  // O harness do simulador de `/upgrade`, extraido quando a suite passou as 500 linhas. Sem
  // esta regra nao casava nada e mexer nele nao gerava obrigacao nenhuma — a mesma classe do
  // `pares.mjs` acima, e um harness DECIDE o veredicto de toda a suite que o usa.
  { re: /^\.agent\/scripts\/tests\/harness\/test-upgrade-harness\.mjs$/, verifica: [S("test-simulate-upgrade.mjs")] },
  // O harness do verificador de bundles, extraido pela mesma catraca. E a `config/` do
  // projeto: mexer na configuracao obriga a correr quem a le.
  { re: /^\.agent\/scripts\/(tests\/harness\/test-bundle-harness\.mjs|config\/bundles\.mjs)$/, verifica: [S("test-bundle-sizes.mjs")] },
  { re: /^\.agent\/scripts\/(check-codigo-morto|tests\/test-codigo-morto)\.mjs$/, verifica: [S("test-codigo-morto.mjs")] },
  // A limpeza de `tmpdir` decide se uma copia de trabalho e apagada — e uma decisao errada aqui
  // apaga a copia de uma corrida VIVA. Regra propria, antes da generica de `lib/`, porque a
  // suite dela e a unica que exercita o contra-caso (o processo vivo que nao se toca).
  { re: /^\.agent\/scripts\/(lib\/tmp-limpo|tests\/test-tmp-limpo)\.mjs$/, verifica: [S("test-tmp-limpo.mjs")] },
  { re: /^\.agent\/scripts\/check-bundle-sizes\.mjs$/, verifica: [S("test-bundle-sizes.mjs")] },
  { re: /^\.agent\/scripts\/(mutation-sweep\.mjs|tests\/harness\/test-sweep-harness\.mjs)$/, verifica: [S("test-mutation-sweep.mjs")] },
  // ESTE ficheiro, e a regra vem ANTES da generica de `lib/` — a ordem da tabela e a
  // semantica. Sem ela, mexer no mapa mandava correr a suite do registo, que nao o mede.
  { re: /^\.agent\/scripts\/(lib\/mapa-suites|tests\/test-mapa-suites)\.mjs$/, verifica: [S("test-mapa-suites.mjs")] },
  // O `pares.mjs` decide **o que a varredura mede de todo**, e caia na generica de `lib/` — ia
  // para o `test-registo.mjs`, que nao lhe toca (menciona `PARES` zero vezes; o
  // `test-mutation-sweep.mjs` menciona-o vinte). Exactamente a armadilha que a regra de cima
  // evita, escrita ali, e nao aplicada aqui.
  //
  // E mais grave do que parecer: uma entrada perdida no `PARES` nao produz vermelho nenhum —
  // a varredura passa a medir um conjunto mais pequeno e **reporta 100% sobre ele**.
  { re: /^\.agent\/scripts\/(lib\/pares|lib\/varredura-paralela|tests\/test-mutation-sweep)\.mjs$/, verifica: [S("test-mutation-sweep.mjs")] },
  // Os modulos `tests-*.mjs` nao casavam regra NENHUMA: edita-los nao gerava obrigacao de
  // verificacao. O `registo.mjs` falha fechado num modulo sem `registar()` e o CI descobre-os
  // todos, logo o custo era so nao haver aviso local — mas duas linhas fecham-no. O entry point
  // de cada um esta declarado no proprio ficheiro; estas regras espelham-no.
  { re: /^\.agent\/scripts\/(tests\/tests-surface-[\w-]+|lib\/surface-patterns)\.mjs$/, verifica: [S("test-test-surface.mjs")] },
  // Os modulos `tests-*` do simulador de /upgrade: declaram outro entry point, e a regra generica
  // abaixo mandava-os para o `test-guards`. Apanhado pelo teste do mapa que compara a regra com o
  // `entryPoint` que o proprio modulo declara — uma regra que manda para a suite errada nao da
  // erro nenhum, so deixa de gerar a obrigacao certa.
  { re: /^\.agent\/scripts\/tests\/tests-(upgrade|medida)-[\w-]+\.mjs$/, verifica: [S("test-simulate-upgrade.mjs")], only: "upgrade" },
  { re: /^\.agent\/scripts\/tests\/tests-[\w-]+\.mjs$/, verifica: [S("test-guards.mjs")] },

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
  { re: /^\.agent\/scripts\/tests\/(test-[\w-]+)\.mjs$/, verifica: [], suiteDeSi: true },
  // ANTES da regra generica de `lib/`: a ordem da tabela e a semantica, e o `lib/` generico
  // manda tudo para a suite do registo — que nao toca nestes dois.
  { re: /^\.agent\/scripts\/(simulate-derived|lib\/patch|lib\/derivado|lib\/ficheiros)\.mjs$/, verifica: [S("test-simulate-derived.mjs")] },
  { re: /^\.agent\/scripts\/lib\//, verifica: [S("test-registo.mjs")] },
  { re: /^\.githooks\//, verifica: [S("test-commit-msg.mjs")] },
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
  // O backlog verifica-se pelos DOIS: o `check-backlog.mjs` recalcula os contadores, e o
  // Guard 21 (dentro do `check-doc-versions.mjs`) exige que no template ele esteja por estrear.
  // Sem o segundo, editar o backlog aqui nao gerava obrigacao de correr quem o congela.
  { re: /^\.agent\/context\/backlog/, verifica: [S("check-backlog.mjs"), S("check-doc-versions.mjs")] },
  // **Se acrescentares um verificador a regra da pasta abaixo, acrescenta-o tambem na do
  // backlog acima.** A primeira regra que casa vence (`regraDe`), logo a do backlog nao herda
  // nada desta — e uma divergencia entre as duas nao produz erro nenhum, so deixa de gerar a
  // obrigacao certa para os dois ficheiros do backlog.
  //
  // Os OUTROS cinco ficheiros de contexto nao casavam regra NENHUMA — `implementation_plan.md`,
  // `session.md`, `task.md`, `walkthrough.md`, `decisions.md`. Tocar-lhes nao gerava obrigacao de
  // verificar coisa nenhuma, e foi exactamente num deles que se escreveram 189 linhas que nada
  // travou. A regra e por PASTA e nao por nome (`TP9`): um `.agent/context/X.md` novo tem de
  // casar a partir do primeiro dia, que e quando o Guard 21 tem de o ver.
  { re: /^\.agent\/context\//, verifica: [S("check-doc-versions.mjs")] },
  { re: /^\.claude\/settings\.json$/, verifica: [S("test-guards.mjs")] },
];

/** A linha de comando de uma regra, montada a partir do que ela declara. */
export function comandoDe(regra, ficheiro) {
  // O CASO EM QUE NAO HA COMANDO A MONTAR, dito em vez de interpolado.
  //
  // O segundo parametro so e preciso nas regras `suiteDeSi`, e nasceu depois delas. Um
  // consumidor que tenha ficado com a chamada antiga — `comandoDe(regra)` — produzia
  // literalmente `node undefined` como instrucao de verificacao. Um `undefined` interpolado
  // nao da erro: da uma ordem inutil, com ar de ordem. Medido num derivado real.
  //
  // PORQUE NAO LANCA, que era a forma obvia: o unico consumidor em producao e o hook
  // `stop-verify`, e ele tem um `catch` de ultimo recurso que sai `0` em silencio — de
  // proposito, para um hook avariado nunca bloquear trabalho legitimo. Lancar aqui fazia UMA
  // regra mal chamada engolir o aviso INTEIRO do fim do turno, incluindo a divida dos outros
  // ficheiros. Trocava uma instrucao inutil por nenhuma instrucao, que e pior (`TP2`).
  //
  // A string comeca por `#` para nao poder ser copiada como comando, e diz o remedio.
  if (regra.suiteDeSi && !ficheiro) {
    return "# ERRO: regra `suiteDeSi` sem o caminho tocado — quem chama tem de usar `comandoDe(regra, ficheiro)`";
  }
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
