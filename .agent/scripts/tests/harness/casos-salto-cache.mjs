/**
 * O SALTO do push do merge e o `cache.yml` dos exemplos de CI de um derivado sem a maquinaria (#439) — {{PROJECT_NAME}}
 *
 * Duas receitas, e os casos de uma delas:
 *   - `problemasDoSalto(job)`: o `if:` de job do `ci-sem-maquinaria.yml`, numa das duas formas (pela mensagem, num
 *     repo de merge commits; pelo committer, num repo de squash), em bloco, e a tabela de verdade de cada forma nos
 *     eventos que importam. A suite chama-a dentro da receita do `ci.yml`.
 *   - `problemasDoCache(texto, ciTexto)`: o `cache-sem-maquinaria.yml` (os eventos, o `if:` de job e a sua tabela, o
 *     restore sem `lookup-only`, quem grava cada chave, as chaves iguais as do `ci.yml`, e as mesmas MARCAS: `(deps`
 *     e `,deps`, #442).
 *   - `casosDoCache(caso, …)`: os casos do `cache.yml` e os seus controlos.
 * Sairam da suite pelo tamanho (as ~500 linhas). NAO e uma suite nem um modulo descoberto: a suite importa-o e chama
 * cada funcao com o `caso` dela (os contadores sao dela).
 */
import { avalia, comT80, cortesDosIf, eventos, ifDeJob, normaliza, passosDoExemplo, problemasDeSaidas } from "./expressoes-ci.mjs";

export const IF_MENSAGEM = "github.event_name == 'pull_request' || !github.event.repository.private || !startsWith(github.event.head_commit.message, 'Merge pull request #')";
export const IF_SQUASH = "github.event_name == 'pull_request' || !github.event.repository.private || github.event.head_commit.committer.username != 'web-flow'";
export const IF_CACHE = "github.event_name != 'push' || contains(github.event.head_commit.message, '(deps') || contains(github.event.head_commit.message, ',deps')";

const E = "github.event_name";
const P = "github.event.repository.private";
const M = "github.event.head_commit.message";
const C = "github.event.head_commit.committer.username";
const MERGE = "Merge pull request #12 from dono/ramo\n\nfeat(app): uma coisa";
// [cenario, contexto, corre pela mensagem?, corre pelo committer?]
const CENARIOS = [
  ["um PR", { [E]: "pull_request", [P]: true }, true, true],
  ["o push de um merge commit num privado", { [E]: "push", [P]: true, [M]: MERGE, [C]: "web-flow" }, false, false],
  ["um merge commit com a opcao \"PR title\"", { [E]: "push", [P]: true, [M]: "feat(app): uma coisa (#12)", [C]: "web-flow" }, true, false],
  ["um squash", { [E]: "push", [P]: true, [M]: "feat(app): uma coisa (#12)\n\n* um commit", [C]: "web-flow" }, true, false],
  ["um rebase", { [E]: "push", [P]: true, [M]: "feat(app): o ultimo commit do PR", [C]: "web-flow" }, true, false],
  ["um push direto", { [E]: "push", [P]: true, [M]: "fix(app): direto", [C]: "uma-pessoa" }, true, true],
  ["um commit pela UI web no main", { [E]: "push", [P]: true, [M]: "Update README.md", [C]: "web-flow" }, true, false],
  ["um push num repo publico", { [E]: "push", [P]: false, [M]: MERGE, [C]: "web-flow" }, true, true],
  ["um push sem `head_commit`", { [E]: "push", [P]: true }, true, true],
];

/** A tabela de verdade de um `if:` contra o que cada cenario quer (`coluna`: 2 pela mensagem, 3 pelo committer). */
export function tabelaDoSalto(expr, coluna) {
  const out = [];
  for (const c of CENARIOS) {
    const r = avalia(expr, c[1]);
    if (r === null) out.push(`o \`if:\` do job nao se avalia (${expr})`);
    else if (r !== c[coluna]) out.push(`o \`if:\` do job ${c[coluna] ? "salta" : "corre"} em ${c[0]}`);
  }
  return out;
}

/** O `if:` de job do `ci.yml` do exemplo: uma das duas formas, em bloco, com a tabela dela. */
export function problemasDoSalto(job) {
  const i = ifDeJob(job);
  if (!i) return ["o job nao tem `if:`: o push do merge num privado corria (1 min de 3 por PR)"];
  const out = [];
  if (i.forma !== "bloco") out.push("o `if:` do job vai em bloco (`if: >-`): numa linha simples, o ` #` cortava-o");
  const v = normaliza(i.valor);
  if (v !== IF_MENSAGEM && v !== IF_SQUASH) return [...out, `o \`if:\` do job nao e nenhuma das duas formas: ${v}`];
  return [...out, ...tabelaDoSalto(v, v === IF_MENSAGEM ? 2 : 3)];
}

// As quatro linhas que fazem as chaves: a funcao, a ENTRADA dela (o `fp=`), e as duas chaves.
const chaves = (corpo) => (corpo ?? "").split("\n").map((l) => l.trim()).filter((l) => /^deps_fp\(\)|^fp=|npm_key=|nm_key=/.test(l));

/** Os problemas do `cache.yml` do exemplo (vazio = a receita cumpre-se). `ciTexto`: o `ci.yml` do exemplo. */
export function problemasDoCache(texto, ciTexto) {
  const out = [...cortesDosIf(texto)];
  const ev = eventos(texto).sort().join(",");
  if (ev !== "push,schedule,workflow_dispatch") out.push(`o \`on:\` e push, schedule e workflow_dispatch (tem: ${ev || "nada"})`);
  const paths = /^[ \t]+paths:[ \t]*\[([^\]]*)\]/m.exec(texto)?.[1].split(",").map((x) => x.trim()).sort().join(",");
  if (paths !== ".nvmrc,package-lock.json") out.push(`o push so com o \`package-lock.json\` e o \`.nvmrc\` (\`paths:\` ${paths ?? "em falta"}): o \`.nvmrc\` muda a chave da node_modules`);
  const { jobs, passos } = passosDoExemplo(texto);
  if (jobs.length !== 1) return [...out, `tem de haver UM job (ha ${jobs.length})`];
  const i = ifDeJob(jobs[0]);
  if (!i) out.push("o job nao tem `if:`: um merge que so suba a versao corria (1 min)");
  else {
    if (i.forma !== "bloco") out.push("o `if:` do job vai em bloco (`if: >-`)");
    if (normaliza(i.valor) !== IF_CACHE) out.push(`o \`if:\` do job nao e \`${IF_CACHE}\`: ${normaliza(i.valor)}`);
    const casos = [["o schedule", { [E]: "schedule" }, true], ["o workflow_dispatch", { [E]: "workflow_dispatch" }, true], ["um merge de dependencias", { [E]: "push", [M]: "Merge pull request #3 from d/r\n\nchore(deps-dev): bump x" }, true], ["um merge com varios scopes", { [E]: "push", [M]: "feat(reader,deps): usa o x (#5)" }, true], ["um merge que so sobe a versao", { [E]: "push", [M]: "feat(app): uma coisa (#4)" }, false]];
    for (const [nome, ctx, quer] of casos) if (avalia(i.valor, ctx) !== quer) out.push(`o \`if:\` do job ${quer ? "salta" : "corre"} em ${nome}`);
  }
  for (const p of passos) {
    const nome = p.name ?? p.uses ?? "?";
    if (/^actions\/cache\/restore@/.test(p.uses ?? "") && p.with["lookup-only"] !== undefined) out.push(`${nome}: o restore e INTEIRO (sem \`lookup-only\`): restaurar conta como uso, e evita a remocao aos 7 dias`);
    if (/^actions\/cache@/.test(p.uses ?? "")) out.push(`${nome}: \`restore\` e \`save\` separados`);
  }
  const grava = (k) => passos.some((p) => /^actions\/cache\/save@/.test(p.uses ?? "") && (p.with.key ?? "").includes(`steps.deps.outputs.${k}`));
  if (!grava("npm_key")) out.push("ninguem grava a cache do npm (`npm_key`)");
  if (passos.some((p) => p.id === "nmcache") && !grava("nm_key")) out.push("o T80 restaura a node_modules e ninguem a grava (`nm_key`)");
  if (!passos.some((p) => /^npm ci\b/.test((p.run ?? "").trim()))) out.push("falta o `npm ci` (com a chave em falta, instala e grava)");
  out.push(...problemasDeSaidas(passos));
  const ciDeps = passosDoExemplo(ciTexto ?? "").passos.find((p) => p.id === "deps");
  const a = chaves(passos.find((p) => p.id === "deps")?.corpo);
  const b = chaves(ciDeps?.corpo);
  if (a.length !== 4 || JSON.stringify(a) !== JSON.stringify(b)) out.push("as chaves (o `deps_fp`, a `npm_key` e a `nm_key`) divergem das do passo `deps` do `ci-sem-maquinaria.yml`");
  // As MARCAS do `ci.yml` e os `contains` do `if:` do `cache.yml` sao o MESMO conjunto, nos dois sentidos (#442).
  const marcas = (passosDoExemplo(ciTexto ?? "").passos.find((p) => p.env?.MARCAS !== undefined)?.env.MARCAS ?? "").split(/\s+/).filter(Boolean).sort();
  const doIf = [...(i?.valor ?? "").matchAll(/contains\([^,]+,\s*'([^']+)'\)/g)].map((m) => m[1]).sort();
  if (!marcas.length || JSON.stringify(marcas) !== JSON.stringify(doIf)) out.push(`as MARCAS do \`ci.yml\` (${marcas.join(" ") || "em falta"}) nao sao os textos dos \`contains\` do \`if:\` do \`cache.yml\` (${doIf.join(" ") || "nenhum"})`);
  return out;
}

/** Os casos do `cache.yml`. `caso`: o da suite. */
export function casosDoCache(caso, { texto, ciTexto }) {
  if (texto === null) {
    caso("o exemplo `cache-sem-maquinaria.yml` existe", () => ["nao existe — e o par do `ci-sem-maquinaria.yml` (#439)"]);
    return;
  }
  const T80 = comT80(texto);
  caso("cache: o exemplo cumpre a receita (zero problemas)", () => problemasDoCache(texto, ciTexto));
  caso("cache: o bloco OPCIONAL T80 descomentado cumpre a receita", () => (T80 === null ? ["nao encontrei os marcadores CACHE/OPCIONAL T80"] : problemasDoCache(T80, ciTexto)));
  const IF = "    if: >-\n      github.event_name != 'push' ||\n      contains(github.event.head_commit.message, '(deps') ||\n      contains(github.event.head_commit.message, ',deps')\n";
  const MUTACOES = [
    { nome: "sem o `.nvmrc` no `paths:`", de: "paths: [package-lock.json, .nvmrc]", para: "paths: [package-lock.json]", espera: "`.nvmrc` muda" },
    { nome: "sem o `schedule`", de: "  schedule:\n    - cron: \"17 4 * * 1\" # segunda, 04:17 UTC\n", para: "", espera: "push, schedule e workflow_dispatch" },
    { nome: "o `if:` numa linha simples (o ` #`... e aqui o bloco)", de: IF, para: "    if: github.event_name != 'push' || contains(github.event.head_commit.message, '(deps')\n", espera: "em bloco" },
    { nome: "um `if:` que salta o schedule", de: IF, para: "    if: >-\n      contains(github.event.head_commit.message, '(deps')\n", espera: "salta em o schedule" },
    { nome: "sem `if:` (corre em cada merge)", de: IF, para: "", espera: "nao tem `if:`" },
    { nome: "o restore com `lookup-only`", de: "          key: ${{ steps.deps.outputs.npm_key }}\n\n      - name: Install", para: "          key: ${{ steps.deps.outputs.npm_key }}\n          lookup-only: true\n\n      - name: Install", espera: "sem `lookup-only`" },
    { nome: "sem o save do npm", de: "uses: actions/cache/save@v6", para: "uses: actions/cache/restore@v6", espera: "ninguem grava a cache do npm" },
    { nome: "o Install a ler a saida de um passo com `if:` sem o repetir", de: "        id: npmcache\n", para: "        id: npmcache\n        if: github.event_name == 'schedule'\n", espera: "sem repetir o `if:`" },
    { nome: "a impressao digital de outro ficheiro", de: 'fp="$(deps_fp < package-lock.json)"', para: 'fp="$(deps_fp < npm-shrinkwrap.json)"', espera: "divergem" },
    { nome: "a chave sem o ABI", de: "-abi$(node -p process.versions.modules)-", para: "-", espera: "divergem" },
    { nome: "outra MARCA no `contains`", de: "'(deps')", para: "'(dependencias')", espera: "nao e" },
    { nome: "sem o ramo do `,deps` (#442)", de: " ||\n      contains(github.event.head_commit.message, ',deps')", para: "", espera: "salta em um merge com varios scopes" },
    { base: "t80", nome: "T80: sem o save da node_modules", de: "      - name: node_modules (gravar)\n        if: steps.nmcache.outputs.cache-hit != 'true'\n        uses: actions/cache/save@v6\n        with:\n          path: node_modules\n          key: ${{ steps.deps.outputs.nm_key }}\n", para: "", espera: "ninguem a grava" },
  ];
  for (const m of MUTACOES) {
    caso(`cache: controlo: ${m.nome}`, () => {
      const base = m.base === "t80" ? T80 : texto;
      if (base === null || !base.includes(m.de)) return [`o texto a mutar ja nao esta no exemplo: ${m.de.slice(0, 80)}`];
      const ps = problemasDoCache(base.replace(m.de, () => m.para), ciTexto);
      return ps.some((p) => p.includes(m.espera)) ? [] : [`esperava um problema com "${m.espera}"; deu: ${ps.join(" | ") || "nenhum"}`];
    });
  }
  caso("cache: controlo: a MARCA do `ci.yml` diferente", () => {
    const ci = (ciTexto ?? "").replace('MARCAS: "(deps ,deps"', 'MARCAS: "[deps] ,deps"');
    if (ci === ciTexto) return ["o texto a mutar ja nao esta no `ci-sem-maquinaria.yml`: MARCAS"];
    return problemasDoCache(texto, ci).some((p) => p.includes("MARCAS")) ? [] : ["uma MARCA diferente no `ci.yml` passou"];
  });
  caso("cache: controlo: uma marca so no `ci.yml` (o `cache.yml` sem ela)", () => {
    const ci = (ciTexto ?? "").replace('MARCAS: "(deps ,deps"', 'MARCAS: "(deps ,deps +deps"');
    if (ci === ciTexto) return ["o texto a mutar ja nao esta no `ci-sem-maquinaria.yml`: MARCAS"];
    return problemasDoCache(texto, ci).some((p) => p.includes("MARCAS")) ? [] : ["uma marca a mais no `ci.yml` passou"];
  });
}
