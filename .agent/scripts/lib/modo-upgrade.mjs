/**
 * O MODO do `/upgrade` de um projeto derivado (#429): completo (com a maquinaria) ou parcial (sem ela) — {{PROJECT_NAME}}
 *
 * A MARCA DECIDE; o disco so propoe. O disco nao distingue "decidiu nao a trazer" de "perdeu-a por engano", e por isso
 * a linha `modo:` do `.agent/.template-version` e a resposta; o unico sinal do disco e o job `guard-tests` do `ci.yml`
 * (lido por quem chama, com o leitor da 2b: um job comentado conta como ausente). Dois sinais no disco inventavam um
 * estado "indeciso" em que caiam as fixtures de hoje (o `tests/` sem o job, ou o contrario).
 *
 *   modo: na marca | job `guard-tests` | resultado
 *   parcial        | ausente           | parcial
 *   parcial        | presente          | contradicao
 *   completo       | presente          | completo
 *   completo       | ausente           | contradicao
 *   (nenhum)       | presente          | completo      (o comportamento de hoje)
 *   (nenhum)       | ausente           | parcial       (o upgrade propoe-no, e pergunta antes de o escrever)
 *
 * Um `modo:` que nao e nenhum dos dois e uma contradicao: a marca diz algo que ninguem le.
 * O modo parcial e uma variante do Modo A (com marca). Sem marca utilizavel e o Modo B, e quem chama recusa ANTES.
 *
 * NAO e um entry point, e nao recusa: decide. O `PARES` muta cada `resultado(` (a suite `test-modo-upgrade.mjs`).
 */

/** O valor da linha `modo:` da marca (tudo o que vem depois, aparado), ou `null` sem ela. A linha INTEIRA, e nao so
 *  uma palavra (#508): um `modo: parcial (porque)` lido como "sem `modo:`" era o `TP2`; lido inteiro, nao e
 *  `parcial` nem `completo`, e cai na contradicao, que diz a linha e como a corrigir. */
export function modoDaMarca(marca) {
  // `trim()` e nao `[ \t]*`: um espaco nao separavel colado de um editor (U+00A0) nao vira um valor que parece valido.
  return /^modo:(.*)$/m.exec(marca ?? "")?.[1]?.trim() ?? null;
}

// `soMarca`: o disco nao entra na contradicao — a linha `modo:` nao se le (#508); corrige-se so a marca.
const resultado = (modo, porque, soMarca = false) => ({ modo, porque, soMarca });

/**
 * @param {{ marca: string | null, temGuardTests: boolean }} p
 * @returns {{ modo: "completo" | "parcial" | "contradicao", porque: string }}
 */
export function modoDoProjeto({ marca, temGuardTests }) {
  const m = modoDaMarca(marca);
  const job = temGuardTests ? "tem o job `guard-tests`" : "nao tem o job `guard-tests`";
  // Um `resultado(` por linha: cada um e uma linha da tabela, e a varredura mede-os um a um.
  if (m === "parcial" && temGuardTests) return resultado("contradicao", `a marca diz \`modo: parcial\` e o ci.yml ${job}`);
  if (m === "parcial") return resultado("parcial", `a marca diz \`modo: parcial\` (e o ci.yml ${job})`);
  if (m === "completo" && temGuardTests) return resultado("completo", `a marca diz \`modo: completo\` (e o ci.yml ${job})`);
  if (m === "completo") return resultado("contradicao", `a marca diz \`modo: completo\` e o ci.yml ${job}`);
  if (m !== null) return resultado("contradicao", `a marca diz \`modo: ${m}\`, que nao e \`parcial\` nem \`completo\` (sozinho na linha: um comentario vai noutra)`, true);
  if (temGuardTests) return resultado("completo", `a marca nao tem \`modo:\` e o ci.yml ${job}`);
  return resultado("parcial", `a marca nao tem \`modo:\` e o ci.yml ${job}: propor o modo parcial, e perguntar antes de o escrever`);
}

/** O que o `simulate-upgrade --projeto` diz quando nao mede (o modo nao e `completo`). Sai != 0 nos dois. */
export function mensagemDoModo({ modo, porque, soMarca = false }) {
  if (modo === "parcial") {
    return (
      `projeto sem a maquinaria: modo parcial, nada medido aqui (${porque}). Se o projeto traz a maquinaria, o job ` +
      "falta. O upgrade parcial esta em `src/docs/upgrade-parcial.md` (no template); no projeto, verificar a mao: o " +
      "`node .claude/hooks/tests/test-hooks.mjs`, o `.githooks/commit-msg` novo sobre os ultimos commits, e o " +
      "`node .agent/scripts/check-backlog.mjs`"
    );
  }
  if (soMarca) return `a linha \`modo:\` da marca nao se le: ${porque}. Corrigir SO a marca (o ci.yml nao entra) — ver \`src/docs/upgrade-parcial.md\``;
  return `a marca e o disco contradizem-se: ${porque}. Corrigir a marca (\`modo:\`) ou o ci.yml antes de medir — ver \`src/docs/upgrade-parcial.md\``;
}
