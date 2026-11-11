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
 */

import { execFileSync } from "child_process";

/** Onde a instrucao manda clonar: FORA do `TMPDIR`, porque a fronteira da 2b recusa um template
 *  dentro dele (`lib/fronteira-upgrade.mjs`). Sem `--shared`: um clone local usa hardlinks, que
 *  sobrevivem a um `gc` no template (o `--shared` depende dos objetos dele). Do URL, o `origin` do
 *  clone e o URL, que a marca da §4 grava. */
export const ONDE_CLONAR = "~/.cache/agent-template";

/** A instrucao de cada recusa: o clone da tag, que nao escreve no repo do template. */
export const comoClonar = (tag = "<tag>") =>
  `git clone -q --branch ${tag} <url-do-template> ${ONDE_CLONAR}/${tag}` +
  (tag === "<tag>" ? " (a mais recente: `git ls-remote --tags --refs --sort=-v:refname <url-do-template> 'v*'`)" : "") +
  ` — e correr dali (num sandbox que so escreve no TMPDIR: clonar la e passar --fronteira-em=<pasta vazia fora do projeto e do template>)`;

// `column.ui=never`: com colunas ligadas na config do utilizador, duas tags saiam numa so linha.
const git = (root, args) =>
  execFileSync("git", ["--no-optional-locks", "-c", "column.ui=never", ...args], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
// A razao do GIT (o stderr), e nao a 1.a linha da mensagem do `execFileSync`, que e so o comando: "dubious ownership"
// e "not a git repository" pedem correccoes diferentes.
const primeiraLinha = (err) =>
  String(err?.stderr ?? "").trim().split("\n")[0] || (err instanceof Error ? err.message : String(err)).split("\n")[0];
/** As releases estaveis primeiro: sem `versionsort.suffix`, o git poe `v1.0.0-rc.1` DEPOIS de `v1.0.0`. */
const estaveisPrimeiro = (ts) => [...ts.filter((t) => /^v\d+\.\d+\.\d+$/.test(t)), ...ts.filter((t) => !/^v\d+\.\d+\.\d+$/.test(t))];
const linhas = (t) => t.split("\n").filter(Boolean);

/**
 * (a) o `root` e a raiz do seu repo, sem alteracoes seguidas ou nao (os ignorados nao contam: o motor
 * exclui-os), e sem nada escondido do `status` (sparse, `skip-worktree`, `assume-unchanged`); (b) o
 * `HEAD` numa tag `v*` — com duas, a maior estavel (o clone traz as duas: recusar era um beco). `fatal`
 * recebe a razao e NAO retorna.
 *
 * @returns {{tag: string}}
 */
export function confirmaTemplateLimpoNumaTag(root, fatal) {
  const recusa = (porque, tag) => fatal(`o template em ${root} ${porque} — um upgrade le um clone limpo numa tag (#490): ${comoClonar(tag)}`);
  let r;
  // Tudo num so `try`: qualquer pergunta que falhe e a mesma recusa (`TP2`), nunca "limpo".
  try {
    r = {
      // `--show-prefix` vazio = o `root` e a raiz: sem comparar caminhos (maiusculas, symlinks, nomes 8.3).
      prefixo: git(root, ["rev-parse", "--show-prefix"]).trim(),
      // `--untracked-files=all` contra um `status.showUntrackedFiles=no` do utilizador.
      sujo: linhas(git(root, ["status", "--porcelain", "--untracked-files=all"])),
      sparse: git(root, ["config", "--bool", "--default", "false", "core.sparseCheckout"]).trim() === "true",
      // `ls-files -v`: minuscula = `assume-unchanged`, `S` = `skip-worktree` — o `status` nao os ve.
      escondidos: linhas(git(root, ["ls-files", "-v"])).filter((l) => /^[a-zS] /.test(l)).map((l) => l.slice(2)),
      tags: estaveisPrimeiro(linhas(git(root, ["tag", "--points-at", "HEAD", "--list", "--sort=-v:refname", "v[0-9]*"]))),
      todas: estaveisPrimeiro(linhas(git(root, ["tag", "--list", "--sort=-v:refname", "v[0-9]*"]))),
    };
  } catch (err) {
    return recusa(`nao responde ao git (${primeiraLinha(err)})`);
  }
  if (r.prefixo !== "") return recusa(`nao e a raiz de um repo (e a subpasta ${r.prefixo} de outro)`);
  if (r.sujo.length) {
    const amostra = r.sujo.slice(0, 3).map((l) => l.slice(3)).join(", ");
    return recusa(`tem ${r.sujo.length} alteracao(oes) por commitar (${amostra}${r.sujo.length > 3 ? ", ..." : ""})`);
  }
  if (r.sparse || r.escondidos.length) {
    return recusa(`esconde ficheiros do \`git status\` (${r.sparse ? "sparse-checkout" : `skip-worktree/assume-unchanged: ${r.escondidos.slice(0, 3).join(", ")}`})`);
  }
  if (r.tags.length === 0) {
    return r.todas.length
      ? recusa("nao esta numa tag de release (o HEAD e um commit sem tag `v*`)", r.todas[0])
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
    contem = git(root, ["tag", "--contains", ref, "--list", "v[0-9]*"]).split("\n").filter(Boolean);
  } catch {
    // fica "nenhuma": a recusa e a mesma, so a pista se perde
  }
  fatal(
    `a marca do projeto aponta para ${ref}, que nenhuma tag ate ao HEAD do template contem ` +
      `(tags que o contem: ${contem.length ? contem.join(", ") : "nenhuma"}) — se o projeto saiu de uma tag anterior, ` +
      "poe essa tag em `commit:`; se saiu de trabalho por publicar, espera pela tag que o contem"
  );
}
