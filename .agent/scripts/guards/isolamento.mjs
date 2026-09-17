/**
 * Guard 19: as suites sao isoladas umas das outras — {{PROJECT_NAME}}
 *
 * PORQUE EXISTE: a varredura de mutacao passou a correr em paralelo, e o que torna isso seguro
 * nao e o codigo dela — e uma propriedade das SUITES: cada uma monta o seu diretorio temporario
 * com `mkdtempSync`, nenhuma abre portas, nenhuma escreve em `process.env`. Duas corridas ao
 * mesmo tempo nunca se veem.
 *
 * Essa propriedade era verdade **por acidente feliz**, e nada a verificava. Uma suite futura com
 * um caminho temporario fixo, ou com um servidor a ouvir numa porta, nao daria erro nenhum: daria
 * **resultados errados intermitentes** — e a licao aprendida seria "volta a correr", que e como
 * morre uma rede de seguranca. Foi medido o que a falta de isolamento custa: com uma copia
 * partilhada entre workers, 12% dos sitios saiam com veredicto errado, todos na direccao de
 * acusar cobertura que existe.
 *
 * O QUE MEDE, e porque sao estas tres:
 *   1. **Caminho temporario fixo** — `join(tmpdir(), "nome")` sem `mkdtempSync`. E o unico dos
 *      tres que ja quase aconteceu neste repo, e o mais barato de escrever por distraccao.
 *   2. **Portas e servidores** — duas corridas a pedir a mesma porta: uma delas morre com
 *      `EADDRINUSE`, e o vermelho nao tem nada a ver com o que se estava a medir.
 *   3. **Escrita em `process.env`** — estado global do processo. Entre suites em processos
 *      separados nao contamina, mas prende a suite a poder correr so num processo so.
 *
 * O QUE NAO MEDE, e fica dito para ninguem o ler como garantia: isto e uma verificacao
 * ESTATICA, por padrao de texto. Nao prova que duas corridas nao se pisam — prova que os tres
 * mecanismos conhecidos de as fazer pisarem-se nao estao escritos. Uma suite pode partir o
 * isolamento por vias que nenhum `grep` apanha (escrever num caminho do repo, por exemplo).
 */

/** As pastas onde vivem as suites e os seus modulos. Nao inclui `guards/` nem `lib/`: um guard
 *  nao corre em paralelo com nada — quem corre sao as suites que o exercitam. */
const PASTAS = [".agent/scripts", ".claude/hooks/tests"];

/** So o que corre como teste. Um `check-*.mjs` pode legitimamente abrir o que quiser. */
const EH_SUITE = /(?:^|\/)(?:test-[\w-]+|tests-[\w-]+)\.mjs$/;

/** Cada regra traz o seu contra-exemplo na mensagem: um aviso que so diz "errado" obriga quem o
 *  le a adivinhar o certo, e nessa altura a saida mais rapida e desligar o aviso. */
const REGRAS = [
  {
    // O perigo e CONSTRUIR um caminho (`join(tmpdir(), ...)`) sem criar o diretorio: duas
    // corridas escrevem no mesmo sitio. O `mkdtempSync` gera um sufixo aleatorio e resolve-o.
    //
    // Exigir o `join(` nao e enfraquecer: um `tmpdir()` sozinho (`base = tmpdir()`, um valor
    // por omissao que vai para o `mkdtempSync` tres linhas abaixo) nao e caminho nenhum, e a
    // primeira versao desta regra acusava-o. Um guard que acusa quem lhe obedece e um guard
    // que se desliga — e este existe para nao ser desligado.
    nome: "caminho temporario fixo",
    casa: (l) => /\bjoin\([^)]*\btmpdir\(\)/.test(l) && !/\bmkdtempSync\b/.test(l),
    remedio: "usar `mkdtempSync(join(tmpdir(), \"prefixo-\"))` — um caminho fixo e partilhado entre corridas",
  },
  {
    nome: "porta ou servidor",
    casa: (l) => /\b(?:createServer|\.listen)\s*\(/.test(l),
    remedio: "duas corridas pedem a mesma porta e uma morre com EADDRINUSE, por uma razao que nada tem a ver com o que se media",
  },
  {
    // ATRIBUICAO, nao leitura: `process.env.CI` lido e legitimo e comum. O que prende a suite
    // a um unico processo e escrever la.
    nome: "escrita em process.env",
    casa: (l) => /\bprocess\.env\.\w+\s*(?:\|\||\?\?)?=(?!=)/.test(l),
    remedio: "passar o valor por argumento ou por ficheiro da fixture — `process.env` e estado global do processo",
  },
];

/** Linhas que nao sao codigo deste ficheiro: comentarios, e o texto dentro de literais.
 *
 *  As fixtures deste repo SAO strings com codigo la dentro (`'if (process.env.X) ...'`), e esse
 *  codigo corre noutro processo, num sandbox proprio — nao e este ficheiro a abrir uma porta.
 *  Sem esta exclusao o guard acusava as proprias fixtures que existem para testar o isolamento,
 *  e um guard que acusa quem lhe obedece e um guard que se desliga. */
const IGNORAR = /^\s*(?:\/\/|\*|\/\*)/;
const semLiterais = (l) => l.replace(/`(?:[^`\\]|\\.)*`|'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"/g, '""');

/**
 * @returns {number} guards executados
 */
export function guardIsolamento({ read, warn, ok, skip, listTree }) {
  const ficheiros = PASTAS.flatMap((p) => listTree(p, ".mjs") ?? []).filter((f) => EH_SUITE.test(f));
  if (ficheiros.length === 0) {
    // Um projeto derivado pode ter removido a maquinaria. "Nao encontrei" tem de o DIZER, senao
    // e um zero lido como "nao ha problemas" — o `TP2`, dentro do guard escrito contra ele.
    skip(`Guard 19 (isolamento das suites) — sem suites em ${PASTAS.join(" nem ")}`);
    return 1;
  }

  let problemas = 0;
  for (const f of ficheiros.sort()) {
    const src = read(f);
    if (src === null) continue; // listado e ilegivel: outro guard trata disso
    src.split("\n").forEach((linha, i) => {
      if (IGNORAR.test(linha)) return;
      const codigo = semLiterais(linha);
      for (const r of REGRAS) {
        if (!r.casa(codigo)) continue;
        warn(`${f}:${i + 1} — ${r.nome}: ${r.remedio}`);
        problemas++;
      }
    });
  }

  if (problemas === 0) {
    ok(`Guard 19: ${ficheiros.length} suites isoladas (tmpdir proprio, sem portas, sem escrita em env)`);
  }
  return 1;
}
