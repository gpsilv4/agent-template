/**
 * Re-congelar o `.agent/context/` de uma sandbox (Guard 21) — {{PROJECT_NAME}}
 *
 * NAO e um entry point e nao corre testes: e um construtor de fixture, importado pelo
 * `test-harness.mjs` (que o re-exporta) e usado por quem monta um `.agent/context/` proprio.
 *
 * PORQUE EXISTE, e o consumidor e UM SO: o `syntheticSandbox()` monta um repo minimo limpo por
 * construcao e escreve o seu proprio `.agent/context/session.md`. O Guard 21 congela o conteudo
 * por estrear dos ficheiros do REPO, logo esse `session.md` nunca casaria o hash — a fixture
 * "limpa" passava a avisar, e o bloco de baseline do `test-guards.mjs`, que exige zero WARN,
 * ficava vermelho.
 *
 * DERIVAR DA FIXTURE E NAO DO REPO e o ponto (`TP3`). A primeira tentativa foi o contrario:
 * copiar o `.agent/context/` real para a fixture sintetica. Ficava verde aqui e VERMELHA num
 * projeto derivado, onde esses ficheiros tem conteudo do projeto — apanhado pelo
 * `simulate-derived.mjs`, a unica coisa no repo que ve essa diferenca.
 *
 * (Uma versao anterior chamava-o tambem do `andarFixture` dos testes do Guard 15, "porque ele
 * reescreve a fixture inteira". Era **codigo morto**: os quatro chamadores desse helper correm
 * com `synthetic: true`, e o `session.md` da fixture sintetica nao cita nenhum `TPn` — o filtro
 * de citacoes nunca lhe toca. Medido por um leitor independente, que o desligou e viu a suite
 * ficar verde na mesma. A defesa "por precaucao" era uma rede sem nada por baixo.)
 *
 * PORQUE VIVE EM FICHEIRO PROPRIO: com ele dentro, o `test-harness.mjs` passava as 500 linhas e
 * o Guard 17 reprovava. A catraca nao se isenta — divide-se.
 *
 * Patchar o codigo do guard na sandbox e pratica estabelecida nesta suite: o teste do `BANNED` e
 * o controlo negativo do `ROOT` fazem o mesmo.
 */
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
// A tabela e a funcao de hash do proprio guard. Importadas e nao reescritas: uma segunda copia
// dos hashes aqui era o `TP8`, e divergia no primeiro andaime que mudasse.
import { PRISTINOS, digest } from "../../guards/context-virgem.mjs";

/** Recalcula `PRISTINOS` na COPIA do Guard 21 que vive em `dir`, a partir do `.agent/context/`
 *  que essa copia tem. Os hashes sao **recalculados**, nunca escritos. */
export function recongelarContexto(dir) {
  const mod = ".agent/scripts/guards/context-virgem.mjs";
  if (!existsSync(join(dir, mod))) return; // fixture sem a camada dos guards: nada a re-congelar
  const src = readFileSync(join(dir, mod), "utf8");
  // So os ficheiros PRESENTES: manter a entrada de um que a fixture nao tem punha o guard a
  // avisar de uma ausencia que e da fixture e nao do repo.
  const linhas = Object.keys(PRISTINOS)
    .filter((f) => existsSync(join(dir, f)))
    .map((f) => `  ${JSON.stringify(f)}: ${JSON.stringify(digest(readFileSync(join(dir, f), "utf8")))},`);
  // A guarda pergunta se o bloco EXISTE, e nao se o texto mudou. A diferenca nao e estilistica:
  // numa fixture que copia o repo, os ficheiros ja estao por estrear, a tabela recalculada sai
  // **identica** e um `novo === src` lia esse no-op legitimo como "o patch nao aplicou" — doze
  // testes rebentaram no setup por causa disso. O que se quer apanhar e o bloco renomeado ou
  // desaparecido, que e quando a fixture montaria um estado que ninguem pediu.
  const BLOCO = /export const PRISTINOS = \{[\s\S]*?\n\};/;
  if (!BLOCO.test(src)) throw new Error(`nao encontrei o bloco PRISTINOS em ${mod}`);
  writeFileSync(join(dir, mod), src.replace(BLOCO, `export const PRISTINOS = {\n${linhas.join("\n")}\n};`));
}
