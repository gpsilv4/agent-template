/**
 * De onde vem a versao NOVA de um upgrade (#490) — {{PROJECT_NAME}}
 *
 * O motor (`lib/upgrade-mecanico.mjs`) le o lado novo do DISCO do template, e a 2b tambem. Um
 * derivado correu-o com o template num branch de trabalho, com alteracoes por commitar, e recebeu
 * esse trabalho sob uma marca que dizia uma tag (o R10-3). O aviso que havia ("o template tem
 * alteracoes por commitar", #304) nao o impediu: um aviso le-se depois do facto.
 *
 * A regra: **o template de um upgrade e um clone limpo numa tag de release**, e a tag descende da
 * ref de onde o projeto saiu. O resto recusa, com a instrucao. Nao ha variavel para saltar: um
 * upgrade e sempre para uma release, e uma correcao urgente e uma tag de correcao.
 *
 * Qualquer falha do git RECUSA, nunca conta como "limpo" (`TP2`).
 *
 * So conta como tag de release uma tag no formato `vX.Y.Z[-pre]` (#538): o git aceita `$ ( ) ;` num nome de ref, e
 * uma tag fora do formato nao chega ao comando de uma recusa, que se copia, nem ao `versao:` de uma marca.
 */

import { execFileSync } from "child_process";
import { basename } from "path";

/** Onde a instrucao manda clonar: FORA do `TMPDIR`, porque a fronteira da 2b recusa um template
 *  dentro dele (`lib/fronteira-upgrade.mjs`). Sem `--shared`: um clone local usa hardlinks, que
 *  sobrevivem a um `gc` no template (o `--shared` depende dos objetos dele). Do URL, o `origin` do
 *  clone e o URL, que a marca da §4 grava. */
export const ONDE_CLONAR = "~/.cache/agent-template";

/** Uma tag de release (#538): o pre-release com os caracteres do SemVer, sem build (`+`) — nenhuma release o usa. */
export const TAG_DE_RELEASE = /^v\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;
/** Uma release estavel, sem pre-release. */
export const ESTAVEL = /^v\d+\.\d+\.\d+$/;
/** O que se interpola num comando para copiar: a tag, se for uma tag de release; senao, o marcador. */
export const tagParaComando = (tag) => (typeof tag === "string" && TAG_DE_RELEASE.test(tag) ? tag : "<tag>");
/** Como saber a ultima tag: uma so frase, para o upgrade e para a adocao (#538). */
export const DICA_ULTIMA_TAG = "`git ls-remote --tags --refs --sort=-v:refname <url-do-template> 'v*'`";

/** O nome de um projeto no caminho do clone (#589): cada caracter fora de `[A-Za-z0-9._-]` passa a `_`, como a tag
 *  nunca leva um `$`, um `;` ou um espaco a um comando que se copia (#538). Vazio: o marcador. */
export const projetoParaComando = (nome) => String(nome ?? "").replace(/[^A-Za-z0-9._-]/g, "_") || "<projeto>";

/** A pasta do PROJETO, que da o nome ao clone (#589): a raiz do repo dele (`git rev-parse --show-toplevel`), ou a
 *  propria pasta se nao for um repo. Nunca o `cwd`, que numa medicao e o template. */
export function projetoDe(raiz) {
  let topo = raiz;
  try {
    topo = git(raiz, ["rev-parse", "--show-toplevel"]).trim() || raiz;
  } catch {
    // Nao e um repo (ou o git falhou): o nome da pasta dada serve na mesma — e so um nome de clone.
  }
  return basename(String(topo ?? ""));
}

/** A instrucao de cada recusa: o clone da tag DESTE projeto (#589), que nao escreve no repo do template. Um clone por
 *  tag partilhado foi apagado a meio por outro upgrade para a mesma tag (derivado A). */
export const comoClonar = (pedida = "<tag>", projeto = "") => {
  const tag = tagParaComando(pedida);
  const pasta = `${tag}-${projetoParaComando(projeto)}`;
  return `git clone -q --branch ${tag} <url-do-template> ${ONDE_CLONAR}/${pasta}` +
  (tag === "<tag>" ? ` (a mais recente: ${DICA_ULTIMA_TAG})` : "") +
  ` — e correr dali (num sandbox que so escreve no TMPDIR: clonar em $TMPDIR/agent-template/${pasta} e passar --fronteira-em=<pasta vazia fora do projeto e do template>)`;
};

// `column.ui=never`: com colunas ligadas na config do utilizador, duas tags saiam numa so linha.
const git = (root, args) =>
  execFileSync("git", ["--no-optional-locks", "-c", "column.ui=never", ...args], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
// A razao do GIT (o stderr), e nao a 1.a linha da mensagem do `execFileSync`, que e so o comando: "dubious ownership"
// e "not a git repository" pedem correccoes diferentes.
const primeiraLinha = (err) =>
  String(err?.stderr ?? "").trim().split("\n")[0] || (err instanceof Error ? err.message : String(err)).split("\n")[0];
/** As releases estaveis primeiro: sem `versionsort.suffix`, o git poe `v1.0.0-rc.1` DEPOIS de `v1.0.0`. */
const estaveisPrimeiro = (ts) => [...ts.filter((t) => ESTAVEL.test(t)), ...ts.filter((t) => !ESTAVEL.test(t))];
const deRelease = (ts) => ts.filter((t) => TAG_DE_RELEASE.test(t));
const linhas = (t) => t.split("\n").filter(Boolean);

/**
 * (a) o `root` e a raiz do seu repo, sem alteracoes seguidas ou nao (os ignorados nao contam: o motor
 * exclui-os), e sem nada escondido do `status` (sparse, `skip-worktree`, `assume-unchanged`); (b) o
 * `HEAD` numa tag `v*` — com duas, a maior estavel (o clone traz as duas: recusar era um beco). `fatal`
 * recebe a razao e NAO retorna. `quem`/`instrucao`: o texto da recusa de quem chama (#512) — a adocao clona para
 * `../agent-template-<tag>` e nao tem `--fronteira-em`; dar-lhe a instrucao do upgrade mandava-a para um beco.
 *
 * @returns {{tag: string}}
 */
/**
 * A arvore do `root` esta LIMPA: sem alteracoes seguidas ou nao (os ignorados nao contam: o motor exclui-os), e sem
 * nada escondido do `status` (sparse, `skip-worktree`, `assume-unchanged`). `recusa(porque)` recebe a razao e NAO
 * retorna; uma falha do git recusa (`TP2`). Partilhada pela guarda abaixo e pela retoma da adocao (#538).
 */
export function confirmaLimpo(root, recusa) {
  // Devolve `true` SO quando esta limpa: quem chama para se nao for `true` (um `recusa` que retorne, em vez de lancar,
  // nao deixa a guarda seguir para as tags — a leitura independente do #538).
  let r;
  try {
    r = {
      // `--untracked-files=all` contra um `status.showUntrackedFiles=no` do utilizador.
      sujo: linhas(git(root, ["status", "--porcelain", "--untracked-files=all"])),
      sparse: git(root, ["config", "--bool", "--default", "false", "core.sparseCheckout"]).trim() === "true",
      // `ls-files -v`: minuscula = `assume-unchanged`, `S` = `skip-worktree` — o `status` nao os ve.
      escondidos: linhas(git(root, ["ls-files", "-v"])).filter((l) => /^[a-zS] /.test(l)).map((l) => l.slice(2)),
    };
  } catch (err) {
    return recusa(`nao responde ao git (${primeiraLinha(err)})`);
  }
  if (r.sujo.length) {
    const amostra = r.sujo.slice(0, 3).map((l) => l.slice(3)).join(", ");
    return recusa(`tem ${r.sujo.length} alteracao(oes) por commitar (${amostra}${r.sujo.length > 3 ? ", ..." : ""})`);
  }
  if (r.sparse || r.escondidos.length) {
    return recusa(`esconde ficheiros do \`git status\` (${r.sparse ? "sparse-checkout" : `skip-worktree/assume-unchanged: ${r.escondidos.slice(0, 3).join(", ")}`})`);
  }
  return true;
}

export function confirmaTemplateLimpoNumaTag(root, fatal, { quem = "um upgrade", instrucao = comoClonar } = {}) {
  const recusa = (porque, tag) => fatal(`o template em ${root} ${porque} — ${quem} le um clone limpo numa tag (#490): ${instrucao(tag)}`);
  let r;
  // Tudo num so `try`: qualquer pergunta que falhe e a mesma recusa (`TP2`), nunca "limpo".
  try {
    r = {
      // `--show-prefix` vazio = o `root` e a raiz: sem comparar caminhos (maiusculas, symlinks, nomes 8.3).
      prefixo: git(root, ["rev-parse", "--show-prefix"]).trim(),
      // Pelo formato (#538): `v[0-9]*` e um glob, e deixa passar `v1$(x)`, `v1.2` ou `v1.0.0_x`.
      tags: estaveisPrimeiro(deRelease(linhas(git(root, ["tag", "--points-at", "HEAD", "--list", "--sort=-v:refname", "v[0-9]*"])))),
      todasNoGlob: linhas(git(root, ["tag", "--list", "--sort=-v:refname", "v[0-9]*"])),
    };
  } catch (err) {
    return recusa(`nao responde ao git (${primeiraLinha(err)})`);
  }
  if (r.prefixo !== "") return recusa(`nao e a raiz de um repo (e a subpasta ${r.prefixo} de outro)`);
  if (confirmaLimpo(root, recusa) !== true) return undefined;
  const todas = estaveisPrimeiro(deRelease(r.todasNoGlob));
  if (r.tags.length === 0) {
    if (todas.length) return recusa("nao esta numa tag de release (o HEAD e um commit sem tag `vX.Y.Z`)", todas[0]);
    // So tags fora do formato: "`git fetch --tags`" seria uma pista errada. O nome dela nunca entra na mensagem.
    return r.todasNoGlob.length
      ? recusa("nao tem tags de release no formato `vX.Y.Z[-pre]` (as que tem estao fora dele)")
      : recusa("nao tem tags de release — `git fetch --tags` no template");
  }
  return { tag: r.tags[0] };
}

/**
 * (c) sem downgrade: a `ref` de onde o projeto saiu tem de ser antepassada do `HEAD` do template.
 * Uma ref que existe e NAO e antepassada pode ter conteudo posterior a tag (um branch fundido por
 * squash): recusa, sem recorrer ao `versao:` da marca, que nessas marcas esta velho.
 */
export function confirmaSemDowngrade(root, ref, fatal) {
  try {
    git(root, ["merge-base", "--is-ancestor", ref, "HEAD"]);
    return;
  } catch (err) {
    if (err?.status !== 1) return fatal(`nao consegui comparar ${ref} com o HEAD do template em ${root} (${primeiraLinha(err)})`);
  }
  let contem = [];
  try {
    // So as tags de release (#538): uma fora do formato nao entra na mensagem.
    contem = deRelease(git(root, ["tag", "--contains", ref, "--list", "v[0-9]*"]).split("\n").filter(Boolean));
  } catch {
    // fica "nenhuma": a recusa e a mesma, so a pista se perde
  }
  fatal(
    `a marca do projeto aponta para ${ref}, que nenhuma tag ate ao HEAD do template contem ` +
      `(tags que o contem: ${contem.length ? contem.join(", ") : "nenhuma"}) — se o projeto saiu de uma tag anterior, ` +
      "poe essa tag em `commit:`; se saiu de trabalho por publicar, espera pela tag que o contem"
  );
}
