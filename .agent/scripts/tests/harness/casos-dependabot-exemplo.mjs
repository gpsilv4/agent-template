/**
 * Os casos do `dependabot.yml` de um derivado privado (`exemplos/dependabot-privado.yml`, #440) — {{PROJECT_NAME}}
 *
 * O exemplo e o `.github/dependabot.yml` do template com DUAS diferencas por ecossistema: `interval: monthly` (em vez
 * de `weekly` + `day:`) e `rebase-strategy: disabled`. Tudo o resto (as labels, os grupos, os prefixos, o `cooldown`)
 * tem de ser igual, para os dois nao divergirem quando o do template mudar. NAO e uma suite nem um modulo descoberto:
 * a `test-ci-exemplo.mjs` importa-o e chama `casosDoDependabot` com o `caso` dela. Sem sitios de recusa: so regista.
 */
import { semComentario } from "../../lib/estrutura-workflow.mjs";

/** Os ecossistemas de um `dependabot.yml`: `{ nome: [linhas sem comentarios nem vazias] }`. */
function ecossistemas(texto) {
  const out = {};
  let atual = null;
  for (const l of (texto ?? "").split(/\r\n|\r|\n/).map(semComentario)) {
    const m = /^[ \t]*-[ \t]+package-ecosystem:[ \t]*(\S+)/.exec(l);
    if (m) out[(atual = m[1])] = [];
    else if (atual && l.trim()) out[atual].push(l.trim());
  }
  return out;
}

const SO_NO_TEMPLATE = (l) => l === "interval: weekly" || /^day:/.test(l);
const SO_NO_EXEMPLO = (l) => l === "interval: monthly" || l === "rebase-strategy: disabled";

/** Os problemas do exemplo contra o `dependabot.yml` do template (vazio = cumpre). */
export function problemasDoDependabot(exemplo, template) {
  const out = [];
  const e = ecossistemas(exemplo);
  const t = ecossistemas(template);
  const nomes = Object.keys(t).sort().join(",");
  if (Object.keys(e).sort().join(",") !== nomes) out.push(`os ecossistemas nao sao os do template (${nomes}): ${Object.keys(e).join(",") || "nenhum"}`);
  for (const nome of Object.keys(e)) {
    const ls = e[nome];
    if (!ls.includes("interval: monthly")) out.push(`${nome}: \`interval: monthly\` (uma corrida por mes; a quota e da conta)`);
    if (!ls.includes("rebase-strategy: disabled")) out.push(`${nome}: \`rebase-strategy: disabled\` (cada rebase corre o CI do PR outra vez)`);
    if (!ls.some((l) => /^default-days:[ \t]*\d+/.test(l))) out.push(`${nome}: o \`cooldown\` do template (#377)`);
    const resto = ls.filter((l) => !SO_NO_EXEMPLO(l));
    const doTemplate = (t[nome] ?? []).filter((l) => !SO_NO_TEMPLATE(l));
    if (t[nome] && JSON.stringify(resto) !== JSON.stringify(doTemplate)) out.push(`${nome}: diverge do \`.github/dependabot.yml\` do template fora do \`schedule\` e do \`rebase-strategy\``);
  }
  return out;
}

/** Os casos do exemplo. `caso`: o da suite. */
export function casosDoDependabot(caso, { exemplo, template }) {
  if (exemplo === null || template === null) {
    caso("o exemplo `dependabot-privado.yml` e o `.github/dependabot.yml` existem", () => ["falta um dos dois (#440)"]);
    return;
  }
  caso("dependabot privado: o exemplo cumpre (mensal, sem rebase, e o resto igual ao do template)", () => problemasDoDependabot(exemplo, template));
  const MUTACOES = [
    { nome: "o npm semanal", de: "      interval: monthly\n    rebase-strategy: disabled\n    open-pull-requests-limit: 5", para: "      interval: weekly\n    rebase-strategy: disabled\n    open-pull-requests-limit: 5", espera: "npm: `interval: monthly`" },
    { nome: "sem o `rebase-strategy` no github-actions", de: "    rebase-strategy: disabled\n    open-pull-requests-limit: 3", para: "    open-pull-requests-limit: 3", espera: "github-actions: `rebase-strategy: disabled`" },
    { nome: "sem o `cooldown` no npm", de: "    cooldown:\n      default-days: 7\n    commit-message:\n      prefix: chore", para: "    commit-message:\n      prefix: chore", espera: "npm: o `cooldown`" },
    { nome: "outra label (diverge do template)", de: "      - dependencies", para: "      - deps", espera: "npm: diverge" },
    { nome: "sem o grupo do CodeQL", de: "    groups:\n      codeql-action:\n        patterns:\n          - \"github/codeql-action*\"\n", para: "", espera: "github-actions: diverge" },
    { nome: "sem o ecossistema github-actions", de: "  - package-ecosystem: github-actions", para: "  - package-ecosystemx: github-actions", espera: "os ecossistemas" },
  ];
  for (const m of MUTACOES) {
    caso(`dependabot privado: controlo: ${m.nome}`, () => {
      if (!exemplo.includes(m.de)) return [`o texto a mutar ja nao esta no exemplo: ${m.de.slice(0, 80)}`];
      const ps = problemasDoDependabot(exemplo.replace(m.de, () => m.para), template);
      return ps.some((p) => p.includes(m.espera)) ? [] : [`esperava um problema com "${m.espera}"; deu: ${ps.join(" | ") || "nenhum"}`];
    });
  }
  caso("dependabot privado: controlo: o template muda uma label e o exemplo nao", () =>
    problemasDoDependabot(exemplo, template.replace("      - dependencies", "      - deps")).some((p) => p.includes("diverge")) ? [] : ["o exemplo atrasado passou"]);
}
