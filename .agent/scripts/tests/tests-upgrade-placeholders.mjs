/**
 * Testes do motor do `/upgrade` com os PLACEHOLDERS reais do projeto — {{PROJECT_NAME}}
 *
 * O motor decidia "intacto ou customizado" trocando TODOS os `{{ X }}` da tag por um so
 * `substituto` — na 2b, o nome de fachada `EsteProjeto`. No derivado real, a 2b trazia 2
 * documentos onde eram 7 (R7-C, #179). Estes casos medem a comparacao a menos dos placeholders, a
 * recolha dos valores reais, e a recusa quando eles nao concordam.
 *
 * NAO e um entry point. O `test-simulate-upgrade.mjs` importa-o e chama `registar()`.
 */
import { pathToFileURL } from "url";
import { execFileSync } from "child_process";
import { join } from "path";
import { cenario, limpa, test } from "./harness/test-upgrade-harness.mjs";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.error("tests-upgrade-placeholders.mjs nao e um entry point: nao corre testes por si.\nCorrer `node .agent/scripts/tests/test-simulate-upgrade.mjs`.");
  process.exit(1);
}

/** Entry point a que este modulo pertence. */
export const entryPoint = "test-simulate-upgrade.mjs";

// Os placeholders MONTADOS: escritos por extenso, o sweep do bootstrap substitui-los-ia num derivado.
const P = (x) => "{" + "{" + x + "}" + "}";
const NOME = P("PROJECT_NAME");
const LINGUA = P("UI_LANGUAGE");

/** Corre um cenario e devolve o que `fn(c)` afirmar, limpando sempre. */
function mede(opcoes, fn) {
  let c;
  try {
    c = cenario(opcoes);
    return fn(c);
  } finally {
    limpa(c);
  }
}

export function registar() {
  // O caso da 2b: o derivado tem o nome REAL e uma segunda chave, e quem mede usa outro nome.
  test("documento intacto com DOIS placeholders e o nome real e trazido, com os valores dele", () =>
    mede(
      {
        ontem: { ".agent/rules/guia.md": `# Guia (${NOME})\n\nUI em ${LINGUA}.\n` },
        hoje: { ".agent/rules/guia.md": `# Guia (${NOME})\n\nUI em ${LINGUA}.\n\nUma regra nova.\n` },
        consumidor: { ".agent/rules/guia.md": "# Guia (Projeto Real)\n\nUI em pt-PT.\n" },
      },
      (c) => {
        const v = c.ler(".agent/rules/guia.md");
        return v === "# Guia (Projeto Real)\n\nUI em pt-PT.\n\nUma regra nova.\n" ? [] : [`ficou ${JSON.stringify(v)}`];
      }
    ));

  // O CONTRA-CASO: uma alteracao do projeto fora dos placeholders continua a ser dele.
  test("documento CUSTOMIZADO fora dos placeholders continua a ser do projeto", () =>
    mede(
      {
        ontem: { ".agent/rules/guia.md": `# Guia (${NOME})\n` },
        hoje: { ".agent/rules/guia.md": `# Guia (${NOME})\n\nNovo.\n` },
        consumidor: { ".agent/rules/guia.md": "# Guia (Projeto Real)\n\nUma decisao do projeto.\n" },
      },
      (c) => (c.ler(".agent/rules/guia.md").includes("Uma decisao do projeto") ? [] : ["a customizacao do projeto foi atropelada"])
    ));

  // Um ficheiro NOVO nunca foi bootstrapado: leva os valores recolhidos, e nao o `substituto`.
  // O nome `a-nova.md` vem ANTES de `guia.md` na travessia: escrito durante o ciclo, levava o
  // `substituto` — e e isso que distingue "escrito no fim" de uma ordem com sorte (`TP1`).
  test("ficheiro NOVO leva o nome real recolhido, e nao o substituto", () =>
    mede(
      {
        ontem: { ".agent/rules/guia.md": `# Guia (${NOME})\n` },
        hoje: { ".agent/rules/guia.md": `# Guia (${NOME})\n`, ".agent/rules/a-nova.md": `# Nova (${NOME})\n` },
        consumidor: { ".agent/rules/guia.md": "# Guia (Projeto Real)\n" },
      },
      (c) => {
        const v = c.ler(".agent/rules/a-nova.md");
        return v === "# Nova (Projeto Real)\n" ? [] : [`o ficheiro novo ficou ${JSON.stringify(v)}`];
      }
    ));

  // Dois valores para o mesmo placeholder: nao ha certo a escolher, e escolher em silencio era
  // escrever texto que ninguem escreveu (`TP2`).
  test("o mesmo placeholder com dois valores em ficheiros intactos REPROVA", () => {
    let c;
    try {
      c = cenario({
        ontem: { ".agent/rules/a.md": `# A (${NOME})\n`, ".agent/rules/b.md": `# B (${NOME})\n` },
        // Um ficheiro NOVO que leva o placeholder: e aqui que a falta de consenso decide alguma coisa.
        hoje: { ".agent/rules/a.md": `# A (${NOME})\n`, ".agent/rules/b.md": `# B (${NOME})\n`, ".agent/rules/c.md": `# C (${NOME})\n` },
        consumidor: { ".agent/rules/a.md": "# A (Um Nome)\n", ".agent/rules/b.md": "# B (Outro Nome)\n" },
      });
      return ["devia ter reprovado"];
    } catch (err) {
      return /mais de um valor/.test(err.message) && /PROJECT_NAME/.test(err.message) ? [] : [`razao errada: ${err.message}`];
    } finally {
      limpa(c);
    }
  });

  // O CONTRA-CASO: um conflito num placeholder que NENHUM ficheiro a escrever leva nao decide
  // nada, e ha divergencias legitimas (o `TEST_FRAMEWORK` que o bootstrap adapta por ficheiro).
  test("um conflito num placeholder que ninguem vai escrever NAO reprova", () =>
    mede(
      {
        ontem: { ".agent/rules/a.md": `# A (${LINGUA})\n`, ".agent/rules/b.md": `# B (${LINGUA})\n` },
        hoje: { ".agent/rules/a.md": `# A (${LINGUA})\n`, ".agent/rules/b.md": `# B (${LINGUA})\n` },
        consumidor: { ".agent/rules/a.md": "# A (pt-PT)\n", ".agent/rules/b.md": "# B (en)\n" },
      },
      () => []
    ));

  // O cabecalho do `anti-patterns.md` segue a mesma regra (#178). As ENTRADAS sao do projeto e
  // ficam sempre; o cabecalho intacto atualiza-se, com o valor real no placeholder.
  const AP = "## " + "AP" + "1" + " — meu\n";
  const AP_REL = ".agent/rules/anti-patterns.md";
  test("cabecalho do `anti-patterns.md` INTACTO e atualizado, e as entradas ficam", () =>
    mede(
      {
        ontem: { [AP_REL]: `# Anti (${NOME})\n\n> velho\n\n---\n\n${AP}` },
        hoje: { [AP_REL]: `# Anti (${NOME})\n\n> novo\n\n---\n\n${AP}` },
        consumidor: { [AP_REL]: `# Anti (Projeto Real)\n\n> velho\n\n---\n\n${AP}## ${"AP" + "2"} — outro\n` },
      },
      (c) => {
        const v = c.ler(AP_REL);
        return v === `# Anti (Projeto Real)\n\n> novo\n\n---\n\n${AP}## ${"AP" + "2"} — outro\n` ? [] : [`ficou ${JSON.stringify(v)}`];
      }
    ));

  // O CONTRA-CASO: o cabecalho que o projeto condensou a mao fica byte a byte. Trazer o inteiro
  // apagava-o e, num derivado maduro, passava o tecto do Guard 1.
  test("cabecalho do `anti-patterns.md` CUSTOMIZADO fica byte a byte", () => {
    const meu = `# Anti (Projeto Real)\n\n> condensado a mao\n\n---\n\n${AP}`;
    return mede(
      {
        ontem: { [AP_REL]: `# Anti (${NOME})\n\n> velho\n\n---\n\n${AP}` },
        hoje: { [AP_REL]: `# Anti (${NOME})\n\n> novo\n\n---\n\n${AP}` },
        consumidor: { [AP_REL]: meu },
      },
      (c) => (c.ler(AP_REL) === meu ? [] : [`o cabecalho do projeto foi atropelado: ${JSON.stringify(c.ler(AP_REL))}`])
    );
  });

  // Sem cabecalho na TAG nao ha contra que comparar: nao se adivinha, fica o do projeto (`TP2`).
  test("tag sem separador no `anti-patterns.md`: o do projeto fica byte a byte", () => {
    const meu = `# Anti (Projeto Real)\n\n> meu\n\n---\n\n${AP}`;
    return mede(
      {
        ontem: { [AP_REL]: "# Anti\n\nsem separador\n" },
        hoje: { [AP_REL]: `# Anti (${NOME})\n\n> novo\n\n---\n\n${AP}` },
        consumidor: { [AP_REL]: meu },
      },
      (c) => (c.ler(AP_REL) === meu ? [] : [`sem cabecalho na tag, o do projeto mudou: ${JSON.stringify(c.ler(AP_REL))}`])
    );
  });

  // A regex e montada do texto da tag: um ficheiro grande nao pode pendurar a comparacao.
  // Num processo filho e com tecto, para um retrocesso catastrofico reprovar em vez de pendurar.
  test("a captura num ficheiro grande e rapida (sem retrocesso catastrofico)", () => {
    const lib = pathToFileURL(join(import.meta.dirname, "../lib/intacto.mjs")).href;
    const codigo = `const { capturaPlaceholders } = await import(${JSON.stringify(lib)});
      const P = (x) => "{" + "{" + x + "}" + "}";
      const tag = Array.from({ length: 4000 }, (_, i) => i % 50 === 0 ? "linha " + P("PROJECT_NAME") + " " + i : "linha " + i).join("\\n");
      const t0 = Date.now(); const r = capturaPlaceholders(tag.replaceAll(P("PROJECT_NAME"), "Nome") + "x", tag);
      console.log(JSON.stringify({ ms: Date.now() - t0, nulo: r === null }));`;
    try {
      const { ms, nulo } = JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", codigo], { encoding: "utf8", timeout: 10000 }));
      return [...(nulo ? [] : ["um ficheiro alterado deu intacto"]), ...(ms < 2000 ? [] : [`${ms} ms`])];
    } catch (err) {
      return [`a captura pendurou ou rebentou: ${err.message.split("\n")[0]}`];
    }
  });
}
