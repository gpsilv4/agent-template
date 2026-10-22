/**
 * Testes dos wrappers do Gemini no `/upgrade` — {{PROJECT_NAME}}
 *
 * A linha "workflows + os dois wrappers" do `upgrade.md` diz que se copiam os dois. O motor so
 * trazia o `.claude/commands/`: o `.gemini/commands/*.toml` nunca chegava, e o primeiro workflow
 * novo reprovou a FASE 2 do simulador so por isso (#365).
 *
 * Os casos 1 e 2 medem a correcao (revertida, ficam vermelhos). Os 3, 4 e 5 medem uma correcao
 * LARGA DE MAIS — passam com ela revertida, e e de proposito: o que custa dados aqui e o motor
 * escrever por cima do que o projeto decidiu (um wrapper customizado, um apagado, a pasta que
 * ele nao quis).
 *
 * NAO e um entry point. O `test-simulate-upgrade.mjs` importa-o e chama `registar()`.
 */
import { pathToFileURL } from "url";
import { cenario, limpa, test } from "./harness/test-upgrade-harness.mjs";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.error("tests-upgrade-wrappers.mjs nao e um entry point: nao corre testes por si.\nCorrer `node .agent/scripts/tests/test-simulate-upgrade.mjs`.");
  process.exit(1);
}

/** Entry point a que este modulo pertence. */
export const entryPoint = "test-simulate-upgrade.mjs";

const X = ".gemini/commands/x.toml";
const OUTRO = ".gemini/commands/outro.toml";
// `{{args}}` e o placeholder do Gemini, nao do bootstrap: tem de sobreviver a passagem final.
// Guardam-no dois cadeados do `lib/intacto.mjs`, a classe `[A-Z_]+` e o `(?!args\})`: so sem
// os dois os casos 1 a 3 ficam vermelhos (medido; um so, alargado ou tirado, nao chega).
const toml = (v) => `description = "${v}"\nprompt = "Le .agent/workflows/x.md. Contexto: {{args}}"\n`;

/** Corre um cenario e devolve os problemas de `verifica(c)`, limpando sempre. */
function mede(opts, verifica) {
  let c;
  try {
    c = cenario(opts);
    return verifica(c);
  } finally {
    limpa(c);
  }
}

export function registar() {
  test("um wrapper do Gemini NOVO desde a tag chega ao consumidor (#365)", () =>
    mede({ ontem: { [OUTRO]: toml("outro") }, hoje: { [OUTRO]: toml("outro"), [X]: toml("novo") } }, (c) => {
      const v = c.ler(X);
      return v === toml("novo") ? [] : [`ficou ${JSON.stringify(v)}, esperado o wrapper novo com o {{args}}`];
    }));

  test("um wrapper do Gemini INTACTO fica com a versao nova, e o {{args}} sobrevive (#365)", () =>
    mede({ ontem: { [X]: toml("velho") }, hoje: { [X]: toml("novo") } }, (c) => {
      const v = c.ler(X);
      return v === toml("novo") ? [] : [`ficou ${JSON.stringify(v)}, esperado o wrapper novo com o {{args}}`];
    }));

  test("um wrapper do Gemini CUSTOMIZADO fica com a versao do projeto (#365)", () =>
    mede({ ontem: { [X]: toml("velho") }, hoje: { [X]: toml("novo") }, consumidor: { [X]: toml("meu") } }, (c) => {
      const v = c.ler(X);
      return v === toml("meu") ? [] : [`ficou ${JSON.stringify(v)}, devia manter o do projeto`];
    }));

  // O wrapper MUDOU desde a tag: igual, um motor que tratasse o ausente como intacto saia na
  // mesma por "nada mudou", e o teste nao distinguia "apagado" de "intacto".
  test("um wrapper do Gemini que o projeto APAGOU nao volta (#365)", () =>
    mede({ ontem: { [OUTRO]: toml("outro"), [X]: toml("velho") }, hoje: { [OUTRO]: toml("outro"), [X]: toml("novo") }, consumidor: { [OUTRO]: toml("outro") } }, (c) => {
      const v = c.ler(X);
      return v === null ? [] : [`voltou ${JSON.stringify(v)}: o projeto tinha-o apagado`];
    }));

  test("um projeto SEM .gemini/commands nao a recebe por um wrapper novo (#365)", () =>
    mede({ ontem: {}, hoje: { [X]: toml("novo") } }, (c) => {
      const v = c.ler(X);
      return v === null ? [] : ["a pasta do Gemini apareceu num projeto que nao a tinha (o Guard 6 le a falta como opt-out)"];
    }));
}
