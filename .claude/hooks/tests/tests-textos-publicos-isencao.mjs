/**
 * Testes do hook `guard-textos-publicos`: a ISENCAO do `commit-msg` do template (#511, #536, #545, #546) — {{PROJECT_NAME}}
 *
 * O que se afirma: `node .githooks/commit-msg F && git commit -F F` passa (o script so LE a mensagem), e cada condicao
 * da isencao tem o seu caso — outro script, outra pasta, uma escrita no que ele corre, ou um `node` mudado (por uma
 * atribuicao, um `export`, uma funcao) tiram-na. Os ajudantes (`corre`, `chama`, `afirma`...) sao do
 * `tests-textos-publicos.mjs`.
 *
 * Vivia no `tests-textos-publicos.mjs` ate ao #580, que o separou para os dois ficarem com folga do Guard 17. Os
 * casos vieram sem mudanca.
 *
 * NAO e um entry point. O `test-hooks.mjs` descobre-o e chama `registar()`.
 */
import { execFileSync, spawnSync } from "child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { dirname, join, resolve } from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { afirma, chama, corre, DEIXA, ESCRITO, HOOK, LIMPOS, LISTA, NEGA, SEM_GIT } from "./tests-textos-publicos.mjs";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.error("tests-textos-publicos-isencao.mjs nao e um entry point: nao corre testes por si.\nCorrer `node .claude/hooks/tests/test-hooks.mjs`.");
  process.exit(1);
}

/** Entry point a que este modulo pertence. */
export const entryPoint = "test-hooks.mjs";

export function registar({ test }) {
  // #511: o `commit-msg` do template so LE a mensagem — valida-la e fazer o commit no mesmo comando passa. UM CASO POR
  // CONDICAO da isencao (as duas leituras independentes do #511): cada um fica vermelho sozinho quando a sua cai.
  test("textos-publicos: o commit-msg do template a validar o -F do mesmo comando passa (#511)", () => {
    for (const c of [`node .githooks/commit-msg pr.md && git commit -F pr.md`, `node ./.githooks/commit-msg pr.md && git add -A && git commit -qF pr.md`])
      afirma(corre(c, { ficheiros: LIMPOS }), DEIXA);
  });
  test("textos-publicos: so o script exato e isento — outro script, outro caminho, ou um node com opcoes nega (#511)", () => {
    for (const c of [`node outro.mjs pr.md && git commit -F pr.md`, `node x/.githooks/commit-msg pr.md && git commit -F pr.md`,
      `node --input-type=module .githooks/commit-msg pr.md && git commit -F pr.md`])
      afirma(corre(c, { ficheiros: LIMPOS }), ESCRITO);
  });
  test("textos-publicos: a isencao nao tira as redireccoes nem os pipelines do proprio comando (#511)", () => {
    for (const c of [`node .githooks/commit-msg pr.md > pr.md && git commit -F pr.md`, `node .githooks/commit-msg pr.md | tee pr.md && git commit -F pr.md`])
      afirma(corre(c, { ficheiros: LIMPOS }), ESCRITO);
  });
  // O `sub/pr.md` existe e esta limpo: a negacao so pode vir da escrita (corria o `commit-msg` do `sub`).
  test("textos-publicos: noutra pasta (depois de um cd) a isencao nao vale (#511)", () =>
    afirma(corre(`cd sub && node .githooks/commit-msg pr.md && git commit -F pr.md`, { ficheiros: { ...LIMPOS, "sub/pr.md": "texto limpo\n" } }), ESCRITO));
  test("textos-publicos: com atribuicoes antes do node (NODE_OPTIONS corre outro codigo) a isencao nao vale (#511)", () =>
    afirma(corre(`NODE_OPTIONS=--import=./w.mjs node .githooks/commit-msg pr.md && git commit -F pr.md`, { ficheiros: LIMPOS }), ESCRITO));
  test("textos-publicos: um ./node qualquer nao e o node (#511)", () =>
    afirma(corre(`./node .githooks/commit-msg pr.md && git commit -F pr.md`, { ficheiros: LIMPOS }), ESCRITO));
  test("textos-publicos: reescrever o script (ou a lib dele) no mesmo comando tira a isencao (#511)", () => {
    for (const c of [`cp x.mjs .githooks/commit-msg && node .githooks/commit-msg pr.md && git commit -F pr.md`,
      `cp x.mjs .githooks/lib/commit-msg.mjs && node .githooks/commit-msg pr.md && git commit -F pr.md`])
      afirma(corre(c, { ficheiros: LIMPOS }), ESCRITO);
  });
  // #536 (o `/audit` pre-tag da v0.63.5, M3): as OUTRAS formas de tocar no que o script corre. A condicao do alvo por
  // resolver (`e.p === null`) tem DOIS casos (#545): antes da leitura (sem ela o `toca` lancava, e o hook deixava passar);
  // e depois dela, onde e a unica que nega (o `mesmo` nao ve uma escrita que vem depois) — um aviso a mais, de proposito.
  test("textos-publicos: uma escrita num alvo que nao se resolve tira a isencao (#536)", () =>
    afirma(corre(`echo x > "$F" && node .githooks/commit-msg pr.md && git commit -F pr.md`, { ficheiros: LIMPOS }), ESCRITO));
  test("textos-publicos: uma escrita por resolver DEPOIS da leitura tambem tira a isencao (falhar fechado, #545)", () =>
    afirma(corre(`node .githooks/commit-msg pr.md && git commit -F pr.md && echo x > "$F"`, { ficheiros: LIMPOS }), ESCRITO));
  test("textos-publicos: copiar PARA a propria pasta .githooks tira a isencao (#536)", () =>
    afirma(corre(`cp -r d .githooks && node .githooks/commit-msg pr.md && git commit -F pr.md`, { ficheiros: LIMPOS }), ESCRITO));
  // A mensagem FORA da pasta copiada (`~/pr.md`): com ela dentro, a copia para `.` ja a tapava e o caso negava sem a
  // condicao (um controlo do #536 mostrou-o).
  test("textos-publicos: uma copia para a pasta que CONTEM o .githooks tira a isencao (#536)", () =>
    afirma(corre(`cp -r outro/.githooks . && node .githooks/commit-msg ~/pr.md && git commit -F ~/pr.md`, { ficheiros: { "~/pr.md": "texto limpo\n" } }), ESCRITO));
  test("textos-publicos: escrever numa lib que o commit-msg importa (.agent/scripts/lib/) tira a isencao (#536)", () =>
    afirma(corre(`cp x.mjs .agent/scripts/lib/prefixo-commit.mjs && node .githooks/commit-msg pr.md && git commit -F pr.md`, { ficheiros: LIMPOS }), ESCRITO));
  test("textos-publicos: um node mudado noutro comando (export NODE_OPTIONS/PATH, uma funcao node) tira a isencao (#536)", () => {
    for (const c of [`export NODE_OPTIONS=--import=./w.mjs && node .githooks/commit-msg pr.md && git commit -F pr.md`,
      `export PATH=./bin:$PATH && node .githooks/commit-msg pr.md && git commit -F pr.md`,
      `NODE_PATH=./m; node .githooks/commit-msg pr.md && git commit -F pr.md`,
      `declare -x NODE_OPTIONS=--require=./w.cjs && node .githooks/commit-msg pr.md && git commit -F pr.md`,
      `node() { ./outro.sh; }; node .githooks/commit-msg pr.md && git commit -F pr.md`,
      `function node { ./outro.sh; }; node .githooks/commit-msg pr.md && git commit -F pr.md`])
      afirma(corre(c, { ficheiros: LIMPOS }), ESCRITO);
  });
  // #545: o `NODE_OPTIONS+=` (o nome lia-se `NODE_OPTIONS+`; a forma EXPORTADA discrimina, a de prefixo ja negava por
  // outro caminho) e um `export`/`declare` SEM `=` (exporta o valor posto antes). Controlos: `export FOO+=1`/`FOO`, abaixo.
  test("textos-publicos: um NODE_OPTIONS+=, ou um export/declare sem `=`, tambem tira a isencao (#545)", () => {
    for (const c of [`export NODE_OPTIONS+=--import=./w.mjs && node .githooks/commit-msg pr.md && git commit -F pr.md`,
      `NODE_OPTIONS+=--import=./w.mjs node .githooks/commit-msg pr.md && git commit -F pr.md`,
      `printf -v NODE_OPTIONS -- --import=./w.mjs && export NODE_OPTIONS && node .githooks/commit-msg pr.md && git commit -F pr.md`,
      `declare -x PATH && node .githooks/commit-msg pr.md && git commit -F pr.md`])
      afirma(corre(c, { ficheiros: LIMPOS }), ESCRITO);
  });
  // #545: o `X+=y` antes do comando e uma atribuicao (o `cabeca`): o comando que corre e o que vem a seguir. Antes, o
  // `FOO+=1` lia-se como o comando — um `gh` depois dele nem era lido, e um `cat` contava como escrita.
  test("textos-publicos: um FOO+=1 antes do gh nao o esconde; antes de um cat, e um leitor como com FOO=1 (#545)", () => {
    afirma(corre(`FOO+=1 gh issue create --title x --body "projeto-secreto"`), NEGA);
    afirma(corre(`FOO+=1 cat pr.md && git commit -F pr.md`, { ficheiros: LIMPOS }), DEIXA);
  });
  test("textos-publicos: CONTROLO — exportar outra variavel, ou escrever fora do que o script corre, deixa a isencao (#536)", () => {
    for (const c of [`export FOO=1 && node .githooks/commit-msg pr.md && git commit -F pr.md`,
      `export FOO+=1 && node .githooks/commit-msg pr.md && git commit -F pr.md`,
      `export FOO && node .githooks/commit-msg pr.md && git commit -F pr.md`,
      `cp x.mjs .agent/scripts/outro.mjs && node .githooks/commit-msg pr.md && git commit -F pr.md`,
      `cp x.mjs .git-hooks-velhos && node .githooks/commit-msg pr.md && git commit -F pr.md`])
      afirma(corre(c, { ficheiros: LIMPOS }), DEIXA);
    // A pasta `.git` nao CONTEM o `.githooks` (o separador, #536): sem ele, `<raiz>/.githooks` comecava por `<raiz>/.git`.
    afirma(corre(`cp -r x .git && node .githooks/commit-msg ~/pr.md && git commit -F ~/pr.md`, { ficheiros: { "~/pr.md": "texto limpo\n" } }), DEIXA);
  });
  // O realpath da isencao (#511) so se provava no macOS (`/var` e `/private/var`): aqui o `cwd` entra por um symlink.
  test("textos-publicos: com o cwd a entrar por um symlink para o repo, a isencao vale na mesma (#536)", () => {
    const dir = mkdtempSync(join(tmpdir(), "textos-hook-test-"));
    try {
      const repo = join(dir, "repo");
      mkdirSync(repo, { recursive: true });
      const env = { ...SEM_GIT(), GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1", HOME: join(dir, "home"), NOMES_PROIBIDOS_FICHEIRO: join(dir, "lista") };
      mkdirSync(env.HOME, { recursive: true });
      writeFileSync(join(dir, "lista"), LISTA);
      execFileSync("git", ["init", "-q"], { cwd: repo, env });
      writeFileSync(join(repo, "pr.md"), "texto limpo\n");
      symlinkSync(repo, join(dir, "atalho"));
      return afirma(chama(HOOK, `node .githooks/commit-msg pr.md && git commit -F pr.md`, join(dir, "atalho"), env), DEIXA);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  // A premissa do #511 tem rede: o `commit-msg` do template LE a mensagem e nao lhe toca (um hook que a normalizasse
  // passava a escrever o ficheiro, e a isencao a mentir). Corre-se o verdadeiro, e os bytes ficam iguais.
  test("textos-publicos: o commit-msg do template nao escreve o ficheiro que valida (a premissa do #511)", () => {
    const raizRepo = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
    const dir = mkdtempSync(join(tmpdir(), "textos-hook-test-"));
    try {
      const f = join(dir, "msg.txt");
      const antes = "feat(x): uma mensagem\n\n# um comentario que um hook que normaliza tiraria\n";
      writeFileSync(f, antes);
      // Com uma HOME temporaria (a lista da maquina fica de fora) e o `status` afirmado (#536): um `commit-msg` que nem
      // corresse (um import partido) deixava os bytes iguais, e o caso verde sem provar nada.
      const r = spawnSync(process.execPath, [join(raizRepo, ".githooks/commit-msg"), f], { cwd: raizRepo, encoding: "utf8", env: { ...SEM_GIT(), HOME: dir } });
      if (r.status !== 0) return [`o commit-msg saiu ${r.status} com uma mensagem valida (nao correu ate ao fim?): ${r.stderr}`];
      return readFileSync(f, "utf8") === antes ? [] : ["o commit-msg reescreveu o ficheiro: a isencao do #511 deixa de ser verdade"];
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}
