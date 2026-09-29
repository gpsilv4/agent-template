/**
 * O ALCANCE dos guards — uma pasta em falta passa a ser VERMELHA — {{PROJECT_NAME}}
 *
 * NAO e um entry point: o `test-guards.mjs` descobre-o em disco e chama `registar()`.
 *
 * ## Porque existe
 *
 * Tres guards varrem o repo a procura de coisas diferentes, cada um com a sua lista de pastas
 * **escrita a mao**. Uma pasta que falte nao produz erro: produz **silencio** — os ficheiros la
 * dentro deixam de ser verificados e ninguem repara.
 *
 * A classe ja apareceu CINCO vezes, e duas estavam VIVAS no dia em que este ficheiro nasceu:
 *
 *   - a `config/` fora do Guard 13, com placeholders nos dois ficheiros la dentro — e o Guard 13
 *     e a UNICA rede contra um placeholder esquecido depois do bootstrap;
 *   - a `tests/` fora do Guard 15, com **30** ficheiros a citar anti-padroes. Ao fecha-la, a
 *     contagem do guard saltou de 174 para 311: **137 citacoes** que ninguem verificava.
 *
 * A quinta foi a mais instrutiva de todas: ao mover codigo para `lib/` noutro ticket, a contagem
 * do proprio Guard 15 **DESCEU** de 136 para 135. Mover um ficheiro tirava-o da rede, e so
 * apareceu porque alguem foi verificar uma diferenca de 1.
 *
 * ## O que este ficheiro afirma
 *
 * Que **toda a pasta do repo com ficheiros relevantes esta no alcance, ou esta excluida com a
 * razao escrita**. Nao iguala os tres alcances — os tres perguntam coisas diferentes, e algumas
 * diferencas sao legitimas. O que deixa de ser possivel e uma diferenca **por esquecimento**.
 *
 * As excepcoes sao verificadas nos dois sentidos: uma que falte e um buraco, e uma que **ja nao
 * isente nada** e um ponto cego a espera do ficheiro seguinte.
 */
import { pathToFileURL } from "url";
import { join } from "path";
import { readdirSync } from "fs";
import { registarResultado, ROOT } from "./harness/test-harness.mjs";
import { alvosPlaceholders } from "../guards/placeholders.mjs";
import { alvosDe } from "../guards/anti-patterns.mjs";
import {
  pastasComCandidatos,
  TEM_PLACEHOLDER,
  CITA_ANTIPADRAO,
} from "../lib/alcance.mjs";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.error(
    "tests-alcance.mjs nao e um entry point: nao corre testes por si.\n" +
      "Correr `node .agent/scripts/tests/test-guards.mjs`."
  );
  process.exit(1);
}

/** Entry point a que este modulo pertence. */
export const entryPoint = "test-guards.mjs";

/** As pastas que um guard pode legitimamente NAO varrer, cada uma com a razao.
 *
 *  Uma entrada aqui e uma decisao, nao um esquecimento — e e por isso que leva texto. Sem esta
 *  lista, o teste abaixo so podia exigir que os tres alcances fossem iguais, o que seria falso:
 *  os tres perguntam coisas diferentes. */
const FORA_COM_RAZAO = {
  // VAZIO, e isso e o resultado: depois de fechar as quatro lacunas vivas, nao sobrou uma unica
  // pasta com conteudo relevante fora do alcance. As entradas que aqui estiveram sairam todas
  // porque o teste da direita as declarou desnecessarias — que e o ponto de o teste existir nos
  // dois sentidos.
  placeholders: {},
  antipadroes: {},
};

/** O `listDir` real, como o `check-doc-versions.mjs` o passa aos guards. */
const listDir = (rel, ext) => {
  try {
    return readdirSync(join(ROOT, rel), { withFileTypes: true })
      .filter((e) => e.isFile() && e.name.endsWith(ext))
      .map((e) => e.name.slice(0, -ext.length));
  } catch {
    return [];
  }
};

/** As pastas que um guard varre de facto — PERGUNTADAS A FONTE.
 *
 *  A primeira versao lia as chamadas `listDir(` do codigo-fonte do guard, e isso tinha um modo
 *  de falha que o controlo negativo apanhou: a `FIXTURES_DE_OUTRO_REPO` do Guard 15 contem
 *  CAMINHOS de ficheiro, e o parser contava-os como prova de cobertura. Tirar uma pasta do
 *  alcance deixava o teste VERDE — `TP1` na forma canonica, uma assercao satisfeita por outra
 *  coisa que nao o facto.
 *
 *  Chamar a funcao nao tem esse modo de falha: o que ela devolve E o alcance. */
const ficheirosDoAlcance = (alvos) => new Set(alvos);

export function registar() {
  const casos = [
    {
      nome: "placeholders (Guard 13)",
      alcance: () => ficheirosDoAlcance(alvosPlaceholders(listDir)),
      interessa: TEM_PLACEHOLDER,
      fora: FORA_COM_RAZAO.placeholders,
    },
    {
      nome: "anti-padroes (Guard 15)",
      alcance: () => ficheirosDoAlcance(alvosDe(listDir)),
      interessa: CITA_ANTIPADRAO,
      fora: FORA_COM_RAZAO.antipadroes,
    },
  ];

  // Uma arvore sem git nao tem resposta honesta a dar — ver `pastasComCandidatos`. O SKIP e
  // VISIVEL no nome do teste, e nao um `return` silencioso: um guard que se cala sem dizer que
  // se calou e o `TP2`, e este ficheiro existe precisamente contra o silencio.
  const semGit = pastasComCandidatos(ROOT, CITA_ANTIPADRAO) === null;
  const rotulo = (n) => (semGit ? `${n} — SALTADO (arvore sem git)` : n);

  for (const { nome, alcance, interessa, fora } of casos) {
    registarResultado(
      rotulo(`alcance: todo o ficheiro com conteudo relevante esta no alcance do ${nome}`),
      (() => {
        const noDisco = pastasComCandidatos(ROOT, interessa);
        if (noDisco === null) return [];
        const varridos = alcance();
        // Por FICHEIRO, e nao por pasta. A primeira versao comparava pastas, e o controlo
        // negativo mostrou o buraco: tirar `.github/CODEOWNERS` do Guard 13 ficava VERDE,
        // porque o `.github/` continuava "coberto" por outros ficheiros nomeados. E precisamente
        // em `.github/` que a cobertura e ficheiro-a-ficheiro, logo era ai que falhava.
        const faltam = [];
        for (const [pasta, fich] of noDisco) {
          if (pasta in fora) continue;
          for (const f of fich) {
            const caminho = pasta === "." ? f : `${pasta}/${f}`;
            if (!varridos.has(caminho)) faltam.push([caminho, pasta]);
          }
        }
        return faltam.map(
          ([caminho, pasta]) =>
            `"${caminho}" tem conteudo relevante e NAO esta no alcance do ${nome}. ` +
            `Acrescentar o ficheiro (ou a pasta "${pasta}"), ou por uma entrada em ` +
            `FORA_COM_RAZAO com a razao — o que esta fora do alcance nao produz erro, ` +
            `produz silencio`
        );
      })(),
      ""
    );

    registarResultado(
      rotulo(`alcance: nenhuma excepcao do ${nome} esta a mais`),
      (() => {
        const noDisco = pastasComCandidatos(ROOT, interessa);
        // Uma excepcao para uma pasta que JA esta no alcance, ou que nao tem conteudo relevante
        // nenhum, nao isenta nada — e fica la a dar a impressao de que alguem pensou nisso.
        const varridos = alcance();
        const cobertaPorInteiro = (p) =>
          (noDisco.get(p) ?? []).every((f) => varridos.has(p === "." ? f : `${p}/${f}`));
        return Object.keys(fora)
          .filter((p) => !noDisco.has(p) || cobertaPorInteiro(p))
          .map(
            (p) =>
              `"${p}" esta em FORA_COM_RAZAO mas ${noDisco.has(p) ? "ja esta TODA no alcance" : "nao tem conteudo relevante"} ` +
              `— a excepcao nao isenta nada e devia sair`
          );
      })(),
      ""
    );
  }

  // O contra-caso: sem ele, um `pastasComCandidatos` que devolvesse VAZIO passava os testes
  // acima todos, e este ficheiro afirmava exactamente nada (`TP2`).
  registarResultado(
    rotulo("alcance: a varredura encontra alguma coisa"),
    (() => {
      if (semGit) return [];
      const n = pastasComCandidatos(ROOT, CITA_ANTIPADRAO).size;
      return n >= 5
        ? []
        : [`a varredura do disco devolveu ${n} pasta(s) — com tao poucas, os testes acima nao afirmam nada`];
    })(),
    ""
  );
}
