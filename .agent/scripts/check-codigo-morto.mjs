#!/usr/bin/env node
/**
 * Codigo morto na maquinaria: imports que ninguem usa — {{PROJECT_NAME}}
 *
 * PORQUE EXISTE: o codigo morto **viaja** do template para os derivados e so la aparece, num
 * `/review` de alguem que nao o escreveu. A ronda 4 encontrou quatro casos; medi hoje e sao
 * **dezoito** — e a razao esta identificada: a catraca do Guard 17 obriga a dividir ficheiros, e
 * cada divisao deixa imports para tras. Duas das extracoes de hoje deixaram os seus, e uma delas
 * foi neste mesmo turno.
 *
 * PORQUE NAO O `eslint`: o `core-rules.md` diz que estes verificadores **so precisam de `node`**
 * — sem dependencias, sem `package.json` — e e isso que os faz correr no template nu, em qualquer
 * derivado e para qualquer agente. Trazer uma dependencia npm para o job `guard-tests` quebrava
 * exactamente a propriedade que o torna universal.
 *
 * COMO CONTA, e e aqui que a versao ingenua falha: as ocorrencias contam-se sobre **codigo**, nao
 * sobre texto. Um nome mencionado num comentario ou dentro de uma string nao e uso. A ronda 4
 * reportou `sandbox` e `GUARD` como falsos positivos exactamente por isso — e verificado hoje,
 * **estao mesmo mortos**: as outras ocorrencias eram um comentario e a propria linha de import.
 * Contar texto dava o veredicto errado nos dois sentidos.
 *
 * O QUE NAO MEDE, dito por inteiro: so olha para **imports**. Uma funcao interna que ninguem
 * chama, uma constante exportada que ninguem importa, um ramo inalcancavel — nada disso e visto.
 * Alargar e possivel e e outro trabalho; prometer mais do que se mede era o defeito que este repo
 * passa a vida a apanhar.
 *
 * Sem dependencias e sem package.json, como os outros scripts de `.agent/scripts/`.
 *
 *   node .agent/scripts/check-codigo-morto.mjs
 *
 * Sai `!= 0` se encontrar algum. Corre no CI, no job `guard-tests`.
 */

import { readdirSync, readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve, join } from "path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Onde vive a maquinaria. O codigo da APP nao entra: cada projeto traz a sua stack e as suas
 *  excecoes legitimas, e um verificador que varresse `src/` era ruido no dia 1. */
const PASTAS = [".agent/scripts", ".claude/hooks"];

/** O texto sem o que NAO e codigo: strings e comentarios.
 *
 *  Nao e cosmetico — e a diferenca entre um veredicto certo e um errado, nos dois sentidos. Um
 *  nome citado num comentario faz um import morto passar por vivo; um nome dentro de uma fixture
 *  (que neste repo sao strings com codigo la dentro) faz o mesmo. Molde: o `semStrings()` do
 *  `check-test-surface.mjs`, que resolveu a mesma classe. */
function soCodigo(src) {
  // LINHA A LINHA, e a ordem importa: tirar o comentario ANTES de tirar as strings, e nunca
  // aplicar o regex de string ao ficheiro inteiro.
  //
  // A primeira versao fazia o contrario e comia **92% do ficheiro**: 27 126 caracteres reduzidos
  // a 2 288. Basta uma aspa solta dentro de um comentario — uma apostrofe em prosa portuguesa — e
  // o regex de string consome ate a aspa seguinte, atravessando dezenas de linhas de codigo real.
  // Resultado: quatro imports em uso dados como mortos, no `guard-protected-branch.mjs`.
  //
  // Por linha, uma aspa solta estraga **essa** linha e mais nenhuma. O dano fica contido, e o
  // modo de falha passa a ser sub-reportar um uso (falso positivo isolado) em vez de apagar
  // blocos inteiros.
  return src
    .split("\n")
    .map((l) => {
      if (/^\s*(?:\/\/|\*|\/\*)/.test(l)) return "";
      // O comentario de fim de linha sai primeiro: `const x = 1; // ver `nome`` nao e um uso.
      const semComentario = l.replace(/\/\/[^\n]*$/, "");
      // As INTERPOLACOES de uma template string sao CODIGO: `${GUARD_MODULES}/x.mjs` USA o nome.
      // Apagar a string inteira dava-o por morto — e este detector acusou dois nomes em uso por
      // causa disso. Um deles partiu uma suite quando eu acreditei nele e o removi.
      return semComentario
        .replace(/`[^`]*`/g, (m) => [...m.matchAll(/\$\{([^}]*)\}/g)].map((x) => x[1]).join(" ") || '""')
        .replace(/'[^']*'|"[^"]*"/g, '""');
    })
    .join("\n");
}

/** Os nomes que uma linha de `import { ... }` traz. `a as b` conta como `b` — e o nome pelo qual
 *  o ficheiro o usa. */
function importados(src) {
  const nomes = [];
  for (const m of src.matchAll(/^import\s*\{([^}]+)\}\s*from\s*["'][^"']+["'];?\s*$/gm)) {
    for (const bruto of m[1].split(",")) {
      const nome = bruto.trim().split(/\s+as\s+/).pop().trim();
      if (nome) nomes.push({ nome, linha: src.slice(0, m.index).split("\n").length });
    }
  }
  return nomes;
}

function anda(dir, out = []) {
  let entradas;
  try {
    entradas = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entradas) {
    const p = join(dir, e.name);
    if (e.isDirectory()) anda(p, out);
    else if (e.name.endsWith(".mjs")) out.push(p);
  }
  return out;
}

console.log("\n=== Codigo morto: imports por usar ===\n");

const presentes = PASTAS.filter((p) => existsSync(join(ROOT, p)));
if (presentes.length === 0) {
  // Um projeto derivado pode ter removido a maquinaria. "Nao encontrei" tem de o DIZER: um zero
  // lido como "nao ha problemas" e o `TP2`, e este repo tem o script inteiro do sweep por causa
  // disso.
  console.log(`  SKIP  nenhuma das pastas existe (${PASTAS.join(", ")}) — nada a varrer\n`);
  process.exit(0);
}

const ficheiros = presentes.flatMap((p) => anda(join(ROOT, p)));
if (ficheiros.length === 0) {
  console.log(`  SKIP  sem ficheiros .mjs em ${presentes.join(", ")}\n`);
  process.exit(0);
}

let mortos = 0;

/** Um achado. Funcao propria e nao um `console.log` solto, e a razao nao e estilo: **este e o
 *  sitio de recusa deste verificador**, e a varredura de mutacao precisa de o poder desligar
 *  para provar que a suite fica vermelha.
 *
 *  Com o texto dentro de um `console.log`, o sinal nao casava nada: a varredura **tira as
 *  strings** antes de procurar o padrao, e o `MORTO` desaparecia com elas. Deu `SINAL ERRADO`,
 *  que e exactamente o aviso que existe para apanhar um par desactualizado. */
const morto = (m) => {
  console.log(`  MORTO  ${m}`);
  mortos++;
};
for (const abs of ficheiros.sort()) {
  const rel = abs.slice(ROOT.length + 1);
  let src;
  try {
    src = readFileSync(abs, "utf8");
  } catch {
    continue; // ilegivel: nao e o trabalho deste verificador reportar isso
  }
  const codigo = soCodigo(src);
  for (const { nome, linha } of importados(src)) {
    // `> 1` e nao `> 0`: a propria linha de import conta uma vez.
    const usos = (codigo.match(new RegExp(`\\b${nome.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g")) || []).length;
    if (usos <= 1) morto(`${rel}:${linha} — \`${nome}\` importado e nunca usado`);
  }
}

console.log("");
if (mortos) {
  console.log(`  ${mortos} import(s) por usar. Cada divisao de ficheiro deixa os seus: remover e trabalho de um minuto,`);
  console.log("  e deixa-los viaja para todos os projetos derivados.\n");
  process.exit(1);
}
console.log(`  ${ficheiros.length} ficheiros varridos, nenhum import por usar.\n`);
process.exit(0);
