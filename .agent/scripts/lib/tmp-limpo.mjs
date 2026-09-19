/**
 * Copias de trabalho em `tmpdir` que nao sobrevivem ao dono — {{PROJECT_NAME}}
 *
 * PORQUE EXISTE: os verificadores que copiam o repo (`mutation-sweep`, os dois simuladores)
 * deixam a copia para tras quando a corrida e interrompida. Nao e descuido: o cabecalho do
 * `mutation-sweep.mjs` ja explica que **"um handler nao apanha `SIGKILL` nem a morte do grupo
 * de processos"**, e foi por isso que a mutacao passou a acontecer numa copia — para uma morte
 * brutal nao poder sujar o repo. A contrapartida ficou por fazer: a copia fica la.
 *
 * Medido: `tmpdir` a **2,6 GB** depois de duas corridas interrompidas, e 1580 pastas ao todo.
 * O custo nao e so disco — uma acumulacao destas ja inflou uma medicao de tempo em **3x**,
 * porque o indexador do SO percorre tudo o que la esta.
 *
 * DESENHO: limpar no ARRANQUE, e nao a saida. E a unica altura que sobrevive a um `SIGKILL`:
 * a corrida seguinte varre o que a anterior deixou. Handlers de `exit`/`SIGINT` continuam a
 * fazer sentido para o caso normal, e nao sao substituidos — sao complementados.
 *
 * O QUE NAO SE PODE FAZER, e e o que torna isto menos trivial do que parece: apagar a cego.
 * **Duas corridas em paralelo aconteceram** (duas sessoes do agente, o mesmo comando, o mesmo
 * projeto, cada uma com a sua copia de 33 MB). Uma limpeza cega apagava a copia de trabalho de
 * uma corrida VIVA — deixava de ser limpeza e passava a ser uma forma nova de partir coisas, e
 * das piores: o sintoma apareceria como um ficheiro em falta a meio de uma medicao, longe da
 * causa.
 *
 * Por isso cada copia guarda o PID de quem a criou, e so se apaga o que ja nao tem dono.
 */

import { mkdtempSync, readdirSync, rmSync, statSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

/** O dono vai no NOME da pasta (`prefixo-<pid>-XXXXXX`), e nao num ficheiro la dentro.
 *
 *  A primeira versao escrevia um `.dono-pid` **dentro** da copia. Parecia inofensivo e nao era:
 *  tudo o que inspecciona a copia passou a ver um ficheiro a mais. O simulador deteta "o archive
 *  saiu vazio" com `readdirSync(dir).length === 0`, e essa condicao deixou de poder acontecer —
 *  um caminho de recusa desligado em silencio, que so apareceu porque tres suites ficaram
 *  vermelhas. Uma marca de gestao nao pertence ao que esta a ser medido.
 *
 *  No nome nao ha ficheiro nenhum a acrescentar, e o `mkdtemp` continua a garantir a unicidade. */
const DONO = /^(\d+)-/;

/** Quanto tempo uma copia SEM dono legivel no nome tem de ter para ser considerada abandonada.
 *  Existe para as copias deixadas por versoes anteriores a este modulo, cujo nome nao traz pid.
 *  Apagar uma copia sem dono **de imediato** fechava essa porta em cima de quem esta a nascer. */
const IDADE_SEM_DONO_MS = 60 * 60 * 1000;

/** O processo `pid` ainda existe?
 *
 *  `process.kill(pid, 0)` nao envia sinal nenhum: so pergunta. Lanca `ESRCH` quando nao ha
 *  processo — e `EPERM` quando existe mas nao e nosso, que para esta decisao conta como VIVO.
 *  Tratar `EPERM` como morto era apagar a copia de uma corrida de outro utilizador. */
export function processoVivo(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === "EPERM";
  }
}

/**
 * Cria uma copia de trabalho e declara-lhe o dono.
 *
 * @param {string} prefixo o prefixo do `mkdtemp` (ex: `"mutation-sweep-"`)
 * @returns {string} o caminho da copia
 */
export function criaTmp(prefixo) {
  // A copia sai EXACTAMENTE como sairia sem este modulo: nada e escrito la dentro.
  return mkdtempSync(join(tmpdir(), `${prefixo}${process.pid}-`));
}

/** Os prefixos que as SUITES usam para as suas fixtures.
 *
 *  PORQUE EXISTE: as fixtures de teste nao sao residuais — as 1580 pastas que ocuparam **2,5 GB**
 *  eram `sim-up-root`/`sim-up-cons` do `cenario()`, e nao copias de scripts. No caminho normal as
 *  suites limpam-nas; ficam quando uma corrida e interrompida, e a varredura de mutacao corre as
 *  suites dezenas de vezes, o que multiplica qualquer interrupcao.
 *
 *  PORQUE UMA LISTA, e nao uma chamada em cada suite: eram catorze sitios a lembrar-se, e um
 *  sitio que se esqueca nao da sinal nenhum. Uma lista a mao seria o `TP8` — por isso o
 *  `test-tmp-limpo.mjs` varre `tests/` em disco e REPROVA se aparecer um prefixo que nao esteja
 *  aqui. A lista e mantida a mao; a divergencia e que nao passa. */
export const PREFIXOS_DE_TESTE = [
  "sweep-test-",
  "bundle-test-",
  "surface-test-",
  "morto-test-",
  "sim-up-",
  "guard-test-",
  "guard-synth-",
  "commit-msg-test-",
  // `registo-test-` e nao `registo-`: a limpeza apaga pastas, e um prefixo que e uma PALAVRA
  // comum podia casar o que outra ferramenta escreveu em `tmpdir`. Os irmaos todos sao
  // compostos (`guard-test-`, `sweep-test-`); este era o unico elo fraco.
  "registo-test-",
  // Os DOIS da suite dos hooks (`.claude/hooks/tests/`). Faltavam desde sempre, e nao por
  // descuido de quem escreveu a lista: o teste que existe para ela nao envelhecer so varria
  // `.agent/scripts/tests/`, logo nunca viu esta pasta. Encontrados quando ele passou a varrer
  // as duas — e a prova estava em disco, uma `hook-test-*` de tres dias que ninguem limpava.
  //
  // `naorepo-` e composto e nao ambiguo: as fixtures que montam uma pasta que NAO e um repo git.
  "hook-test-",
  "naorepo-",
  "backlog-test-",
  "t-limpo-",
  "sim-test-",
  "fuga-2b-",
];

/**
 * Apaga as copias de `prefixo` que ja nao tem dono vivo. Corre-se no ARRANQUE.
 *
 * Nunca lanca: uma limpeza que rebente impede a corrida que ela devia servir, e o objectivo
 * dela e o disco, nao o veredicto. Quem chama fica a saber quantas apagou.
 *
 * @returns {number} quantas copias foram removidas
 */
export function limpaTmpsAntigos(prefixo, base = tmpdir()) {
  let apagadas = 0;
  let entradas;
  try {
    entradas = readdirSync(base);
  } catch {
    return 0;
  }
  for (const nome of entradas) {
    if (!nome.startsWith(prefixo)) continue;
    const dir = join(base, nome);
    try {
      if (!statSync(dir).isDirectory()) continue;
      const marca = DONO.exec(nome.slice(prefixo.length));
      if (marca === null) {
        // Sem dono legivel no nome: so a partir de uma idade. E residuo de uma versao anterior.
        if (Date.now() - statSync(dir).mtimeMs < IDADE_SEM_DONO_MS) continue;
      } else if (processoVivo(Number(marca[1]))) {
        continue; // tem dono e o dono esta vivo — e uma corrida a decorrer
      }
      rmSync(dir, { recursive: true, force: true });
      apagadas++;
    } catch {
      /* melhor esforco: uma copia que nao se consegue ler ou apagar nao trava a corrida */
    }
  }
  return apagadas;
}

/**
 * Varre as fixtures de teste abandonadas. Chamada pelos scripts no arranque: sao eles que
 * correm com frequencia, e a varredura de mutacao corre as suites dezenas de vezes.
 *
 * As fixtures de teste nao levam o PID no nome (nao passam pelo `criaTmp`), logo caem todas no
 * ramo da IDADE — o que e o comportamento certo: uma fixture com mais de uma hora nao pertence
 * a nenhuma corrida a decorrer, e uma recente pode pertencer a uma suite que esta a correr ao
 * lado. Apagar por PID exigia mudar catorze sitios; apagar por idade nao exige nenhum.
 *
 * @returns {number} quantas foram removidas
 */
export function limpaFixturesDeTeste(base = tmpdir()) {
  let n = 0;
  for (const p of PREFIXOS_DE_TESTE) n += limpaTmpsAntigos(p, base);
  return n;
}
