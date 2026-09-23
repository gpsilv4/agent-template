/**
 * A MATURIDADE do derivado, na simulacao — {{PROJECT_NAME}}
 *
 * Os tres passos que levam o projeto simulado do **dia 1** ao **dia 100**: um anti-padrao
 * proprio, a configuracao preenchida, e ficheiros grandes seus. Extraidos do
 * `simulate-derived.mjs`, que estava em 500 linhas exactas — o limite do Guard 17 — e onde
 * uma alteracao funcional de duas linhas ja tinha exigido tres passagens a cortar comentario.
 *
 * OS CORPOS ESTAO VERBATIM, indentacao original incluida, pela mesma razao que o
 * `guards/derived-counts.mjs` e o `guards/settings.mjs`: o refactor tem de ser auditavel como
 * um MOVIMENTO — o output do simulador fica igual — e nao como uma reescrita onde um erro se
 * esconde. O que mudou foi a moldura: cada bloco `{ ... }` passou a funcao, e o que era
 * fechado por escopo (`dir`, `ok`, `fatal`) passa a parametro.
 *
 * PORQUE E UM MODULO E NAO UM HARNESS DE TESTE: isto e maquinaria de producao. Corre no CI,
 * em `.agent/scripts/`, e nao dentro de uma suite. Os harnesses vivem em `tests/harness/`.
 *
 * As recusas vivem aqui, logo este ficheiro leva a sua entrada em `PARES` no
 * `mutation-sweep.mjs` — sem ela a varredura cobria so o ficheiro de origem e reportava 100%
 * a mentir, porque os `fatal()` passaram a viver neste.
 *
 * @param dir    raiz da copia onde o derivado esta a ser montado
 * @param ok     reporter de sucesso do simulador
 * @param fatal  recusa do simulador: avisa e sai `!= 0` na hora
 */
import { readFileSync, writeFileSync } from "fs";
import { pathToFileURL } from "url";
import { join } from "path";
import { aplica } from "./patch.mjs";
import { leOuNull } from "./ficheiros.mjs";

// --- 3c. o derivado com HISTORIA, e nao so o dia 1 --------------------------------
// PORQUE EXISTE: este simulador validava o **dia 1**. O derivado que ele construia tinha zero
// anti-padroes proprios, os TETOS do template e nenhum ficheiro seu acima de 500 linhas — e
// por isso tres dos quatro achados da terceira ronda de revisao escaparam-lhe. Todos vivem no
// **dia 100**: so aparecem depois de o projeto escrever a primeira entrada `APn` sua, o
// primeiro teto seu, ou o primeiro ficheiro grande.
//
// O que se acrescenta aqui e a MATURIDADE: o derivado passa a ter um anti-padrao proprio, com
// um numero que NAO colide, e os guards tem de continuar verdes. Se um dia colidir — ou se o
// Guard 15 deixar de detetar a colisao — esta simulacao passa a reprovar sozinha, em vez de
// esperar que alguem corra o `/upgrade` num projeto real e o descubra.
export function comHistoria({ dir, ok }) {
  const rel = ".agent/rules/anti-patterns.md";
  const p2 = join(dir, rel);
  const c = leOuNull(p2);
  if (c !== null) {
    // O proximo ID livre no prefixo do PROJETO, e so nesse. Os `TPn` do template NAO entram
    // na conta: e essa a razao de ser dos prefixos separados — a numeracao do template nao
    // consome a do projeto, logo um derivado comeca no primeiro numero com o espaco todo
    // livre. Derivar daqui, em vez de escrever um numero a mao, e o que faz esta simulacao
    // reprovar sozinha no dia em que isso deixar de ser verdade.
    const usados = new Set();
    for (const m of c.matchAll(/^#{2,3}\s+AP(\d+)\b/gm)) usados.add(Number(m[1]));
    const livre = usados.size ? Math.max(...usados) + 1 : 1;
    writeFileSync(
      p2,
      c +
        `\n### AP${livre} — Entrada propria deste projeto (simulacao de derivado maduro)\n\n` +
        `- **Origem**: simulacao\n- **Anti-padrao**: o que nao fazer\n` +
        `- **Correto**: o que fazer\n- **Detecao em review**: \`grep -rn "exemplo" src/\`\n`
    );
    ok(`derivado com historia: anti-padrao proprio AP${livre} acrescentado (o proximo ID livre)`);
  }
}

// --- 3d. o derivado que CONFIGUROU -----------------------------------------------
// PORQUE EXISTE: um template por estrear tem a configuracao VAZIA, e nenhum teste que leia
// essas listas em vez de as MONTAR pode falhar aqui. E o `TP3` do lado do simulador. A medicao
// que o prova esta em `src/docs/scripts-guide-why.md`.
export function queConfigurou({ dir, ok, fatal }) {
  /** Substitui um literal na copia, e REPROVA se nao casar. Um patch que nao aplica deixa a
   *  simulacao a medir o template por estrear outra vez, em silencio — que e o defeito que
   *  este bloco existe para fechar. Falhar alto e a unica alternativa honesta. */
  const configura = (rel, padrao, novo, o_que) => {
    const p = join(dir, rel);
    const c = leOuNull(p);
    if (c === null) fatal(`${rel} nao existe na copia — nao consigo simular ${o_que}`);
    // `ja-estava` NAO e falha — porque, em `lib/patch.mjs`.
    const r = aplica(c, padrao, novo);
    if (r.estado === "sem-alvo") fatal(`nao consegui configurar ${o_que} em ${rel} — o literal mudou de forma`);
    if (r.estado === "aplicado") writeFileSync(p, r.texto);
  };

  // (a) `CHECKS` — o opt-in dos guards de versoes. Vazia, o guard SALTA; preenchida, corre. Um
  //     teste que assuma a lista vazia fica vermelho em qualquer projeto que a preencha.
  configura(
    ".agent/scripts/guards/versions.mjs",
    /const CHECKS = \[[\s\S]*?\n\];/,
    'const CHECKS = [\n  { name: "Framework", pkg: "framework-do-projeto", pattern: /Framework\\s+(\\d+)/g, files: ["README.md"] },\n];',
    "os guards de versoes de dependencias"
  );

  // (b) `BANNED` — os termos obsoletos deste projeto. O template deixa-a vazia.
  configura(
    ".agent/scripts/check-doc-versions.mjs",
    /const BANNED = \[/,
    'const BANNED = [\n  { re: /NomeAntigoDoProjeto/g, msg: "nome anterior ao rebrand" },',
    "os termos obsoletos"
  );

  // (c) O gate dos bundles SUSPENSO. E a posicao que um derivado toma quando liga a medicao a
  //     serio e encontra os alvos acima — e o interruptor existe para isso. Um teste que so
  //     saiba ir de `true` para `false` rebenta aqui, que foi exactamente o que aconteceu.
  // Na `config/`, que e onde a DECISAO agora vive — e nao no ficheiro da logica, que o upgrade
  // substitui. Foi esta mudanca de casa que fechou a classe: preservar por nome era mitigacao.
  configura(
    ".agent/scripts/config/bundles.mjs",
    /export const ALVOS_REPROVAM = (?:true|false);/,
    "export const ALVOS_REPROVAM = false;",
    "o gate dos bundles suspenso"
  );

  // (d) A PROSA reescrita. Um derivado nao mantem a redaccao do template: reescreve-a a sua
  //     maneira. Uma fixture que ancore na redaccao do template nao casa nada aqui — e uma
  //     fixture que nao muta nada da um teste verde que nao mediu coisa nenhuma.
  configura(
    ".agent/rules/process-rules.md",
    /passa por 6 fases/,
    "atravessa seis fases (0 a 5)",
    "a prosa reescrita pelo projeto"
  );

  ok("derivado que CONFIGUROU: CHECKS, BANNED, gate dos bundles suspenso e prosa reescrita");
}

// --- 3e. o derivado com ficheiros GRANDES seus -----------------------------------
// A terceira dimensao que o comentario do 3c nomeia e nao implementa. Os `TETOS` do Guard 17
// sao por natureza do PROJETO — contagens de linhas dos ficheiros dele — e qualquer derivado
// os reescreve. Um teste que crave o nome de um ficheiro congelado pelo TEMPLATE rebenta no
// setup do consumidor com `ENOENT`, e foi assim que quatro testes ficaram vermelhos numa ronda.
export async function comFicheirosGrandes({ dir, ok, fatal }) {
  const rel = ".agent/scripts/check-dominio.mjs";
  writeFileSync(join(dir, rel), "#!/usr/bin/env node\n// Verificador proprio deste projeto.\n" + "// linha\n".repeat(540));
  const relGuard = ".agent/scripts/guards/sizes.mjs";
  const p = join(dir, relGuard);
  const c = leOuNull(p);
  if (c === null) fatal(`${relGuard} nao existe na copia`);
  // A contagem vem do GUARD, nao de uma copia local: reimplementada aqui media +1 e congelava
  // este ficheiro em 543 tendo 542 — a TERCEIRA copia do mesmo defeito, e o cabecalho do
  // `contaLinhas` diz porque foi exportado. DINAMICO pela razao da 2b: um `import` no topo
  // tornava a ausencia do guard um crash em vez do `fatal` acima, que a reporta.
  const { contaLinhas } = await import(pathToFileURL(p).href);
  const n = contaLinhas(readFileSync(join(dir, rel), "utf8"));
  // ACRESCENTA, nao substitui. Um derivado fica com os ficheiros grandes do template (que
  // copiou) **e** os seus — os dois conjuntos, nao um deles. Substituir simulava um projeto que
  // apagou os ficheiros do template, que nao e um derivado: e outra coisa. Medido — a versao
  // que substituia punha o Guard 17 a reclamar de tres ficheiros do proprio template.
  const depois = c.replace(/export const TETOS = \{/, `export const TETOS = {\n  ${JSON.stringify(rel)}: ${n},`);
  if (depois === c) fatal(`nao consegui reescrever os TETOS em ${relGuard} — o literal mudou de forma`);
  writeFileSync(p, depois);
  ok(`derivado com ficheiros grandes seus: ${rel} (${n} linhas) congelado, TETOS do projeto`);
}
