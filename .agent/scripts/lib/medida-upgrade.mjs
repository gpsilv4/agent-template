/**
 * Medir o impacto de um upgrade numa arvore — {{PROJECT_NAME}}
 *
 * PORQUE EXISTE: a pergunta da seccao 2b do `/upgrade` — *"o que e que este upgrade faz
 * reprovar num projeto que estava verde?"* — poe-se dos DOIS lados. Do lado do template,
 * contra um consumidor montado a partir de uma tag; do lado de um projeto derivado, contra a
 * arvore que ele tem hoje. A pergunta e a mesma, logo o instrumento tambem tem de ser: duas
 * copias disto a concordar a mao eram o `TP8`, e a que estivesse do lado menos corrido
 * envelhecia sem ninguem reparar.
 *
 * O QUE DA:
 *   - `comandosDoCI(raiz)` — os verificadores que os jobs `guard-tests` e `sweep` correm, DERIVADOS do
 *     `ci.yml` dessa raiz e nao escritos a mao;
 *   - `correBateria({dir, comandos})` — corre-os dentro de uma copia e devolve os que reprovam;
 *   - `adapta2bGuard17({dir, fatal})` — a unica adaptacao da 2b que e mecanica.
 *
 * A RAIZ E PARAMETRO e nao uma constante: quem mede do lado do template quer os comandos do
 * template; quem mede dentro de um derivado quer, para o ANTES, os que o projeto corre hoje, e
 * para o DEPOIS os que o template novo traz. Cravar a raiz aqui obrigava um dos dois lados a
 * medir a lista do outro — e a medir bem uma coisa que ninguem lhe perguntou.
 */

import { execFileSync } from "child_process";
import { readFileSync, readdirSync, writeFileSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { pathToFileURL } from "url";
import { leOuNull } from "./ficheiros.mjs";
import { andaFicheiros, aplicaUpgradeMecanico } from "./upgrade-mecanico.mjs";
import { imprimeAntesDeAprovar } from "./saida-upgrade.mjs";
import { agentesDesatualizados } from "./agentes.mjs";
import { regrasEmFalta } from "./permissoes.mjs";
import { fronteiraDa2b, validaFronteiraEm } from "./fronteira-upgrade.mjs";

/** Os comandos que o consumidor corre, DERIVADOS dos jobs `guard-tests` e `sweep` do `ci.yml` de `raiz` —
 *  e nao escritos a mao. Uma lista a mao mede menos a cada suite nova, em silencio.
 *  Devolve `null` quando o job nao aparece: "nao derivei nada" e "nao ha nada" pedem accoes
 *  diferentes, e quem chama e que decide (`TP2`). */
export function comandosDoCI(raiz) {
  const porJob = comandosPorJob(raiz);
  return porJob && [...new Set(Object.values(porJob).flat())];
}

/** Os jobs que a 2b le: o `guard-tests`, e o `sweep` (#308), para onde a varredura saiu dele. */
export const JOBS_DA_2B = ["guard-tests", "sweep"];

/** Os comandos de `comandosDoCI`, POR JOB (#308): `{ "guard-tests": [...], sweep: [...] }`, ou `null`
 *  sem `guard-tests`. A uniao nao chega: um derivado com a varredura ainda no `guard-tests` dava o
 *  mesmo conjunto que o template com ela no `sweep` — e a 2b nao via que ela corre duas vezes, ou
 *  fora do check que a protecao exige (leitura independente do #308). */
export function comandosPorJob(raiz) {
  const jobs = textosDosJobs(raiz);
  return jobs && Object.fromEntries(JOBS_DA_2B.map((n) => [n, comandosDe(jobs[n])]));
}

/** O texto de cada job da 2b, ou `null` sem `guard-tests`. */
function textosDosJobs(raiz) {
  const ci = leOuNull(join(raiz, ".github/workflows/ci.yml"));
  // So ate ao job SEGUINTE: o `split` sozinho levava todos os jobs que vem depois.
  // Um comentario na linha do job (`  guard-tests:   # suites`) nao a desfaz — nem a do job seguinte,
  // senao os comandos dele eram atribuidos a este (leitura independente do #308).
  const doJob = (nome) => ci?.split(new RegExp(`^  ${nome}:[ \t]*(?:#.*)?$`, "m"))[1]?.split(/^  [\w-]+:[ \t]*(?:#.*)?$/m)[0];
  if (!doJob("guard-tests")) return null;
  return Object.fromEntries(JOBS_DA_2B.map((n) => [n, doJob(n) ?? ""]));
}

/** As SUITES (`tests/test-*.mjs`) que aparecem MAIS DE UMA VEZ no mesmo job: `{ "guard-tests": [...], sweep: [...] }`,
 *  ou `null` sem `guard-tests` (#337). O passo das suites em paralelo SUBSTITUI um passo por suite: um
 *  derivado que o traga e deixe os antigos corre cada suite duas vezes, verde — e nada mais o via (o
 *  `comandosDe` tira os repetidos, e a contagem da superficie SOBE em vez de descer). So as suites: a varredura
 *  aparece duas vezes no `sweep` do template DE PROPOSITO, em dois ramos de um `if` (completa / `--diff`). */
export function repetidosPorJob(raiz) {
  const jobs = textosDosJobs(raiz);
  if (!jobs) return null;
  return Object.fromEntries(
    JOBS_DA_2B.map((n) => {
      const todos = nodesDe(jobs[n]).filter((c) => /(?:^|\/)tests\/test-[\w-]+\.mjs$/.test(c));
      return [n, [...new Set(todos.filter((c, i) => todos.indexOf(c) !== i))]];
    })
  );
}

/** Os `node X.mjs` dos `run:` de um job (o texto dele), sem repetidos e sem os EXCLUIDOS. */
function comandosDe(job) {
  // EXCLUSOES, cada uma por uma razao concreta:
  //  - `check-test-surface`: precisa de um `.git` com historia, e um archive nao traz nenhum;
  //  - os dois simuladores: correriam DENTRO da copia e voltariam a copiar — recursao;
  //  - o `suites-em-paralelo` (#337): e um DESPACHANTE, e as suites que ele corre estao nas linhas seguintes
  //    e leem-se uma a uma. Sozinho, sem argumentos, so sabe reprovar.
  const EXCLUIR = ["check-test-surface", "simulate-derived", "simulate-upgrade", "suites-em-paralelo"];
  return [...new Set(nodesDe(job))].filter((c) => !EXCLUIR.some((x) => c.includes(x)));
}

/** TODOS os `node X.mjs` dos `run:` de um job, pela ordem e com repetidos. */
function nodesDe(job) {
  // LINHA A LINHA, e as COMENTADAS ficam de fora. Um passo comentado no `ci.yml` e uma
  // DECISAO do projeto — desligou-o —, e o regex corrido sobre o texto inteiro nao distinguia
  // `run:` de `#   run:`. Num projeto real isso poe a medicao a correr a varredura de mutacao
  // que o projeto tinha desligado: **duas vezes**, ~14 min cada, com as suites aninhadas la
  // dentro. Medido num consumidor com nove releases de atraso; no template nunca apareceu,
  // porque o `ci.yml` dele nao tem nenhuma linha `run:` comentada no `guard-tests`.
  //
  // So conta o `#` que ABRE a linha: `run: node x.mjs  # nota` e um passo activo com um
  // comentario ao lado, e excluir a linha inteira ai era trocar um falso positivo por um
  // falso negativo — a medicao passaria a nao correr um passo que o projeto corre.
  //
  // E os blocos `run: |` CONTAM (#184). A varredura de mutacao do template vive num, dentro de um
  // `if`, e so o `run: node X` numa linha era lido: a NOTE escrita para o caso das seis rondas com
  // a varredura comentada nunca a nomeava. Uma linha pertence ao bloco enquanto estiver mais
  // indentada do que o `run:` que o abre.
  const NODE = /(?:^|[\s;&|(])node\s+(\S+\.mjs)/g;
  const achados = [];
  let bloco = -1;
  for (const l of job.split("\n")) {
    if (/^\s*#/.test(l)) continue;
    const ind = l.match(/^\s*/)[0].length;
    if (bloco >= 0 && (l.trim() === "" || ind > bloco)) {
      for (const m of l.matchAll(NODE)) achados.push(m[1]);
      continue;
    }
    bloco = -1;
    const run = l.match(/^\s*(?:-\s+)?run:\s*(.*)$/);
    if (!run) continue;
    if (/^[|>][+-]?\s*$/.test(run[1])) bloco = ind;
    else for (const m of run[1].matchAll(NODE)) achados.push(m[1]);
  }
  return achados;
}

/** Os que a BATERIA nao corre, embora contem para a comparacao com o template. A varredura de
 *  mutacao demora minutos (dezenas num derivado privado) e mede as suites, nao o projeto: corre-la
 *  duas vezes por medicao era o custo que a 2b existe para poupar. Fica de fora DITO, nunca calado. */
//  Pelo NOME do ficheiro, e nao por substring: `includes("mutation-sweep")` tirava tambem o
//  `test-mutation-sweep.mjs`, que e uma suite rapida e tem de correr.
const SO_COMPARAR = ["mutation-sweep.mjs"];
export const correNaBateria = (c) => !SO_COMPARAR.includes(c.split("/").pop());

/** Uma linha de aviso, sem a de RESUMO: `WARNING: ha divergencias...` casava `^WARN` e, numa
 *  comparacao linha a linha, passaria a contar como um achado. */
const AVISO = /^\s*(WARN|FAIL)\b/;

/**
 * Corre a bateria dentro de `dir`. Devolve, dos que sairam `!= 0`, **todas** as linhas de aviso —
 * um par por linha. Guardava so a primeira, e a 2b de um derivado real mostrou 2 linhas onde a
 * bateria tinha 19 (#175): entre as escondidas estava um guard proprio do projeto desligado.
 * Um comando que reprova sem nenhuma linha de aviso (um crash) da `exit N`, para nao sumir.
 *
 * Um comando AUSENTE na copia entra na lista em vez de ser ignorado: e quase sempre um
 * verificador que o template novo traz e o projeto ainda nao tem, e ler isso como "passou" e
 * o `TP2` — zero resultados lidos como zero problemas.
 *
 * @returns {Array<[string, string]>} pares `[comando, linha]`, um por linha de aviso
 */
export function correBateria({ dir, comandos }) {
  const falhados = [];
  for (const c of comandos) {
    if (!existsSync(join(dir, c))) {
      falhados.push([c, "ausente na copia"]);
      continue;
    }
    try {
      execFileSync(process.execPath, [join(dir, c)], { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    } catch (err) {
      const out = (err.stdout ?? "") + (err.stderr ?? "");
      const linhas = out.split("\n").filter((l) => AVISO.test(l)).map((l) => l.trim());
      for (const linha of linhas.length ? linhas : [`exit ${err.status ?? 1}`]) falhados.push([c, linha]);
    }
  }
  return falhados;
}

/**
 * O que reprova DEPOIS e nao reprovava ANTES, **linha a linha** e com repeticoes (#175).
 *
 * O "antes" era um conjunto de COMANDOS: um comando que ja reprovasse por uma razao escondia
 * tudo o que passasse a reprovar por outras. Agora subtrai-se o multiconjunto das linhas.
 *
 * A comparacao e pela linha EXACTA. Normalizar os numeros esconderia `existem 31 -> 33`, que e
 * uma regressao; quando a unica diferenca sao numeros, a linha sai na mesma, ANOTADA. Ruido
 * aceita-se, supressao nao. O limite que fica: a mesma linha antes e depois, com uma causa nova,
 * continua escondida — e a classe que o `upgrade-why.md` ja admite.
 *
 * @returns {Array<[string, string, string]>} `[comando, linha, nota]`
 */
export function novasLinhas(antes, depois) {
  const chave = (c, l) => `${c}\0${l}`;
  const sobra = new Map();
  for (const [c, l] of antes) sobra.set(chave(c, l), (sobra.get(chave(c, l)) ?? 0) + 1);
  const soNumeros = (l) => l.replace(/\d+/g, "N");
  const novos = [];
  for (const [c, l] of depois) {
    const n = sobra.get(chave(c, l)) ?? 0;
    if (n > 0) {
      sobra.set(chave(c, l), n - 1);
      continue;
    }
    const parecida = antes.find(([ca, la]) => ca === c && soNumeros(la) === soNumeros(l));
    novos.push([c, l, parecida ? `   (mudou so em numeros; antes: ${parecida[1]})` : ""]);
  }
  return novos;
}

/**
 * A versao do template de onde ESTE projeto saiu, lida de `.agent/.template-version`.
 *
 * O campo util e o `commit:` — um SHA, que o `git` do template resolve exactamente como
 * resolve uma tag. O `versao:` so existe quando foi o bootstrap a escrever a marca; o
 * `/upgrade` escreve `template/commit/data`, sem ele. Por isso o `commit` e o primario e o
 * `versao` a alternativa, e nao ao contrario.
 *
 * `desconhecido` nao e uma versao: e o que o BOOTSTRAP.md manda escrever quando nao conseguiu
 * apurar o SHA, e e exactamente o caso do **Modo B** do `/upgrade` — julgamento, nao mecanica.
 * Devolver isso como se fosse uma baseline media contra um ponto que nao existe.
 *
 * Devolve OS DOIS, por ordem, e nao so o primeiro: com "Use this template" o `commit:` e um SHA
 * do PROJETO, que o template nao tem — e o `versao:` e que o resolve (M6 do #195). Quem chama
 * escolhe o primeiro que existe no template, como o bash da seccao 1 do `/upgrade`.
 *
 * @returns {string[]} as referencias candidatas — vazio quando nao ha marca utilizavel
 */
export function versaoDeOrigem(raiz) {
  const marca = leOuNull(join(raiz, ".agent/.template-version"));
  if (marca === null) return [];
  const refs = [];
  for (const campo of ["commit", "versao"]) {
    const v = new RegExp(`^${campo}:\\s*(\\S+)\\s*$`, "m").exec(marca)?.[1];
    if (v && v !== "desconhecido" && v !== "desconhecida") refs.push(v);
  }
  return refs;
}

/**
 * "Limiar apertado" (Guard 17): os ficheiros do projeto ja acima do limite entram em `TETOS`
 * com a contagem do dia da migracao. E catraca, nao isencao: podem encolher, crescer reprova.
 * Mais do que uma adaptacao, isto verifica que a receita escrita na 2b FUNCIONA.
 *
 * @returns {{congelados: number, limite: number}}
 */
export async function adapta2bGuard17({ dir, fatal }) {
  const relGuard = ".agent/scripts/guards/sizes.mjs";
  const p = join(dir, relGuard);
  const c = leOuNull(p);
  if (c === null) fatal(`${relGuard} nao existe na copia — nao consigo aplicar a adaptacao do Guard 17`);
  // A contagem e o limite vem do GUARD que esta adaptacao serve, e nao de uma copia local.
  // Reimplementados aqui eram duas copias da mesma regra a ter de concordar a mao — e nao
  // concordavam: esta contava sem aparar o newline final, logo media +1 em todos os ficheiros e
  // congelava em `TETOS` ficheiros que o guard considera dentro do limite. Nunca deu sinal, ate
  // um ficheiro cair em EXACTAMENTE 500.
  //
  // DINAMICO e nao estatico, e depois do guarda acima: um `import` no topo tornava a ausencia do
  // guard um crash no arranque, e e precisamente essa ausencia que a linha anterior existe para
  // reportar com uma razao. E le-se o guard do CONSUMIDOR, que e quem tem a palavra sobre o
  // proprio limite.
  const { contaLinhas, LIMITE } = await import(pathToFileURL(p).href);
  const grandes = [];
  for (const base of [".agent/scripts", ".claude/hooks"]) {
    andaFicheiros(join(dir, base), (sub, nome) => {
      if (!nome.endsWith(".mjs")) return;
      const rel = `${base}/${sub}`;
      const n = contaLinhas(readFileSync(join(dir, rel), "utf8"));
      if (n > LIMITE && !c.includes(`"${rel}"`)) grandes.push([rel, n]);
    });
  }
  if (grandes.length) {
    const entradas = grandes.map(([rel, n]) => `  ${JSON.stringify(rel)}: ${n},`).join("\n");
    writeFileSync(p, c.replace(/^export const TETOS = \{$/m, `export const TETOS = {\n${entradas}`));
  }
  return { congelados: grandes.length, limite: LIMITE };
}

/**
 * A medicao da seccao 2b **de dentro de um projeto derivado**: *o que e que este upgrade faz
 * reprovar neste projeto?*
 *
 * PORQUE EXISTE: a 2b nomeia um comando, e o comando que ela nomeava saltava aqui — os dois
 * simuladores recusam-se a correr num derivado, e bem (as tags daqui sao as releases DESTE
 * projeto). O `/upgrade`, porem, **so** se corre num derivado. A rede que devia apanhar a
 * classe "upgrade que poe um projeto verde a vermelho" estava desligada no unico sitio onde
 * essa classe ocorre, e ninguem sabia porque o comando existe e parece funcionar.
 *
 * O ANTES E DEPOIS SAO AMBOS MEDIDOS, e a lista e a DIFERENCA. Um projeto real pode ja estar
 * vermelho por razoes suas; imputar isso ao upgrade era culpa-lo do que ele nao fez, e quem
 * lesse a lista aprendia a desconfiar dela. O que a 2b promete e o que **passa** a reprovar.
 *
 * AS LISTAS DE COMANDOS SAO DUAS, de proposito: o ANTES corre os verificadores que o projeto
 * tem hoje, o DEPOIS corre os que o template novo traz. Um verificador NOVO nao pode ter
 * estado verde antes — nao existia —, logo tudo o que ele acuse e efeito deste upgrade.
 *
 * O QUE ISTO NAO E: nao aplica nada ao projeto. Corre sobre uma copia em `tmpdir`, e o
 * projeto nao e tocado. E por isso que sai `0` mesmo com lista cheia: uma lista cheia e o
 * OUTPUT esperado da 2b, nao uma reprovacao. So a impossibilidade de MEDIR sai `!= 0`.
 *
 * @returns {number} o codigo de saida
 */
export async function medeImpactoAqui({ raiz, template, dir, git, ok, note, fatal, fronteiraEm = null }) {
  validaFronteiraEm(fronteiraEm, [raiz, template], fatal);
  const refs = versaoDeOrigem(raiz);
  if (refs.length === 0) {
    fatal(
      "sem `.agent/.template-version` utilizavel — isto e o Modo B do /upgrade (decidir por " +
        "categoria, com julgamento), e o Modo B nao se mede: mede-se o que e mecanico"
    );
  }
  // A referencia tem de existir NO TEMPLATE. Sem esta recusa, o motor lia `git show <ref>:x` a
  // falhar em todos os ficheiros, interpretava cada falha como "nao existia na tag" e concluia
  // que o template inteiro e novo — uma lista enorme e completamente errada, sem um unico erro
  // no ecra (`TP2`).
  const existe = (r) => {
    try {
      git(["rev-parse", "--verify", `${r}^{commit}`], template);
      return true;
    } catch {
      return false;
    }
  };
  const ref = refs.find(existe);
  if (ref === undefined) {
    fatal(
      `a marca deste projeto aponta para ${refs.join(" / ")}, que nao existe no template em ${template} — ` +
        "num clone raso falta `git fetch --unshallow`"
    );
  }

  let erro = null;
  try {
    execFileSync("sh", ["-c", `git archive HEAD | tar -x -C ${JSON.stringify(dir)}`], { cwd: raiz, stdio: "pipe" });
  } catch (err) {
    erro = err.message.split("\n")[0];
  }
  if (erro !== null || readdirSync(dir).length === 0) {
    fatal(`nao consegui copiar a arvore deste projeto${erro ? `: ${erro}` : " — o archive saiu vazio"}`);
  }
  ok(`copia deste projeto (HEAD), a comparar com o template em ${ref.slice(0, 12)}`);

  const cmdAntes = comandosDoCI(raiz);
  const cmdDepois = comandosDoCI(template);
  if (!cmdAntes?.length) fatal("nao derivei comandos do job `guard-tests` do ci.yml DESTE projeto");
  if (!cmdDepois?.length) fatal(`nao derivei comandos do job \`guard-tests\` do ci.yml de ${template}`);

  // O QUE O TEMPLATE CORRE E ESTE PROJETO NAO. Sao dois conjuntos ja calculados; faltava
  // subtrai-los.
  //
  // PORQUE EXISTE: um consumidor real ficou SEIS RONDAS com a varredura de mutacao desligada.
  // Ela estava **comentada** no `ci.yml` dele, com uma justificacao escrita ao lado. A categoria
  // `.github/workflows/*` do `/upgrade` manda trazer "so os jobs em falta", e quem comparou fez
  // exactamente isso — passo a passo, contra o que la estava. **Um passo comentado nao aparece
  // como em falta: aparece como presente.**
  //
  // O `comandosDoCI` ja deita fora as linhas comentadas dos DOIS lados, logo um passo desligado
  // simplesmente nao entra no `cmdAntes` — e ate hoje ninguem dizia nada. E a mesma leitura que
  // esta ronda fez nos ficheiros ao separar migracao de limpeza, um nivel abaixo:
  // **desactivado nao e o mesmo que decidido.**
  //
  // NOTE e nao `warn`: pode ser uma decisao legitima do projeto, e um gate que reprova por uma
  // escolha alheia e desligado na primeira semana. O que nao pode e ser invisivel.
  const soNoTemplate = cmdDepois.filter((c) => !cmdAntes.includes(c));
  const [jobsAntes, jobsDepois] = [comandosPorJob(raiz), comandosPorJob(template)];
  const ondeCorre = (porJob, c) => JOBS_DA_2B.filter((j) => porJob[j].includes(c));
  if (soNoTemplate.length) {
    note(
      `o template corre ${soNoTemplate.length} verificacao(oes) que o ci.yml deste projeto nao corre: ` +
        `${soNoTemplate.map((c) => `${c} (job \`${ondeCorre(jobsDepois, c).join("`, `")}\`)`).join(", ")} — se alguma esta COMENTADA aqui, conta como ausente`
    );
  }
  // A COLOCACAO (#308): o mesmo comando noutro job, ou em dois. A varredura saiu do `guard-tests`
  // para o `sweep`; um derivado que a deixe no antigo corre-a DUAS vezes se trouxer o `sweep`.
  for (const c of cmdDepois.filter((x) => cmdAntes.includes(x))) {
    const [aqui, la] = [ondeCorre(jobsAntes, c), ondeCorre(jobsDepois, c)];
    if (aqui.join() !== la.join()) {
      note(
        `${c} corre no job \`${aqui.join("` e `")}\` deste projeto, e no \`${la.join("` e `")}\` do template — ` +
          "um passo que o template moveu sai do job antigo (senao corre 2x); o `check-test-surface` reprova os estados que tiram a varredura do check exigido"
      );
    }
  }
  // OS REPETIDOS no mesmo job (#337): um passo que o template SUBSTITUIU (as suites em paralelo, no lugar de um
  // passo por suite) trazido sem tirar os que substitui. Le-se DEPOIS de mexer no `ci.yml` (a 2b corre-se outra vez).
  for (const [job, cs] of Object.entries(repetidosPorJob(raiz) ?? {})) {
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
  const emParalelo = (r) => /^[ \t]*(?:-[ \t]+)?(?:run:[ \t]*)?(?:exec[ \t]+)?node[ \t]+(?:\.\/)?\.agent\/scripts\/lib\/suites-em-paralelo\.mjs\b/m.test(textosDosJobs(r)?.["guard-tests"] ?? "");
  if (emParalelo(template) && !emParalelo(raiz)) {
    note(
      "o `guard-tests` do template corre as suites num so passo, em paralelo (`suites-em-paralelo.mjs`, #337), e o deste projeto nao — " +
        "OPCIONAL (so tempo: as mesmas suites); ao adotar, os passos de cada suite SAEM (senao correm 2x) e o commit leva o trailer `Test-Surface: .github/workflows/ci.yml — <porque>`"
    );
  }
  // Os SHARDS (#308): o comando da varredura e o mesmo dos dois lados, e nada acima o ve — um derivado
  // privado, para quem eles existem, ficava sem eles em silencio (leitor do #308). So a quem TEM o `sweep`.
  const reparte = (r) => /^[^#\n]*\bSWEEP_SHARD\b/m.test(leOuNull(join(r, ".github/workflows/ci.yml")) ?? "");
  if (reparte(template) && !reparte(raiz) && jobsAntes.sweep?.some((c) => c.endsWith("mutation-sweep.mjs"))) {
    note("o `sweep` do template reparte a varredura completa em shards (`SWEEP_SHARD`, #308) e o deste projeto nao — trazer JUNTOS a matriz, o passo da varredura (o `env:` e o `nao_aplicavel`), o upload do relatorio e os passos do portao no `guard-gate` (a matriz sem o portao, o `check-test-surface` reprova-a)");
  }

  // O MESMO, para a fronteira de permissoes (#301, R7B-1). O motor nao toca no `settings.json` — e
  // do projeto —, e a tabela do `/upgrade` mandava "trazer regras novas" em prosa: um derivado
  // passou varias rondas sem o `ask` dos hooks. Lista LITERAL, para copiar; o que deixa a
  // fronteira aberta, o Guard 11 novo ja o faz reprovar na lista de baixo.
  const [setAqui, setLa] = [leOuNull(join(raiz, ".claude/settings.json")), leOuNull(join(template, ".claude/settings.json"))];
  const falta = regrasEmFalta(setAqui, setLa);
  // Os dois existem e nao se comparam (um nao e JSON valido): dize-lo — "nao comparei" nao e "nao falta
  // nada" (auditoria do #308). Sem o do projeto e um projeto sem Claude Code: nada a dizer.
  if (falta === null && setAqui !== null && setLa !== null) note("nao consegui comparar o `deny`/`ask`/`allow` com o do template: um dos settings.json nao e JSON valido");
  for (const lista of ["deny", "ask", "allow"]) {
    if (falta?.[lista].length) {
      // O `allow` em falta nao tira protecao: sem ele, cada verificador da maquinaria pede aprovacao (#317).
      const qual = lista === "allow" ? " da maquinaria" : "";
      const como = lista === "allow" ? "nem cobre por um prefixo" : "literalmente";
      note(`o \`${lista}\` do settings.json do template tem ${falta[lista].length} regra(s)${qual} que o deste projeto nao tem, ${como}: ${falta[lista].join(", ")} — trazer, ou decidir que nao`);
    }
  }

  const naoCorre = [...new Set([...cmdAntes, ...cmdDepois].filter((c) => !correNaBateria(c)))];
  if (naoCorre.length) {
    note(`${naoCorre.join(", ")} conta(m) na comparacao mas nao corre(m) aqui (minutos, e mede as suites e nao o projeto) — correr a parte`);
  }
  const antes = correBateria({ dir, comandos: cmdAntes.filter(correNaBateria) });
  ok(`estado actual: ${new Set(antes.map(([c]) => c)).size} de ${cmdAntes.length} verificacao(oes) ja reprovam antes do upgrade`);

  // O upgrade MECANICO, o mesmo motor e as mesmas categorias que o outro modo usa.
  //
  // O `substituto` e um nome de fachada, e ja nao decide nada (#179). Este comentario dizia que o
  // nome "nao muda resposta nenhuma", e era FALSO: o motor comparava contra a tag com a fachada
  // posta, e lia como customizado todo o documento com o nome real — no derivado real, 2 docs
  // trazidos onde eram 7, e um FAIL do G18 que era da medicao. Agora a comparacao e a menos dos
  // placeholders, e os valores reais saem dos ficheiros intactos; a fachada so preenche um `X`
  // que nunca apareca intacto.
  const medido = aplicaUpgradeMecanico({ dir, root: template, tag: ref, fatal, substituto: "EsteProjeto" });
  ok(
    `upgrade mecanico aplicado a copia: ${medido.repostas} constante(s) preservada(s), ` +
      `${medido.trazidos} doc(s) actualizado(s)`
  );
  // O que se le antes de aprovar: a mesma funcao e a mesma ordem que o simulador (#243). Escritas
  // aqui a parte, as migracoes ja se tinham perdido neste modo, o que um consumidor real corre
  // (#176). Os agentes sao os que o motor NAO actualizou (os CUSTOMIZADOS: trazer o `tools:` a mao, #240);
  // os intactos, que ele actualizou na copia, saem no bloco da FRONTEIRA abaixo (#304). Os removidos
  // pertencem a esta lista porque uma MIGRACAO adiada deixa as duas estruturas e poe o gate
  // vermelho — e a lista e lida ANTES de aplicar.
  // A fronteira MEDE-SE aqui, sobre a copia como o motor a deixou; imprime-se no fim (`lib/fronteira-upgrade.mjs`).
  const fronteira2b = fronteiraDa2b({ raiz, template, dir, medido, ref, fronteiraEm, git, ok, note, fatal });
  imprimeAntesDeAprovar({ medido, agentes: agentesDesatualizados(dir, template), desde: ref.slice(0, 12), sai: fronteira2b.sai }, ok);
  if (medido.removidos.length) {
    // A copia e que fica sem eles — o projeto nao e tocado. Sem isto mediamos o MEIO da
    // migracao, um estado que ninguem deve ficar a ter, e a lista vinha cheia de ruido que
    // desaparece assim que as remocoes forem aprovadas.
    for (const { caminho } of medido.removidos) rmSync(join(dir, caminho), { force: true });
  }

  const depois = correBateria({ dir, comandos: cmdDepois.filter(correNaBateria) });
  const novos = novasLinhas(antes, depois);

  console.log("\n  --- O que ESTE upgrade faz reprovar NESTE projeto ---\n");
  if (novos.length === 0) {
    console.log("  (nenhuma) — para este projeto, este upgrade e puramente aditivo.\n");
  } else {
    for (const [c, linha, nota] of novos) console.log(`  PASSA A REPROVAR  ${c}\n                    ${linha}${nota}`);
    console.log("");
  }

  // As adaptacoes mecanicas que a 2b prescreve, e o que sobra DEPOIS delas. O que sobra e o que
  // precisa de julgamento — e e essa a lista que vai a aprovacao, nao a de cima.
  const { congelados, limite } = await adapta2bGuard17({ dir, fatal });
  ok(
    congelados
      ? `adaptacao 2b (Guard 17): ${congelados} ficheiro(s) deste projeto a congelar em TETOS`
      : `adaptacao 2b (Guard 17): nenhum ficheiro acima das ${limite} linhas por congelar`
  );
  const sobra = novasLinhas(antes, correBateria({ dir, comandos: cmdDepois.filter(correNaBateria) }));
  if (sobra.length) {
    console.log("\n  Depois das adaptacoes mecanicas, continuam a reprovar:\n");
    for (const [c, linha, nota] of sobra) console.log(`  DECIDIR  ${c}\n           ${linha}${nota}`);
    console.log("\n  Estas exigem decisao: acrescentar o que falta, ou nao trazer o guard.");
    console.log("  Nunca trazer e deixar vermelho.\n");
  } else if (novos.length) {
    console.log("\n  As adaptacoes mecanicas da 2b resolvem tudo o que passou a reprovar.\n");
  }

  // A FRONTEIRA por ultimo (#317): so com a medicao inteira de pe se cria o staging e se dao os comandos.
  fronteira2b.imprime();
  console.log("  Nada foi aplicado a este projeto: a medicao correu sobre uma copia.\n");
  return 0;
}
