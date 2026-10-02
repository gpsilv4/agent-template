/**
 * "O projeto nao mexeu neste ficheiro" — {{PROJECT_NAME}}
 *
 * A pergunta que o motor do `/upgrade` faz a cada ficheiro: o consumidor tem-no como a tag o
 * deixou, ou alterou-o? Com placeholders, igualdade de texto responde mal: o bootstrap pos la o
 * nome do projeto, e quem mede (a 2b) nao o sabe. Medido num derivado real: 68 de 71 ficheiros
 * davam "alterado" so por isso (#176), e a 2b trazia 2 documentos onde eram 7 (#179).
 *
 * LINHA A LINHA, e sem regex com varios grupos (#179, leitor independente): com quatro ou mais
 * placeholders numa linha, uma regex do ficheiro inteiro voltava atras por todas as combinacoes
 * da linha anterior a cada falha mais abaixo — medido, 5 por linha davam 6,9 s. Por linha:
 *  - sem placeholder, igualdade;
 *  - com UM, o inicio e o fim da linha tem de bater, e o meio e o valor (linear);
 *  - com VARIOS, os pedacos de texto tem de aparecer por ordem (linear), e a linha NAO da
 *    valores: dois placeholders lado a lado nao dizem onde acaba um e comeca o outro.
 * O mesmo `X` com dois valores no ficheiro e uma alteracao do projeto, e nao o bootstrap.
 */

const UM_PLACEHOLDER = /\{\{(?!args\})([A-Z_]+)\}\}/;

/** Os VALORES que o consumidor tem no lugar dos placeholders da tag — `{ X: valor }` —, ou `null`
 *  se o ficheiro nao esta intacto a menos deles. */
export function capturaPlaceholders(doConsumidor, daTag) {
  const g = new RegExp(UM_PLACEHOLDER.source, "g");
  if (!g.test(daTag)) return doConsumidor === daTag ? {} : null;
  const tl = daTag.split("\n");
  const cl = doConsumidor.split("\n");
  if (tl.length !== cl.length) return null;
  const vals = {};
  for (let i = 0; i < tl.length; i++) {
    const partes = tl[i].split(new RegExp(UM_PLACEHOLDER.source, "g"));
    const pedacos = partes.filter((_, j) => j % 2 === 0); // o `split` com grupo intercala os nomes
    const nomes = partes.filter((_, j) => j % 2 === 1);
    const c = cl[i];
    if (nomes.length === 0) {
      if (c !== tl[i]) return null;
      continue;
    }
    const [ini, fim] = [pedacos[0], pedacos[pedacos.length - 1]];
    if (!c.startsWith(ini) || !c.endsWith(fim) || c.length < ini.length + fim.length) return null;
    if (nomes.length === 1) {
      const v = c.slice(ini.length, c.length - fim.length);
      if (nomes[0] in vals && vals[nomes[0]] !== v) return null;
      vals[nomes[0]] = v;
      continue;
    }
    let pos = ini.length;
    for (const meio of pedacos.slice(1, -1)) {
      const k = c.indexOf(meio, pos);
      if (k === -1 || k > c.length - fim.length) return null;
      pos = k + meio.length;
    }
    if (pos > c.length - fim.length) return null;
  }
  return vals;
}

/** `doConsumidor` e `daTag` iguais, a menos do valor de cada placeholder da tag. */
export const intactoAMenosDePlaceholders = (doConsumidor, daTag) => capturaPlaceholders(doConsumidor, daTag) !== null;

/** Os valores dos placeholders DESTE projeto, recolhidos ficheiro a ficheiro (#179). Um so
 *  `substituto` fazia de todos os `{{ X }}` — na 2b um nome de fachada —, e o motor lia como
 *  customizado qualquer documento com outro placeholder ou com o nome real.
 *
 *  `recolhe` junta o que um ficheiro intacto deu; `substitui` escreve, por cada `X`, o valor
 *  unanime — e o `substituto` para um `X` que nunca apareceu intacto, que e o que acontecia a
 *  todos; `emConflito` descreve os `X` com mais de um valor, ou `null`. */
export function valoresDoProjeto(substituto) {
  const valores = new Map();
  const g = new RegExp(UM_PLACEHOLDER.source, "g");
  return {
    recolhe(vals) {
      for (const [k, v] of Object.entries(vals ?? {})) {
        // Vazio, ou o proprio `{{ X }}` por substituir (um ficheiro que o bootstrap nao varreu):
        // nao e um valor do projeto, e recolhe-lo dava um conflito falso contra o verdadeiro.
        if (v === "" || new RegExp(`^${UM_PLACEHOLDER.source}$`).test(v)) continue;
        if (!valores.has(k)) valores.set(k, new Set());
        valores.get(k).add(v);
      }
    },
    substitui: (t) => t.replace(g, (_, k) => (valores.get(k)?.size === 1 ? [...valores.get(k)][0] : substituto)),
    // So os `X` em conflito que `usados` vai precisar: um conflito num placeholder que nenhum
    // ficheiro a escrever leva nao decide nada (#179, leitor independente). E ha divergencias
    // legitimas — o `TEST_FRAMEWORK` que o bootstrap adapta por ficheiro.
    emConflito(usados) {
      const c = [...valores].filter(([k, vs]) => vs.size > 1 && usados.has(k));
      return c.length ? c.map(([k, vs]) => `${k} = ${[...vs].map((v) => JSON.stringify(v)).join(" / ")}`).join("; ") : null;
    },
  };
}

