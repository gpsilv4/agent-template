/**
 * Os branches protegidos, numa so fonte (#257) — {{PROJECT_NAME}}
 *
 * PORQUE EXISTE: a lista vivia escrita a mao em tres sitios — o `guard-protected-branch.mjs`, o
 * `session-context.mjs` e os literais dos testes dos hooks —, todos dentro de `.claude/hooks/`, que
 * o `/upgrade` substitui. Passa a ser do PROJETO, em **`.claude/hooks/protegidos.json`**.
 *
 * PORQUE UM JSON, e PORQUE AQUI (leitura independente do #257): a primeira versao pos a lista em
 * `.agent/scripts/config/`, que o hook IMPORTAVA — fora da fronteira. Um `Edit` sem aprovacao
 * escrevia `PROTEGIDOS = []` e o guard deixava passar um commit em `main`; pior, um
 * `process.exit(0)` no topo da config fazia o hook sair com `allow`. Aqui o ficheiro esta DENTRO da
 * fronteira (`.claude/hooks/`: o Bash e negado, o Edit pede aprovacao), e e lido como DADOS: o hook
 * nao executa nada que nao seja seu. O `/upgrade` nao o substitui (so o copia se faltar).
 *
 * FALHA FECHADA: ausente, partido, ou que nao seja uma lista de nomes, cai no default
 * `["main", "master", "develop"]` — um hook que perdesse a lista ficava a proteger nada. Uma lista
 * VAZIA escrita de proposito respeita-se: e uma decisao do projeto, nao uma falta.
 */
import { readFileSync } from "fs";

/** O que protege quando o projeto nao disse nada. */
export const PROTEGIDOS_POR_OMISSAO = ["main", "master", "develop"];

/** Um nome como o git o reporta: sem espacos e sem o `refs/heads/` a frente. */
const normaliza = (b) => b.trim().replace(/^refs\/heads\//, "");

/** Um nome de branch: sem glob (`release/*` nao protegeria `release/1.0` — a comparacao e literal,
 *  e um nome que PARECE proteger varios mas nao protege nenhum e pior do que o default). */
const ehNome = (b) => typeof b === "string" && normaliza(b) !== "" && !/[*?[\]\s]/.test(normaliza(b));

/** A lista do projeto, lida do JSON, e o estado da leitura: `ok`, `ausente` (o default, legitimo)
 *  ou `invalido` (o default, mas o projeto escreveu ALGO — e o `session-context` di-lo, porque o
 *  branch que ele queria proteger ficou de fora em silencio). O BOM de um editor no Windows sai. */
export function leProtegidosComEstado(url = new URL("../protegidos.json", import.meta.url)) {
  let texto;
  try {
    texto = readFileSync(url, "utf8");
  } catch {
    return { lista: PROTEGIDOS_POR_OMISSAO, estado: "ausente" };
  }
  try {
    const v = JSON.parse(texto.replace(/^\uFEFF/, ""));
    if (Array.isArray(v) && v.every(ehNome)) return { lista: v.map(normaliza), estado: "ok" };
  } catch {
    /* partido: o default, e o estado di-lo */
  }
  return { lista: PROTEGIDOS_POR_OMISSAO, estado: "invalido" };
}

/** So a lista. */
export const leProtegidos = (url) => leProtegidosComEstado(url).lista;

const LIDO = leProtegidosComEstado();
export const PROTEGIDOS_LISTA = LIDO.lista;
export const PROTEGIDOS_ESTADO = LIDO.estado;

/** Comparacao NORMALIZADA, nao igualdade exacta de `Set`. Num filesystem case-insensitive
 *  (APFS/macOS e NTFS, ambos por defeito) `refs/heads/MAIN` e o mesmo ficheiro que
 *  `refs/heads/main` — logo um `symbolic-ref` para `MAIN` punha o git a reportar um branch
 *  que a lista nao reconhecia, e tudo passava a ser permitido. Medido: `main` avancou.
 *  Tambem se corta `refs/heads/` a frente, que e como o branch aparece em algumas formas. */
const NORMALIZADOS = new Set(PROTEGIDOS_LISTA.map((b) => b.toLowerCase()));
export const ehProtegido = (br) =>
  typeof br === "string" && NORMALIZADOS.has(normaliza(br).toLowerCase());
