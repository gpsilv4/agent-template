/**
 * O FECHO do modo parcial (#429): o que vem num `/upgrade` parcial tem de incluir tudo o que isso le — {{PROJECT_NAME}}
 *
 * Os hooks, o `commit-msg`, o `check-backlog` e o `minutos-ci` leem outros ficheiros: por `import`, por um `import()`
 * de um caminho escrito como texto, por um `readFileSync`/`readdirSync` de uma pasta. Um que nao venha deixa um hook a
 * cair no seu `catch` e a sair 0 — a fronteira desaparece calada (o `guard-subagent-bash` sem `.claude/agents/`).
 *
 * Por isso a lista "o que vem" do `src/docs/upgrade-parcial.md` (entre `<!-- fecho:inicio -->` e `<!-- fecho:fim -->`)
 * e verificada contra o fecho CALCULADO: cada literal de caminho do codigo (fora de comentarios e de regex), seguido
 * transitivamente. O que e so dado e nao dependencia vai na `ISENCOES`, com o porque, e uma isencao que ja nao
 * apanha nada reprova (senao a lista crescia ate isentar tudo).
 *
 * Um template conta pelo prefixo e pelos pedacos depois de cada `${…}` (`${raiz}/.agent/x.mjs` da `.agent/x.mjs`).
 * O LIMITE que fica: um caminho montado por segmentos (`join(r, ".agent", "scripts", "x.mjs")`) nao e um literal, e
 * nao se ve. Os do repo hoje escrevem o caminho inteiro; um novo assim e um falso negativo, e e por isso que a leitura
 * de um hook novo confere a lista a mao.
 *
 * NAO e um entry point nem um modulo de casos (`tests-*.mjs`, da descoberta): e um ajudante que o
 * `test-modo-upgrade.mjs` importa, e por isso vive em `harness/`.
 */
import { existsSync, readdirSync, statSync } from "fs";
import { join, posix } from "path";
import { leOuNull } from "../../lib/ficheiros.mjs";

// --- O tokenizer: so os literais de texto, sem comentarios nem regex ---

const ANTES_DE_REGEX = new Set(["(", ",", "=", ":", "[", "!", "&", "|", "?", "{", "}", ";", "+", "-", "*", "%", "<", ">", "~", "^", ""]);
const PALAVRAS_ANTES_DE_REGEX = new Set(["return", "typeof", "case", "do", "else", "in", "of", "new", "delete", "void", "throw", "yield", "await"]);

/** Os literais de texto de um ficheiro JS: `'…'`, `"…"` e o PREFIXO estatico de um template (ate ao 1.o `${`). */
export function literaisDe(src) {
  const out = [];
  let i = 0;
  let ultimo = ""; // o ultimo caractere significativo
  let palavra = ""; // a ultima palavra (para `return /x/`)
  const leTexto = (q) => {
    let s = "";
    i++;
    while (i < src.length && src[i] !== q) {
      if (src[i] === "\\") {
        s += src[i + 1] ?? "";
        i += 2;
        continue;
      }
      s += src[i++];
    }
    i++;
    return s;
  };
  // O PREFIXO (ate ao 1.o `${`) e o literal; os pedacos DEPOIS de um `${…}` entram tambem, sem a `/` inicial:
  // `${raiz}/.agent/scripts/x.mjs` da `.agent/scripts/x.mjs`. Sem isso, um caminho assim nao entrava no fecho.
  const leTemplate = () => {
    let s = "";
    let prefixo = null;
    i++;
    while (i < src.length && src[i] !== "`") {
      if (src[i] === "\\") {
        s += src[i + 1] ?? "";
        i += 2;
      } else if (src[i] === "$" && src[i + 1] === "{") {
        if (prefixo === null) prefixo = s;
        else if (s) out.push(s.replace(/^\//, ""));
        s = "";
        i += 2;
        expressao();
      } else s += src[i++];
    }
    i++;
    if (prefixo !== null && s) out.push(s.replace(/^\//, ""));
    return prefixo ?? s;
  };
  const leRegex = () => {
    let classe = false;
    i++;
    while (i < src.length && src[i] !== "\n") {
      const c = src[i];
      if (c === "\\") i += 2;
      else if (c === "[") (classe = true), i++;
      else if (c === "]") (classe = false), i++;
      else if (c === "/" && !classe) break;
      else i++;
    }
    i++;
    while (/[a-z]/i.test(src[i] ?? "")) i++;
  };
  // Le ate ao `}` que fecha a expressao de um `${` (ou ate ao fim, no topo).
  const expressao = (topo = false) => {
    let fundo = 0;
    while (i < src.length) {
      const c = src[i];
      const d = src[i + 1];
      if (c === "/" && d === "/") {
        while (i < src.length && src[i] !== "\n") i++;
      } else if (c === "/" && d === "*") {
        const f = src.indexOf("*/", i + 2);
        i = f < 0 ? src.length : f + 2;
      } else if (c === "'" || c === '"') {
        out.push(leTexto(c));
        ultimo = "a";
        palavra = "";
      } else if (c === "`") {
        out.push(leTemplate());
        ultimo = "a";
        palavra = "";
      } else if (c === "/" && (ANTES_DE_REGEX.has(ultimo) || PALAVRAS_ANTES_DE_REGEX.has(palavra))) {
        leRegex();
        ultimo = "a";
        palavra = "";
      } else if (/\s/.test(c)) {
        i++;
      } else {
        if (!topo && c === "{") fundo++;
        if (!topo && c === "}") {
          if (fundo === 0) {
            i++;
            ultimo = "a";
            return;
          }
          fundo--;
        }
        if (/[\w$]/.test(c)) {
          let w = "";
          while (i < src.length && /[\w$]/.test(src[i])) w += src[i++];
          palavra = w;
          ultimo = "a";
          continue;
        }
        palavra = "";
        ultimo = c === ")" || c === "]" ? "a" : c;
        i++;
      }
    }
  };
  expressao(true);
  return out;
}

// --- O fecho ---

/** Um literal que nomeia um caminho do repo: absoluto a raiz (`.agent/`…) ou relativo ao ficheiro (`./`, `../`). Uma
 *  mensagem que comeca por um caminho (`".agent/adocao.json ilegivel — …"`) nao e um: um caminho nao tem espacos. */
function caminhoDe(literal, ficheiro) {
  const l = literal.trim();
  if (/\s/.test(l)) return null;
  if (/^\.\.?[/]/.test(l)) return posix.normalize(posix.join(posix.dirname(ficheiro), l));
  if (/^(\.(agent|claude|githooks|github)|src)[/]/.test(l) || /^[A-Z][\w-]*\.md$/.test(l) || /(^|\/)CONTRIBUTING\.md$/.test(l)) return posix.normalize(l);
  return null;
}

/** As raizes do fecho: o que o modo parcial traz e que LE outros ficheiros. Os testes dos hooks vem tambem, mas os
 *  caminhos deles sao sobretudo DADOS (os comandos que testam): neles so se seguem os `import`. */
export function raizesDoFecho(root) {
  const mjs = (d) => (existsSync(join(root, d)) ? readdirSync(join(root, d)).filter((f) => f.endsWith(".mjs")).map((f) => `${d}/${f}`) : []);
  const H = ".claude/hooks";
  // TODOS os ficheiros do `.githooks/` (sem extensao: o git exige o nome do evento), e nao so o `commit-msg`.
  const githooks = existsSync(join(root, ".githooks")) ? readdirSync(join(root, ".githooks")).filter((f) => statSync(join(root, ".githooks", f)).isFile()).map((f) => `.githooks/${f}`) : [];
  return [
    ...[...mjs(H), ...mjs(`${H}/lib`), ...mjs(".githooks/lib"), ...githooks, ".agent/scripts/check-backlog.mjs", ".agent/scripts/minutos-ci.mjs"].map((f) => ({ f, soImports: false })),
    ...mjs(`${H}/tests`).map((f) => ({ f, soImports: true })),
  ];
}

// EXATA, e nunca por prefixo: uma isencao `.agent/scripts/` engolia tambem um `import "./x.mjs"` desse ficheiro.
const isenta = (isencoes, p, f) => isencoes.find((x) => x.ficheiro === f && x.literal === p);

/**
 * O fecho transitivo: `{ caminhos: Map<caminho, Set<quem o nomeia>>, nomeados: [{ de, modulo, nomes }], usadas }`. Um
 * `.mjs` (ou o `commit-msg`) segue-se; uma pasta ou outro ficheiro conta como esta. Um literal ISENTO nao entra nem se
 * segue (por isso a isencao e por ficheiro: o mesmo caminho noutro sitio conta).
 */
export function fechoDe(root, raizes, isencoes = []) {
  const caminhos = new Map();
  const nomeados = [];
  const usadas = new Set();
  const marca = (p, de) => {
    if (!caminhos.has(p)) caminhos.set(p, new Set());
    if (de) caminhos.get(p).add(de);
  };
  const fila = raizes.map((r) => ({ ...r }));
  const visto = new Set();
  for (const r of raizes) marca(r.f, null);
  while (fila.length) {
    const { f, soImports } = fila.shift();
    if (visto.has(f)) continue;
    visto.add(f);
    const src = leOuNull(join(root, f));
    if (src === null) continue;
    for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*["']([^"']+)["']/g)) {
      const alvo = caminhoDe(m[2], f);
      if (alvo) nomeados.push({ de: f, modulo: alvo, nomes: m[1].split(",").map((n) => n.trim().split(/\s+as\s+/)[0]).filter(Boolean) });
    }
    // Nos testes dos hooks: o `from "x"`, o `import "x"` (de efeito) e o `import("x")` com um texto literal.
    const literais = soImports ? [...src.matchAll(/\b(?:from|import)\s*\(?\s*["']([^"']+)["']/g)].map((m) => m[1]) : literaisDe(src);
    for (const l of literais) {
      const p = caminhoDe(l, f);
      if (!p) continue;
      const x = isenta(isencoes, p, f);
      if (x) {
        usadas.add(x);
        continue;
      }
      marca(p, f);
      const abs = join(root, p);
      if ((p.endsWith(".mjs") || /^\.githooks\/[^/.]+$/.test(p)) && existsSync(abs) && statSync(abs).isFile()) fila.push({ f: p, soImports: false });
    }
  }
  return { caminhos, nomeados, usadas };
}

/** As entradas da lista "o que vem" do doc: o 1.o caminho entre crases de cada ITEM (`- `) entre os marcadores. */
export function listaDoDoc(doc) {
  const m = /<!-- fecho:inicio -->([\s\S]*?)<!-- fecho:fim -->/.exec(doc ?? "");
  if (!m) return null;
  return m[1].split("\n").filter((l) => /^- /.test(l)).map((l) => /`([^`]+)`/.exec(l)?.[1]).filter(Boolean);
}

/** O que o fecho nomeia e NAO e dependencia: dados, estado de runtime, ficheiros do projeto. Cada um com o porque. */
export const ISENCOES = [
  { ficheiro: ".claude/hooks/lib/fronteira-dados.mjs", literal: ".claude/settings.local.json", porque: "a lista dos caminhos da fronteira: o hook protege-o, nao o le" },
  { ficheiro: ".claude/hooks/stop-verify.mjs", literal: ".claude/state/stop-verify.last", porque: "estado de runtime, criado pelo proprio hook" },
  { ficheiro: ".claude/hooks/guard-textos-publicos.mjs", literal: ".claude/state/textos-publicos.sessao", porque: "estado de runtime, criado pelo proprio hook" },
  { ficheiro: ".agent/scripts/check-backlog.mjs", literal: ".agent/context/backlog.md", porque: "o backlog e do projeto (e o que se verifica)" },
  { ficheiro: ".agent/scripts/check-backlog.mjs", literal: ".agent/context/backlog-archive.md", porque: "o arquivo e do projeto" },
  { ficheiro: ".claude/hooks/reinject-fronteiras.mjs", literal: "CLAUDE.md", porque: "o ponto de entrada e do projeto (o hook le as Fronteiras DELE)" },
  { ficheiro: ".agent/scripts/lib/marcas-yaml.mjs", literal: ".github/workflows/codeql.yml", porque: "um nome numa lista (o que e so do template), nao uma leitura" },
  { ficheiro: ".agent/scripts/lib/mapa-suites.mjs", literal: ".agent/scripts/", porque: "dados da tabela (as suites que cada regra nomeia), e nao uma leitura" },
  { ficheiro: ".agent/scripts/lib/mapa-suites.mjs", literal: ".agent/scripts/tests/", porque: "dados da tabela (as suites que cada regra nomeia), e nao uma leitura" },
];

const coberto = (p, lista) => lista.some((e) => e === p || (e.endsWith("/") && (p.startsWith(e) || p === e.slice(0, -1))));

/**
 * Os problemas do fecho contra a lista: um caminho do fecho que a lista nao cobre; uma isencao que ja nao apanha nada;
 * um nome importado de um modulo da lista que o modulo nao exporta.
 */
export function problemasDoFecho(root, lista, isencoes) {
  const { caminhos, nomeados, usadas } = fechoDe(root, raizesDoFecho(root), isencoes);
  const out = [];
  for (const [p, quem] of caminhos) if (!coberto(p, lista)) out.push(`\`${p}\` (lido por ${[...quem].join(", ") || "uma raiz"}) nao esta na lista "o que vem" do upgrade-parcial.md`);
  for (const x of isencoes) if (!usadas.has(x)) out.push(`a isencao \`${x.literal}\` em ${x.ficheiro} ja nao apanha nada — tira-la`);
  for (const { de, modulo, nomes } of nomeados) {
    if (!coberto(modulo, lista)) continue;
    const src = leOuNull(join(root, modulo)) ?? "";
    for (const n of nomes) if (!new RegExp(`export\\s+(?:async\\s+)?(?:function\\*?|const|let|class)\\s+${n}\\b|export\\s*\\{[^}]*\\b${n}\\b`).test(src)) out.push(`${de} importa \`${n}\` de ${modulo}, que nao o exporta`);
  }
  return out;
}
