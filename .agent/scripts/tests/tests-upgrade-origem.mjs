/**
 * Testes da ORIGEM de um upgrade (#490): o template e um clone limpo numa tag, e sem downgrade — {{PROJECT_NAME}}
 *
 * Cobre `lib/origem-upgrade.mjs` (as duas guardas, em repos minimos), o motor chamado de fora (como um
 * derivado o chamou no R10-3) e a 2b (recusa antes da copia e da bateria; um downgrade; o `--keep`).
 *
 * NAO e um entry point. O `test-simulate-upgrade.mjs` importa-o e chama `registar()`.
 */
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync, readFileSync, rmSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { pathToFileURL } from "url";
import { confirmaTemplateLimpoNumaTag, confirmaSemDowngrade } from "../lib/origem-upgrade.mjs";
import { aplicaUpgradeMecanico } from "../lib/upgrade-mecanico.mjs";
import { git, cenario, limpa, contraProjeto, exige, test } from "./harness/test-upgrade-harness.mjs";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.error("tests-upgrade-origem.mjs nao e um entry point. Correr `node .agent/scripts/tests/test-simulate-upgrade.mjs`.");
  process.exit(1);
}

/** Entry point a que este modulo pertence. */
export const entryPoint = "test-simulate-upgrade.mjs";

/** Um repo minimo, com um commit tagueado `v1.0.0`. `prepara(dir)` mexe nele depois. */
function comRepo(prepara, fn) {
  const dir = mkdtempSync(join(tmpdir(), "sim-up-origem-"));
  try {
    writeFileSync(join(dir, "a.md"), "a\n");
    writeFileSync(join(dir, ".gitignore"), "ignorado.log\n");
    git(dir, ["init", "-q", "-b", "main"]);
    git(dir, ["config", "user.email", "t@t"]);
    git(dir, ["config", "user.name", "t"]);
    git(dir, ["config", "core.excludesFile", "/dev/null"]);
    git(dir, ["add", "-A"]);
    git(dir, ["commit", "-qm", "um"]);
    git(dir, ["tag", "v1.0.0"]);
    prepara?.(dir);
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
const commit = (dir, msg) => {
  git(dir, ["commit", "-q", "--allow-empty", "-m", msg]);
  return git(dir, ["rev-parse", "HEAD"]).trim();
};

/** `{ tag }` ou `{ msg }` da recusa: o `fatal` lanca, como no motor. */
const corre = (f) => {
  try {
    return { r: f((m) => { throw new Error(`__fatal__: ${m}`); }) };
  } catch (err) {
    return { msg: err instanceof Error ? err.message : String(err) };
  }
};
const recusa = (res, ...trechos) => {
  if (res.msg === undefined) return [`devia ter recusado, devolveu ${JSON.stringify(res.r)}`];
  if (!res.msg.startsWith("__fatal__")) return [`rebentou por outra razao: ${res.msg}`];
  return trechos.filter((t) => !res.msg.includes(t)).map((t) => `a recusa devia dizer ${JSON.stringify(t)}: ${res.msg}`);
};
const passa = (res, tag) =>
  res.msg !== undefined ? [`recusou: ${res.msg}`] : tag === undefined || res.r?.tag === tag ? [] : [`tag ${JSON.stringify(res.r)}, esperado ${tag}`];

export function registar() {
  const limpo = (dir) => corre((f) => confirmaTemplateLimpoNumaTag(dir, f));

  // --- (a) limpo e (b) numa tag ----------------------------------------------------------------
  test("origem: limpo numa tag v* passa, e devolve a tag (#490)", () => comRepo(null, (d) => passa(limpo(d), "v1.0.0")));
  test("origem: um ficheiro seguido modificado recusa (#490)", () =>
    comRepo((d) => writeFileSync(join(d, "a.md"), "mudou\n"), (d) => recusa(limpo(d), "1 alteracao(oes) por commitar (a.md)", "~/.cache/agent-template/")));
  test("origem: um ficheiro novo NAO seguido recusa (#490)", () =>
    comRepo((d) => writeFileSync(join(d, "novo.md"), "n\n"), (d) => recusa(limpo(d), "(novo.md)")));
  // O controlo do excesso: o que o `.gitignore` ignora nao e do template, e o motor ja o exclui.
  test("origem: um ficheiro IGNORADO nao recusa (#490)", () =>
    comRepo((d) => writeFileSync(join(d, "ignorado.log"), "x\n"), (d) => passa(limpo(d), "v1.0.0")));
  test("origem: o status.showUntrackedFiles=no do utilizador nao esconde um nao seguido (#490)", () =>
    comRepo((d) => {
      git(d, ["config", "status.showUntrackedFiles", "no"]);
      mkdirSync(join(d, "pasta"));
      writeFileSync(join(d, "pasta/novo.md"), "n\n");
    }, (d) => recusa(limpo(d), "(pasta/novo.md)")));
  test("origem: o HEAD num commit sem tag recusa (#490)", () =>
    comRepo((d) => commit(d, "depois"), (d) => recusa(limpo(d), "nao esta numa tag de release")));
  test("origem: so uma tag que nao e de release nao conta (#490)", () =>
    comRepo((d) => {
      git(d, ["tag", "-d", "v1.0.0"]);
      git(d, ["tag", "x"]);
    }, (d) => recusa(limpo(d), "nao tem tags de release", "git fetch --tags")));
  // Duas tags no HEAD: a maior, pela versao (e nao pela ordem alfabetica, que poria v1.9 acima de v1.10).
  test("origem: duas tags de release no HEAD passam, e devolve a maior (#490)", () =>
    comRepo((d) => {
      git(d, ["tag", "v1.9.0"]);
      git(d, ["tag", "v1.10.0"]);
    }, (d) => passa(limpo(d), "v1.10.0")));
  // Sem `versionsort.suffix`, o git ordena `v1.0.0-rc.1` DEPOIS de `v1.0.0`: a estavel tem de ganhar.
  test("origem: uma pre-release no mesmo HEAD nao ganha a release (#490)", () =>
    comRepo((d) => git(d, ["tag", "v1.0.0-rc.1"]), (d) => passa(limpo(d), "v1.0.0")));
  test("origem: as colunas do utilizador (column.ui=always) nao juntam duas tags numa so linha (#490)", () =>
    comRepo((d) => {
      git(d, ["config", "column.ui", "always"]);
      git(d, ["tag", "v1.9.0"]);
    }, (d) => passa(limpo(d), "v1.9.0")));
  test("origem: um sparse-checkout recusa — o status nao ve o que ele esconde (#490)", () =>
    comRepo((d) => git(d, ["config", "core.sparseCheckout", "true"]), (d) => recusa(limpo(d), "sparse-checkout")));
  test("origem: um ficheiro skip-worktree editado recusa (#490)", () =>
    comRepo((d) => {
      git(d, ["update-index", "--skip-worktree", "a.md"]);
      writeFileSync(join(d, "a.md"), "mudou\n");
    }, (d) => recusa(limpo(d), "skip-worktree/assume-unchanged: a.md")));
  test("origem: um ficheiro assume-unchanged editado recusa (#490)", () =>
    comRepo((d) => {
      git(d, ["update-index", "--assume-unchanged", "a.md"]);
      writeFileSync(join(d, "a.md"), "mudou\n");
    }, (d) => recusa(limpo(d), "a.md")));
  // Um template COPIADO para dentro de outro repo limpo e numa tag: o git subia ao de fora.
  test("origem: uma pasta dentro de outro repo nao e a raiz dele, e recusa (#490)", () =>
    comRepo((d) => {
      mkdirSync(join(d, "sub"));
      writeFileSync(join(d, "sub/b.md"), "b\n");
      git(d, ["add", "-A"]);
      git(d, ["commit", "-qm", "sub"]);
      git(d, ["tag", "-f", "v1.0.0"]);
    }, (d) => recusa(limpo(join(d, "sub")), "nao e a raiz de um repo")));
  test("origem: o commit sem tag sugere clonar a tag mais recente (#490)", () =>
    comRepo((d) => {
      git(d, ["tag", "v1.2.0"]);
      commit(d, "depois");
    }, (d) => recusa(limpo(d), "--branch v1.2.0")));
  // `TP2`: um git que falha nunca e "limpo".
  test("origem: um .git partido recusa com a razao do git (#490)", () =>
    comRepo((d) => {
      rmSync(join(d, ".git"), { recursive: true, force: true });
      writeFileSync(join(d, ".git"), "gitdir: /nao/existe\n");
    }, (d) => {
      // A razao e a do GIT (o stderr), e nao a 1.a linha do `execFileSync` ("Command failed: git ..."). Sem fixar a
      // frase do git, que muda com a versao e a lingua (#400).
      const r = limpo(d);
      return [...recusa(r, "nao responde ao git ("), ...(String(r.msg).includes("Command failed") ? [`so o comando, sem a razao: ${r.msg}`] : [])];
    }));

  // --- (c) sem downgrade ---------------------------------------------------------------------
  const desce = (dir, ref) => corre((f) => confirmaSemDowngrade(dir, ref, f));
  test("origem: a ref antepassada do HEAD passa; a propria tag tambem (#490)", () =>
    comRepo((d) => {
      commit(d, "dois");
      git(d, ["tag", "v1.1.0"]);
    }, (d) => [...passa(desce(d, "v1.0.0")), ...passa(desce(d, "v1.1.0"))]));
  test("origem: um commit fora das tags (branch por publicar) recusa, sem nenhuma tag que o contenha (#490)", () =>
    comRepo(null, (d) => {
      git(d, ["switch", "-q", "-c", "lado"]);
      const fora = commit(d, "lado");
      git(d, ["switch", "-q", "main"]);
      return recusa(desce(d, fora), "tags que o contem: nenhuma", "poe essa tag em `commit:`");
    }));
  test("origem: um commit posterior a tag do HEAD recusa, e diz a tag que o contem (#490)", () =>
    comRepo(null, (d) => {
      const depois = commit(d, "depois");
      git(d, ["tag", "v1.1.0"]);
      git(d, ["switch", "-q", "--detach", "v1.0.0"]);
      return recusa(desce(d, depois), "tags que o contem: v1.1.0");
    }));
  test("origem: uma ref que o git nao resolve recusa, nunca passa (#490)", () =>
    comRepo(null, (d) => recusa(desce(d, "0000000000000000000000000000000000000000"), "nao consegui comparar")));

  // --- O motor chamado de fora, como no R10-3 ---------------------------------------------------
  const FALHA = "// FALHA_SE_CHEGA\n";
  test("motor: o root com trabalho por commitar recusa, e o trabalho nao chega ao consumidor (#490)", () => {
    const base = mkdtempSync(join(tmpdir(), "sim-up-origem-motor-"));
    try {
      // Um template numa tag, com trabalho POR COMMITAR e sem `"disco"`: e o que o derivado correu.
      const root = mkdtempSync(join(base, "root-"));
      const dir = mkdtempSync(join(base, "cons-"));
      mkdirSync(join(root, ".agent/scripts"), { recursive: true });
      writeFileSync(join(root, ".agent/scripts/x.mjs"), "// script\n");
      git(root, ["init", "-q", "-b", "main"]);
      git(root, ["config", "user.email", "t@t"]);
      git(root, ["config", "user.name", "t"]);
      git(root, ["config", "core.excludesFile", "/dev/null"]);
      git(root, ["add", "-A"]);
      git(root, ["commit", "-qm", "ontem"]);
      git(root, ["tag", "v1.0.0"]);
      writeFileSync(join(root, ".agent/scripts/sujo.mjs"), FALHA);
      const r = corre((f) => aplicaUpgradeMecanico({ dir, root, tag: "v1.0.0", substituto: "C", fatal: f }));
      const chegou = existsSync(join(dir, ".agent/scripts/sujo.mjs"));
      return [...recusa(r, "alteracao(oes) por commitar"), ...(chegou ? ["o FALHA_SE_CHEGA chegou ao consumidor"] : [])];
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });
  // O controlo do B3: o MESMO cenario do caso convertido (`tests-upgrade-fora-do-template.mjs`, o "NOVO por
  // commitar"), com o "hoje" por commitar mas o motor em `"ref"`: recusa — e o `"disco"` que o deixa medir.
  test("motor: o caso do NOVO por commitar, com o motor em \"ref\", recusa (o controlo do B3, #490)", () => {
    const hoje = { ".gitignore": "outra-coisa.md\n", ".agent/scripts/novo.mjs": "// novo\n" };
    const com = corre(() => {
      const c = cenario({ ontem: {}, hoje, origem: "disco" });
      const chegou = c.ler(".agent/scripts/novo.mjs") !== null;
      limpa(c);
      return chegou;
    });
    if (com.r !== true) return [`com "disco" o novo devia chegar: ${com.msg ?? "nao chegou"}`];
    const sem = corre(() => cenario({ ontem: {}, hoje, origem: "disco", motor: "ref" }));
    return recusa(sem, "por commitar", ".agent/scripts/novo.mjs");
  });
  // O downgrade no MOTOR chamado de fora (a 2b tem a sua chamada, que recusa antes desta).
  test("motor: uma tag que nao e antepassada do root recusa, chamado de fora (#490)", () => {
    const base = mkdtempSync(join(tmpdir(), "sim-up-origem-desce-"));
    try {
      const root = mkdtempSync(join(base, "root-"));
      const dir = mkdtempSync(join(base, "cons-"));
      mkdirSync(join(root, ".agent/scripts"), { recursive: true });
      writeFileSync(join(root, ".agent/scripts/x.mjs"), "// script\n");
      git(root, ["init", "-q", "-b", "main"]);
      git(root, ["config", "user.email", "t@t"]);
      git(root, ["config", "user.name", "t"]);
      git(root, ["config", "core.excludesFile", "/dev/null"]);
      git(root, ["add", "-A"]);
      git(root, ["commit", "-qm", "ontem"]);
      git(root, ["tag", "v1.0.0"]);
      git(root, ["switch", "-q", "-c", "lado"]);
      const fora = commit(root, "lado");
      git(root, ["switch", "-q", "main"]);
      commit(root, "hoje");
      git(root, ["tag", "v2.0.0"]);
      const r = corre((f) => aplicaUpgradeMecanico({ dir, root, tag: fora, substituto: "C", fatal: f }));
      return recusa(r, "tags que o contem: nenhuma");
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });
  test("motor: uma origem desconhecida recusa (#490)", () => {
    const meu = mkdtempSync(join(tmpdir(), "sim-up-origem-ramo-"));
    try {
      const r = corre((f) => aplicaUpgradeMecanico({ dir: meu, root: meu, tag: "v1.0.0", substituto: "C", fatal: f, origem: "ramo" }));
      return recusa(r, 'origem "ramo" desconhecida');
    } finally {
      rmSync(meu, { recursive: true, force: true });
    }
  });

  // --- A 2b ----------------------------------------------------------------------------------
  test("2b: o template num commit sem tag recusa antes de medir (#490)", () =>
    exige(contraProjeto({ tagHoje: null }), { codigo: 1, inclui: ["nao esta numa tag de release"], exclui: ["copia deste projeto (HEAD)", "estado actual"] }));
  // A guarda vem ANTES da recusa do Modo B: quem le essa recusa copia a mao do $TPL, e tem de saber ja que nao serve.
  test("2b: sem marca (Modo B), um template sujo recusa pela origem, e nao pelo Modo B (#490)", () =>
    exige(contraProjeto({ marca: null, sujoNoTemplate: { ".agent/scripts/sujo.mjs": "// sujo\n" } }), {
      codigo: 1,
      inclui: ["alteracao(oes) por commitar (.agent/scripts/sujo.mjs)"],
      exclui: ["isto e o Modo B"],
    }));
  test("controlo: sem marca e com o template limpo, a recusa e a do Modo B (#490)", () =>
    exige(contraProjeto({ marca: null }), { codigo: 1, inclui: ["template: v2.0.0, limpo", "isto e o Modo B"] }));
  // B1: a marca num commit que existe e nao descende da tag recusa — sem recorrer ao `versao:`.
  test("2b: a marca num commit fora das tags recusa, mesmo com um `versao:` valido (#490)", () => {
    const marca = ({ tpl }) => {
      git(tpl, ["switch", "-q", "-c", "lado"]);
      git(tpl, ["commit", "-q", "--allow-empty", "-m", "lado"]);
      const fora = git(tpl, ["rev-parse", "HEAD"]).trim();
      git(tpl, ["switch", "-q", "main"]);
      return `template: ${tpl}\ncommit: ${fora}\nversao: v1.0.0\ndata: 2026-01-01\n`;
    };
    return exige(contraProjeto({ marca }), { codigo: 1, inclui: ["tags que o contem: nenhuma"], exclui: ["copia deste projeto (HEAD)", "estado actual"] });
  });
  // R4: com `--keep` a copia fica, e o que a guarda recusou nao chegou la.
  test("2b: com --keep, a copia de um template recusado nao tem o trabalho por commitar (#490)", () => {
    const meu = mkdtempSync(join(tmpdir(), "sim-up-keep-"));
    try {
      const r = contraProjeto({ sujoNoTemplate: { ".agent/scripts/sujo.mjs": FALHA }, tmp: meu, extra: ["--keep"] });
      const copias = readdirSync(meu).filter((n) => n.startsWith("upgrade-2b-"));
      const tem = (d) => readdirSync(d, { recursive: true }).some((f) => {
        try {
          return readFileSync(join(d, String(f)), "utf8").includes("FALHA_SE_CHEGA");
        } catch {
          return false;
        }
      });
      return [
        ...exige(r, { codigo: 1, inclui: ["(.agent/scripts/sujo.mjs)"] }),
        ...(copias.length === 1 ? [] : [`devia ficar 1 copia com --keep, ficaram ${copias.length}`]),
        ...copias.filter((c) => tem(join(meu, c))).map((c) => `o FALHA_SE_CHEGA chegou a ${c}`),
      ];
    } finally {
      rmSync(meu, { recursive: true, force: true });
    }
  });
}
