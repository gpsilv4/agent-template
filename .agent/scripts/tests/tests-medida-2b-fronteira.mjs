/**
 * Testes da FRONTEIRA da 2b vindos das leituras do #304 que ficaram no #317 — {{PROJECT_NAME}}
 *
 * PORQUE VIVE A PARTE: o `tests-medida-2b-config.mjs` chegou as 497 linhas com eles (o Guard 17 reprova
 * acima de 500). Cobrem `lib/fronteira-upgrade.mjs` (a validacao do `--fronteira-em`, as ligacoes dos
 * hooks, o bloco que se imprime no fim) e a marca FRONTEIRA da lista do que saiu.
 *
 * NAO e um entry point. O `tests-medida-2b-config.mjs` importa-o e chama `registar()` no fim do seu.
 */
import { readdirSync, rmSync, mkdtempSync, mkdirSync, writeFileSync, symlinkSync, existsSync } from "fs";
import { tmpdir } from "os";
import { execFileSync } from "child_process";
import { join, dirname } from "path";
import { pathToFileURL } from "url";
import { fronteiraDa2b, ligacoes, notasDeLigacao } from "../lib/fronteira-upgrade.mjs";
import { exige, contraProjeto, test } from "./harness/test-upgrade-harness.mjs";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.error(
    "tests-medida-2b-fronteira.mjs nao e um entry point: nao corre testes por si.\n" +
      "Correr `node .agent/scripts/tests/test-simulate-upgrade.mjs`."
  );
  process.exit(1);
}

/** Entry point a que este modulo pertence. */
export const entryPoint = "test-simulate-upgrade.mjs";

/** `H`/`P`/`cpDe`/`lido` sao os do `tests-medida-2b-config.mjs`: o mesmo hook e o mesmo staging. */
export function registar({ H, P, cpDe }) {
  // 1. Um ficheiro da fronteira que saiu aparece nas duas listas: na do que saiu vai marcado.
  test("o que saiu da fronteira vai marcado na lista do que saiu (#317)", () =>
    exige(contraProjeto({ ontem: { ".claude/hooks/velho.mjs": "// velho\n" }, hoje: { ".claude/hooks/velho.mjs": null } }),
      { codigo: 0, inclui: [".claude/hooks/velho.mjs   (FRONTEIRA: o rm e do utilizador, no bloco da fronteira)"] }));
  test("o que saiu FORA da fronteira nao leva a marca (#317)", () =>
    // Num prefixo que o motor copia (`.agent/scripts/`): fora deles, nada entra na lista do que saiu.
    exige(contraProjeto({ ontem: { ".agent/scripts/velho.mjs": "// velho\n" }, hoje: { ".agent/scripts/velho.mjs": null } }),
      { codigo: 0, inclui: [".agent/scripts/velho.mjs"], exclui: [".agent/scripts/velho.mjs   (FRONTEIRA"] }));
  // 2. Onde ligar cada hook: o evento e o matcher do settings do template, e a ligacao que muda num hook intacto.
  const SET = ".claude/settings.json";
  const liga = (pares) =>
    JSON.stringify({ hooks: Object.fromEntries(pares.map(([ev, m, rel]) => [ev, [{ ...(m ? { matcher: m } : {}), hooks: [{ type: "command", command: `node "$CLAUDE_PROJECT_DIR/${rel}"` }] }]])) });
  test("um hook novo diz o evento e o matcher onde o ligar (#317)", () =>
    exige(contraProjeto({ hoje: { ".claude/hooks/novo.mjs": "// novo\n", [SET]: liga([["PreToolUse", "Bash", ".claude/hooks/novo.mjs"]]) } }),
      { codigo: 0, inclui: [".claude/hooks/novo.mjs -> PreToolUse (Bash)"] }));
  test("a ligacao que muda num hook INTACTO diz-se (#317)", () =>
    exige(contraProjeto({ ontem: { [SET]: liga([["Stop", null, H]]) }, hoje: { [SET]: liga([["SessionStart", "compact", H]]) } }),
      { codigo: 0, inclui: ["a LIGACAO mudou no template", `${H}: Stop -> SessionStart (compact)`], exclui: ["nada a pedir ao utilizador"] }));
  test("a mesma ligacao dos dois lados nao se diz (#317)", () =>
    exige(contraProjeto({ ontem: { [SET]: liga([["Stop", null, H]]) }, hoje: { [SET]: liga([["Stop", null, H]]), "NOVO.md": "# doc\n" } }),
      { codigo: 0, exclui: ["a LIGACAO mudou"] }));
  // O settings de HOJE e o da arvore do template, como o staging e o deny/ask da mesma 2b (leitura do #317).
  test("um hook novo ligado so no settings por commitar do template diz onde (#317)", () =>
    exige(contraProjeto({ hoje: { ".claude/hooks/novo.mjs": "// novo\n" }, sujoNoTemplate: { [SET]: liga([["Stop", null, ".claude/hooks/novo.mjs"]]) } }),
      { codigo: 0, inclui: [".claude/hooks/novo.mjs -> Stop"] }));
  test("a ligacao que o projeto JA fez nao se pede outra vez (#317)", () =>
    exige(contraProjeto({ ontem: { [SET]: liga([["Stop", null, H]]) }, hoje: { [SET]: liga([["SessionStart", "compact", H]]) }, projeto: { [SET]: liga([["SessionStart", "compact", H]]) } }),
      { codigo: 0, exclui: ["a LIGACAO mudou"], inclui: ["nada a pedir ao utilizador"] }));
  // O template nao mudou a ligacao: nada a dizer, mesmo que o projeto ligue de outra forma (e escolha dele).
  test("a ligacao que o template NAO mudou nao se diz, ligue o projeto como ligar (#317)", () =>
    exige(contraProjeto({ ontem: { [SET]: liga([["Stop", null, H]]) }, hoje: { [SET]: liga([["Stop", null, H]]), "NOVO.md": "# doc\n" }, projeto: { [SET]: liga([]) } }),
      { codigo: 0, exclui: ["a LIGACAO mudou"] }));
  // ...e a que MUDOU diz-se enquanto o projeto nao a tiver como a de hoje (segunda leitura do #317).
  test("a ligacao que mudou diz-se se o projeto liga de outra forma (#317)", () =>
    exige(contraProjeto({ ontem: { [SET]: liga([["Stop", null, H]]) }, hoje: { [SET]: liga([["SessionStart", "compact", H]]) }, projeto: { [SET]: liga([["UserPromptSubmit", null, H]]) } }),
      { codigo: 0, inclui: [`${H}: Stop -> SessionStart (compact)`] }));
  // O hook novo que o projeto JA liga como o template nao se pede; o que SAI pede-se sempre (um filtro aqui
  // errava para o silencio, e o `rm` deixava o Claude Code a falhar a cada evento).
  test("um hook novo que o projeto ja liga como o template nao se pede (#317)", () => {
    const n = ".claude/hooks/novo.mjs";
    return exige(contraProjeto({ hoje: { [n]: "// novo\n", [SET]: liga([["Stop", null, n]]) }, projeto: { [SET]: liga([["Stop", null, n]]) } }), { codigo: 0, exclui: ["a ligar na chave"] });
  });
  // ...mas so quando o template o LIGA: um hook novo que ninguem liga continua a pedir-se.
  test("um hook novo que o template nao liga pede-se, mesmo com o settings.json do projeto (#317)", () =>
    exige(contraProjeto({ hoje: { ".claude/hooks/novo.mjs": "// novo\n" }, projeto: { [SET]: liga([]) } }),
      { codigo: 0, inclui: [".claude/hooks/novo.mjs -> (o template nao o liga)"] }));
  test("um hook que sai pede-se sempre, mesmo que o projeto nao o ligue no settings.json (#317)", () =>
    exige(contraProjeto({ ontem: { ".claude/hooks/velho.mjs": "// velho\n" }, hoje: { ".claude/hooks/velho.mjs": null }, projeto: { [SET]: liga([]) } }),
      { codigo: 0, inclui: ["a DESLIGAR da chave `hooks`"] }));
  test("ligacoes: todos os hooks de um comando, e `null` para o que nao e JSON (#317)", () => {
    const l = ligacoes(JSON.stringify({ hooks: { Stop: [{ hooks: [{ command: "node .claude/hooks/a.mjs && node .claude/hooks/b.mjs" }] }] } }));
    return [
      ...(l?.has(".claude/hooks/a.mjs") && l?.has(".claude/hooks/b.mjs") ? [] : [`esperava a.mjs e b.mjs: ${JSON.stringify([...(l ?? new Map()).keys()])}`]),
      ...(ligacoes("{ nao e json") === null ? [] : ["um texto que nao e JSON devia dar null"]),
      ...(ligacoes(null) === null ? [] : ["sem ficheiro devia dar null"]),
    ];
  });
  test("um settings.json do projeto que nao e JSON nao esconde o hook a ligar (#317)", () => {
    const n = ".claude/hooks/n.mjs";
    const notas = notasDeLigacao([{ rel: n, como: "novo" }], null, liga([["Stop", null, n]]), "{ nao e json", () => true);
    return notas.some((x) => x.includes("a ligar na chave")) ? [] : [`a nota de ligar sumiu: ${JSON.stringify(notas)}`];
  });
  // 5. O protegidos.json do TEMPLATE (sem migracao) e um cp normal: a nota de migracao era falsa.
  test("o protegidos.json sem migracao nao diz que migrou (#317)", () => {
    const r = contraProjeto({ ontem: { [P]: null }, projeto: { [P]: null }, hoje: { [P]: '["main"]\n' } });
    return exige(r, { codigo: 0, inclui: [cpDe(r, P, "novo")], exclui: ["migrados do hook"] });
  });
  // 10. Com o protegidos.json do projeto commitado e uma edicao por commitar, nao entra. (O motor mantem o
  // commitado na copia, logo isto nao separa o ramo PROTEGIDOS do generico: o `return` dele e defesa.)
  test("o protegidos.json do projeto com uma edicao por commitar nao entra (#317)", () =>
    exige(contraProjeto({ hoje: { [H]: "// novo\n" }, projeto: { [P]: '["main","prod"]\n' }, sujoNoProjeto: { [P]: '["main","x"]\n' } }),
      { codigo: 0, exclui: ["protegidos.json'"] }));
  // 6, 9 e 13. O staging fora do projeto e do template, nas duas direccoes, pelo caminho canonico, e validado
  // mesmo quando a fronteira nao muda.
  const RECUSA = "o staging tem de ficar FORA do projeto e do template";
  for (const [nome, em, hoje] of [
    ["uma subpasta do projeto", ({ proj }) => join(proj, "sub"), { [H]: "// novo\n" }],
    ["uma pasta `..x` DENTRO do projeto", ({ proj }) => join(proj, "..x"), { [H]: "// novo\n" }],
    ["a pasta que CONTEM o projeto", ({ proj }) => dirname(proj), { [H]: "// novo\n" }],
    ["uma subpasta do template", ({ tpl }) => join(tpl, "sub"), { [H]: "// novo\n" }],
    ["dentro do projeto, sem a fronteira mudar", ({ proj }) => join(proj, "sub"), { "NOVO.md": "# doc\n" }],
  ]) {
    test(`--fronteira-em em ${nome} e recusado (#317)`, () => exige(contraProjeto({ hoje, fronteiraEm: em }), { codigo: 1, inclui: [RECUSA] }));
  }
  // So num disco que nao distingue maiusculas (o APFS por omissao): noutro, o caminho em maiusculas e OUTRO sitio.
  test("--fronteira-em com o projeto em maiusculas e recusado num disco sem maiusculas (#317)", () => {
    let insensivel = false;
    const emMaiusculas = ({ proj }) => {
      insensivel = existsSync(proj.toUpperCase());
      return join(proj.toUpperCase(), "sub");
    };
    const r = contraProjeto({ hoje: { [H]: "// novo\n" }, fronteiraEm: emMaiusculas });
    if (!insensivel) console.log("        (NAO MEDIDO: este disco distingue maiusculas — o symlink abaixo mede o realpath)");
    return insensivel ? exige(r, { codigo: 1, inclui: [RECUSA] }) : [];
  });
  // O `realpath` em qualquer disco: um symlink para o projeto e o projeto (leitura do #317 — no Linux, sem
  // este caso, tirar o `realpathSync` sobrevivia a suite inteira).
  test("--fronteira-em por um symlink para o projeto e recusado (#317)", () => {
    const fora = mkdtempSync(join(tmpdir(), "sim-up-ln-"));
    try {
      const pelo = ({ proj }) => {
        symlinkSync(proj, join(fora, "ln"));
        return join(fora, "ln", "sub");
      };
      return exige(contraProjeto({ hoje: { [H]: "// novo\n" }, fronteiraEm: pelo }), { codigo: 1, inclui: [RECUSA] });
    } finally {
      rmSync(fora, { recursive: true, force: true });
    }
  });
  // 7. Uma medicao que acaba em `fatal` nao deixa comandos nem staging.
  test("uma 2b que falha nas adaptacoes nao deixa staging nem comandos (#317)", () => {
    const r = contraProjeto({ hoje: { [H]: "// novo\n", ".agent/scripts/guards/sizes.mjs": null } });
    return [
      ...exige(r, { codigo: 1, inclui: ["nao consigo aplicar a adaptacao do Guard 17"], exclui: ["A FRONTEIRA"] }),
      ...(readdirSync(r.fronteira).length === 0 ? [] : [`o staging ficou com ${readdirSync(r.fronteira).join(", ")}`]),
    ];
  });
  // 12. Sem a camada Claude, so se afirma o que foi de facto comparado.
  test("sem a camada Claude, a fronteira que nao muda e so o .githooks/ (#317)", () =>
    exige(contraProjeto({ hoje: { [H]: "// novo\n" }, projeto: { [H]: null } }),
      { codigo: 0, inclui: ["a fronteira (.githooks/) nao muda"], exclui: [".claude/hooks/, .githooks/, .claude/agents/) nao muda"] }));
  // 11. Um projeto numa SUBPASTA de um repo: `HEAD:<rel>` resolvia a partir da raiz do repo, e tudo era `novo`.
  test("um projeto numa subpasta de um repo ve o que tem commitado (#317)", () => {
    const repo = mkdtempSync(join(tmpdir(), "sim-up-sub-"));
    try {
      const proj = join(repo, "p");
      const copia = join(repo, "..", `${repo.split("/").pop()}-copia`);
      for (const [d, c] of [[proj, "// a\n"], [copia, "// b\n"]]) {
        mkdirSync(join(d, ".claude/hooks"), { recursive: true });
        writeFileSync(join(d, H), c);
      }
      const git = (a, cwd) => execFileSync("git", a, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
      git(["init", "-q", "-b", "main"], repo);
      git(["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "--allow-empty", "-m", "0"], repo);
      git(["add", "-A"], repo);
      git(["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "p"], repo);
      const linhas = [];
      const log = console.log;
      console.log = (...a) => linhas.push(a.join(" "));
      try {
        const nada = () => {};
        fronteiraDa2b({ raiz: proj, template: proj, dir: copia, medido: {}, ref: "HEAD", fronteiraEm: join(copia, "st"), git, ok: nada, note: nada, fatal: (m) => { throw new Error(m); } }).imprime();
      } finally {
        console.log = log;
        rmSync(copia, { recursive: true, force: true });
      }
      const cp = linhas.find((l) => l.includes(`'${H}'`)) ?? "";
      return cp.includes("# muda") ? [] : [`esperava o hook como 'muda': ${cp || linhas.join(" | ")}`];
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
  // As leituras do bloco (#317). M1: um protegidos.json SO na arvore de trabalho e do projeto — diff, nao cp.
  test("o protegidos.json por commitar e nao versionado sai com o diff, nao com um cp (#317)", () => {
    const r = contraProjeto({ ontem: { [P]: null }, projeto: { [P]: null }, hoje: { [P]: '["main"]\n' }, sujoNoProjeto: { [P]: '["main","prod"]\n' } });
    return exige(r, { codigo: 0, inclui: [`diff -u '${P}'`, `# cp '${join(r.fronteira, P)}' '${P}'`], exclui: [cpDe(r, P, "novo")] });
  });
  // M2: uma pasta que ja tem conteudo (o $HOME tem os agentes do utilizador) nao e staging.
  test("--fronteira-em numa pasta que ja tem ficheiros e recusado (#317)", () => {
    const cheia = mkdtempSync(join(tmpdir(), "sim-up-cheia-"));
    try {
      writeFileSync(join(cheia, "meu.md"), "do utilizador\n");
      const r = contraProjeto({ hoje: { [H]: "// novo\n" }, fronteiraEm: cheia });
      return [
        ...exige(r, { codigo: 1, inclui: ["a pasta ja existe e nao esta vazia"] }),
        ...(readdirSync(cheia).join() === "meu.md" ? [] : [`a 2b escreveu em ${cheia}: ${readdirSync(cheia).join(", ")}`]),
      ];
    } finally {
      rmSync(cheia, { recursive: true, force: true });
    }
  });
  // ...e ao LER o argumento: sem a fronteira a mudar, so a validacao do arranque o apanha.
  test("--fronteira-em numa pasta cheia e recusado mesmo sem a fronteira mudar (#317)", () => {
    const cheia = mkdtempSync(join(tmpdir(), "sim-up-cheia-"));
    try {
      writeFileSync(join(cheia, "meu.md"), "do utilizador\n");
      return exige(contraProjeto({ hoje: { "NOVO.md": "# doc\n" }, fronteiraEm: cheia }), { codigo: 1, inclui: ["a pasta ja existe e nao esta vazia"] });
    } finally {
      rmSync(cheia, { recursive: true, force: true });
    }
  });
  test("um --fronteira-em com caracteres de controlo e recusado antes de escrever (#317)", () =>
    exige(contraProjeto({ hoje: { [H]: "// novo\n" }, fronteiraEm: ({ proj }) => join(dirname(proj), `st\n${proj.split("/").pop()}`) }),
      { codigo: 1, inclui: ["caracteres de controlo"], exclui: ["A FRONTEIRA: passo"] }));
  // B2: o staging por omissao nasce no TMPDIR — e um TMPDIR dentro do projeto e recusado antes de o criar.
  test("o staging por omissao com o TMPDIR dentro do projeto e recusado, sem criar nada (#317)", () => {
    let t = "";
    const dentro = ({ proj }) => {
      t = join(proj, "tmp-local");
      mkdirSync(t, { recursive: true });
      return t;
    };
    const r = contraProjeto({ hoje: { [H]: "// novo\n" }, fronteiraEm: null, tmp: dentro });
    const criados = readdirSync(t).filter((n) => n.startsWith("agent-template-fronteira-"));
    return [...exige(r, { codigo: 1, inclui: ["o staging tem de ficar FORA"] }), ...(criados.length ? [`ficou no projeto: ${criados.join(", ")}`] : [])];
  });
  // B1/B3: a fronteiraDa2b valida OUTRA VEZ onde escreve, e recusa um nome com caracteres de controlo.
  const direta = (nomes, emProj) => {
    const proj = mkdtempSync(join(tmpdir(), "sim-up-dir-"));
    const copia = mkdtempSync(join(tmpdir(), "sim-up-dir-copia-"));
    try {
      // Com a camada Claude commitada: sem ela, os hooks eram filtrados e nao havia o que escrever.
      mkdirSync(join(proj, ".claude"), { recursive: true });
      writeFileSync(join(proj, ".claude/settings.json"), "{}\n");
      execFileSync("git", ["init", "-q", "-b", "main"], { cwd: proj });
      execFileSync("git", ["add", "-A"], { cwd: proj });
      execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "-m", "0"], { cwd: proj });
      for (const n of nomes) {
        mkdirSync(dirname(join(copia, n)), { recursive: true });
        writeFileSync(join(copia, n), "// novo\n");
      }
      const git = (a, cwd) => execFileSync("git", a, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
      const log = console.log;
      console.log = () => {};
      try {
        const nada = () => {};
        const em = emProj ? join(proj, "st") : join(copia, "..", `${copia.split("/").pop()}-st`);
        fronteiraDa2b({ raiz: proj, template: proj, dir: copia, medido: {}, ref: "HEAD", fronteiraEm: em, git, ok: nada, note: nada, fatal: (m) => { throw new Error(m); } }).imprime();
        return "";
      } catch (err) {
        return err instanceof Error ? err.message : String(err);
      } finally {
        console.log = log;
        rmSync(join(copia, "..", `${copia.split("/").pop()}-st`), { recursive: true, force: true });
      }
    } finally {
      rmSync(proj, { recursive: true, force: true });
      rmSync(copia, { recursive: true, force: true });
    }
  };
  test("a fronteiraDa2b recusa escrever o staging dentro do projeto (#317)", () => {
    const e = direta([H], true);
    return e.includes("o staging tem de ficar FORA") ? [] : [`esperava a recusa, veio: ${e || "(nada)"}`];
  });
  test("a fronteiraDa2b fora do projeto escreve (contra-caso) (#317)", () => {
    const e = direta([H], false);
    return e === "" ? [] : [`nao devia recusar: ${e}`];
  });
  test("um caminho da fronteira com caracteres de controlo e recusado (#317)", () => {
    const e = direta([".claude/hooks/a\nb.mjs"], false);
    return e.includes("caracteres de controlo") ? [] : [`esperava a recusa, veio: ${e || "(nada)"}`];
  });
}
