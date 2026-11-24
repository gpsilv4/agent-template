/**
 * Os casos dos passos de DOCS do bootstrap (`lib/derivado-docs.mjs`: o `docs/README.md` do #585) — {{PROJECT_NAME}}
 *
 * Sairam do `test-simulate-derived.mjs` quando ele chegou as 483 linhas e o #495 precisava de mais casos (o precedente:
 * os `casos-*.mjs` do #400). NAO e uma suite nem um modulo descoberto: o `test-simulate-derived.mjs` importa-o e chama
 * `casosDosDocs` com o `test` dele (que monta a fixture e corre o simulador). Sem sitios de recusa: so regista.
 */
import { existsSync, readFileSync } from "fs";
import { join } from "path";

/** Igual ao modelo, byte a byte: o passo COPIA o modelo, e nao escreve outra coisa com o mesmo trecho (o leitor do #585). */
const igualAoModelo = (c, destino, modelo) =>
  existsSync(join(c, destino)) && readFileSync(join(c, destino), "utf8") === readFileSync(join(c, modelo), "utf8");

export function casosDosDocs(test) {
  // O `docs/` do produto (#585): o simulador cria o `docs/README.md` porque o TEXTO do BOOTSTRAP o manda. A ausencia
  // reprova — um `ok` calado deixava o critério nunca ficar vermelho (a 2.a leitura do plan-auditor do #585).
  // Cada caso afirma a SUA mensagem: as tres citam o `docs/README.md`, e trocar os ramos tem de ficar vermelho.
  test("BOOTSTRAP sem o passo do docs/README.md reprova (#585)", { semDocsReadme: "instrucao" }, { code: 1, includes: ["deixou de mandar"] });
  // O caminho do modelo CITADO noutro sitio do BOOTSTRAP nao conta como o passo (o leitor do #585).
  test("o caminho do modelo citado fora do passo nao conta como o passo (#585)", { semDocsReadme: "instrucao", bootstrapExtra: "\nTraduzir tambem o `src/docs/exemplos/docs-README.md`.\n" }, { code: 1, includes: ["deixou de mandar"] });
  test("o modelo do docs/README.md em falta reprova (#585)", { semDocsReadme: "modelo" }, { code: 1, includes: ["nao existe"] });
  test("o modelo do docs/README.md sem uma das 8 pastas reprova (#585)", { semDocsReadme: "pasta" }, { code: 1, includes: ["legal/"] });
  test("o derivado tem o docs/README.md criado do modelo (#585)", {}, {
    code: 0,
    args: ["--keep"],
    copia: (c) => (igualAoModelo(c, "docs/README.md", "src/docs/exemplos/docs-README.md") ? [] : ["a copia nao tem o docs/README.md igual ao modelo"]),
  });

  // O `docs/legal/` da privacidade (#495): o mesmo padrao — pelo TEXTO do BOOTSTRAP, ancorado a forma do passo.
  test("BOOTSTRAP sem o passo do docs/legal/ reprova (#495)", { semPrivacidade: "instrucao" }, { code: 1, includes: ["deixou de mandar criar o docs/legal/privacy-inventory.md"] });
  test("o caminho do modelo do inventario citado fora do passo nao conta (#495)", { semPrivacidade: "instrucao", bootstrapExtra: "\nVer o `src/docs/exemplos/privacy-inventory.md`.\n" }, { code: 1, includes: ["deixou de mandar criar o docs/legal/privacy-inventory.md"] });
  test("o modelo do inventario em falta reprova (#495)", { semPrivacidade: "modelo" }, { code: 1, includes: ["privacy-inventory.md nao existe"] });
  test("com \"sim\", o derivado tem o inventario e a politica iguais aos modelos (#495)", {}, {
    code: 0,
    args: ["--keep"],
    copia: (c) => ["privacy-inventory.md", "privacy-policy.md"].flatMap((n) =>
      igualAoModelo(c, `docs/legal/${n}`, `src/docs/exemplos/${n}`) ? [] : [`a copia nao tem o docs/legal/${n} igual ao modelo`]),
  });
  test("com \"nao\", so o nivel base: nada em docs/legal/ (#495)", {}, {
    code: 0,
    args: ["--keep"],
    env: { SIMULATE_PRIVACIDADE: "nao" },
    mostra: ["so o nivel base, nada em docs/legal/"],
    copia: (c) => (existsSync(join(c, "docs/legal")) ? ["com \"nao\", a copia nao devia ter o docs/legal/"] : []),
  });
  // Um valor que nao e `sim` nem `nao` recusa: calado, passava a "sim" (o leitor tecnico do #495).
  test("SIMULATE_PRIVACIDADE com outro valor recusa (#495)", {}, { code: 1, env: { SIMULATE_PRIVACIDADE: "no" }, includes: ["SIMULATE_PRIVACIDADE=no"] });
}
