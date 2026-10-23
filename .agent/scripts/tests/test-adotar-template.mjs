#!/usr/bin/env node
/**
 * Testes da adocao do template num projeto existente (`adotar-template.mjs`) — {{PROJECT_NAME}}
 *
 * O que se afirma: o que o projeto ja tinha **nao e tocado**, as colisoes saem decididas ANTES da
 * copia (o defeito da versao em shell, #288), nada se escreve por um symlink, o `LICENSE` nao se
 * herda em silencio, e as recusas recusam. Cada caso tem o seu contra-caso: um teste que so
 * olhasse para o caminho feliz passava com as recusas todas desligadas.
 *
 * Um template SINTETICO (um repo git com os ficheiros minimos, e o proprio script copiado para la,
 * porque a CLI acha o template pelo sitio onde o script vive) e um projeto sintetico por caso.
 *
 *   node .agent/scripts/tests/test-adotar-template.mjs
 */
import { execFileSync } from "child_process";
import { chmodSync, cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import { executar, MANIFESTO, planear } from "../adotar-template.mjs";

const SCRIPTS = resolve(dirname(fileURLToPath(import.meta.url)), "..");

let passed = 0;
const falhas = [];
const test = (nome, fn) => {
  let p;
  try {
    p = fn() ?? [];
  } catch (err) {
    p = [`rebentou: ${err instanceof Error ? err.message : String(err)}`];
  }
  if (p.length === 0) {
    passed++;
    console.log(`  PASS  ${nome}`);
  } else {
    falhas.push(nome);
    console.log(`  FAIL  ${nome}`);
    for (const m of p) console.log(`          ${m}`);
  }
};
const espera = (cond, msg) => (cond ? [] : [msg]);
/** A razao da recusa, ou `null` se `fn` nao recusou. */
const recusa = (fn) => {
  try {
    fn();
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
};

const ISOLADO = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" };
const git = (cwd, ...a) =>
  execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", ...a], { cwd, encoding: "utf8", env: ISOLADO, stdio: ["ignore", "pipe", "pipe"] });
const escreve = (raiz, rel, txt, modo) => {
  mkdirSync(dirname(join(raiz, rel)), { recursive: true });
  writeFileSync(join(raiz, rel), txt);
  if (modo) chmodSync(join(raiz, rel), modo);
};

// So POSIX, e dito em vez de reprovar: os casos de symlink pedem privilegios no Windows (EPERM), e o
// bit de execucao nao existe la. O CI corre em ubuntu.
if (process.platform === "win32") {
  console.log("\n  SKIP  suite so POSIX (symlinks e bit de execucao) — corre-a num Linux ou macOS.");
  process.exit(0);
}

const sandbox = mkdtempSync(join(tmpdir(), "adotar-test-"));
try {
  // O template: os ficheiros que os casos olham, mais o script e o modulo que ele importa.
  const tpl = join(sandbox, "tpl");
  escreve(tpl, ".agent/BOOTSTRAP.md", "# Bootstrap\n");
  escreve(tpl, ".agent/TEMPLATE_VERSION", "v9.9.9\n");
  escreve(tpl, "LICENSE", "MIT do template\n");
  escreve(tpl, "README.md", "# Template\n");
  escreve(tpl, "CLAUDE.md", "# Regras do template\n");
  escreve(tpl, ".editorconfig", "root = true\n");
  escreve(tpl, ".githooks/commit-msg", "#!/usr/bin/env node\n", 0o755);
  escreve(tpl, ".github/workflows/ci.yml", "jobs: {}\n");
  cpSync(join(SCRIPTS, "adotar-template.mjs"), join(tpl, ".agent/scripts/adotar-template.mjs"));
  cpSync(join(SCRIPTS, "lib/derivado.mjs"), join(tpl, ".agent/scripts/lib/derivado.mjs"));
  // O que o `adotar-template.mjs` importa tem de vir com ele (#373: a guarda de entry point partilhada).
  cpSync(join(SCRIPTS, "lib/eh-main.mjs"), join(tpl, ".agent/scripts/lib/eh-main.mjs"));
  git(tpl, "init", "-q", "-b", "main");
  git(tpl, "add", "-A");
  git(tpl, "commit", "-q", "-m", "template");
  git(tpl, "remote", "add", "origin", "https://example.invalid/agent-template");
  const commitTpl = git(tpl, "rev-parse", "HEAD").trim();

  let n = 0;
  /** Um projeto novo, com os ficheiros `{ rel: conteudo }`. */
  const projeto = (ficheiros = {}) => {
    const p = join(sandbox, `proj${n++}`);
    mkdirSync(p);
    for (const [rel, txt] of Object.entries(ficheiros)) escreve(p, rel, txt);
    return p;
  };
  const le = (raiz, rel) => readFileSync(join(raiz, rel), "utf8");
  const cli = (cwd, ...args) => {
    try {
      return { code: 0, out: execFileSync("node", [join(tpl, ".agent/scripts/adotar-template.mjs"), ...args], { cwd, encoding: "utf8", env: ISOLADO, stdio: ["ignore", "pipe", "pipe"] }) };
    } catch (err) {
      return { code: err.status ?? -1, out: `${err.stdout ?? ""}${err.stderr ?? ""}` };
    }
  };

  console.log("\n=== Testes da adocao do template ===\n");

  test("copia o que falta, preserva o executavel, e o que o projeto tinha fica intacto", () => {
    const p = projeto({ "README.md": "# O meu projeto\n", "src/app.js": "x\n" });
    executar(planear(tpl, p));
    const m = JSON.parse(le(p, MANIFESTO));
    return [
      ...espera(le(p, "README.md") === "# O meu projeto\n", "o README do projeto foi tocado"),
      ...espera(le(p, "CLAUDE.md") === "# Regras do template\n", "o CLAUDE.md que faltava nao foi copiado"),
      ...espera((statSync(join(p, ".githooks/commit-msg")).mode & 0o111) !== 0, "o commit-msg perdeu o bit de execucao"),
      ...espera(m.copiados.includes("CLAUDE.md") && !m.copiados.includes("README.md"), `copiados: ${m.copiados}`),
      ...espera(JSON.stringify(m.colisoes) === '["README.md"]', `colisoes: ${m.colisoes}`),
      ...espera(le(p, "src/app.js") === "x\n", "o codigo do projeto foi tocado"),
    ];
  });

  test("as colisoes decidem-se ANTES da copia: o que se copiou nao aparece como colisao", () => {
    const m = planear(tpl, projeto());
    return [
      ...espera(m.colisoes.length === 0, `num projeto vazio nada colide, e saiu ${m.colisoes}`),
      // O total vem da fixture, e nao de um numero escrito a mao (`TP8`): era 9, e partiu ao entrar o `eh-main.mjs` (#373).
      ...((total) => espera(total > 1 && m.copiados.length === total - 1, `devia copiar ${total - 1} (os ${total} da fixture menos o LICENSE), copiou ${m.copiados.length}`))(git(tpl, "ls-files").trim().split("\n").length),
    ];
  });

  test("um ficheiro IGUAL ao do template nao e colisao (nem e copiado); um diferente e", () => {
    const m = planear(tpl, projeto({ ".editorconfig": "root = true\n", "CLAUDE.md": "# As minhas regras\n" }));
    return [
      ...espera(m.iguais.includes(".editorconfig") && !m.colisoes.includes(".editorconfig"), "o igual saiu como colisao"),
      ...espera(m.colisoes.includes("CLAUDE.md"), "o diferente nao saiu como colisao"),
    ];
  });

  test("o LICENSE nao se copia: fica em `perguntar`; um LICENSE do projeto e colisao", () => {
    const p = projeto();
    executar(planear(tpl, p));
    const m = JSON.parse(le(p, MANIFESTO));
    const outro = planear(tpl, projeto({ LICENSE: "Proprietary\n" }));
    return [
      ...espera(!existsSync(join(p, "LICENSE")), "o LICENSE do template foi copiado"),
      ...espera(JSON.stringify(m.perguntar) === '["LICENSE"]', `perguntar: ${m.perguntar}`),
      ...espera(outro.colisoes.includes("LICENSE") && outro.perguntar.length === 0, "o LICENSE do projeto nao saiu como colisao"),
    ];
  });

  test("uma pasta que e um SYMLINK e colisao: nada e escrito fora do projeto", () => {
    const fora = join(sandbox, "fora");
    mkdirSync(fora);
    const p = projeto();
    symlinkSync(fora, join(p, ".githooks"));
    executar(planear(tpl, p));
    const m = JSON.parse(le(p, MANIFESTO));
    return [
      ...espera(readdirSync(fora).length === 0, `escreveu pelo symlink: ${readdirSync(fora)}`),
      ...espera(m.colisoes.includes(".githooks/commit-msg"), "o caminho pelo symlink nao saiu como colisao"),
      // O contra-caso: uma pasta REAL com o mesmo nome deixa copiar.
      ...espera(planear(tpl, projeto({ ".githooks/outro": "x\n" })).copiados.includes(".githooks/commit-msg"), "uma pasta real bloqueou a copia"),
    ];
  });

  test("um FICHEIRO onde o template tem uma pasta e colisao, e nao um rebentamento", () => {
    const m = planear(tpl, projeto({ ".github": "nao sou uma pasta\n" }));
    return espera(m.colisoes.includes(".github/workflows/ci.yml"), `colisoes: ${m.colisoes}`);
  });

  test("o manifesto traz a origem do TEMPLATE (caminho, remoto, commit, versao), nao a do projeto", () => {
    const p = projeto();
    git(p, "init", "-q");
    git(p, "remote", "add", "origin", "https://example.invalid/projeto");
    const { template } = planear(tpl, p);
    return [
      ...espera(template.origem === "https://example.invalid/agent-template", `origem: ${template.origem}`),
      ...espera(template.commit === commitTpl, `commit: ${template.commit}`),
      ...espera(template.versao === "v9.9.9", `versao: ${template.versao}`),
      ...espera(template.caminho === realpathSync(tpl), `caminho: ${template.caminho}`),
    ];
  });

  test("um token no URL do remoto NAO vai para o manifesto (que se commita)", () => {
    const comToken = (args) => (args[0] === "remote" ? "https://eu:segredo123@example.invalid/agent-template\n" : git(tpl, ...args));
    const { origem } = planear(tpl, projeto(), comToken).template;
    return espera(!/segredo123|eu:/.test(origem) && origem.includes("example.invalid/agent-template"), `origem: ${origem}`);
  });

  test("sem remoto no clone, a origem fica `null` e a adocao segue", () => {
    const semRemoto = (args) => (args[0] === "remote" ? (() => { throw new Error("sem origin"); })() : git(tpl, ...args));
    return espera(planear(tpl, projeto(), semRemoto).template.origem === null, "devia ser null");
  });

  // As recusas. O contra-caso de todas e o primeiro teste: o mesmo `planear` num projeto normal.
  const recusas = [
    ["correr DENTRO do proprio template", () => planear(tpl, tpl), /sobrepoem/],
    ["um projeto dentro do clone do template", () => planear(tpl, join(tpl, ".agent")), /sobrepoem/],
    ["o clone do template dentro do projeto", () => planear(tpl, sandbox), /sobrepoem/],
    ["um projeto ja bootstrapado (e o /upgrade)", () => planear(tpl, projeto({ ".agent/.template-version": "x\n" })), /\/upgrade/],
    ["um projeto ja adotado (o manifesto existe)", () => planear(tpl, projeto({ [MANIFESTO]: JSON.stringify({ estado: "commitado", copiados: [], colisoes: [], iguais: [], perguntar: [], template: { commit: "x" } }) })), /ja existe/],
    ["um template sem ficheiros no git", () => planear(tpl, projeto(), () => ""), /nao tem ficheiros/],
  ];
  for (const [nome, fn, re] of recusas) {
    test(`recusa: ${nome}`, () => {
      const r = recusa(fn);
      return espera(r !== null && re.test(r), `devia recusar com ${re}, e deu: ${r}`);
    });
  }

  test("recusa: um template que ja e derivado (tem a marca do bootstrap)", () => {
    escreve(tpl, ".agent/.template-version", "x\n");
    try {
      const r = recusa(() => planear(tpl, projeto()));
      // Corrido da raiz do proprio derivado: a mensagem aponta para o /upgrade, nao para clonar.
      const r2 = recusa(() => planear(tpl, tpl));
      return [
        ...espera(r !== null && /nao e o template/.test(r), `deu: ${r}`),
        ...espera(r2 !== null && /\/upgrade/.test(r2), `na raiz do derivado deu: ${r2}`),
      ];
    } finally {
      rmSync(join(tpl, ".agent/.template-version"));
    }
  });

  test("um ficheiro que aparece entre o plano e a copia nao e sobrescrito: passa a colisao", () => {
    const p = projeto();
    const plano = planear(tpl, p);
    escreve(p, "CLAUDE.md", "# Escrito entretanto\n");
    const final = executar(plano);
    return [
      ...espera(le(p, "CLAUDE.md") === "# Escrito entretanto\n", "sobrescreveu"),
      ...espera(final.colisoes.includes("CLAUDE.md") && !final.copiados.includes("CLAUDE.md"), `copiados/colisoes erradas: ${final.colisoes}`),
      ...espera(JSON.parse(le(p, MANIFESTO)).estado === "completo", "o manifesto final nao ficou completo"),
    ];
  });

  test("um ficheiro IGUAL posto la entretanto vai para `iguais`, nao para `copiados`", () => {
    const p = projeto();
    const plano = planear(tpl, p);
    escreve(p, "CLAUDE.md", "# Regras do template\n");
    const final = executar(plano);
    return espera(final.iguais.includes("CLAUDE.md") && !final.copiados.includes("CLAUDE.md"), `copiados tem-no: ${final.copiados.includes("CLAUDE.md")}`);
  });

  test("um symlink no sitio do MANIFESTO: a escrita nao segue para o alvo dele", () => {
    const p = projeto();
    mkdirSync(join(p, ".agent"));
    const alvo = join(sandbox, `alvo-manifesto-${n}`);
    symlinkSync(alvo, join(p, MANIFESTO));
    executar(planear(tpl, p));
    return [
      ...espera(!existsSync(alvo), "escreveu no alvo do symlink, fora do projeto"),
      ...espera(lstatSync(join(p, MANIFESTO)).isFile(), "o manifesto nao ficou um ficheiro regular"),
    ];
  });

  test("o temporario de uma corrida morta e limpo; um symlink com o mesmo nome nao", () => {
    const p = projeto();
    escreve(p, ".agent/adocao.json.4194304.tmp", "lixo\n");
    const alvo = join(sandbox, `alvo-tmp-${n}`);
    writeFileSync(alvo, "nao me apagues\n");
    symlinkSync(alvo, join(p, ".agent/adocao.json.4194305.tmp"));
    executar(planear(tpl, p));
    return [
      ...espera(!existsSync(join(p, ".agent/adocao.json.4194304.tmp")), "o temporario orfao ficou"),
      ...espera(existsSync(alvo) && lstatSync(join(p, ".agent/adocao.json.4194305.tmp")).isSymbolicLink(), "mexeu no symlink"),
    ];
  });

  test("recusa: um manifesto ilegivel (JSON invalido, null, sem as listas)", () => {
    const rs = ["{nao e json", "null", '{"estado":"a copiar"}'].map((txt) => recusa(() => planear(tpl, projeto({ [MANIFESTO]: txt }))));
    return rs.flatMap((r, i) => espera(r !== null && /ilegivel/.test(r), `caso ${i}: ${r}`));
  });

  test("recusa: na retoma, um ficheiro copiado que agora DIFERE do template (copia cortada)", () => {
    const p = projeto();
    executar(planear(tpl, p));
    writeFileSync(join(p, MANIFESTO), JSON.stringify({ ...JSON.parse(le(p, MANIFESTO)), estado: "a copiar" }));
    writeFileSync(join(p, "CLAUDE.md"), "# Regr"); // truncado
    const r = recusa(() => planear(tpl, p));
    return espera(r !== null && /CLAUDE\.md/.test(r) && /diferentes/.test(r), `deu: ${r}`);
  });

  test("na retoma, o caminho do template e o do clone ATUAL", () => {
    const p = projeto();
    executar(planear(tpl, p));
    const m = JSON.parse(le(p, MANIFESTO));
    writeFileSync(join(p, MANIFESTO), JSON.stringify({ ...m, estado: "a copiar", template: { ...m.template, caminho: "/ja/nao/existe" } }));
    return espera(planear(tpl, p).template.caminho === realpathSync(tpl), "ficou o caminho antigo");
  });

  test("um symlink QUEBRADO posto no destino entretanto: nada e escrito no alvo dele", () => {
    const p = projeto();
    const plano = planear(tpl, p);
    const alvo = join(sandbox, `alvo-quebrado-${n}`);
    symlinkSync(alvo, join(p, "CLAUDE.md"));
    const final = executar(plano);
    return [
      ...espera(!existsSync(alvo), "escreveu pelo symlink quebrado, para fora do projeto"),
      ...espera(final.colisoes.includes("CLAUDE.md"), "o symlink nao passou a colisao"),
    ];
  });

  test("um PAI trocado por um symlink entretanto: o mkdir nao o segue", () => {
    const fora = join(sandbox, `fora-pai-${n}`);
    mkdirSync(fora);
    const p = projeto();
    const plano = planear(tpl, p);
    symlinkSync(fora, join(p, ".github"));
    const final = executar(plano);
    return [
      ...espera(readdirSync(fora).length === 0, `escreveu pelo pai: ${readdirSync(fora)}`),
      ...espera(final.colisoes.includes(".github/workflows/ci.yml"), "o caminho pelo pai nao passou a colisao"),
    ];
  });

  test("uma copia INTERROMPIDA retoma-se: o que ja tinha sido copiado continua em `copiados`", () => {
    const p = projeto();
    const plano = planear(tpl, p);
    executar(plano);
    // A forma de uma corrida que morreu a meio: o manifesto `a copiar` e so parte dos ficheiros.
    writeFileSync(join(p, MANIFESTO), JSON.stringify({ ...JSON.parse(le(p, MANIFESTO)), estado: "a copiar" }));
    rmSync(join(p, "CLAUDE.md"));
    const retoma = planear(tpl, p);
    const final = executar(retoma);
    return [
      ...espera(retoma.retomar === true, "nao reconheceu a adocao interrompida"),
      ...espera(final.copiados.includes("README.md") && final.iguais.length === 0, `o ja copiado saiu como igual: ${final.iguais}`),
      ...espera(final.copiados.includes("CLAUDE.md") && existsSync(join(p, "CLAUDE.md")), "o que faltava nao foi copiado"),
      ...espera(final.estado === "completo", "nao ficou completo"),
    ];
  });

  test("recusa: retomar com o clone noutro commit", () => {
    const p = projeto();
    executar(planear(tpl, p));
    writeFileSync(join(p, MANIFESTO), JSON.stringify({ ...JSON.parse(le(p, MANIFESTO)), estado: "a copiar", template: { commit: "0".repeat(40) } }));
    const r = recusa(() => planear(tpl, p));
    return espera(r !== null && /interrompida/.test(r), `deu: ${r}`);
  });

  test("recusa: um .agent que e um symlink (o manifesto sairia do projeto) ou um ficheiro", () => {
    const fora = join(sandbox, `fora-agent-${n}`);
    mkdirSync(fora);
    const p = projeto();
    symlinkSync(fora, join(p, ".agent"));
    const r = recusa(() => executar(planear(tpl, p)));
    const r2 = recusa(() => planear(tpl, projeto({ ".agent": "ficheiro\n" })));
    return [
      ...espera(r !== null && /pasta real/.test(r), `symlink: ${r}`),
      ...espera(readdirSync(fora).length === 0, `escreveu pelo .agent: ${readdirSync(fora)}`),
      ...espera(r2 !== null && /pasta real/.test(r2), `ficheiro: ${r2}`),
    ];
  });

  test("recusa: um clone do template com alteracoes locais", () => {
    escreve(tpl, "README.md", "# Template mexido\n");
    try {
      const r = recusa(() => planear(tpl, projeto()));
      return espera(r !== null && /alteracoes locais/.test(r), `deu: ${r}`);
    } finally {
      git(tpl, "checkout", "--", "README.md");
    }
  });

  test("um projeto alcancado por um symlink PARA DENTRO do template e sobreposicao", () => {
    const atalho = join(sandbox, "atalho");
    symlinkSync(join(tpl, ".agent"), atalho);
    const r = recusa(() => planear(tpl, atalho));
    return espera(r !== null && /sobrepoem/.test(r), `deu: ${r}`);
  });

  test("um symlink no PROPRIO ficheiro (CLAUDE.md -> AGENTS.md) e colisao, mesmo com o conteudo igual", () => {
    const p = projeto({ "AGENTS.md": "# Regras do template\n" });
    symlinkSync("AGENTS.md", join(p, "CLAUDE.md"));
    const m = planear(tpl, p);
    return espera(m.colisoes.includes("CLAUDE.md") && !m.iguais.includes("CLAUDE.md"), `iguais: ${m.iguais}`);
  });

  test("uma PASTA onde o template tem um ficheiro e colisao", () => {
    const p = projeto({ "CLAUDE.md/dentro": "x\n" });
    return espera(planear(tpl, p).colisoes.includes("CLAUDE.md"), "a pasta nao saiu como colisao");
  });

  test("CLI: --simular lista as colisoes e nao escreve nada", () => {
    const p = projeto({ "CLAUDE.md": "# Meu\n" });
    const r = cli(p, "--simular");
    return [
      ...espera(r.code === 0, `exit ${r.code}: ${r.out}`),
      ...espera(/Colidem[^\n]*\n {2}CLAUDE\.md/.test(r.out), `nao listou a colisao:\n${r.out}`),
      ...espera(readdirSync(p).join() === "CLAUDE.md", `escreveu: ${readdirSync(p)}`),
    ];
  });

  test("CLI: um argumento desconhecido (--dry-run) sai 1 e nao copia", () => {
    const p = projeto();
    const r = cli(p, "--dry-run");
    return [
      ...espera(r.code === 1 && /desconhecido/.test(r.out), `exit ${r.code}: ${r.out}`),
      ...espera(readdirSync(p).length === 0, `escreveu: ${readdirSync(p)}`),
    ];
  });

  test("CLI: sem --simular copia e escreve o manifesto; numa recusa sai 1", () => {
    const p = projeto();
    const ok = cli(p);
    const segunda = cli(p);
    return [
      ...espera(ok.code === 0 && existsSync(join(p, MANIFESTO)), `exit ${ok.code}: ${ok.out}`),
      ...espera(segunda.code === 1 && /ERRO/.test(segunda.out), `a segunda corrida devia recusar: exit ${segunda.code}`),
    ];
  });
} finally {
  rmSync(sandbox, { recursive: true, force: true });
}

console.log(`\n  ${passed} passaram, ${falhas.length} falharam.`);
if (falhas.length) process.exit(1);
console.log("\n  Todos os testes da adocao do template passaram.");
