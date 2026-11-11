/**
 * Guard 22: os runners do CI do template num so rotulo fixo (#488) — {{PROJECT_NAME}}
 *
 * PORQUE EXISTE: o `ubuntu-latest` muda de imagem quando o GitHub decide (passou para o Ubuntu 26 a partir de 19 out
 * 2026), e com a imagem mudam as versoes das ferramentas. Ja mordeu um derivado: uma suite fixava a frase de erro do
 * `git`, e o `git` da imagem nova dizia outra (#400). Os exemplos de CI dos derivados ja fixavam `ubuntu-24.04`; o CI
 * do proprio template nao. Fixar sem rede nao chega: o proximo workflow novo voltava ao `-latest` sem ninguem ver.
 *
 * O QUE VERIFICA: todo o `runs-on:` dos workflows do template (`.github/workflows/`) e dos exemplos dos derivados
 * (`src/docs/exemplos/`) e o rotulo `RUNNER`. Um `-latest`, ou um rotulo diferente dos outros, reprova.
 *
 * SUBIR DE IMAGEM e uma decisao com PR: muda-se o `RUNNER` aqui e os `runs-on:` todos de uma vez, e o CI do PR mostra
 * o que parte. A pergunta "ja ha uma LTS nova estavel, ou o fim da fixada foi anunciado?" vive no `/backlog-review`.
 *
 * NUM DERIVADO NAO CORRE (SKIP visivel): os workflows sao dele, e a escolha do runner tambem. Um derivado com
 * `ubuntu-latest` nao fica vermelho por um `/upgrade`.
 */

/** O rotulo fixo. Mudar aqui e nos `runs-on:` de uma vez (o guard reprova o meio-termo). */
export const RUNNER = "ubuntu-24.04";

/** Onde se procuram os `runs-on:`. */
export const ONDE = [".github/workflows", "src/docs/exemplos"];

/** Os `runs-on:` de um texto YAML: `{ linha, valor }`, o valor sem aspas nem comentario. */
export function runsOnDe(texto) {
  const out = [];
  (texto ?? "").split("\n").forEach((l, i) => {
    const m = /^\s*runs-on:\s*(.*?)\s*(?:#.*)?$/.exec(l);
    if (m) out.push({ linha: i + 1, valor: m[1].replace(/^(['"])(.*)\1$/, "$2") });
  });
  return out;
}

export function guardRunners({ read, warn, ok, skip, listDir, ehDerivado }) {
  if (ehDerivado()) {
    skip("Guard 22 (runner fixo) — num derivado os workflows sao dele, e o runner tambem");
    return 0;
  }
  const achados = [];
  let ficheiros = 0;
  for (const pasta of ONDE) {
    for (const ext of [".yml", ".yaml"]) {
      for (const nome of listDir(pasta, ext) ?? []) {
        const f = `${pasta}/${nome}${ext}`;
        ficheiros++;
        for (const r of runsOnDe(read(f))) achados.push({ f, ...r });
      }
    }
  }
  if (ficheiros === 0) {
    // Sem workflows nem exemplos nao ha o que verificar — dito, e nao calado (uma fixture minima).
    skip(`Guard 22 (runner fixo) — sem workflows nem exemplos em ${ONDE.join(" nem ")}`);
    return 0;
  }
  if (achados.length === 0) {
    // Ha workflows e nenhum `runs-on:` (um que so chama outros, `uses:` no job): nada a verificar — dito, e nao calado.
    skip(`Guard 22 (runner fixo) — ${ficheiros} workflow(s) e nenhum \`runs-on:\` em ${ONDE.join(" nem ")}`);
    return 0;
  }
  let mal = 0;
  for (const r of achados) {
    if (r.valor === RUNNER) continue;
    mal++;
    warn(
      `${r.f}:${r.linha} — \`runs-on: ${r.valor}\`, e o rotulo fixo do template e \`${RUNNER}\` (#488: um \`-latest\` muda de ` +
        "imagem quando o GitHub quer). Subir de imagem e mudar o `RUNNER` de `guards/runners.mjs` e todos os `runs-on:` num PR"
    );
  }
  if (mal === 0) ok(`Guard 22: ${achados.length} \`runs-on:\`, todos em ${RUNNER}`);
  return 1;
}
