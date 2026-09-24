/**
 * A negacao da fronteira diz QUE condicao disparou — {{PROJECT_NAME}}
 *
 * NAO e um entry point: o `test-hooks.mjs` descobre este modulo e chama `registar()`.
 *
 * PORQUE EXISTE: a decisao de `lib/fronteira.mjs` combina SETE condicoes com alcances
 * diferentes — umas por segmento, outras sobre o comando inteiro — e bastava uma disparar para
 * o comando ser negado com uma razao generica. Quem levava com a negacao nao sabia qual.
 *
 * O CUSTO MEDIDO: numa sessao real, CINCO leituras foram negadas. Duas bloquearam passos que o
 * proprio processo exige — correr a suite dos hooks, e publicar um comentario sobre o assunto.
 * Um agente que nao perceba a negacao ou desliga o hook (e perde a proteccao toda) ou salta a
 * verificacao; investigar e a opcao menos provavel das tres.
 *
 * E POR ISSO QUE OS TESTES SAO PONTA A PONTA e nao unitarios sobre `porqueAltera()`: o que
 * interessa nao e a funcao devolver o rotulo, e ele CHEGAR a mensagem que a pessoa le. Um
 * rotulo correcto que nao saia do hook nao diagnostica nada.
 *
 * A LICAO QUE ESTE MODULO NAO PODE ESQUECER: as cinco ocorrencias foram reconstruidas depois, e
 * TRES das reconstrucoes devolveram `null` — ou seja, pela regra actual deviam ter passado. Os
 * comandos reais eram outros. Nao ha diagnostico por reconstrucao: so instrumentando o sitio
 * onde a negacao acontece. Os casos abaixo sao sinteticos e assumem-se como tal; servem para
 * provar que o mecanismo reporta, nao para explicar aquelas cinco.
 */
import { pathToFileURL } from "url";
import { rmSync } from "fs";
import { porqueAltera } from "../lib/fronteira.mjs";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.error(
    "tests-fronteira-porque.mjs nao e um entry point: nao corre testes por si.\n" +
      "Correr `node .claude/hooks/tests/test-hooks.mjs`."
  );
  process.exit(1);
}

/** Entry point a que este modulo pertence. */
export const entryPoint = "test-hooks.mjs";

/** Um comando por condicao, e o rotulo que ele tem de produzir. Sao SETE porque sao sete os
 *  ramos da decisao — um caso a menos e um ramo que ninguem exercita, e um rotulo que pode
 *  estar errado sem nada o denunciar. */
const CONDICOES = [
  // O verbo do segmento que toca a fronteira nao esta na lista de leitura. E o caso comum, e o
  // rotulo inclui o verbo porque e ele que se discute quando a negacao e indevida.
  ["verbo que nao le", "cp /tmp/x .claude/hooks/stop-verify.mjs", "verbo-nao-e-leitura:cp"],
  // `sed -i` le e escreve no mesmo comando: o verbo esta na lista de leitura e mesmo assim
  // escreve. Sem ramo proprio, este passava por ser `sed`.
  ["edita no sitio", "sed -i '' s/a/b/ .claude/settings.json", "edita-no-sitio"],
  // `codigo-inline` dispara quando o interpretador inline esta NO SEGMENTO que toca a fronteira.
  //
  // ESTE CASO MUDOU. Era `cat <fronteira>; node -e "..."` — o `-e` noutro segmento — e isso
  // passou a ser PERMITIDO: o alcance do `inline` alinhou-se ao do verbo, porque negava leitura
  // legitima (o `-c` de um `grep` a jusante era lido como sendo do `node`). Ver
  // `tests-fronteira-alcance.mjs`.
  ["codigo inline no segmento que toca", 'cat /tmp/x; node -e "console.log(1)" .claude/hooks/y.mjs', "codigo-inline"],
  // O `opaco` NAO se alinhou, e a assimetria e deliberada: com `|`, o segmento que toca a
  // fronteira **alimenta** o consumidor a jusante, e quem apaga nao tem o caminho escrito. Por
  // isso este caso continua a ser noutro segmento, e continua a negar.
  ["wrapper opaco noutro segmento", 'cat .claude/hooks/lib/fronteira.mjs; eval "echo ok"', "wrapper-opaco"],
  // Redireccao para dentro da fronteira. O verbo pode ser de leitura — o que escreve e o `>`.
  ["redireciona", "echo '{}' > .claude/settings.json", "redireciona"],
  // `git` esta na lista de leitura, e tem sub-verbos que apagam. Foi medido a remover um hook
  // obsoleto, minutos depois de a verificacao ser escrita.
  ["git que escreve", "git rm .claude/hooks/stop-verify.mjs", "git-que-escreve"],
  // A fronteira so aparece dentro de aspas — e texto — MAS o comando executa esse texto.
  ["citado mas executado", 'sh -c "cat .claude/settings.json > /tmp/x"', "citado-mas-executado"],
];

export function registar({ test, corre, repo, eq, contem }) {
  // --- Ponta a ponta: o rotulo CHEGA a mensagem -----------------------------
  for (const [nome, comando, rotulo] of CONDICOES) {
    test(`porque: ${nome} -> ${rotulo}`, () => {
      const d = repo("main");
      try {
        const r = corre({ tool_input: { command: comando }, cwd: d });
        eq(r.decisao, "deny", `"${comando}" tinha de ser negado`);
        contem(r.razao, `condicao: ${rotulo}`);
      } finally {
        rmSync(d, { recursive: true, force: true });
      }
    });
  }

  // --- O CONTRA-CASO, e sem ele os sete acima eram satisfeitos por um hook que negasse
  // sempre e dissesse sempre a mesma coisa: um comando permitido nao leva rotulo nenhum,
  // porque nao leva negacao nenhuma.
  test("porque: leitura legitima da fronteira nao e negada nem rotulada", () => {
    const d = repo("main");
    try {
      const r = corre({ tool_input: { command: "grep -n LEITURA .claude/hooks/lib/fronteira.mjs" }, cwd: d });
      eq(r.decisao, "allow", "um grep da fronteira e leitura e tem de passar");
      eq(r.razao, "", "um comando permitido nao pode trazer razao nenhuma");
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  // --- O veredicto NAO mudou, e e a condicao para isto ser seguro ------------
  // `alteraFronteira()` passou a derivar de `porqueAltera()`. Se a derivacao divergir, a
  // fronteira passa a negar coisas diferentes — e este ticket prometia nao mexer nisso.
  test("porque: o veredicto concorda com `alteraFronteira` em todos os casos", () => {
    const problemas = [];
    for (const [, comando, rotulo] of CONDICOES) {
      if (porqueAltera(comando) !== rotulo) problemas.push(`${comando}: deu ${porqueAltera(comando)}, esperava ${rotulo}`);
    }
    if (porqueAltera("grep -n x .claude/hooks/lib/fronteira.mjs") !== null) problemas.push("um grep legitimo passou a ser negado");
    eq(problemas.length, 0, problemas.join(" | "));
  });
}
