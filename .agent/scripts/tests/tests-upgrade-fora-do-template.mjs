/**
 * Testes do que o `/upgrade` NAO copia do disco do template — {{PROJECT_NAME}}
 *
 * O filtro vive em `lib/fora-do-template.mjs` e o motor usa-o em tres sitios: a copia de
 * `.agent/scripts` e `.claude/hooks`, o passo dos documentos novos, e a arvore "do que o template
 * tem agora". Cada caso abaixo pergunta por um desses sitios, porque um filtro ligado num e
 * esquecido noutro e o defeito que a ronda 7 encontrou (R7-D): os `RELATORIO-*.md` ignorados
 * aterraram na copia de um derivado real.
 *
 * NAO e um entry point. O `test-simulate-upgrade.mjs` importa-o e chama `registar()` —
 * explicitamente, como os outros modulos do motor: aquela suite tem contadores proprios.
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { pathToFileURL } from "url";
import { cenario, limpa, test } from "./harness/test-upgrade-harness.mjs";
import { aplicaUpgradeMecanico } from "../lib/upgrade-mecanico.mjs";
import { razaoDoNome } from "../lib/fora-do-template.mjs";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.error(
    "tests-upgrade-fora-do-template.mjs nao e um entry point: nao corre testes por si.\n" +
      "Correr `node .agent/scripts/tests/test-simulate-upgrade.mjs`."
  );
  process.exit(1);
}

/** Entry point a que este modulo pertence. */
export const entryPoint = "test-simulate-upgrade.mjs";

/** Corre um cenario e devolve os problemas que `mede(c)` encontrar, limpando sempre. */
function mede(opcoes, fn) {
  let c;
  try {
    c = cenario(opcoes);
    return fn(c);
  } finally {
    limpa(c);
  }
}

/** A razao registada para `caminho`, ou `null` se nao ficou de fora. */
const razao = (c, caminho) => c.medido.naoCopiados.find((n) => n.caminho === caminho)?.razao ?? null;

export function registar() {
  // A primeira camada, com um nome que a SEGUNDA nao apanha: so assim se sabe qual das duas
  // trabalhou. Um `.pem` aqui passava mesmo com o git desligado do filtro.
  test("ficheiro IGNORADO pelo git do template nao e copiado com .agent/scripts", () =>
    mede({ ontem: {}, hoje: { ".gitignore": "notas-locais.md\n", ".agent/scripts/notas-locais.md": "rascunho\n" } }, (c) => {
      const p = [];
      if (c.ler(".agent/scripts/notas-locais.md") !== null) p.push("o ficheiro ignorado chegou ao consumidor");
      if (razao(c, ".agent/scripts/notas-locais.md") !== "ignorado pelo git do template") {
        p.push(`naoCopiados = ${JSON.stringify(c.medido.naoCopiados)} — devia dizer porque ficou de fora`);
      }
      return p;
    }));

  // O passo dos documentos NOVOS desde a tag e o outro caminho de copia — e era por ele que um
  // `.claude/settings.local.json` do mantenedor chegava ao consumidor, por ser `.json`. Quem
  // prova a PRIMEIRA camada aqui e o `RELATORIO-*`: o `settings.local.json` tambem tem nome de
  // segredo, logo seria apanhado pela segunda mesmo com o git desligado.
  test("ficheiro IGNORADO na raiz ou em .claude/ nao chega pelo passo dos documentos novos", () =>
    mede(
      {
        ontem: {},
        hoje: {
          ".gitignore": "RELATORIO-*.md\n.claude/settings.local.json\n",
          "RELATORIO-RONDA9.md": "# notas de trabalho\n",
          ".claude/settings.local.json": '{ "permissions": {} }\n',
        },
      },
      (c) => {
        const p = [];
        for (const f of ["RELATORIO-RONDA9.md", ".claude/settings.local.json"]) {
          if (c.ler(f) !== null) p.push(`${f} chegou ao consumidor`);
          if (razao(c, f) === null) p.push(`${f} nao aparece em naoCopiados`);
        }
        return p;
      }
    ));

  // A segunda camada: SEM `.gitignore` nenhum. E o dia em que quem mantem o template se esquece.
  test("chave com nome de segredo e recusada mesmo sem .gitignore", () =>
    mede({ ontem: {}, hoje: { ".agent/scripts/id_rsa": "-----BEGIN-----\n", ".claude/hooks/x.pem": "k\n" } }, (c) => {
      const p = [];
      for (const f of [".agent/scripts/id_rsa", ".claude/hooks/x.pem"]) {
        if (c.ler(f) !== null) p.push(`${f} chegou ao consumidor`);
        if (razao(c, f) !== "nome de segredo") p.push(`${f}: razao ${JSON.stringify(razao(c, f))}, esperado "nome de segredo"`);
      }
      return p;
    }));

  // Uma pasta ignorada inteira vem do git como UMA entrada (`cache/`). Um predicado que so
  // comparasse ficheiros deixava-a passar toda.
  test("pasta IGNORADA inteira nao e copiada", () =>
    mede({ ontem: {}, hoje: { ".gitignore": ".agent/scripts/cache/\n", ".agent/scripts/cache/a.mjs": "//\n", ".agent/scripts/cache/b/c.json": "{}\n" } }, (c) => {
      const p = [];
      if (c.ler(".agent/scripts/cache/a.mjs") !== null || c.ler(".agent/scripts/cache/b/c.json") !== null) {
        p.push("conteudo da pasta ignorada chegou ao consumidor");
      }
      // O `cpSync` entrega a PASTA sem `/` final; o git da-a com. E a juncao que se mede aqui.
      if (razao(c, ".agent/scripts/cache") !== "ignorado pelo git do template") {
        p.push(`naoCopiados = ${JSON.stringify(c.medido.naoCopiados)} — a pasta devia aparecer, com a razao`);
      }
      return p;
    }));

  // O CONTROLO do excesso. O simulador corre ANTES do commit: um ficheiro novo por commitar e
  // do template, e um filtro que perguntasse "esta commitado?" em vez de "esta ignorado?"
  // deixava de o trazer — e o `arvoreNoDisco` dava-o como removido.
  test("ficheiro NOVO por commitar e nao ignorado CONTINUA a ser copiado", () =>
    mede({ ontem: {}, hoje: { ".gitignore": "outra-coisa.md\n", ".agent/scripts/novo.mjs": "// novo\n", ".agent/rules/nova.md": "# nova\n" } }, (c) => {
      const p = [];
      if (c.ler(".agent/scripts/novo.mjs") === null) p.push(".agent/scripts/novo.mjs nao chegou");
      if (c.ler(".agent/rules/nova.md") === null) p.push(".agent/rules/nova.md nao chegou");
      if (c.medido.naoCopiados.length) p.push(`naoCopiados devia estar vazio: ${JSON.stringify(c.medido.naoCopiados)}`);
      return p;
    }));

  // A arvore "do que o template tem agora" tambem passa pelo filtro. Sem isso, um ficheiro
  // IGNORADO com o mesmo nome de um que saiu marcava a remocao como MIGRACAO — e uma migracao
  // nao se pode adiar, logo o consumidor era empurrado a apagar ja.
  test("um ignorado com o nome de um ficheiro que saiu nao faz dele uma MIGRACAO", () =>
    mede(
      {
        ontem: { ".agent/scripts/a/velho.mjs": "// velho\n" },
        hoje: { ".agent/scripts/a/velho.mjs": null, ".gitignore": ".agent/scripts/b/\n", ".agent/scripts/b/velho.mjs": "// local\n" },
      },
      (c) => {
        const r = c.medido.removidos.find((x) => x.caminho === ".agent/scripts/a/velho.mjs");
        if (!r) return [`removidos = ${JSON.stringify(c.medido.removidos)}, devia conter o que saiu`];
        return r.migrado ? ["marcado como MIGRADO por causa de um ficheiro ignorado"] : [];
      }
    ));

  // Sem resposta do git nao se sabe o que e do template. Seguir com "nada ignorado" e o `TP2`,
  // e aqui teria a consequencia de copiar exactamente o que este filtro existe para travar.
  // Um `.git` que aponta para lado nenhum faz o git falhar SEM subir a um repo pai.
  test("git que nao responde REPROVA em vez de copiar tudo", () => {
    const base = mkdtempSync(join(tmpdir(), "sim-up-semgit-"));
    try {
      const root = join(base, "tpl");
      const dir = join(base, "cons");
      mkdirSync(root);
      mkdirSync(dir);
      writeFileSync(join(root, ".git"), "gitdir: /nao/existe\n");
      try {
        aplicaUpgradeMecanico({
          dir,
          root,
          tag: "v1.0.0",
          substituto: "Consumidor",
          fatal: (m) => {
            throw new Error(`__fatal__: ${m}`);
          },
        });
        return ["devia ter reprovado"];
      } catch (err) {
        if (!err.message.startsWith("__fatal__")) return [`rebentou por outra razao: ${err.message}`];
        if (!err.message.includes("o que o template ignora")) return [`razao errada: ${err.message}`];
        // A razao do GIT vai junto: "dubious ownership" num mount e "nao e um repo" pedem
        // correccoes diferentes, e so ele sabe qual e.
        return /not a git repository|nao e um repositorio/i.test(err.message) ? [] : [`sem a razao do git: ${err.message}`];
      }
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  // Um nome em NFD (o que o macOS grava muitas vezes) contra a lista do git, que vem em NFC
  // com `core.precomposeunicode`. Sem normalizar os dois lados, o ignorado passava.
  test("ficheiro IGNORADO com nome em NFD nao e copiado", () => {
    const nfd = "RELATORIO-ação.md";
    return mede({ ontem: {}, hoje: { ".gitignore": "RELATORIO-*.md\n", [nfd]: "# notas\n" } }, (c) =>
      c.ler(nfd) !== null || c.ler(nfd.normalize("NFC")) !== null ? ["o ficheiro NFD ignorado chegou ao consumidor"] : []
    );
  });

  // A lista fixa, nos dois sentidos, e com a razao certa. Os negativos importam tanto como os
  // positivos: um padrao largo de mais (`key` em vez de `.key`) tirava um `keyboard.mjs`
  // legitimo. E a razao importa: dizer "segredo" de um `.DS_Store` engana quem le a lista.
  test("nomes que nunca se copiam: os que deve, com a razao certa, e nao os parecidos", () => {
    const segredo = ["a/settings.local.json", ".env", "x/.env.local", ".envrc", ".npmrc", ".netrc", ".pgpass", "credentials.json", ".aws/credentials", "id_rsa", "id_dsa", "id_ed25519.pub", "c/x.pem", "a/MIX.PEM", "x.key", "a.p12", "a.pfx", "a.jks", "a.keystore", "a.ppk", "secrets/a.md"];
    const lixo = ["a/.DS_Store", "Thumbs.db", "x/node_modules/y.mjs", "node_modules"];
    const nao = ["settings.json", "environment.md", "keyboard.mjs", "monkey.md", "credentials-guide.md", "a/secrets.md", "node_modules_notas.md", "identidade.md", "x.pem.md"];
    return [
      ...segredo.filter((f) => razaoDoNome(f) !== "nome de segredo").map((f) => `${f}: ${JSON.stringify(razaoDoNome(f))}, esperado "nome de segredo"`),
      ...lixo.filter((f) => razaoDoNome(f) !== "lixo do sistema ou dependencias").map((f) => `${f}: ${JSON.stringify(razaoDoNome(f))}, esperado lixo`),
      ...nao.filter((f) => razaoDoNome(f) !== null).map((f) => `${f} nao devia ser recusado`),
    ];
  });
}
