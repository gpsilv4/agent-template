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
 *   - `comandosDoCI(raiz)` — os verificadores que o job `guard-tests` corre, DERIVADOS do
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

/** Os comandos que o consumidor corre, DERIVADOS do job `guard-tests` do `ci.yml` de `raiz` —
 *  e nao escritos a mao. Uma lista a mao mede menos a cada suite nova, em silencio.
 *  Devolve `null` quando o job nao aparece: "nao derivei nada" e "nao ha nada" pedem accoes
 *  diferentes, e quem chama e que decide (`TP2`). */
export function comandosDoCI(raiz) {
  const ci = leOuNull(join(raiz, ".github/workflows/ci.yml"));
  const job = ci?.split(/^  guard-tests:/m)[1];
  if (!job) return null;
  // EXCLUSOES, cada uma por uma razao concreta:
  //  - `check-test-surface`: precisa de um `.git` com historia, e um archive nao traz nenhum;
  //  - os dois simuladores: correriam DENTRO da copia e voltariam a copiar — recursao.
  const EXCLUIR = ["check-test-surface", "simulate-derived", "simulate-upgrade"];
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
  const activas = job.split("\n").filter((l) => !/^\s*#/.test(l));
  const achados = [...new Set([...activas.join("\n").matchAll(/run:\s*node\s+(\S+\.mjs)/g)].map((m) => m[1]))];
  return achados.filter((c) => !EXCLUIR.some((x) => c.includes(x)));
}

/**
 * Corre a bateria dentro de `dir`. Devolve os que sairam `!= 0`, com a primeira linha util.
 *
 * Um comando AUSENTE na copia entra na lista em vez de ser ignorado: e quase sempre um
 * verificador que o template novo traz e o projeto ainda nao tem, e ler isso como "passou" e
 * o `TP2` — zero resultados lidos como zero problemas.
 *
 * @returns {Array<[string, string]>} pares `[comando, primeira linha util]`
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
      const linha = out.split("\n").find((l) => /^\s*(WARN|FAIL)/.test(l))?.trim() ?? `exit ${err.status ?? 1}`;
      falhados.push([c, linha]);
    }
  }
  return falhados;
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
 * @returns {string|null} a referencia, ou `null` quando nao ha marca utilizavel
 */
export function versaoDeOrigem(raiz) {
  const marca = leOuNull(join(raiz, ".agent/.template-version"));
  if (marca === null) return null;
  for (const campo of ["commit", "versao"]) {
    const v = new RegExp(`^${campo}:\\s*(\\S+)\\s*$`, "m").exec(marca)?.[1];
    if (v && v !== "desconhecido") return v;
  }
  return null;
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
export async function medeImpactoAqui({ raiz, template, dir, git, ok, fatal }) {
  const ref = versaoDeOrigem(raiz);
  if (ref === null) {
    fatal(
      "sem `.agent/.template-version` utilizavel — isto e o Modo B do /upgrade (decidir por " +
        "categoria, com julgamento), e o Modo B nao se mede: mede-se o que e mecanico"
    );
  }
  // A referencia tem de existir NO TEMPLATE. Sem esta recusa, o motor lia `git show <ref>:x` a
  // falhar em todos os ficheiros, interpretava cada falha como "nao existia na tag" e concluia
  // que o template inteiro e novo — uma lista enorme e completamente errada, sem um unico erro
  // no ecra (`TP2`).
  try {
    git(["rev-parse", "--verify", `${ref}^{commit}`], template);
  } catch {
    fatal(
      `a marca deste projeto aponta para ${ref}, que nao existe no template em ${template} — ` +
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

  const antes = new Set(correBateria({ dir, comandos: cmdAntes }).map(([c]) => c));
  ok(`estado actual: ${antes.size} de ${cmdAntes.length} verificacao(oes) ja reprovam antes do upgrade`);

  // O upgrade MECANICO, o mesmo motor e as mesmas categorias que o outro modo usa.
  //
  // O `substituto` e um nome de fachada e nao o do projeto: o que a 2b mede e QUE verificadores
  // passam a reprovar, e o guard dos placeholders da o mesmo veredicto com qualquer nome desde
  // que algum substitua. Ir buscar o nome real obrigava a adivinha-lo a partir de prosa ja
  // substituida — uma heuristica a mais, para nao mudar resposta nenhuma.
  const medido = aplicaUpgradeMecanico({ dir, root: template, tag: ref, fatal, substituto: "EsteProjeto" });
  ok(
    `upgrade mecanico aplicado a copia: ${medido.repostas} constante(s) preservada(s), ` +
      `${medido.trazidos} doc(s) actualizado(s)`
  );

  // O que SAIU do template e o projeto ainda tem. Nao e desarrumacao: a descoberta em disco
  // exige par ao orfao, o Guard 17 conta-o e o `check-test-surface` ve a superficie duplicada.
  // Numa MIGRACAO (o mesmo nome noutra pasta) adiar a remocao deixa o projeto com as duas
  // estruturas, e e isso que poe o gate vermelho — logo isto pertence a lista da 2b, que e
  // lida ANTES de aplicar.
  const migrados = medido.removidos.filter((r) => r.migrado);
  if (medido.removidos.length) {
    ok(`${medido.removidos.length} ficheiro(s) sairam do template e continuam neste projeto:`);
    for (const { caminho, migrado } of medido.removidos) {
      console.log(`        ${caminho}${migrado ? "   (MIGRADO: o mesmo nome existe noutra pasta)" : ""}`);
    }
    // A copia e que fica sem eles — o projeto nao e tocado. Sem isto mediamos o MEIO da
    // migracao, um estado que ninguem deve ficar a ter, e a lista vinha cheia de ruido que
    // desaparece assim que as remocoes forem aprovadas.
    for (const { caminho } of medido.removidos) rmSync(join(dir, caminho), { force: true });
  }

  const depois = correBateria({ dir, comandos: cmdDepois });
  const novos = depois.filter(([c]) => !antes.has(c));

  console.log("\n  --- O que ESTE upgrade faz reprovar NESTE projeto ---\n");
  if (novos.length === 0) {
    console.log("  (nenhuma) — para este projeto, este upgrade e puramente aditivo.\n");
  } else {
    for (const [c, linha] of novos) console.log(`  PASSA A REPROVAR  ${c}\n                    ${linha}`);
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
  const sobra = correBateria({ dir, comandos: cmdDepois }).filter(([c]) => !antes.has(c));
  if (sobra.length) {
    console.log("\n  Depois das adaptacoes mecanicas, continuam a reprovar:\n");
    for (const [c, linha] of sobra) console.log(`  DECIDIR  ${c}\n           ${linha}`);
    console.log("\n  Estas exigem decisao: acrescentar o que falta, ou nao trazer o guard.");
    console.log("  Nunca trazer e deixar vermelho.\n");
  } else if (novos.length) {
    console.log("\n  As adaptacoes mecanicas da 2b resolvem tudo o que passou a reprovar.\n");
  }

  if (migrados.length) {
    console.log(`  ${migrados.length} das remocoes sao MIGRACAO, nao limpeza — adiar deixa o projeto`);
    console.log("  com as duas estruturas, e e isso que poe o gate vermelho.\n");
  }
  console.log("  Nada foi aplicado a este projeto: a medicao correu sobre uma copia.\n");
  return 0;
}
