/**
 * A negacao da fronteira diz QUE condicao disparou — {{PROJECT_NAME}}
 *
 * NAO e um entry point: o `test-hooks.mjs` descobre este modulo e chama `registar()`.
 *
 * PORQUE EXISTE: a decisao de `lib/fronteira.mjs` combina varias condicoes com alcances
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
import { porqueAltera, razaoDe, RAZAO_OPACA, RAZAO_FRONTEIRA } from "../lib/fronteira.mjs";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.error(
    "tests-fronteira-porque.mjs nao e um entry point: nao corre testes por si.\n" +
      "Correr `node .claude/hooks/tests/test-hooks.mjs`."
  );
  process.exit(1);
}

/** Entry point a que este modulo pertence. */
export const entryPoint = "test-hooks.mjs";

/** Um comando por condicao, e o rotulo que ele tem de produzir. Nasceu com os oito ramos da
 *  decisao do #101 — um caso a menos e um ramo que ninguem exercita, e um rotulo que pode estar
 *  errado sem nada o denunciar — e o #307 juntou os de opacidade e os blocos de shell. */
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
  // O oitavo, do #101: o `find` esta na LEITURA e destroi. Sem este caso, o ramo novo
  // nascia sem ninguem a exercita-lo — que e exactamente o que este ficheiro existe para
  // nao deixar acontecer.
  ["find que escreve", "find .claude/hooks/ -delete", "find-que-escreve"],
  // A fronteira so aparece dentro de aspas — e texto — MAS o comando executa esse texto.
  ["citado mas executado", 'sh -c "cat .claude/settings.json > /tmp/x"', "citado-mas-executado"],
  // Os dois medidos do #307: nenhum escrevia, e os dois levavam a razao de escrita.
  ["ciclo de shell", "for t in .claude/hooks/tests/test-*.mjs; do node $t; done", "verbo-nao-e-leitura:for"],
  // O sufixo `:inline` (#336): a razao do codigo inline leva a nota do `jq`, e a dos outros opacos nao.
  // Quem RECEBE codigo no ramo visivel tem rotulo seu (auditoria do PR a do #336): a razao e opaca, sem a nota do `jq`.
  ["recebe codigo pelo pipe", "cat .claude/hooks/x.mjs | bash", "recebe-codigo"],
  ["interpretador inline que so le","python3 -c \"print(open('.claude/settings.json').read())\"", "citado-mas-executado:inline"],
  ["bloco que so le", "{ cat .claude/settings.json; }", "verbo-nao-e-leitura:{"],
  ["ciclo que le da fronteira", "while read f; do cat $f; done < .claude/hooks/x", "verbo-nao-e-leitura:done"],
  // E o contrario (leituras do #307): um bloco de shell com uma escrita A VISTA leva a razao de
  // escrita — a de opacidade aconselha a reescrever o comando, e aqui o hook viu o que ele faz.
  ["bloco que redireciona", "{ echo a; echo b; } > .claude/settings.json", "redireciona"],
  ["bloco que apaga", "{ rm -rf .claude/hooks; }", "verbo-nao-e-leitura:rm"],
  ["ciclo que apaga", "while rm .claude/hooks/x; do :; done", "verbo-nao-e-leitura:rm"],
  ["ciclo que redireciona", "for f in a; do echo x; done > .claude/hooks/x.mjs", "redireciona"],
  ["apaga na lista do ciclo", "for f in $(rm -rf .claude/hooks); do :; done", "verbo-nao-e-leitura:rm"],
  ["ciclo que apaga com cabecas", "while ! sudo rm .claude/hooks/x; do :; done", "verbo-nao-e-leitura:rm"],
  // Uma por condicao de escrita dentro do bloco: com o rotulo escolhido por condicao, cada braco
  // sem caso era uma razao que podia mudar sem nada o denunciar.
  ["bloco que edita no sitio", "{ sed -i '' s/a/b/ .claude/settings.json; }", "edita-no-sitio"],
  // O `git`/`find` que escreve, num segmento seu OU colado a palavra-chave do bloco: desde o #317 o
  // rotulo e o de escrita nos dois (antes, colado ao `{`, levava a razao de opacidade).
  ["bloco com git que escreve", "{ cat .claude/settings.json; git rm .claude/hooks/x; }", "git-que-escreve"],
  ["bloco com find que escreve", "{ cat .claude/settings.json; find .claude/hooks -delete; }", "find-que-escreve"],
  ["git colado ao bloco", "{ git rm .claude/hooks/x; }", "git-que-escreve"],
  ["find colado ao bloco", "{ find .claude/hooks -delete; }", "find-que-escreve"],
  ["git colado ao while", "while git rm .claude/hooks/x; do :; done", "git-que-escreve"],
  // A variavel de um `for` e o sujeito de um `case` sao TEXTO: um `rm` ali nao e um comando.
  ["rm como variavel do for", "for rm in .claude/hooks/*; do cat $rm; done", "verbo-nao-e-leitura:for"],
  ["rm no sujeito do case", "case rm in x) cat .claude/hooks/x;; esac", "verbo-nao-e-leitura:case"],
  // Os limites (2.a passagem das leituras): na duvida, a razao e a de opacidade. Uma cabeca ou um
  // `!` nao sao o verbo, e um `case` nao se abre.
  ["bloco que le com cabeca", "{ sudo cat .claude/settings.json; }", "verbo-nao-e-leitura:{"],
  ["ciclo que le negado", "while ! grep -q ok .claude/hooks/x; do sleep 1; done", "verbo-nao-e-leitura:while"],
  ["bloco com builtin", "{ cd .claude/hooks && ls; }", "verbo-nao-e-leitura:{"],
  ["case fica opaco", "case $x in a) rm .claude/hooks/x;; esac", "verbo-nao-e-leitura:case"],
];

/** A razao que cada rotulo leva (#307): a de escrita so quando o hook VIU uma escrita; nas outras,
 *  so nao conseguiu provar que o comando le. Comparado por uma frase de cada, que a outra nao tem. */
const OPACA = "nao consegue provar que este comando so LE";
const ESCRITA = "nao se altera por `Bash`";
const RAZAO_DO_ROTULO = {
  "verbo-nao-e-leitura:cp": ESCRITA,
  "edita-no-sitio": ESCRITA,
  "codigo-inline": OPACA,
  "wrapper-opaco": OPACA,
  redireciona: ESCRITA,
  "git-que-escreve": ESCRITA,
  "find-que-escreve": ESCRITA,
  "citado-mas-executado": OPACA,
  "citado-mas-executado:inline": OPACA,
  "recebe-codigo": OPACA,
  "verbo-nao-e-leitura:for": OPACA,
  "verbo-nao-e-leitura:rm": ESCRITA,
  "verbo-nao-e-leitura:{": OPACA,
  "verbo-nao-e-leitura:done": OPACA,
  "verbo-nao-e-leitura:while": OPACA,
  "verbo-nao-e-leitura:case": OPACA,
};

export function registar({ test, corre, repo, eq, contem }) {
  // --- Ponta a ponta: o rotulo CHEGA a mensagem -----------------------------
  for (const [nome, comando, rotulo] of CONDICOES) {
    test(`porque: ${nome} -> ${rotulo}`, () => {
      const d = repo();
      try {
        const r = corre({ tool_input: { command: comando }, cwd: d });
        eq(r.decisao, "deny", `"${comando}" tinha de ser negado`);
        contem(r.razao, `condicao: ${rotulo}`);
        const certa = RAZAO_DO_ROTULO[rotulo];
        contem(r.razao, certa);
        eq(r.razao.includes(certa === OPACA ? ESCRITA : OPACA), false, `"${comando}" levou as duas razoes`);
      } finally {
        rmSync(d, { recursive: true, force: true });
      }
    });
  }

  // --- O CONTRA-CASO, e sem ele os sete acima eram satisfeitos por um hook que negasse
  // sempre e dissesse sempre a mesma coisa: um comando permitido nao leva rotulo nenhum,
  // porque nao leva negacao nenhuma.
  test("porque: leitura legitima da fronteira nao e negada nem rotulada", () => {
    const d = repo();
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

  // --- Os rotulos que nenhum comando acima produz (#307) ---------------------
  // A tabela de cima so cobre os que tem um comando curto; estes tambem sao de opacidade, e os
  // verbos que escrevem de facto (`rm`, `mv`) tem de manter a razao de escrita.
  test("porque: a razao segue a condicao em todos os rotulos de opacidade e nos verbos que escrevem", () => {
    const esperado = {
      "erro-ao-analisar": RAZAO_OPACA, "execucao-adiada": RAZAO_OPACA, "substituicoes-demais": RAZAO_OPACA,
      "verbo-nao-e-leitura:done": RAZAO_OPACA, "verbo-nao-e-leitura:{": RAZAO_OPACA, "verbo-nao-e-leitura:while": RAZAO_OPACA,
      "verbo-nao-e-leitura:rm": RAZAO_FRONTEIRA, "verbo-nao-e-leitura:mv": RAZAO_FRONTEIRA,
      "git-que-executa": RAZAO_FRONTEIRA,
    };
    const errados = Object.entries(esperado).filter(([c, r]) => razaoDe(c) !== r).map(([c]) => c);
    eq(errados.length, 0, `razao errada para: ${errados.join(", ")}`);
  });
}
