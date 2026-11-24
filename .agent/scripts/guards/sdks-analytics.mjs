/**
 * Guard 24: um SDK de analytics ou de telemetria no `package.json` (#495) — {{PROJECT_NAME}}
 *
 * E a UNICA peca da `.agent/rules/privacy.md` que uma maquina verifica a cada commit: um SDK de analytics e, ele
 * proprio, o sinal de que ha dados pessoais. Sem o inventario (o nivel base), lembra "passar ao nivel completo"; com o
 * inventario (`docs/legal/privacy-inventory.md`), lembra o SDK que la nao aparece.
 *
 * So NOTE (sai 0), e nunca WARN: a lista nunca esta completa, e um SDK pode estar configurado sem enviar dados
 * pessoais (o porque: `src/docs/privacy-why.md`). So o `package.json`: as outras stacks ficam para um issue proprio.
 *
 * A ordem dos ramos importa (a 2.a leitura do `plan-auditor` do #495): (1) sem `package.json`, SKIP — e o SKIP
 * congelado em `COMUNS` (`tests-skips-congelados.mjs`), porque nem o template nem a fixture o tem; (2) um
 * `package.json` invalido sai calado, porque o Guard 3 ja o diz; (3) sem a lista (uma sandbox minima, sem `config/`),
 * SKIP com a razao. O `package.json` le-se pelo MESMO memo do Guard 3 (`pkgRawOnce`), sem uma segunda copia (`TP8`).
 *
 * Os avisos vivem aqui, logo este ficheiro esta em `PARES` (`lib/pares-guards.mjs`), com o sinal `note(`.
 */
import { pkgRawOnce } from "./versions.mjs";
import { literalEmRegex } from "../lib/regex-literal.mjs";

/** O SDK esta no `package.json`: um nome exato, ou um PREFIXO (terminado em `/` ou em `-`: `@sentry/`, `@datadog/browser-`). */
const usa = (deps, sdk) => deps.some((d) => sdk.pacotes.some((p) => (/[/-]$/.test(p) ? d.startsWith(p) : d === p)));

/** O SDK aparece numa LINHA DE TABELA do inventario, como palavra e com as MAIUSCULAS do nome (`TP1`): "amplitude" numa
 *  frase em portugues nao e a Amplitude (o leitor do #495). */
const noInventario = (tabela, sdk) => sdk.nomes.some((n) => new RegExp(`(?<![\\w])${literalEmRegex(n)}(?![\\w])`).test(tabela));

/** @returns {number} guards executados */
export function guardSdksDeAnalytics({ read, note, ok, skip, sdks }) {
  const raw = pkgRawOnce(read);
  if (raw === null) {
    skip("Guard 24 (SDKs de analytics) — sem package.json");
    return 1;
  }
  let pkg;
  try {
    pkg = JSON.parse(raw);
  } catch {
    return 1; // o Guard 3 ja diz que o package.json e invalido: dizer outra vez era ruido
  }
  if (!Array.isArray(sdks)) {
    skip("Guard 24 (SDKs de analytics) — sem a lista (.agent/scripts/config/sdks-de-analytics.mjs)");
    return 1;
  }
  const deps = Object.keys({ ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}), ...(pkg.optionalDependencies ?? {}) });
  const presentes = sdks.filter((s) => usa(deps, s));
  if (presentes.length === 0) {
    ok("Guard 24: nenhum SDK de analytics da lista no package.json");
    return 1;
  }
  const inventario = read("docs/legal/privacy-inventory.md");
  if (inventario === null) {
    for (const s of presentes) {
      note(`Guard 24: ${s.produto} no package.json sugere dados pessoais — passar ao nivel completo da .agent/rules/privacy.md (o inventario em docs/legal/)`);
    }
    return 1;
  }
  const tabela = inventario.split("\n").filter((l) => /^\s*\|/.test(l)).join("\n");
  const faltam = presentes.filter((s) => !noInventario(tabela, s));
  for (const s of faltam) note(`Guard 24: ${s.produto} esta no package.json e nao aparece numa linha do inventario (docs/legal/privacy-inventory.md)`);
  if (faltam.length === 0) ok(`Guard 24: ${presentes.length} SDK(s) de analytics, todos no inventario`);
  return 1;
}
