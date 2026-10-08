/**
 * Testes de `lib/saida-upgrade.mjs` — {{PROJECT_NAME}}
 *
 * O dono do modulo pela convencao do registo. NAO e um entry point: o `test-guards.mjs` descobre-o.
 * O que se mede e a promessa do cabecalho dele: os DOIS modos do `/upgrade` mostram o mesmo, pela
 * mesma ordem. Escrita em cada modo, a impressao ja tinha divergido duas vezes (#176, #243).
 */
import { pathToFileURL } from "url";
import { readFileSync } from "fs";
import { join } from "path";
import { registarResultado, ROOT } from "./harness/test-harness.mjs";
import { blocosAntesDeAprovar } from "../lib/saida-upgrade.mjs";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.error("tests-saida-upgrade.mjs nao e um entry point: nao corre testes por si.\nCorrer `node .agent/scripts/tests/test-guards.mjs`.");
  process.exit(1);
}

/** Entry point a que este modulo pertence. Ver `lib/registo.mjs`. */
export const entryPoint = "test-guards.mjs";

const VAZIO = { substituidos: [], naoCopiados: [], migracoes: [], removidos: [] };
const CHEIO = {
  substituidos: [".agent/scripts/x.mjs"],
  naoCopiados: [{ caminho: ".env", razao: "segredo" }],
  migracoes: [{ nome: "K", de: "a.mjs", para: "config/a.mjs" }],
  removidos: [{ caminho: ".agent/scripts/velho.mjs", migrado: false }],
};

export function registar() {
  {
    const titulos = blocosAntesDeAprovar({ medido: CHEIO, agentes: ["leitor.md"], desde: "v1.0.0" }).map(([t]) => t);
    const ordem = [/ALTEROU/, /NAO foram copiados/, /agente\(s\)/, /mudaram de casa/, /sairam do template desde v1\.0\.0/];
    registarResultado("saida-upgrade: os cinco blocos, pela ordem que os dois modos partilham",
      titulos.length === ordem.length && ordem.every((re, i) => re.test(titulos[i])) ? [] : [`ficou: ${JSON.stringify(titulos)}`]);
  }
  registarResultado("saida-upgrade: sem nada a mostrar, nenhum bloco (e sem `migracoes`, nao rebenta)",
    blocosAntesDeAprovar({ medido: { ...VAZIO, migracoes: undefined }, agentes: [], desde: "v1.0.0" }).length === 0 ? [] : ["deu blocos vazios"]);
  {
    const linhas = (migrado) =>
      blocosAntesDeAprovar({ medido: { ...VAZIO, removidos: [{ caminho: "a/x.mjs", migrado }] }, agentes: [], desde: "v1" }).flat().join("\n");
    registarResultado("saida-upgrade: a nota da MIGRACAO so aparece quando ha um migrado", [
      ...(/MIGRADO[\s\S]*1 sao MIGRACAO/.test(linhas(true)) ? [] : ["um migrado sem a nota"]),
      ...(/MIGRA/.test(linhas(false)) ? ["uma limpeza com a nota da migracao"] : []),
    ]);
  }
  // Os dois chamadores usam a funcao e mais nada: uma lista impressa a parte voltava a divergir —
  // por uma chamada `linhas*(`, ou por uma copia a mao do texto (a nota da migracao ficou assim
  // duplicada na 2b, apanhado pelo leitor independente).
  const aParte = /\blinhas(?:Substituidos|NaoCopiados|Agentes|Migracoes|Removidos)\(|MIGRACAO, nao limpeza|sairam do template/;
  registarResultado("saida-upgrade: o simulador e a 2b imprimem so pela funcao partilhada",
    [".agent/scripts/simulate-upgrade.mjs", ".agent/scripts/lib/medida-upgrade.mjs"].flatMap((rel) => {
      const src = readFileSync(join(ROOT, rel), "utf8");
      return [
        ...(src.includes("imprimeAntesDeAprovar(") ? [] : [`${rel} nao chama imprimeAntesDeAprovar`]),
        ...(aParte.test(src) ? [`${rel} imprime uma lista a parte`] : []),
      ];
    }));
}
