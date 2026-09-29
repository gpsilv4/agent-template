/**
 * Testes do MODO FAIL-FAST — {{PROJECT_NAME}}
 *
 * NAO e um entry point: o `test-guards.mjs` descobre-o em disco e chama `registar()`.
 *
 * ## Porque existe
 *
 * O fail-fast faz uma suite sair ao primeiro `FAIL`. Na semantica nao enfraquece nada — so
 * pode fazer sair mais cedo uma suite que **ja ia ficar vermelha** — mas o risco de
 * implementacao e o `TP1` na sua forma mais cara: **um bug que faca a suite sair `1` sem uma
 * falha real faz todos os sitios da varredura parecerem cobertos, em silencio.** A varredura
 * passa a certificar o nada, e o ecra continua verde.
 *
 * Por isso os controlos sao nas DUAS direccoes, e ha um terceiro que nao vem do plano mas do
 * codigo: a varredura exige `/^\s*FAIL\s/m` na saida (`lib/varredura-paralela.mjs`) para
 * distinguir "um teste apanhou a mutacao" de "a suite rebentou". Se a saida antecipada nao
 * imprimisse essa linha, **todos** os sitios cobertos passavam a contar como rebentados.
 *
 * ## Suite FALSA, e nao a real
 *
 * Lancar o `test-guards.mjs` tres vezes custava ~45s em cada corrida do CI. Uma suite falsa
 * que importa o `relatorio.mjs` corre em milissegundos e afirma exactamente o mesmo — e o
 * padrao que o `test-mutation-sweep.mjs` ja documenta para os pares falsos.
 *
 * A suite falsa regista SEMPRE um terceiro teste depois da falha: e ele que prova a saida
 * antecipada. Sem esse terceiro, "saiu cedo" e indistinguivel de "acabou".
 */
import { execFileSync } from "child_process";
import { mkdtempSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join, resolve, dirname } from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { registarResultado } from "./harness/test-harness.mjs";
import { FAIL_FAST_ENV } from "../lib/varredura-paralela.mjs";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.error(
    "tests-fail-fast.mjs nao e um entry point: nao corre testes por si.\n" +
      "Correr `node .agent/scripts/tests/test-guards.mjs`."
  );
  process.exit(1);
}

/** Entry point a que este modulo pertence. */
export const entryPoint = "test-guards.mjs";

const AQUI = dirname(fileURLToPath(import.meta.url));
const RELATORIO = resolve(AQUI, "harness", "relatorio.mjs");

/** A prova que a varredura usa. Copiada de `lib/varredura-paralela.mjs` de proposito: se as
 *  duas divergirem, o caso "a linha do modo nao e confundida com um FAIL" deixa de medir o
 *  que a varredura faz — e ai quero ver o teste vermelho, nao silenciosamente irrelevante. */
const PROVA_DE_FALHA = /^\s*FAIL\s/m;

/** Uma suite falsa: um teste que passa, um que falha (ou nao), e um TERCEIRO que so e
 *  registado se a suite nao tiver saido antes. */
const SUITE_FALSA = (comFalha) => `
import { registarResultado, resumo } from ${JSON.stringify(pathToFileURL(RELATORIO).href)};
registarResultado("primeiro-passa", [], "");
registarResultado("segundo", ${comFalha ? '["problema fabricado"]' : "[]"}, "");
registarResultado("terceiro-so-corre-se-nao-saiu", [], "");
resumo();
`;

/** Corre a suite falsa e devolve `{ code, out }`. Nunca lanca: "falhou" e um resultado. */
function correr({ comFalha, failFast }) {
  const dir = mkdtempSync(join(tmpdir(), "fail-fast-test-"));
  try {
    const f = join(dir, "suite-falsa.mjs");
    writeFileSync(f, SUITE_FALSA(comFalha));
    // `env` nas opcoes do filho — NAO se escreve em `process.env` (Guard 19 acusa a escrita).
    // O ramo `else` limpa a chave DERIVADA da constante, e nao uma string repetida: sem isto,
    // correr a propria suite com a variavel ja posta (que e o que a varredura faz) punha o
    // caso 1 a medir o caso 3 — um teste que passava a afirmar o oposto do seu nome.
    const env = { ...process.env };
    for (const k of Object.keys(FAIL_FAST_ENV)) delete env[k];
    if (failFast) Object.assign(env, FAIL_FAST_ENV);
    try {
      return { code: 0, out: execFileSync(process.execPath, [f], { encoding: "utf8", env }) };
    } catch (err) {
      return { code: err.status ?? -1, out: (err.stdout ?? "") + (err.stderr ?? "") };
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export function registar() {
  const caso = (nome, problems) => registarResultado(nome, problems, "");

  // --- 1. SEM a variavel: comportamento inalterado -----------------------------------------
  {
    const r = correr({ comFalha: true, failFast: false });
    const p = [];
    if (r.code === 0) p.push("uma suite com uma falha tem de sair != 0");
    if (!r.out.includes("terceiro-so-corre-se-nao-saiu"))
      p.push("SEM a variavel a suite TEM de correr ate ao fim — o terceiro teste nao correu");
    if (r.out.includes("MODO FAIL-FAST"))
      p.push("SEM a variavel o modo nao pode ser anunciado");
    caso("fail-fast: sem a variavel, a suite corre inteira e sai != 0", p);
  }

  // --- 2. COM a variavel e TUDO VERDE: nao pode sair cedo -----------------------------------
  // O controlo que apanha o `TP1` que este ficheiro teme: um fail-fast que saia sem falha real.
  {
    const r = correr({ comFalha: false, failFast: true });
    const p = [];
    if (r.code !== 0) p.push(`uma suite verde tem de sair 0, saiu ${r.code}`);
    if (!r.out.includes("terceiro-so-corre-se-nao-saiu"))
      p.push("sem FAIL nenhum a suite TEM de correr ate ao fim — saiu cedo sem falha real");
    if (!r.out.includes("MODO FAIL-FAST activo: nenhum FAIL"))
      p.push("o modo tem de se anunciar tambem no caminho verde, e dizer que correu tudo");
    caso("fail-fast: com a variavel e tudo verde, NAO sai cedo", p);
  }

  // --- 3. COM a variavel e uma falha real: sai, e sai a tempo --------------------------------
  {
    const r = correr({ comFalha: true, failFast: true });
    const p = [];
    if (r.code === 0) p.push("tem de sair != 0");
    if (r.out.includes("terceiro-so-corre-se-nao-saiu"))
      p.push("NAO saiu cedo: o terceiro teste ainda correu, logo o modo nao esta a agir");
    if (!r.out.includes("MODO FAIL-FAST: saiu ao primeiro FAIL"))
      p.push("a saida antecipada tem de se anunciar");
    caso("fail-fast: com a variavel e uma falha, sai ao primeiro FAIL", p);

    // O terceiro controlo, o que vem do codigo e nao do plano.
    caso("fail-fast: a saida antecipada continua a provar FALHA para a varredura", [
      ...(PROVA_DE_FALHA.test(r.out)
        ? []
        : ["a varredura exige /^\\s*FAIL\\s/m e nao o encontrou — todos os sitios cobertos " +
           "passariam a contar como REBENTOU"]),
    ]);
  }

  // --- 4. A linha do modo nao se confunde com um FAIL ----------------------------------------
  // Se se confundisse, uma suite que REBENTASSE sem apanhar nada passava por coberta.
  {
    const p = [];
    for (const linha of [
      "  MODO FAIL-FAST: saiu ao primeiro FAIL, depois de 297 teste(s).",
      "  MODO FAIL-FAST activo: nenhum FAIL, logo a suite correu inteira (312 testes).",
    ]) {
      if (PROVA_DE_FALHA.test(linha)) p.push(`a linha do modo foi lida como prova de falha: ${linha.trim()}`);
    }
    caso("fail-fast: o anuncio do modo NAO conta como prova de falha", p);
  }

  // --- 5. A variavel e uma so, escrita num sitio ---------------------------------------------
  // O motor escreve-a e o harness le-a. Duas copias a concordar a mao eram um `TP8` invisivel:
  // o modo simplesmente nao agia, e a varredura ficava correcta e lenta — o defeito mais
  // dificil de notar, porque nada fica vermelho.
  {
    const r = correr({ comFalha: true, failFast: true });
    caso("fail-fast: a chave exportada pelo motor e a que o harness le", [
      ...(Object.keys(FAIL_FAST_ENV).length === 1 ? [] : ["FAIL_FAST_ENV tem de ter uma so chave"]),
      ...(r.out.includes("MODO FAIL-FAST")
        ? []
        : [`o harness nao reagiu a ${Object.keys(FAIL_FAST_ENV)[0]} — as duas pontas divergiram`]),
    ]);
  }
}
