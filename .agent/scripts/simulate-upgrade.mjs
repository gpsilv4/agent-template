#!/usr/bin/env node
/**
 * Simula um /upgrade: template de ONTEM + template de hoje — {{PROJECT_NAME}}
 *
 * PORQUE EXISTE: este template tem dois propositos, e ate agora so um estava defendido.
 * O `simulate-derived.mjs` prova "funciona num projeto NOVO"; nada provava "funciona num
 * projeto que ja existia". Metade do produto sem rede — e e a metade que ja produziu tres
 * rondas de defeitos, todas encontradas a mao, todas com as suites verdes e a cobertura de
 * mutacao completa. Um caminho que ninguem mede nao aparece em contagem nenhuma.
 *
 * O QUE FAZ:
 *   1. baseline = a ultima tag antes do HEAD (o template de ontem, REAL);
 *   2. monta em tmpdir um projeto derivado DESSA tag, com conteudo proprio;
 *   3. FASE 1 — aplica o upgrade mecanico e IMPRIME o que passou a reprovar;
 *   4. FASE 2 — aplica as adaptacoes da seccao 2b do `/upgrade`, e exige VERDE.
 *
 * PORQUE A BASELINE E UMA TAG E NAO UMA FIXTURE ESCRITA A MAO: quem escreve o passado
 * escreve-o compativel sem dar por isso, e a simulacao fica verde por construcao. Uma tag e
 * um passado que ninguem pode ajustar depois. O custo e depender de o clone ter tags — e por
 * isso a ausencia delas REPROVA em vez de passar (ver `TP2`).
 *
 * PORQUE `git archive` E NAO UMA COPIA DA ARVORE: o archive so emite ficheiros versionados.
 * Nao ha `.env`, `.pem`, `node_modules` nem `.git` para excluir, logo nao ha lista de exclusao
 * para envelhecer. O `simulate-derived.mjs` precisa dessa lista porque copia a arvore de
 * trabalho; aqui o problema nao existe, em vez de estar resolvido.
 *
 * O LIMITE, dito por inteiro (e o mesmo erro que o `TP7` documenta):
 *   - **So o Modo A** do `/upgrade` (projeto com `.agent/.template-version`). O Modo B assenta
 *     em "detectar capacidades" e "decidir por categoria" — JULGAMENTO do agente. Simula-lo
 *     era codificar o julgamento e depois verifica-lo contra si proprio: uma tabela verde que
 *     nao prova nada. Fica por simular, escrito, em vez de fingido.
 *   - As categorias que o workflow marca como "diff e decidir caso a caso" ficam com a versao
 *     ANTIGA do projeto. Nao e preguica: copiar tudo convergia no template de hoje, e isso e
 *     exactamente o que o `simulate-derived.mjs` ja monta. O valor esta na MISTURA —
 *     verificadores novos sobre documentacao antiga —, que e onde um upgrade parte.
 *   - A lista do que "e suposto reprovar" (tabela 2b) nao e comparada com nada: e IMPRESSA.
 *     Compara-la obrigava a parsear prosa (que mente ao primeiro reformatar) ou a manter uma
 *     lista a mao que tem de concordar com ela (dois campos sem verificacao, o `TP1`).
 *
 * DOIS MODOS, porque a pergunta da seccao 2b poe-se dos dois lados e o instrumento tem de
 * existir onde ela se le:
 *   - **no template** (sem argumentos): baseline = a ultima tag, consumidor = uma fixture;
 *   - **contra um projeto derivado** (`--projeto=<caminho>`): baseline = a arvore que ele tem
 *     HOJE, e o "depois" e essa arvore com o template novo por cima. Corre-se DAQUI, apontado
 *     ao projeto: a copia que ele tem e a antiga, e nao conhece o modo. Sem isto, a 2b
 *     nomeava um comando que salta no unico sitio onde ela e lida.
 * A mecanica partilhada vive em `lib/medida-upgrade.mjs` — duas copias a concordar a mao eram
 * o `TP8`, e a do lado menos corrido envelhecia sem ninguem dar por isso.
 *
 * Uso:
 *   node .agent/scripts/simulate-upgrade.mjs
 *   node .agent/scripts/simulate-upgrade.mjs --keep     # nao apaga a copia
 *   node .agent/scripts/simulate-upgrade.mjs --projeto=/caminho/do/projeto   # mede a 2b de um derivado
 */

import { readdirSync, rmSync, existsSync } from "fs";
import { execFileSync } from "child_process";
import { fileURLToPath } from "url";
import { dirname, resolve, join } from "path";
import { aplicaUpgradeMecanico, leOuNull } from "./lib/upgrade-mecanico.mjs";
import { ehDerivado } from "./lib/derivado.mjs";
import { criaTmp, limpaTmpsAntigos, limpaFixturesDeTeste } from "./lib/tmp-limpo.mjs";
import { comandosDoCI, correBateria, adapta2bGuard17, medeImpactoAqui } from "./lib/medida-upgrade.mjs";
import { montaProjetoDeOntem } from "./lib/projeto-de-ontem.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** A marca que a fixture escreve dentro da constante customizada, e que tem de sobreviver ao
 *  upgrade. E texto improvavel de proposito: se aparecesse por acaso no template, a assercao
 *  passava sem a preservacao ter acontecido. */
const MARCA_PROJETO = "// decisao deste projeto — nao vem do template";

/** O nome que substitui os placeholders na copia. Um so sitio: a comparacao "customizado ou
 *  nao" faz-se contra a versao antiga JA substituida, logo os dois lados tem de usar o mesmo. */
const SUBSTITUTO = "ProjetoDeOntem";

let problemas = 0;
const ok = (m) => console.log(`  OK    ${m}`);
/** Visivel, mas NAO reprova. Para o que o leitor tem de saber e nao e defeito deste simulador —
 *  uma decisao do projeto medido, por exemplo. A mesma convencao dos guards. */
const note = (m) => console.log(`  NOTE  ${m}`);
const warn = (m) => {
  console.log(`  WARN  ${m}`);
  problemas++;
};

/** A copia vive em `/tmp`; qualquer saida tem de a limpar. Sem isto cada caminho de recusa
 *  deixava uma arvore orfa — o `simulate-derived.mjs` acumulou 63 antes de alguem reparar. */
let copiaAtiva = null;
const limpaCopia = () => {
  if (copiaAtiva && !process.argv.includes("--keep")) {
    try {
      rmSync(copiaAtiva, { recursive: true, force: true });
    } catch {
      /* melhor esforco: nao mascarar a razao real da saida */
    }
    copiaAtiva = null;
  }
};
const fatal = (m) => {
  limpaCopia();
  console.log(`  WARN  ${m}`);
  console.log("");
  process.exit(1);
};
process.on("exit", limpaCopia);
process.on("SIGINT", () => {
  limpaCopia();
  process.exit(130);
});

// A copia so se limpa a saida no caso NORMAL: um `SIGKILL` nao se apanha, e foi assim que
// ficaram 33 MB por corrida interrompida. Quem varre o que sobrou e a corrida SEGUINTE, no
// arranque — e so o que ja nao tem dono vivo, porque duas corridas em paralelo acontecem.
// Os DOIS prefixos deste script: o modo template e o modo `--projeto`. Limpar so um deixava
// o outro a acumular, e e o `--projeto` que copia 33 MB de cada vez.
for (const p of ["upgrade-", "upgrade-2b-"]) {
  const n = limpaTmpsAntigos(p);
  if (n) console.log(`  OK    ${n} copia(s) ${p}* de corridas interrompidas apagadas`);
}

// E as fixtures que as SUITES deixam: sao elas que ocuparam 2,5 GB, e nao as copias dos
// scripts. Caem no ramo da idade, logo uma suite a correr ao lado nao e tocada.
limpaFixturesDeTeste();

const git = (args, cwd = ROOT) =>
  execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

// --- 0a. modo DERIVADO: medir a 2b de dentro de um projeto -----------------------
// A seccao 2b do `/upgrade` manda medir o que passa a reprovar. So que o `/upgrade` corre num
// DERIVADO, e ali o modo normal salta (as tags de la sao as releases desse projeto). Sem este
// modo, a seccao apontava para um comando que nao responde no unico sitio onde e lida — pior
// do que nao apontar para nenhum, porque quem o corre ve um `SKIP` e conclui que nao ha nada
// a medir.
//
// CORRE-SE DO LADO DO TEMPLATE, apontado ao projeto — e nao de dentro do projeto apontado ao
// template. A diferenca nao e de gosto: um projeto derivado corre a **sua** copia deste
// ficheiro, que e a ANTIGA. Um flag que vivesse do lado do consumidor so funcionaria a partir
// do upgrade seguinte aquele que o trouxesse, e o upgrade que precisa de ser medido e sempre
// **este**. Medido: montado um derivado da v0.14.0, o flag do lado de la nem existia.
const argProjeto = process.argv.find((a) => a.startsWith("--projeto="));
if (argProjeto) {
  const projeto = resolve(argProjeto.slice("--projeto=".length));
  console.log("\n=== Impacto deste upgrade no projeto (seccao 2b) ===\n");
  if (!existsSync(join(projeto, ".agent"))) {
    fatal(`${projeto} nao parece um projeto derivado deste template — nao tem .agent/`);
  }
  const dirAqui = criaTmp("upgrade-2b-");
  copiaAtiva = dirAqui;
  const codigo = await medeImpactoAqui({ raiz: projeto, template: ROOT, dir: dirAqui, git, ok, note, fatal });
  limpaCopia();
  process.exit(codigo);
}

console.log("\n=== Simulacao de /upgrade (template de ontem -> hoje) ===\n");

// --- 0. sou o template, ou ja sou um derivado? -----------------------------------
// Este script vai ser COPIADO para todos os projetos derivados (e o `/upgrade` que o leva la).
// E la nao significa nada: "a ultima tag antes do HEAD" seriam as releases DESSE projeto, e a
// simulacao mediria projeto-v1 -> projeto-v2. Pior do que inutil — media uma coisa a fingir
// que media outra, e dava um veredicto sobre o template que ninguem tinha medido.
//
// O discriminador e o mesmo que o Guard 13 usa (`check-doc-versions.mjs`): o bootstrap escreve
// `.agent/.template-version` no primeiro passo da Fase 2, e manda apagar o `BOOTSTRAP.md`.
// Qualquer um dos dois sinais basta — um projeto que tenha apagado o BOOTSTRAP mas nao tenha a
// marca (ou o contrario) e na mesma um derivado.
const bootstrapCorreu = ehDerivado((rel) => leOuNull(join(ROOT, rel)));
if (bootstrapCorreu) {
  console.log("  SKIP  simulacao de /upgrade — este repo e um projeto derivado, nao o template.");
  console.log("        As tags daqui sao as releases DESTE projeto; a simulacao mediria outra coisa.");
  // O `SKIP` tem de dizer o que correr A SEGUIR. Sem esta linha, quem seguia a seccao 2b do
  // `/upgrade` via um salto, lia-o como "nada a medir" e avancava — que foi exactamente como o
  // #75 passou para um consumidor. Um salto que nao aponta para a alternativa e um beco.
  console.log("\n        Para medir a seccao 2b DESTE projeto, correr do CLONE do template:");
  console.log("          node <clone>/.agent/scripts/simulate-upgrade.mjs --projeto=$PWD\n");
  process.exit(0);
}

// --- 1. baseline: o template de ontem --------------------------------------------
let tag;
try {
  tag = git(["describe", "--tags", "--abbrev=0", "HEAD"]);
} catch {
  // Um clone raso (`--depth 1`, ou `actions/checkout` sem `fetch-depth: 0`) nao traz tags.
  // Sem baseline nao ha medicao, e uma medicao ausente nao e um OK — a mesma regra que o
  // `check-test-surface.mjs` aplica a baseline dele.
  fatal(
    "nao ha tags acessiveis — sem baseline nao ha medicao. Num clone raso falta `git fetch --tags` " +
      "(no CI: `fetch-depth: 0`)"
  );
}

// Delta vazio: acontece logo a seguir a marcar uma release, quando a tag E o HEAD. Sem delta
// nao ha upgrade nenhum a simular, e dar OK aqui era reportar sucesso sobre zero trabalho —
// o `TP2` dentro da ferramenta escrita para o apanhar.
//
// **Nao se recua para a tag anterior.** Recuar escondia a condicao e fazia o simulador medir
// um salto diferente do que anuncia.
let temDelta = false;
try {
  git(["diff", "--quiet", tag, "HEAD"]);
} catch {
  temDelta = true; // exit != 0 == ha diferencas
}
if (!temDelta) {
  fatal(`a tag ${tag} e identica ao HEAD — nao ha upgrade a simular. Marcar a release DEPOIS de correr isto`);
}

const sha = git(["rev-parse", "--short", tag]);
ok(`baseline: ${tag} (${sha}) -> HEAD`);

// --- 2. montar o projeto de ONTEM ------------------------------------------------
const dir = criaTmp("upgrade-");
copiaAtiva = dir;
montaProjetoDeOntem({ dir, root: ROOT, tag, sha, substituto: SUBSTITUTO, marcaProjeto: MARCA_PROJETO, ok, fatal });

// --- 3. FASE 1: o upgrade MECANICO -----------------------------------------------
// As categorias que a tabela do `/upgrade` resolve sem julgamento. O motor vive em
// `lib/upgrade-mecanico.mjs` — e a parte que escreve por cima dos ficheiros do consumidor, e
// num modulo proprio pode ser exercitada sem montar a simulacao inteira.
const medido = aplicaUpgradeMecanico({ dir, root: ROOT, tag, fatal, substituto: SUBSTITUTO });
ok(
  `upgrade mecanico aplicado: ${medido.repostas} constante(s) customizada(s) preservada(s), ` +
    `${medido.trazidos} doc(s) nao customizado(s) actualizado(s), ${medido.placeholders} com placeholders substituidos`
);

// O que SAIU do template e o consumidor ainda tem. O upgrade copia com `cpSync`, que acrescenta
// e substitui mas NUNCA apaga — logo uma renomeacao no template deixava o ficheiro velho no
// consumidor, ao lado do novo, para sempre.
//
// Nao e desarrumacao: a descoberta em disco encontra o orfao e exige-lhe par (`SEM PAR`), o
// Guard 17 conta-o e o `check-test-surface` ve a superficie duplicada. Uma arrumacao de pastas
// no template punha VERMELHOS todos os projetos derivados, sem ninguem perceber porque.
//
// O MOTOR lista e nao apaga — apagar e decisao do passo de aprovacao, e e a coisa menos
// reversivel deste workflow. Mas ESTE simulador tem de responder a outra pergunta: *um
// consumidor que faca este upgrade **bem feito** fica verde?* E um upgrade bem feito inclui
// apagar o que saiu.
//
// Medir o meio da migracao media um estado que ninguem deve FICAR a ter: com as duas estruturas
// no disco, os contadores duplicam, a descoberta exige par aos orfaos e o `check-test-surface`
// ve a superficie inflada. Foi exactamente o que aconteceu ao mover 28 ficheiros para `tests/`,
// e a mensagem que o consumidor recebia falava de "entry point que declara" — a quilometros da
// causa.
//
// Por isso a simulacao **aplica** as remocoes e **diz que as aplicou**. A linha existe para
// ninguem ler isto como "o /upgrade apaga sozinho": num projeto real sao propostas, uma a uma.
// CONSTANTES QUE MUDARAM DE CASA. O consumidor que as tinha customizadas perde a customizacao
// em silencio: o ficheiro da logica e substituido, a entrada sai da lista de preservadas, e o
// `config/` novo chega com os defaults. E o modo de falha que o `upgrade-why.md` descreve — uma
// verificacao por diferenca de output apanha o que some, **nao apanha um default que regressa**.
//
// Avisa e nao migra: o formato pode ter mudado com a mudanca de casa, e um motor que adivinhasse
// o merge entregava configuracao que ninguem escreveu.
if (medido.migracoes?.length) {
  ok(`${medido.migracoes.length} constante(s) customizada(s) mudaram de casa — migrar A MAO:`);
  for (const { nome, de, para } of medido.migracoes) {
    console.log(`        ${nome}: ${de}  ->  ${para}`);
  }
  console.log("        O valor antigo esta no historico do git; o novo ficheiro chega com os defaults.");
}

if (medido.removidos.length) {
  const migrados = medido.removidos.filter((r) => r.migrado);
  ok(`${medido.removidos.length} ficheiro(s) sairam do template desde ${tag} e continuam no projeto:`);
  for (const { caminho, migrado } of medido.removidos) {
    console.log(`        ${caminho}${migrado ? "   (MIGRADO: o mesmo nome existe noutra pasta)" : ""}`);
  }
  if (migrados.length) {
    console.log(`        ${migrados.length} sao MIGRACAO, nao limpeza — adiar a remocao deixa o projeto`);
    console.log("        com as duas estruturas, e e isso que poe o gate vermelho.");
  }
  for (const { caminho } of medido.removidos) rmSync(join(dir, caminho), { force: true });
  ok(`aplicadas ${medido.removidos.length} remocao(oes) propostas — num projeto real aprovam-se uma a uma`);
} else {
  ok(`nenhum ficheiro saiu do template desde ${tag} — nada a propor remover`);
}

// A DECISAO do projeto sobrevive a travessia? E a pergunta que o `/upgrade` tem de responder
// com um facto e nao com uma lista: acrescentar a constante a tabela das preservadas nao prova
// que ela sobrevive — prova que alguem a escreveu la. Isto mede.
{
  const depois = leOuNull(join(dir, ".agent/scripts/config/bundles.mjs"));
  if (depois === null || !/export const ALVOS_REPROVAM = false;/.test(depois)) {
    warn(
      "a suspensao do gate dos bundles NAO sobreviveu ao upgrade — a decisao do projeto foi " +
        "reposta no default, e e isso que faz um consumidor levar um gate vermelho sem ter decidido nada"
    );
  }
}

// O que o `/upgrade` manda NUNCA tocar, medido ANTES e depois. Um `cp -R` mal apontado aqui
// apaga trabalho que nao existe em mais sitio nenhum — e a primeira frase da Fase 0 de la.
/** O conteudo de `.agent/context/`, ou `null` se a pasta nao existir. Um `readdirSync` cru
 *  aqui rebentava com um stack do Node em vez de dizer o que falta — e quem le um stack nao
 *  sabe se o simulador esta partido ou se o template e que esta incompleto. */
const contextoDe = () => {
  try {
    return readdirSync(join(dir, ".agent/context")).sort().join(",");
  } catch {
    return null;
  }
};
const contextoAntes = contextoDe();
if (contextoAntes === null) {
  fatal("`.agent/context/` nao existe na copia — sem ela nao consigo afirmar que o upgrade nao lhe tocou");
}

const COMANDOS = comandosDoCI(ROOT);
if (COMANDOS === null || COMANDOS.length === 0) {
  fatal("nao derivei nenhum comando do job `guard-tests` do ci.yml — o job mudou de nome ou de formato?");
}

const corre = () => correBateria({ dir, comandos: COMANDOS });

console.log("\n  --- FASE 1: o que este upgrade faz reprovar num projeto que estava verde ---\n");
const fase1 = corre();
if (fase1.length === 0) {
  console.log("  (nenhuma) — este upgrade e puramente aditivo para um consumidor\n");
} else {
  for (const [c, linha] of fase1) console.log(`  REPROVA  ${c}\n           ${linha}`);
  console.log(
    `\n  ${fase1.length} verificacao(oes) passam a reprovar. A seccao 2b do /upgrade promete esta\n` +
      "  lista ANTES de aplicar — e isto e ela, medida em vez de prometida.\n"
  );
}

// --- 4. FASE 2: as adaptacoes que a seccao 2b prescreve ---------------------------
// So as mecanicas. O que exige julgamento fica de fora, escrito, em vez de fingido.
{
  const { congelados, limite } = await adapta2bGuard17({ dir, fatal });
  if (congelados) ok(`adaptacao 2b (Guard 17): ${congelados} ficheiro(s) do projeto congelado(s) em TETOS`);
  else ok(`adaptacao 2b (Guard 17): nenhum ficheiro do projeto acima das ${limite} linhas por congelar`);
}

console.log("\n  --- FASE 2: depois das adaptacoes ---\n");
const fase2 = corre();
for (const [c, linha] of fase2) warn(`${c}: ${linha}`);
if (fase2.length === 0) ok(`${COMANDOS.length} verificacao(oes) verdes num projeto atualizado do ${tag}`);

// O que o `/upgrade` manda NUNCA tocar continua intacto. Esta verificacao vem no fim de
// proposito: se alguma das copias acima tiver alvo errado, e aqui que se ve.
const contextoDepois = contextoDe();
if (contextoAntes !== contextoDepois) {
  warn(`.agent/context/ foi alterado pelo upgrade — e o estado do projeto, e nao existe em mais sitio nenhum`);
}

if (!process.argv.includes("--keep")) limpaCopia();
else console.log(`\n  copia mantida em ${dir}`);

console.log("");
if (problemas > 0) {
  console.log(`WARNING: ${problemas} problema(s) num projeto atualizado a partir do ${tag}.`);
  console.log("         Passam no template nu — logo o defeito esta no caminho do /upgrade.\n");
  process.exit(1);
}
console.log(`  Upgrade do ${tag} para HEAD verificado.\n`);
