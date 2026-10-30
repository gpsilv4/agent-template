/**
 * O PREFIXO Conventional Commits do assunto de um commit (#394) — {{PROJECT_NAME}}
 *
 * O `core-rules.md` dizia que o `type(scope):` "e o que o `.githooks/commit-msg` e o CI verificam", e nada o
 * verificava: `update stuff` passava. O hook chama este modulo, e o CI corre o hook sobre cada commit do PR e sobre
 * o titulo (que num squash e a 1.a linha do commit no `main`).
 *
 * PORQUE AQUI, e nao em `.githooks/lib/`: o mesmo do #375 para os nomes — o `/upgrade` copia esta pasta sozinho, e o
 * `.githooks/*` e aprovado ficheiro a ficheiro. O hook importa-o dinamicamente: em falta, recusa com a razao.
 *
 * A LISTA DE TYPES e a tabela `### Types` (com o cabecalho `| Type |`) do `CONTRIBUTING.md` do repo do commit — e do
 * PROJETO, e o `/upgrade` nao a sobrescreve: um type novo e uma linha nela. Sem ficheiro, ou sem a seccao com essa
 * tabela, verifica-se so a FORMA (`[a-z]+` como type), e o hook di-lo; uma tabela que existe e nao da nenhum type
 * recusa (`TP2`: "nao consegui ler" nao e "nao ha").
 * Nao ha lista por omissao: seria uma segunda copia da tabela (`TP8`).
 *
 * AS MENSAGENS QUE O GIT E O GITHUB ESCREVEM passam: `Merge <branch|tag|pull request|...> `, `Revert "`, `Reapply "`
 * (o git >= 2.43), `Apply suggestions from code review`, e `fixup! `/`squash! `/`amend! ` seguidos de um assunto que
 * passa. O `Update <ficheiro>` do editor web nao passa: o editor deixa escrever a mensagem. Limite aceite: um `Revert "` de um commit
 * anterior a regra cita um assunto que nunca passou por ela.
 *
 * Cada razao sai por `invalido(...)`: e o sinal da varredura (`lib/pares-publicos.mjs`). Quem chama le `undefined`
 * como "passa" — por isso o neutro da varredura, que devolve `undefined`, deixa passar o que devia recusar.
 */
import { readFileSync } from "fs";
import { join } from "path";

/** O cabecalho da seccao, e a linha de cada type: `` | `feat` | ... ``. */
export const CABECALHO = "### Types";
const SECCAO = /^#{2,4}[ \t]+Types[ \t]*$/;
const OUTRA_SECCAO = /^#{1,4}[ \t]/;
const LINHA_DE_TYPE = /^\|[ \t]*`([a-z][a-z0-9-]*)`[ \t]*\|/;
const CABECALHO_DA_TABELA = /^\|[ \t]*Type[ \t]*\|/;

/** O que o git e o GitHub escrevem por si: as formas do `git fmt-merge-msg` (com os plurais, e o `git pull <url>`
 *  sem branch), o revert, e o "Commit suggestion" de uma revisao (um commit normal DENTRO do PR, que so se corrigia
 *  com um force-push). Fica recusado o `Squashed commit of the following:` do `git merge --squash`: e um modelo que
 *  se edita antes do commit, e o assunto escreve-se ali. */
const MERGE = /^Merge (?:branch(?:es)?|remote-tracking branch(?:es)?|tags?|commits?|pull request|(?:https?|ssh|git|file):\/\/)/;
const REVERT = /^(?:Revert|Reapply) "/;
const SUGESTAO = /^Apply suggestions? from code review$/;
const AUTOSQUASH = /^(?:fixup|squash|amend)! /;
/** `type(scope)!: descricao` — o scope aceita espacos e virgulas (`docs(security-tests, audit):`, medido no historico). */
const FORMA = /^([^\s:(!]+)(\([^()\r\n]+\))?!?: \S/;
const SO_A_FORMA = /^[a-z]+$/;

const invalido = (razao) => razao;

/**
 * Os types da seccao `### Types` de um `CONTRIBUTING.md`: a PRIMEIRA com uma tabela cujo cabecalho abre por
 * `| Type |`. Um `### Types` sem essa tabela (as convencoes de tipos de um projeto TypeScript) nao e a dos commits,
 * e nao a tapa; com o cabecalho e sem nenhuma linha `` | `x` | ``, e a dos commits e nao se leu (`sem-linhas`).
 * @param {string} texto
 * @returns {{ estado: "ok", tipos: string[] } | { estado: "sem-seccao" | "sem-linhas" }}
 */
export function tiposDe(texto) {
  const ls = texto.split(/\r\n|\r|\n/);
  for (let i = 0; i < ls.length; i++) {
    if (!SECCAO.test(ls[i])) continue;
    const fim = ls.findIndex((l, j) => j > i && OUTRA_SECCAO.test(l));
    const seccao = ls.slice(i + 1, fim < 0 ? ls.length : fim);
    if (!seccao.some((l) => CABECALHO_DA_TABELA.test(l))) continue;
    const tipos = seccao.map((l) => LINHA_DE_TYPE.exec(l)?.[1]).filter((t) => t !== undefined);
    return tipos.length > 0 ? { estado: "ok", tipos } : { estado: "sem-linhas" };
  }
  return { estado: "sem-seccao" };
}

/**
 * Le os types do `CONTRIBUTING.md` da `raiz`. `sem-ficheiro` so para um `ENOENT`; outro erro e `ilegivel`.
 * @param {string} raiz
 */
export function carregaTipos(raiz) {
  let texto;
  try {
    texto = readFileSync(join(raiz, "CONTRIBUTING.md"), "utf8");
  } catch (err) {
    const code = err instanceof Error && "code" in err ? err.code : undefined;
    return code === "ENOENT" ? { estado: "sem-ficheiro" } : { estado: "ilegivel", erro: err instanceof Error ? err.message : String(err) };
  }
  return tiposDe(texto);
}

/**
 * A razao por que o assunto NAO segue o prefixo, ou `undefined` se segue.
 * @param {string | undefined} assunto  a 1.a linha nao vazia da mensagem
 * @param {string[] | null} tipos  os types da tabela; `null` = sem tabela, so a forma
 * @returns {string | undefined}
 */
export function razaoDoPrefixo(assunto, tipos) {
  if (assunto === undefined || assunto.trim() === "") return invalido("a mensagem nao tem assunto");
  if (MERGE.test(assunto) || REVERT.test(assunto) || SUGESTAO.test(assunto)) return undefined;
  const a = AUTOSQUASH.exec(assunto);
  if (a) return razaoDoPrefixo(assunto.slice(a[0].length), tipos);
  const m = FORMA.exec(assunto);
  if (!m) return invalido("o assunto nao tem a forma `type(scope): descricao` (o scope e opcional; um espaco depois dos dois pontos)");
  if (tipos === null) return SO_A_FORMA.test(m[1]) ? undefined : invalido(`o type \`${m[1]}\` nao e uma palavra em minusculas`);
  return tipos.includes(m[1]) ? undefined : invalido(`o type \`${m[1]}\` nao esta na tabela \`${CABECALHO}\` do CONTRIBUTING.md`);
}
