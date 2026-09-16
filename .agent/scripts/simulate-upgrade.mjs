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
 * Uso:
 *   node .agent/scripts/simulate-upgrade.mjs
 *   node .agent/scripts/simulate-upgrade.mjs --keep     # nao apaga a copia
 */

import { mkdtempSync, mkdirSync, readdirSync, readFileSync, writeFileSync, rmSync, existsSync } from "fs";
import { execFileSync } from "child_process";
import { fileURLToPath } from "url";
import { dirname, resolve, join } from "path";
import { tmpdir } from "os";
import {
  aplicaUpgradeMecanico,
  leOuNull,
  substituivel,
  andaFicheiros,
  PLACEHOLDER,
} from "./lib/upgrade-mecanico.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** O nome que substitui os placeholders na copia. Um so sitio: a comparacao "customizado ou
 *  nao" faz-se contra a versao antiga JA substituida, logo os dois lados tem de usar o mesmo. */
const SUBSTITUTO = "ProjetoDeOntem";

let problemas = 0;
const ok = (m) => console.log(`  OK    ${m}`);
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

const git = (args, cwd = ROOT) =>
  execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

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
const bootstrapCorreu =
  leOuNull(join(ROOT, ".agent/.template-version")) !== null || leOuNull(join(ROOT, ".agent/BOOTSTRAP.md")) === null;
if (bootstrapCorreu) {
  console.log("  SKIP  simulacao de /upgrade — este repo e um projeto derivado, nao o template.");
  console.log("        As tags daqui sao as releases DESTE projeto; a simulacao mediria outra coisa.\n");
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
const dir = mkdtempSync(join(tmpdir(), "upgrade-"));
copiaAtiva = dir;
// Um SO sitio de recusa para as duas formas de isto correr mal — o `git archive` a falhar e o
// archive a sair vazio. Separados, o primeiro era um ramo que nenhum teste alcanca: nao ha
// como fazer o `git archive` de uma tag valida falhar a pedido. O `TP7` diz o que fazer com um
// ramo assim — nao e escrever a razao ao lado, e juntar ao que se consegue medir. O motivo
// concreto vai na mensagem, logo nao se perde nada a quem le.
let erroArchive = null;
try {
  execFileSync("sh", ["-c", `git archive ${tag} | tar -x -C ${JSON.stringify(dir)}`], { cwd: ROOT, stdio: "pipe" });
} catch (err) {
  erroArchive = err.message.split("\n")[0];
}
const nFicheiros = readdirSync(dir).length;
if (erroArchive !== null || nFicheiros === 0) {
  fatal(`nao consegui montar o template de ${tag}${erroArchive ? `: ${erroArchive}` : " — o archive saiu vazio"}`);
}
ok(`template de ontem extraido (${nFicheiros} entradas de topo)`);

// --- 2b. bootstrapar esse template de ontem --------------------------------------
// O mesmo estado que o `simulate-derived.mjs` monta, mas sobre a arvore da TAG: placeholders
// substituidos e as rules que a Fase 2.2 manda gerar. Sem isto o "projeto de ontem" seria o
// template nu, e um template nu nao e um consumidor.


let tocados = 0;
andaFicheiros(dir, (sub, nome) => {
  if (!substituivel(sub, nome)) return;
  const p = join(dir, sub);
  const c = readFileSync(p, "utf8");
  const novo = c.replace(PLACEHOLDER, SUBSTITUTO);
  if (novo !== c) {
    writeFileSync(p, novo);
    tocados++;
  }
});

// As rules GERADAS no bootstrap, derivadas da seccao 2.2 do BOOTSTRAP.md **da tag** — e nao do
// HEAD. A tabela pode ter mudado entretanto, e o que interessa e o que o consumidor gerou na
// altura em que bootstrapou.
const bootstrapAntigo = leOuNull(join(dir, ".agent/BOOTSTRAP.md"));
const seccao = bootstrapAntigo?.split(/^### 2\.2 /m)[1]?.split(/^### 2\.3 /m)[0] ?? "";
const geradas = [...new Set([...seccao.matchAll(/`(\.agent\/rules\/[a-z-]+\.md)`/g)].map((m) => m[1]))];
if (geradas.length === 0) {
  fatal(`nao derivei nenhuma rule gerada da seccao 2.2 do BOOTSTRAP.md do ${tag} — o formato mudou?`);
}
for (const rel of geradas) {
  const p = join(dir, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, `# ${rel.split("/").pop().replace(".md", "")} (ProjetoDeOntem)\n\nGerado no bootstrap.\n`);
}

// A marca. E o que poe o projeto no **Modo A** do `/upgrade` — o unico que isto simula.
writeFileSync(join(dir, ".agent/.template-version"), `sha: ${sha}\nversao: ${tag}\n`);
// E o `BOOTSTRAP.md` sai: a propria documentacao manda apaga-lo depois do bootstrap, e mante-lo
// deixava o projeto a parecer um template por estrear para quem olha para esse sinal.
rmSync(join(dir, ".agent/BOOTSTRAP.md"), { force: true });
ok(`bootstrapado: ${tocados} ficheiro(s) com placeholders, ${geradas.length} rule(s) geradas, marca ${tag}`);

// --- 2c. o conteudo PROPRIO do projeto -------------------------------------------
// Um consumidor nao e um template bootstrapado e mais nada: tem coisas suas, e sao elas que
// tornam um upgrade dificil. Cada item aqui existe para exercitar uma linha concreta da tabela
// do `/upgrade` — sem eles a simulacao passava por construcao.
{
  // (a) Um anti-padrao SEU. Depois da separacao de prefixos o espaco `AP` e todo do projeto,
  //     e e exactamente isso que a migracao deste upgrade tem de preservar.
  const rel = ".agent/rules/anti-patterns.md";
  const c = leOuNull(join(dir, rel));
  if (c === null) fatal(`${rel} nao existe no ${tag} — a fixture nao representa um consumidor`);
  const idProprio = "AP" + "1";
  writeFileSync(
    join(dir, rel),
    c.replace(/<!--[\s\S]*?-->\n*/g, "") +
      `\n## ${idProprio} — Anti-padrao proprio deste projeto\n\n` +
      `- **Origem**: um bug deste projeto\n- **Anti-padrao**: o que nao fazer\n` +
      `- **Correto**: o que fazer\n- **Detecao em review**: \`grep -rn "exemplo" src/\`\n`
  );

  // (b) Um ficheiro SEU acima das 500 linhas. E a linha "limiar apertado" da 2b: o Guard 17
  //     reprova-o, e a adaptacao prescrita e entra-lo em `TETOS` com a contagem do dia da
  //     migracao. Sem um ficheiro assim, essa linha da tabela nunca era exercitada.
  writeFileSync(
    join(dir, ".agent/scripts/check-dominio.mjs"),
    "#!/usr/bin/env node\n// Verificador proprio deste projeto.\n" + "// linha\n".repeat(540)
  );

  // (c) Uma constante adaptavel CUSTOMIZADA. Sem isto o caminho da preservacao nunca corria:
  //     todos os blocos ficavam iguais aos do template e nao havia nada para preservar — um
  //     teste que passa sem exercitar o que diz exercitar.
  //     `TARGETS` de proposito: e o unico bloco curto cujos comentarios nao citam anti-padroes
  //     do template, logo o que a preservacao traz e conteudo do PROJETO e mais nada.
  const relAlvos = ".agent/scripts/check-bundle-sizes.mjs";
  const cAlvos = leOuNull(join(dir, relAlvos));
  if (cAlvos === null) fatal(`${relAlvos} nao existe no ${tag} — a fixture nao representa um consumidor`);
  const cAlvosNovo = cAlvos.replace(
    /^const TARGETS = \{$/m,
    'const TARGETS = {\n  "/painel": { name: "Painel", target: 240, alarm: 260 },'
  );
  // A fixture REBENTA se nao alterou nada. Sem esta linha, uma mudanca de forma da constante
  // (era `[`, e um objecto `{`) fazia o `replace` nao casar, a customizacao nao acontecia, e a
  // simulacao passava a testar a preservacao de zero constantes — verde a afirmar nada. Foi
  // exactamente o que aconteceu, e so se viu por o contador dizer `0 preservada(s)`.
  if (cAlvosNovo === cAlvos) fatal(`nao consegui customizar TARGETS em ${relAlvos} — a forma da constante mudou`);

  // (d) A DECISAO do projeto: o gate dos bundles SUSPENSO. Nao e um valor tecnico — e a posicao
  //     que um consumidor toma quando liga a medicao a serio, encontra os alvos acima e abre um
  //     ticket. Foi exactamente esta decisao que se perdeu numa ronda de `/upgrade` real: o
  //     ficheiro veio, a constante voltou ao default, e o gate passou a reprovar **sem ninguem
  //     decidir nada**. Em silencio, com o verificador a correr e a medir bem.
  //
  //     A verificacao que o consumidor tinha era por DIFERENCA de output, e nao apanhou: nenhuma
  //     linha desapareceu — o veredicto e que mudou. Diferenca de output apanha o que some; nao
  //     apanha um default que regressa. Por isso e que isto se mede aqui, e nao se confia.
  const comGateSuspenso = cAlvosNovo.replace(/const ALVOS_REPROVAM = (?:true|false);/, "const ALVOS_REPROVAM = false;");
  if (comGateSuspenso === cAlvosNovo) fatal(`nao consegui suspender o gate em ${relAlvos} — o literal mudou de forma`);
  writeFileSync(join(dir, relAlvos), comGateSuspenso);
}
ok("conteudo proprio do projeto acrescentado (anti-padrao, verificador grande e uma constante customizada)");

// --- 3. FASE 1: o upgrade MECANICO -----------------------------------------------
// As categorias que a tabela do `/upgrade` resolve sem julgamento. O motor vive em
// `lib/upgrade-mecanico.mjs` — e a parte que escreve por cima dos ficheiros do consumidor, e
// num modulo proprio pode ser exercitada sem montar a simulacao inteira.
const medido = aplicaUpgradeMecanico({ dir, root: ROOT, tag, fatal, substituto: SUBSTITUTO });
ok(
  `upgrade mecanico aplicado: ${medido.repostas} constante(s) customizada(s) preservada(s), ` +
    `${medido.trazidos} doc(s) nao customizado(s) actualizado(s), ${medido.placeholders} com placeholders substituidos`
);

// A DECISAO do projeto sobrevive a travessia? E a pergunta que o `/upgrade` tem de responder
// com um facto e nao com uma lista: acrescentar a constante a tabela das preservadas nao prova
// que ela sobrevive — prova que alguem a escreveu la. Isto mede.
{
  const depois = leOuNull(join(dir, ".agent/scripts/check-bundle-sizes.mjs"));
  if (depois === null || !/const ALVOS_REPROVAM = false;/.test(depois)) {
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

/** Os comandos que o consumidor corre, DERIVADOS do job `guard-tests` do `ci.yml` do HEAD —
 *  e nao escritos a mao. Uma lista a mao mede menos a cada suite nova, em silencio. */
function comandosDoCI() {
  const ci = leOuNull(join(ROOT, ".github/workflows/ci.yml"));
  const job = ci?.split(/^  guard-tests:/m)[1];
  if (!job) return null;
  // EXCLUSOES, cada uma por uma razao concreta:
  //  - `check-test-surface`: precisa de um `.git` com historia, e o archive nao traz nenhum;
  //  - os dois simuladores: correriam DENTRO da copia e voltariam a copiar — recursao.
  const EXCLUIR = ["check-test-surface", "simulate-derived", "simulate-upgrade"];
  const achados = [...new Set([...job.matchAll(/run:\s*node\s+(\S+\.mjs)/g)].map((m) => m[1]))];
  return achados.filter((c) => !EXCLUIR.some((x) => c.includes(x)));
}

const COMANDOS = comandosDoCI();
if (COMANDOS === null || COMANDOS.length === 0) {
  fatal("nao derivei nenhum comando do job `guard-tests` do ci.yml — o job mudou de nome ou de formato?");
}

/** Corre a bateria na copia. Devolve os que sairam != 0, com a primeira linha util de cada um. */
function corre() {
  const falhados = [];
  for (const c of COMANDOS) {
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
  // "Limiar apertado" (Guard 17): os ficheiros do projeto ja acima das 500 linhas entram em
  // `TETOS` com a contagem do dia da migracao. E catraca, nao isencao: podem encolher, crescer
  // reprova. Mais do que uma adaptacao, isto verifica que a receita escrita na 2b FUNCIONA.
  const relGuard = ".agent/scripts/guards/sizes.mjs";
  const p = join(dir, relGuard);
  const c = leOuNull(p);
  if (c === null) fatal(`${relGuard} nao existe na copia — nao consigo aplicar a adaptacao do Guard 17`);
  const grandes = [];
  for (const base of [".agent/scripts", ".claude/hooks"]) {
    andaFicheiros(join(dir, base), (sub, nome) => {
      if (!nome.endsWith(".mjs")) return;
      const rel = `${base}/${sub}`;
      const n = readFileSync(join(dir, rel), "utf8").split("\n").length;
      if (n > 500 && !c.includes(`"${rel}"`)) grandes.push([rel, n]);
    });
  }
  if (grandes.length) {
    const entradas = grandes.map(([rel, n]) => `  ${JSON.stringify(rel)}: ${n},`).join("\n");
    writeFileSync(p, c.replace(/^export const TETOS = \{$/m, `export const TETOS = {\n${entradas}`));
    ok(`adaptacao 2b (Guard 17): ${grandes.length} ficheiro(s) do projeto congelado(s) em TETOS`);
  } else {
    ok("adaptacao 2b (Guard 17): nenhum ficheiro do projeto acima das 500 linhas por congelar");
  }
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
