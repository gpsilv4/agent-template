/**
 * Os casos da ORIGEM de uma adocao (#538): a tag confirmada no `origin`, uma tag fora do formato fora do comando, e a
 * retoma com a mesma definicao de "limpo" da guarda. Chamados no lugar pelo `test-adotar-template.mjs` (o ficheiro dele
 * esta perto das 500 linhas), com o template sintetico dele.
 *
 * Nenhum caso toca um host: os `origin` sao repos locais, um caminho que nao existe, ou um `git` injetado.
 */
import { join } from "path";

export function registarAdotarOrigem({ test, espera, recusa, git, escreve, planear, projeto, tpl, sandbox, MANIFESTO }) {
  let n = 0;
  /** Um clone do template sintetico: o `origin` dele e o `tpl` (um repo normal, com a `v9.10.0`). */
  const clona = () => {
    const dir = join(sandbox, `tpl-origem-${++n}`);
    git(sandbox, "clone", "-q", tpl, dir);
    return dir;
  };

  // --- A tag no origin ---
  test("recusa: uma tag SO LOCAL (o origin nao a tem) nao vai para o manifesto (#538)", () => {
    const c = clona();
    // No HEAD, ao lado da `v9.10.0`: a guarda escolhe a maior, e o `origin` (o `tpl`) nao a tem.
    git(c, "tag", "v9.12.0");
    const r = recusa(() => planear(c, projeto()));
    return espera(r !== null && /nao tem a tag v9\.12\.0 — e uma tag so local/.test(r), `deu: ${r}`);
  });
  test("recusa: a tag no origin aponta para OUTRO commit (#538)", () => {
    const c = clona();
    const outroNu = join(sandbox, `tpl-outro-${++n}.git`);
    git(sandbox, "clone", "-q", "--bare", tpl, outroNu);
    // No nu, a `v9.10.0` passa para um commit novo: o clone continua no antigo.
    const novo = git(outroNu, "commit-tree", "HEAD^{tree}", "-p", "HEAD", "-m", "outro").trim();
    git(outroNu, "tag", "-f", "v9.10.0", novo);
    git(c, "remote", "set-url", "origin", outroNu);
    const r = recusa(() => planear(c, projeto()));
    return espera(r !== null && new RegExp(`a tag v9\\.10\\.0 no origin .* aponta para ${novo.slice(0, 12)}`).test(r), `deu: ${r}`);
  });
  test("recusa: um origin que nao responde (um caminho que nao existe), com o origin na mensagem (#538)", () => {
    const c = clona();
    git(c, "remote", "set-url", "origin", "file:///nao/existe/tpl.git");
    const r = recusa(() => planear(c, projeto()));
    return espera(r !== null && /o origin file:\/\/\/nao\/existe\/tpl\.git nao respondeu \(/.test(r) && /precisa de o alcancar/.test(r), `deu: ${r}`);
  });
  test("recusa: um token no stderr do ls-remote NAO aparece na mensagem (#538)", () => {
    const falso = (args) => {
      if (args[0] === "ls-remote") throw Object.assign(new Error("Command failed: git ls-remote"), { stderr: "fatal: unable to access 'https://eu:segredo123@example.invalid/tpl/': Could not resolve host\n" });
      return git(tpl, ...args);
    };
    const r = recusa(() => planear(tpl, projeto(), falso));
    return [
      ...espera(r !== null && /nao respondeu \(fatal: unable to access 'https:\/\/example\.invalid\/tpl\/'/.test(r), `deu: ${r}`),
      ...espera(r !== null && !/segredo123|eu:/.test(r), `o token apareceu: ${r}`),
    ];
  });
  test("recusa: um origin que nao responde a tempo diz o tempo, e nao uma razao inventada (#538)", () => {
    const lento = (args) => {
      if (args[0] === "ls-remote") throw Object.assign(new Error("spawnSync git ETIMEDOUT"), { code: "ETIMEDOUT" });
      return git(tpl, ...args);
    };
    const r = recusa(() => planear(tpl, projeto(), lento));
    return espera(r !== null && /nao respondeu em 30 s/.test(r), `deu: ${r}`);
  });

  test("recusa: um git que falha SEM stderr da a razao do erro, e nao `nao respondeu ()` (#538)", () => {
    const mudo = (args) => {
      if (args[0] === "ls-remote") throw Object.assign(new Error("falhou sem stderr"), { stderr: "" });
      return git(tpl, ...args);
    };
    const r = recusa(() => planear(tpl, projeto(), mudo));
    return espera(r !== null && /nao respondeu \(falhou sem stderr\)/.test(r), `deu: ${r}`);
  });

  // --- A origem: "sem origin" so quando o git o diz; uma password fora do manifesto em qualquer esquema ---
  test("recusa: um origin que nao se le (config ilegivel) diz a razao do git, e nao `nao tem origin` (#538)", () => {
    const ilegivel = (args) => (args[0] === "remote" ? (() => { throw Object.assign(new Error("x"), { stderr: "fatal: bad config line 3 in file .git/config\n" }); })() : git(tpl, ...args));
    const r = recusa(() => planear(tpl, projeto(), ilegivel));
    return espera(r !== null && /nao consegui ler o origin do clone do template \(fatal: bad config line 3/.test(r) && !/nao tem `origin`/.test(r), `deu: ${r}`);
  });
  test("recusa: um token no stderr do get-url NAO aparece na mensagem (a razao fica)", () => {
    const comToken = (args) => (args[0] === "remote" ? (() => { throw Object.assign(new Error("x"), { stderr: "fatal: unable to access 'https://eu:segredo321@example.invalid/tpl': timeout\n" }); })() : git(tpl, ...args));
    const r = recusa(() => planear(tpl, projeto(), comToken));
    return espera(r !== null && /nao consegui ler o origin .*https:\/\/example\.invalid\/tpl/.test(r) && !/segredo321|eu:/.test(r), `deu: ${r}`);
  });
  test("recusa: um origin https que nao e um URL que se leia diz-o, sem o token (#538)", () => {
    const torto = (args) => (args[0] === "remote" ? "https://eu:segredo789@exa mple.invalid/tpl\n" : git(tpl, ...args));
    const r = recusa(() => planear(tpl, projeto(), torto));
    return espera(r !== null && /nao e um URL que se leia/.test(r) && !/segredo789/.test(r), `deu: ${r}`);
  });
  test("a password de um origin ssh:// nao vai para o manifesto; o utilizador fica (#538)", () => {
    // So o `get-url` e falso: o `ls-remote` vai ao `origin` real (o nu local), que tem a tag.
    const comPw = (args) => (args[0] === "remote" ? "ssh://git:segredo456@example.invalid/tpl.git\n" : git(tpl, ...args));
    const { origem } = planear(tpl, projeto(), comPw).template;
    return espera(origem === "ssh://git@example.invalid/tpl.git", `origem: ${origem}`);
  });

  // --- O formato da tag ---
  test("recusa: uma tag fora do formato (v9.12.0$(x)) nao conta, e nao entra no comando sugerido (#538)", () => {
    const c = clona();
    git(c, "commit", "-q", "--allow-empty", "-m", "depois da tag");
    git(c, "tag", "v9.12.0$(id);x");
    const r = recusa(() => planear(c, projeto()));
    return [
      ...espera(r !== null && /nao esta numa tag de release/.test(r) && r.includes("--branch v9.10.0"), `deu: ${r}`),
      ...espera(r !== null && !r.includes("$("), `a tag fora do formato entrou na mensagem: ${r}`),
    ];
  });

  // --- A retoma: a mesma definicao de "limpo" da guarda ---
  const retoma = (c) => {
    const p = projeto();
    escreve(p, MANIFESTO, JSON.stringify({ estado: "a copiar", copiados: [], colisoes: [], iguais: [], perguntar: [], template: { commit: git(c, "rev-parse", "HEAD").trim(), versao: "v9.10.0" } }));
    return recusa(() => planear(c, p));
  };
  test("recusa: na retoma, uma versao fora do formato no manifesto nao vai para a marca (#538)", () => {
    const c = clona();
    const p = projeto();
    escreve(p, MANIFESTO, JSON.stringify({ estado: "a copiar", copiados: [], colisoes: [], iguais: [], perguntar: [], template: { commit: git(c, "rev-parse", "HEAD").trim(), versao: "v1.0.0$(id);x" } }));
    const r = recusa(() => planear(c, p));
    return espera(r !== null && /versao fora do formato/.test(r) && !r.includes("$("), `deu: ${r}`);
  });
  test("recusa: na retoma, um ficheiro escondido do status (skip-worktree) (#538)", () => {
    const c = clona();
    git(c, "update-index", "--skip-worktree", "README.md");
    const r = retoma(c);
    return espera(r !== null && /esconde ficheiros do `git status` \(skip-worktree\/assume-unchanged: README\.md\)/.test(r), `deu: ${r}`);
  });
  test("recusa: na retoma, um ficheiro nao seguido com status.showUntrackedFiles=no (#538)", () => {
    const c = clona();
    git(c, "config", "status.showUntrackedFiles", "no");
    escreve(c, "rascunho.md", "x\n");
    const r = retoma(c);
    return espera(r !== null && /alteracao\(oes\) por commitar \(rascunho\.md\)/.test(r), `deu: ${r}`);
  });
}
