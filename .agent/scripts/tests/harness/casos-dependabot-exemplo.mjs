/**
 * Os casos do `dependabot.yml` de um derivado privado (`exemplos/dependabot-privado.yml`, #440) — {{PROJECT_NAME}}
 *
 * O exemplo e o `.github/dependabot.yml` do template com DUAS diferencas por ecossistema: `interval: monthly` (em vez
 * de `weekly` + `day:`) e `rebase-strategy: disabled`. Tudo o resto (as labels, os grupos, os prefixos, o `cooldown`)
 * tem de ser igual, para os dois nao divergirem quando o do template mudar. Essa comparacao so tem sentido NO TEMPLATE
 * (#485): num derivado privado o `.github/dependabot.yml` ja e o proprio exemplo (o `BOOTSTRAP` e o guia do upgrade
 * mandam-no), e compara-lo com o exemplo reprovava sempre. Num derivado, as verificacoes do exemplo continuam (mensal,
 * sem rebase, `cooldown`), e a comparacao diz SKIP. NAO e uma suite nem um modulo descoberto:
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

/** Os problemas do exemplo contra o `dependabot.yml` do template (vazio = cumpre). `template` `null`: so as verificacoes
 *  do proprio exemplo (num derivado, onde nao ha o do template para comparar). */
export function problemasDoDependabot(exemplo, template) {
  const out = [];
  const e = ecossistemas(exemplo);
  const t = template === null ? null : ecossistemas(template);
  const nomes = t === null ? null : Object.keys(t).sort().join(",");
  if (t !== null && Object.keys(e).sort().join(",") !== nomes) out.push(`os ecossistemas nao sao os do template (${nomes}): ${Object.keys(e).join(",") || "nenhum"}`);
  for (const nome of Object.keys(e)) {
    const ls = e[nome];
    if (!ls.includes("interval: monthly")) out.push(`${nome}: \`interval: monthly\` (uma corrida por mes; a quota e da conta)`);
    if (!ls.includes("rebase-strategy: disabled")) out.push(`${nome}: \`rebase-strategy: disabled\` (cada rebase corre o CI do PR outra vez)`);
    if (!ls.some((l) => /^default-days:[ \t]*\d+/.test(l))) out.push(`${nome}: o \`cooldown\` do template (#377)`);
    const resto = ls.filter((l) => !SO_NO_EXEMPLO(l));
    if (t === null) continue;
    const doTemplate = (t[nome] ?? []).filter((l) => !SO_NO_TEMPLATE(l));
    if (t[nome] && JSON.stringify(resto) !== JSON.stringify(doTemplate)) out.push(`${nome}: diverge do \`.github/dependabot.yml\` do template fora do \`schedule\` e do \`rebase-strategy\``);
  }
  return out;
}

/** Os casos do exemplo. `caso`: o da suite; `noTemplate`: se corre no template (so la ha o `dependabot.yml` dele). */
export function casosDoDependabot(caso, { exemplo, template, noTemplate = true, aninhado = false }) {
  if (exemplo === null || (noTemplate && template === null)) {
    caso("o exemplo `dependabot-privado.yml` e o `.github/dependabot.yml` existem", () => ["falta um dos dois (#440)"]);
    return;
  }
  const referencia = noTemplate ? template : null;
  if (!noTemplate && !aninhado) console.log("  SKIP  dependabot privado: a comparacao com o do template (num derivado, o `.github/dependabot.yml` ja e o exemplo, #485)");
  caso(`dependabot privado: o exemplo cumpre (mensal, sem rebase${noTemplate ? ", e o resto igual ao do template" : ""})`, () => problemasDoDependabot(exemplo, referencia));
  // Porque o salto (#485): o `dependabot.yml` de um derivado privado E o exemplo, e a comparacao com ele reprovava sempre;
  // so as verificacoes do proprio exemplo nao o fazem. Corre em todo o lado: e a prova de que o salto e preciso e basta.
  caso("dependabot privado: com o `dependabot.yml` = o exemplo (um derivado privado), comparar reprova e as verificacoes do exemplo passam", () => {
    const comparando = problemasDoDependabot(exemplo, exemplo);
    const so = problemasDoDependabot(exemplo, null);
    return [...(comparando.some((p) => p.includes("diverge")) ? [] : [`comparar o exemplo com ele proprio nao reprovou: ${comparando.join(" | ") || "nenhum"}`]), ...(so.length ? [`as verificacoes do exemplo: ${so.join(" | ")}`] : [])];
  });
  const MUTACOES = [
    { nome: "o npm semanal", de: "      interval: monthly\n    rebase-strategy: disabled\n    open-pull-requests-limit: 5", para: "      interval: weekly\n    rebase-strategy: disabled\n    open-pull-requests-limit: 5", espera: "npm: `interval: monthly`" },
    { nome: "sem o `rebase-strategy` no github-actions", de: "    rebase-strategy: disabled\n    open-pull-requests-limit: 3", para: "    open-pull-requests-limit: 3", espera: "github-actions: `rebase-strategy: disabled`" },
    { nome: "sem o `cooldown` no npm", de: "    cooldown:\n      default-days: 7\n    commit-message:\n      prefix: chore", para: "    commit-message:\n      prefix: chore", espera: "npm: o `cooldown`" },
    { nome: "outra label (diverge do template)", precisaTemplate: true, de: "      - dependencies", para: "      - deps", espera: "npm: diverge" },
    { nome: "sem o grupo do CodeQL", precisaTemplate: true, de: "    groups:\n      codeql-action:\n        patterns:\n          - \"github/codeql-action*\"\n", para: "", espera: "github-actions: diverge" },
    { nome: "sem o ecossistema github-actions", precisaTemplate: true, de: "  - package-ecosystem: github-actions", para: "  - package-ecosystemx: github-actions", espera: "os ecossistemas" },
  ];
  for (const m of MUTACOES.filter((x) => noTemplate || !x.precisaTemplate)) {
    caso(`dependabot privado: controlo: ${m.nome}`, () => {
      if (!exemplo.includes(m.de)) return [`o texto a mutar ja nao esta no exemplo: ${m.de.slice(0, 80)}`];
      const ps = problemasDoDependabot(exemplo.replace(m.de, () => m.para), referencia);
      return ps.some((p) => p.includes(m.espera)) ? [] : [`esperava um problema com "${m.espera}"; deu: ${ps.join(" | ") || "nenhum"}`];
    });
  }
  // O MODO DERIVADO corrido aqui, no template (a leitura independente do #485): sem isto, um defeito no `referencia`, no
  // filtro `precisaTemplate` ou no ultimo `if` so era apanhado pelo `simulate-derived`, depois do commit. Os casos registam
  // num `caso` falso; o `aninhado` impede este bloco de se registar outra vez la dentro.
  if (!aninhado) {
    const falhasCom = (opcoes) => {
      const falhas = [];
      casosDoDependabot((nome, fn) => fn().length && falhas.push(nome), { exemplo, template: exemplo, aninhado: true, ...opcoes });
      return falhas;
    };
    caso("dependabot privado: o modo derivado, com o `dependabot.yml` = o exemplo, nao reprova; controlo: o modo template, sim", () => {
      const derivado = falhasCom({ noTemplate: false });
      const template = falhasCom({ noTemplate: true });
      return [...(derivado.length ? [`o modo derivado reprovou: ${derivado.join(" | ")}`] : []), ...(template.length ? [] : ["o modo template nao reprovou (o controlo nao mede nada)"])];
    });
  }
  if (noTemplate) caso("dependabot privado: controlo: o template muda uma label e o exemplo nao", () =>
    problemasDoDependabot(exemplo, template.replace("      - dependencies", "      - deps")).some((p) => p.includes("diverge")) ? [] : ["o exemplo atrasado passou"]);
}
