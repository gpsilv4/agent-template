/**
 * As tabelas de verbos do `guard-protected-branch.mjs` — {{PROJECT_NAME}}
 *
 * Vivem a parte por uma razao medida, e nao por gosto: o hook passou as 500 linhas (o flag que
 * `core-rules.md` torna obrigatorio e que o **Guard 17** verifica com catraca), e destas
 * ~700 linhas estas 120 eram **dados** — a lista de verbos seguros, as chaves de `git config`
 * que executam codigo, e as formas que tornam inseguro um verbo seguro. Separar os dados do
 * motor deixa o hook abaixo do seu teto e torna obvio onde se acrescenta um verbo.
 *
 * NAO e um entry point: nao corre nada, nao decide nada. O hook importa estas tres tabelas.
 *
 * Ao acrescentar um verbo a `SEGUROS`, perguntar sempre a seguir: **este verbo tem uma FLAG
 * que o torna destrutivo?** Se tiver, a entrada em `FORMAS_INSEGURAS` e obrigatoria — foi
 * assim que `git switch -C main` (que faz o que o `reset --hard` faz) passou a ser negado.
 */

/** Verbos que exigem uma FORMA para serem seguros (nao basta faltar-lhes a forma insegura).
 *
 *  Existe porque o `deploy.md`, o `CONTRIBUTING.md` e o `process-rules.md` mandam correr
 *  `git pull` e `git push origin --tags` em `main`: negar isso punha o guard em contradicao
 *  com o procedimento de release documentado — e um falso positivo que bloqueia trabalho
 *  documentado custa tanto como um bypass.
 *
 *  Recebe `ctx` com `ehProtegido` e `refsApagados`, que vivem no hook: a lista de branches
 *  protegidos e o que cada projeto adapta no bootstrap. */
export const FORMA_EXIGIDA = {
  pull: (args) => args.includes("--ff-only"),
  push: (args, ctx) => {
    const ehProtegido = ctx?.ehProtegido ?? (() => true);
    // (a) So tags: e o procedimento de release, que corre em `main`.
    //
    // `--follow-tags` SAIU daqui: nao e `--tags`. Publica o refspec normal **mais** as tags
    // anotadas, logo publica o branch atual — medido com `--dry-run --porcelain` contra um
    // remoto real, a enviar um commit de `main` que ninguem reviu.
    const semFlags = args.filter((a) => !a.startsWith("-"));
    const soTags =
      args.includes("--tags") &&
      semFlags.length <= 1 && // no maximo o nome do remoto
      !args.some((a) => a.includes(":"));
    if (soTags) return true;
    // (a2) Uma tag de VERSAO nomeada: `git push origin v0.4.0`. Publicar uma tag nao pode
    // mover um branch, e as `process-rules` mandam faze-lo depois de mergear para `main`.
    // Medido ao marcar a v0.4.0 deste repo — o guard negava o seu proprio procedimento.
    //
    // Pela FORMA do ref, e nao perguntando ao git: o `seguro()` nao conhece o diretorio (por
    // desenho — o alvo so e resolvido depois), logo um `git tag --list` aqui correria no cwd
    // do HOOK e responderia sobre o repo errado. Perguntar ao sitio errado e pior que nada.
    //
    // O que torna isto seguro nao e "parece uma tag": e a exclusao dos nomes protegidos. Se
    // `v1.2.3` for um BRANCH, publica-se um branch nao protegido — ja permitido.
    const semVersao = /^v?\d+\.\d+(?:\.\d+)?(?:[-+][\w.]+)?$/;
    if (
      semFlags.length >= 2 &&
      !args.some((a) => a.includes(":") || a === "--delete" || a === "-d") &&
      semFlags.slice(1).every((r) => semVersao.test(r) && !ehProtegido(r))
    ) {
      return true;
    }
    // (b) O comando **so apaga**, e nenhum dos refs apagados e protegido. Um
    // `git push origin --delete fix/algo` estando em `main` nao toca no `main`.
    //
    // **So as remocoes sao julgadas pelo alvo**; para todo o resto vale o branch onde se
    // esta. `todosApagam` e a correcao de uma leitura independente: bastava UMA remocao nao
    // protegida para branquear o comando inteiro, logo `git push origin :fix/x main`
    // empurrava o `main`.
    const refs = semFlags.slice(1); // o primeiro posicional e o remoto
    const temDelete = args.some((a) => a === "--delete" || /^-[a-zA-Z]*d[a-zA-Z]*$/.test(a));
    const todosApagam = refs.length > 0 && refs.every((r) => temDelete || r.startsWith(":"));
    if (!todosApagam) return false;
    return !(ctx?.refsApagados?.(args) ?? []).some((r) => ehProtegido(r));
  },
};

/** Verbos permitidos num branch protegido: leitura, inspecao, e escrita local que nao cria
 *  commits, nao reescreve historia e nao publica. **Tudo o que nao esta aqui e negado.**
 *  `switch` esta ca dentro de proposito: e como se SAI de um branch protegido, e (ao
 *  contrario de `checkout`) nunca recebe caminhos — quem descarta ficheiros e o `restore`. */
export const SEGUROS = new Set([
  "status", "log", "diff", "show", "branch", "tag", "remote", "fetch", "switch", "stash",
  "rev-parse", "rev-list", "symbolic-ref", "merge-base", "describe", "blame", "shortlog",
  "ls-files", "ls-tree", "ls-remote", "cat-file", "grep", "reflog", "add", "config", "help",
  "version", "init", "clone", "worktree", "name-rev", "count-objects", "cherry", "whatchanged",
  "diff-tree", "diff-index", "diff-files", "check-ignore", "check-attr", "var", "show-ref",
  "show-branch", "for-each-ref", "verify-commit", "verify-tag", "fsck", "archive", "bundle",
  "format-patch", "range-diff", "annotate", "notes", "submodule",
  // Estes dois so passam na forma exigida (ver `FORMA_EXIGIDA` no hook).
  "pull", "push",
  // FORA de proposito: `difftool` (`-x <cmd>`) e `bisect` (`bisect run <cmd>`) correm comandos
  // arbitrarios; `gui`/`citool`/`instaweb`/`web--browse` abrem processos interativos.
]);

/** Chaves de `git config` cuja ESCRITA e execucao de codigo ou desliga uma rede de
 *  seguranca. Nao e uma blocklist de comandos (que falharia aberta, `AP6`): e uma lista
 *  fechada de chaves que o proprio git documenta como executaveis. */
export const CHAVES_PERIGOSAS = new RegExp(
  "^(?:" +
    [
      // Chaves nomeadas que executam um comando.
      "core\\.(?:hooksPath|pager|editor|askpass|sshCommand|fsmonitor|gitProxy|alternateRefsCommand)",
      "sequence\\.editor", "http\\.proxy", "ssh\\.variant", "init\\.templateDir",
      "uploadpack\\.packObjectsHook", "instaweb\\.httpd",
      // Familias inteiras. A versao anterior tinha `credential.helper` LITERAL e deixava
      // passar `credential.<url>.helper`, que e a forma documentada e a mais usada. O mesmo
      // para `diff.external` vs `diff.<driver>.command`. Generalizar por SUFIXO fecha a
      // familia em vez de perseguir nomes um a um.
      "credential(?:\\..+)?\\.helper",
      "(?:diff|merge)\\..+\\.(?:command|driver|textconv)",
      "diff\\.external",
      "filter\\..+\\.(?:clean|smudge|process)",
      "gpg(?:\\..+)?\\.program",
      "(?:pager|man|browser|trailer|guitool)\\..+",
      "alias\\..+", "protocol\\..+\\.allow", "url\\..+\\.insteadOf",
      "include\\.path", "includeIf\\..+\\.path",
      // Rede final: qualquer chave que TERMINE num sufixo de execucao. E o que apanha o
      // proximo nome que o git inventar, em vez de esperar por outra auditoria.
      ".*\\.(?:cmd|command|program|driver|helper|hook|hooksPath)",
    ].join("|") +
    ")$",
  "i"
);

/** Um verbo seguro pode ser destrutivo pela FLAG. Medido numa revisao independente:
 *  `git switch -C main`, `git checkout -B main`, `git branch -f master`, `git branch -D
 *  develop` e `git fetch . HEAD:master` passavam todos — e o primeiro faz o que o
 *  `reset --hard` faz, que a versao anterior negava. Cada entrada aqui e uma forma que torna
 *  inseguro um verbo que esta em `SEGUROS`. */
export const FORMAS_INSEGURAS = {
  switch: /^(?:-C|--force|--discard-changes)$/,
  // `-c`/`-C` COPIAM um branch (`git branch -c antigo novo`) — nao destroem nada e sao a
  // forma normal de duplicar. Ficam de fora; `-m`/`-M` (mover/renomear) continuam, porque
  // renomear um branch protegido fa-lo desaparecer.
  //
  // Julgado pelo ALVO e nao pela flag — a mesma regra que o `push --delete` ja seguia, e a
  // incoerencia que faltava fechar: `git push origin --delete fix/x` passava, `git branch -d
  // fix/x` nao. Um derivado real bateu nisto logo a seguir a mergear um PR, a fazer a limpeza
  // que as `process-rules` mandam fazer.
  //
  // Porque nao a correcao mais obvia (tirar so o `-d`, que "o git ja protege"): ela deixaria
  // passar `git branch -d develop` — o git apaga-o de facto quando esta mergeado, e `develop`
  // e um branch PROTEGIDO. Julgar pelo alvo destrava a limpeza legitima **e** fecha esse caso.
  //
  // Sem alvo nomeado (`git branch -d` sozinho, ou so com flags) nao ha o que julgar: nega-se,
  // que e o lado seguro do erro.
  branch: (args, ctx) => {
    // Pelas flags NORMALIZADAS: `git branch -Df old` agrupa duas flags num token e nenhuma
    // casa por igualdade. A versao anterior desta regra era uma regex aplicada ao resultado
    // de `normalizaFlags`; ao passar a predicado, a normalizacao tinha de vir com ela — e
    // sem isso o proprio teste do `-Df` ficou vermelho, que e o que ele existe para fazer.
    const flags = ctx?.normalizaFlags?.(args) ?? args;
    const destrutiva = flags.some((a) => /^(?:-f|--force|-[dD]|--delete|-[mM]|--move)$/.test(a));
    if (!destrutiva) return false;
    const alvos = args.filter((a) => !a.startsWith("-"));
    if (alvos.length === 0) return true;
    return alvos.some((a) => ctx?.ehProtegido?.(a) ?? true);
  },
  tag: /^(?:-d|--delete|-f|--force)$/,
  // `symbolic-ref` LE o HEAD com um argumento e ESCREVE-O com dois. E a forma que permitia
  // `git symbolic-ref HEAD refs/heads/MAIN` seguido de `git commit` — medido a fazer `main`
  // avancar com o guarda a dizer `allow` nos dois passos, porque `PROTEGIDOS` comparava por
  // igualdade exacta e num filesystem case-insensitive `MAIN` **e** `main`.
  // Como predicado: `git symbolic-ref HEAD` (leitura) passa; com valor, ou com `-d`, nao.
  "symbolic-ref": (args) => {
    if (args.some((a) => /^(?:-d|--delete)$/.test(a))) return true;
    return args.filter((a) => !a.startsWith("-")).length >= 2;
  },
  // `config` e um verbo de LEITURA seguro, mas escrever certas chaves e execucao de codigo
  // ou desligar a propria rede: `core.hooksPath /dev/null` mata o `.githooks/commit-msg`
  // (a rede anti-atribuicao-a-IA deste repo), e `core.pager`/`credential.helper`/
  // `core.editor` sao sinks que um `git log` inocente dispara. Medidos a passar.
  // Como PREDICADO e nao regex: e preciso distinguir a leitura (`git config --get x`, que
  // continua a passar) da escrita, e isso depende de haver um VALOR a seguir a chave.
  config: (args) => {
    const flagsDestrutivas = /^(?:--unset|--unset-all|--remove-section|--rename-section|--replace-all|-e|--edit)$/;
    if (args.some((a) => flagsDestrutivas.test(a))) return true;
    // As flags que CONSOMEM o argumento seguinte: sem as saltar, o valor de `--file` virava
    // `posicionais[0]` e `CHAVES_PERIGOSAS` testava `.git/config` em vez da chave. Medido a
    // escrever `core.hooksPath` de facto — a mesma chave que a tabela ja dava por fechada.
    const FLAGS_COM_VALOR = /^(?:--file|-f|--blob|--default|--type|-t)$/;
    const posicionais = [];
    for (let i = 0; i < args.length; i++) {
      if (args[i].startsWith("-")) {
        if (FLAGS_COM_VALOR.test(args[i])) i++;
        continue;
      }
      posicionais.push(args[i]);
    }
    if (posicionais.length === 0) return false;

    // O git 2.46 acrescentou sub-comandos (`git config set|unset|get|list|edit ...`). A
    // versao anterior lia `posicionais[0]` como a CHAVE, logo na forma nova a "chave" era
    // `set` e nao casava nada: `git config set core.hooksPath /dev/null` passava e desligava
    // o `.githooks/commit-msg` de facto. Medido com git 2.50 por uma leitura independente —
    // era o caso que o comentario acima dizia estar fechado.
    const SUBCOMANDOS = /^(?:set|unset|get|list|edit|replace-all|add|remove-section|rename-section)$/;
    let campos = posicionais;
    if (SUBCOMANDOS.test(campos[0])) {
      // `unset`/`edit` sao destrutivos por si, como as flags equivalentes.
      if (/^(?:unset|edit|remove-section|rename-section)$/.test(campos[0])) return true;
      campos = campos.slice(1);
    }
    // Uma escrita tem chave E valor; `git config core.pager` sozinho apenas le.
    if (campos.length < 2) return false;
    return CHAVES_PERIGOSAS.test(campos[0]);
  },
  add: /^(?:-i|--interactive|-p|--patch)$/, // interativos: um hook nao tem como responder
  // `fetch` com refspec escreve refs locais (`git fetch . HEAD:master`). Como PREDICADO e nao
  // regex, para excluir primeiro os `:` que sao de URL — senao `git fetch https://x/y main` e
  // `git fetch git@host:o/r.git` eram negados, tres falsos positivos medidos.
  // `+refs/heads/main:refs/remotes/origin/main` escreve um ref REMOTE-TRACKING, que e o que
  // um fetch normal faz — nao toca em `refs/heads/`. Negar isto bloqueava um fetch explicito,
  // que e trabalho legitimo e frequente.
  fetch: (args) =>
    args.some(
      (a) =>
        !/:refs\/remotes\//.test(a) &&
        !/^[a-z][a-z0-9+.-]*:\/\//i.test(a) && !/^[^/\s]+@[^:\s]+:/.test(a) && (a.includes(":") || a.startsWith("+"))
    ),
};
