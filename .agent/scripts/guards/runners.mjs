/**
 * Guard 22: os runners do CI do template num so rotulo fixo (#488) — {{PROJECT_NAME}}
 *
 * PORQUE EXISTE: o `ubuntu-latest` muda de imagem quando o GitHub decide (passou para o Ubuntu 26 a partir de 19 out
 * 2026), e com a imagem mudam as versoes das ferramentas. Ja mordeu um derivado: uma suite fixava a frase de erro do
 * `git`, e o `git` da imagem nova dizia outra (#400). Os exemplos de CI dos derivados ja fixavam `ubuntu-24.04`; o CI
 * do proprio template nao. Fixar sem rede nao chega: o proximo workflow novo voltava ao `-latest` sem ninguem ver.
 *
 * O QUE VERIFICA: todo o `runs-on:` dos workflows do template (`.github/workflows/`) e dos exemplos dos derivados
 * (`src/docs/exemplos/`) e o rotulo `RUNNER`. Um `-latest`, ou um rotulo diferente dos outros, reprova. Nos exemplos,
 * tambem o `runs-on:` COMENTADO dentro de um bloco `MODO COMPLETO (x) inicio ... fim` (#534): e o que um derivado
 * privado descomenta (o job `guard-tests` do `ci-sem-maquinaria.yml`), e uma subida que o esquecesse passava verde. So
 * os blocos de `BLOCOS_MODO_COMPLETO` (`lib/exemplo-ci.mjs`, #545); um bloco com outra letra no exemplo real reprova o
 * caso do G22 sobre ele (`tests-runners.mjs`), e nao fica de fora calado.
 *
 * SUBIR DE IMAGEM e uma decisao com PR: muda-se o `RUNNER` aqui e os `runs-on:` todos de uma vez, e o CI do PR mostra
 * o que parte. A pergunta "ja ha uma LTS nova estavel, ou o fim da fixada foi anunciado?" vive no `/backlog-review`.
 *
 * NUM DERIVADO NAO CORRE (SKIP visivel): os workflows sao dele, e a escolha do runner tambem. Um derivado com
 * `ubuntu-latest` nao fica vermelho por um `/upgrade`. Numa ADOCAO em curso (o `.agent/adocao.json` existe e a marca
 * ainda nao, #524) verifica SO os ficheiros que o manifesto diz que vieram do template (`copiados` e `iguais`): os
 * outros sao do projeto. Um manifesto ilegivel avisa, em vez de desligar o guard.
 */
import { BLOCOS_MODO_COMPLETO, descomenta, marcaFim, marcaInicio } from "../lib/exemplo-ci.mjs";

/** O rotulo fixo. Mudar aqui e nos `runs-on:` de uma vez (o guard reprova o meio-termo). */
export const RUNNER = "ubuntu-24.04";

/** Onde se procuram os `runs-on:`. */
export const ONDE = [".github/workflows", "src/docs/exemplos"];

/** Os `runs-on:` de um texto YAML: `{ linha, valor }`, o valor sem aspas nem comentario. Com `modoCompleto`, as linhas
 *  comentadas DENTRO de um bloco `MODO COMPLETO` leem-se descomentadas (o `descomenta` e os marcadores de
 *  `lib/exemplo-ci.mjs`, a definicao unica, #545): a linha fica a do ficheiro. Fora dos blocos, um comentario continua
 *  a nao contar. */
export function runsOnDe(texto, { modoCompleto = false } = {}) {
  const out = [];
  let dentro = false;
  (texto ?? "").split("\n").forEach((l, i) => {
    if (modoCompleto && BLOCOS_MODO_COMPLETO.some((b) => l.includes(marcaInicio(b)))) dentro = true;
    else if (modoCompleto && BLOCOS_MODO_COMPLETO.some((b) => l.includes(marcaFim(b)))) dentro = false;
    const m = /^\s*runs-on:\s*(.*?)\s*(?:#.*)?$/.exec(dentro ? descomenta(l) : l);
    if (m) out.push({ linha: i + 1, valor: m[1].replace(/^(['"])(.*)\1$/, "$2") });
  });
  return out;
}

export function guardRunners({ read, warn, ok, skip, listDir, ehDerivado }) {
  if (ehDerivado()) {
    skip("Guard 22 (runner fixo) — num derivado os workflows sao dele, e o runner tambem");
    return 0;
  }
  // Uma ADOCAO em curso (#524): o `adotar-template.mjs` copiou o `BOOTSTRAP.md` e o §2.0 ainda nao gravou a marca, logo
  // o `ehDerivado` diz "template" — mas so os workflows que o manifesto lista vieram do template; os outros sao do
  // PROJETO. Pelo CONTEUDO do manifesto, e nao por ele existir: um `adocao.json` esquecido no template desligava o guard
  // inteiro, com o CI verde (leitura independente do #524).
  let doTemplate = null;
  const manifesto = read(".agent/adocao.json");
  if (manifesto !== null) {
    let m = null;
    try {
      m = JSON.parse(manifesto);
    } catch {
      m = null;
    }
    if (!Array.isArray(m?.copiados) || !Array.isArray(m?.iguais)) {
      warn("Guard 22 (runner fixo) — o `.agent/adocao.json` e ilegivel (JSON invalido, ou sem `copiados`/`iguais`): nao sei que workflows vieram do template");
      return 1;
    }
    doTemplate = new Set([...m.copiados, ...m.iguais]);
  }
  const achados = [];
  let ficheiros = 0;
  for (const pasta of ONDE) {
    for (const ext of [".yml", ".yaml"]) {
      for (const nome of listDir(pasta, ext) ?? []) {
        const f = `${pasta}/${nome}${ext}`;
        if (doTemplate && !doTemplate.has(f)) continue;
        ficheiros++;
        for (const r of runsOnDe(read(f), { modoCompleto: pasta === "src/docs/exemplos" })) achados.push({ f, ...r });
      }
    }
  }
  // Um manifesto que nao lista NENHUM workflow nem exemplo do disco nao e uma adocao real (nela, os exemplos de
  // `src/docs/exemplos/` vem sempre do template): e um `adocao.json` esquecido, que desligava o guard em SKIP (#534).
  if (ficheiros === 0 && doTemplate) {
    warn("Guard 22 (runner fixo) — o `.agent/adocao.json` nao lista nenhum workflow nem exemplo que esteja no disco: numa adocao os exemplos vem do template; no template, um manifesto esquecido — apaga-lo");
    return 1;
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
