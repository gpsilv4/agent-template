/**
 * Os passos de DOCS do bootstrap que o `simulate-derived` reproduz — {{PROJECT_NAME}}
 *
 * Sairam do `simulate-derived.mjs` quando ele chegou as 479 linhas e o #495 precisava de mais um passo (o `docs/legal/`),
 * como a maturidade foi para o `derivado-maduro.mjs`. Cada passo deriva-se do TEXTO do `BOOTSTRAP.md` (o que ele manda
 * fazer), e a AUSENCIA reprova: com um `ok` calado, um BOOTSTRAP que perdesse o passo passava verde.
 *
 * NAO e um entry point: o `simulate-derived.mjs` chama estas funcoes sobre a copia (`dir`), com o BOOTSTRAP do `ROOT`.
 */
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { leOuNull } from "./ficheiros.mjs";

/** O `docs/` do produto (#585): o BOOTSTRAP manda criar o `docs/README.md` (o indice das 8 pastas) a partir do modelo. */
export function comDocsDoProduto({ ROOT, dir, ok, fatal }) {
  const MODELO = "src/docs/exemplos/docs-README.md";
  const PASTAS = ["product", "architecture", "development", "operations", "audits", "strategy", "legal", "reference"];
  const modelo = leOuNull(join(dir, MODELO));
  const faltam = PASTAS.filter((p) => !(modelo ?? "").includes(`\`${p}/\``));
  // Ancorado a FORMA do passo, e nao ao caminho solto: citado noutro sitio do BOOTSTRAP, o passo podia sair e isto
  // continuava verde (o leitor do #585).
  const porque = !(leOuNull(join(ROOT, ".agent/BOOTSTRAP.md")) ?? "").includes(`**\`docs/README.md\`**: criar a partir de \`${MODELO}\``)
    ? "o BOOTSTRAP deixou de mandar criar o docs/README.md a partir do modelo"
    : modelo === null ? `o BOOTSTRAP manda criar o docs/README.md, e o ${MODELO} nao existe`
      : faltam.length ? `o ${MODELO} nao tem a(s) pasta(s): ${faltam.map((p) => `${p}/`).join(", ")}` : null;
  if (porque) fatal(`${porque} (#585)`);
  mkdirSync(join(dir, "docs"), { recursive: true });
  writeFileSync(join(dir, "docs/README.md"), modelo);
  ok("o docs/ do produto: o docs/README.md criado do modelo, com as 8 pastas (BOOTSTRAP, #585)");
}

/** O `docs/legal/` da privacidade (#495): com "sim" a 1.a pergunta, o BOOTSTRAP manda criar o inventario e a politica a
 *  partir dos modelos. O simulador responde "sim" por omissao (exercita mais); `resposta: "nao"` (`SIMULATE_PRIVACIDADE`,
 *  lida e limpa pelo simulador) e o caminho do nivel base, para a suite (sem uma 5.a corrida no pos-commit). A traducao
 *  da politica e do agente: aqui, a lingua do template. */
export function comPrivacidade({ ROOT, dir, ok, fatal, resposta = "sim" }) {
  if (resposta !== "sim" && resposta !== "nao") fatal(`SIMULATE_PRIVACIDADE=${resposta}: so "sim" ou "nao" (#495)`);
  if (resposta === "nao") {
    ok("a privacidade: \"nao\" a 1.a pergunta — so o nivel base, nada em docs/legal/ (#495)");
    return;
  }
  const bootstrap = leOuNull(join(ROOT, ".agent/BOOTSTRAP.md")) ?? "";
  for (const nome of ["privacy-inventory.md", "privacy-policy.md"]) {
    const MODELO = `src/docs/exemplos/${nome}`;
    const modelo = leOuNull(join(dir, MODELO));
    // Ancorado a FORMA do passo (o precedente do #585): o caminho citado noutro sitio do BOOTSTRAP nao conta.
    const porque = !bootstrap.includes(`criar \`docs/legal/${nome}\` a partir de \`${MODELO}\``)
      ? `o BOOTSTRAP deixou de mandar criar o docs/legal/${nome} a partir do modelo`
      : modelo === null ? `o BOOTSTRAP manda criar o docs/legal/${nome}, e o ${MODELO} nao existe` : null;
    if (porque) fatal(`${porque} (#495)`);
    mkdirSync(join(dir, "docs/legal"), { recursive: true });
    writeFileSync(join(dir, `docs/legal/${nome}`), modelo);
  }
  ok("a privacidade: \"sim\" — o docs/legal/ com o inventario e a politica criados dos modelos (BOOTSTRAP, #495)");
}
