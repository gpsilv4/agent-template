/**
 * A lista de AREAS do projeto, carregada da `config/` — {{PROJECT_NAME}}
 *
 * PORQUE EXISTE (#465): as regras (`lib/backlog-regras.mjs`) e o leitor sao puros e recebem a lista por parametro; quem
 * a carrega sao os dois CLIs (`check-backlog.mjs` e `backlog-board.mjs`), por esta funcao so. Assim os testes injetam
 * a sua lista, e nenhum caso fica preso a `config/` real (que cada projeto adapta).
 */
import { existsSync } from "fs";
import { fileURLToPath } from "url";
import { norm } from "./backlog-celulas.mjs";

/** O caminho POR EXTENSO (o fecho do `/upgrade` parcial segue os literais): a `config/` vem com o `check-backlog`. */
const CONFIG = new URL("../config/areas-do-backlog.mjs", import.meta.url);
const NOME = ".agent/scripts/config/areas-do-backlog.mjs";

/**
 * A lista, com as chaves pelo `norm`; `null` sem o ficheiro (um estado legitimo: o projeto nao tem a coluna, ou ainda
 * nao trouxe a lista). Um ficheiro PARTIDO (sintaxe, ou sem um `AREAS` objeto de strings nao vazias) recusa com um erro
 * que o nomeia: "fora da lista" em todas as linhas escondia que o erro e do ficheiro.
 * @param {URL} [url]  so para os testes (uma sandbox com a sua `config/`)
 * @returns {Promise<Record<string, string> | null>}
 */
export async function carregaAreas(url = CONFIG) {
  if (!existsSync(fileURLToPath(url))) return null;
  let mod;
  try {
    mod = await import(url.href);
  } catch (err) {
    throw new Error(`${NOME} nao se le (${err instanceof Error ? err.message : String(err)}) — corrigir o ficheiro (apaga-lo so serve sem a coluna \`Area\` no backlog: com ela, a lista em falta tambem reprova)`);
  }
  const a = mod.AREAS;
  const valido = a !== null && typeof a === "object" && !Array.isArray(a) && Object.keys(a).length > 0 && Object.entries(a).every(([k, v]) => norm(k) && typeof v === "string" && v.trim());
  // Vazia, cada linha com a coluna reprovava "fora da lista": o erro e do ficheiro, e diz-se dele.
  if (!valido) throw new Error(`${NOME} tem de exportar \`AREAS\`, um objeto { chave: definicao } com pelo menos uma area e textos nao vazios`);
  const chaves = Object.keys(a).map(norm);
  const repetida = chaves.find((k, i) => chaves.indexOf(k) !== i);
  // `Segurança` e `seguranca` sao a mesma chave pelo `norm`: fundi-las em silencio perdia uma definicao.
  if (repetida) throw new Error(`${NOME}: a area "${repetida}" esta duas vezes (as chaves comparam-se sem acentos nem caixa)`);
  return Object.fromEntries(Object.entries(a).map(([k, v]) => [norm(k), v]));
}
