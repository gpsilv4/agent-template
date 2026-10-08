/**
 * As CATEGORIAS do `/upgrade`: o que se copia, o que e do projeto e o que mudou de casa — {{PROJECT_NAME}}
 *
 * Saiu do `lib/upgrade-mecanico.mjs` quando ele chegou as 500 linhas (#243). A fronteira e a do
 * proprio motor: aqui os DADOS (as listas e o que conta como substituivel), la a logica que os
 * aplica e que escreve por cima dos ficheiros de um consumidor. O motor reexporta tudo, logo
 * quem ja os importava de la nao muda.
 *
 * Nao tem sitios de recusa: sao listas, e um percurso de arvore.
 */
import { readdirSync } from "fs";
import { join } from "path";

/** Tipos que a Fase 2.1 do BOOTSTRAP manda varrer. Curta de mais, sobram placeholders — e o
 *  Guard 13 denuncia-o no fim, por desenho. */
const SUBSTITUIVEIS = /\.(md|mdc|mjs|json|yml|yaml|toml)$/;
const SUBSTITUIVEIS_SEM_EXT = new Set(["LICENSE", "CODEOWNERS"]);
export const substituivel = (rel, nome) =>
  rel.startsWith(".githooks/") || SUBSTITUIVEIS.test(nome) || SUBSTITUIVEIS_SEM_EXT.has(nome);

/** `{{args}}` e um placeholder dos command templates do Gemini, nao do bootstrap. */
export const PLACEHOLDER = /\{\{(?!args\})[A-Z_]+\}\}/g;

/** Percorre uma arvore em profundidade. `.git` fora — nao e conteudo do projeto. */
export function andaFicheiros(base, fn, rel = "") {
  for (const e of readdirSync(join(base, rel), { withFileTypes: true })) {
    const sub = rel ? `${rel}/${e.name}` : e.name;
    if (e.name === ".git") continue;
    if (e.isDirectory()) andaFicheiros(base, fn, sub);
    else fn(sub, e.name);
  }
}

/** Os prefixos que o upgrade COPIA, e portanto os unicos sobre os quais pode dizer que algo
 *  "saiu do template". Fora deles vive o projeto, e o que la desaparece nao e da nossa conta.
 *
 *  `.agent/rules/` fica de FORA de proposito: o upgrade so traz de la o catalogo de
 *  anti-padroes do template, e as restantes rules sao diff-e-decidir. Propor apagar uma rule
 *  que o projeto customizou seria propor apagar trabalho.
 *
 *  `.github/scripts/` entrou com o `release-da-tag.sh` (#277): e maquinaria do template como as
 *  outras duas, e a suite dele vive em `.agent/scripts/tests/` — copiada sem ele, reprovava em
 *  todo o projeto atualizado (medido pelo `simulate-upgrade`). */
export const PREFIXOS_COPIADOS = [".agent/scripts/", ".claude/hooks/", ".github/scripts/"];

/** Constantes que MUDARAM DE CASA entre versoes, e para onde foram.
 *
 *  PORQUE EXISTE: quando uma constante sai da logica para `config/`, um consumidor que a tenha
 *  customizado **perde a customizacao em silencio** — o ficheiro da logica e substituido, a
 *  entrada sai de `CONSTANTES_DO_PROJETO`, e o `config/` novo chega com os defaults ("copiar se
 *  AUSENTE"). O `upgrade-why.md` ja o diz melhor: *"diferenca de output apanha o que some, nao
 *  apanha um default que regressa"*.
 *
 *  NAO MIGRA AUTOMATICAMENTE, e e deliberado: o formato pode ter mudado com a mudanca de casa
 *  (aqui mudou — `TEST_GLOBS` passou a ser a concatenacao da config com um glob do template), e
 *  um motor que adivinhasse o merge entregava uma configuracao que ninguem escreveu. Avisa, e
 *  quem decide e o consumidor.
 *
 *  ENCOLHE COM O TEMPO: uma entrada so serve enquanto houver consumidores a saltar por cima da
 *  versao em que a mudanca aconteceu. Ao remover uma, remover tambem o seu caso de teste. */
export const MIGRACOES = [
  { rel: ".agent/scripts/check-test-surface.mjs", nome: "TEST_GLOBS", para: ".agent/scripts/config/superficie-de-teste.mjs" },
  { rel: ".agent/scripts/check-test-surface.mjs", nome: "CONFIG_GLOBS", para: ".agent/scripts/config/superficie-de-teste.mjs" },
  // As pastas de scripts do projeto que o Guard 20 procura (#176).
  { rel: ".agent/scripts/guards/citacoes.mjs", nome: "MAQUINARIA", para: ".agent/scripts/config/guards-do-projeto.mjs" },
];

// So as categorias que a tabela do `/upgrade` marca como mecanicas. As de julgamento ("diff e
// decidir caso a caso") ficam com a versao ANTIGA — ver "o que este modulo nao faz" no cabecalho
// do `upgrade-mecanico.mjs`.

/** As constantes que sao do PROJETO e sobrevivem a copia. Fonte: a tabela de categorias do
 *  `.agent/workflows/upgrade.md`.
 *
 *  Escrita aqui e nao lida de la porque parsear a tabela amarra isto a formatacao de um
 *  markdown. O preco e poder envelhecer por OMISSAO (uma constante nova que ninguem
 *  acrescente); nao envelhece por APODRECIMENTO, porque uma que desapareca do ficheiro novo
 *  reprova em voz alta no motor (`aplicaUpgradeMecanico`, em `upgrade-mecanico.mjs`).
 *
 *  Escrever esta lista ja rendeu: a tabela do workflow dizia `CONTAGENS` em
 *  `check-test-surface.mjs`, e ela vive em `surface-patterns.mjs`. Um consumidor a seguir a
 *  instrucao copiava o ficheiro por inteiro e perdia as suas contagens em silencio. */
// As duas dos BUNDLES sairam desta lista: `TARGETS` e `ALVOS_REPROVAM` mudaram-se para
// `.agent/scripts/config/bundles.mjs`, que o `/upgrade` nunca SUBSTITUI (mas copia se o
// consumidor ainda nao a tiver — ver o filtro em `trazerDoHead`, no `upgrade-mecanico.mjs`). Preservar por nome era a
// mitigacao; separar a configuracao da logica **fecha a classe** — a lista deixa de ter de
// crescer a cada decisao nova, e era por ela envelhecer que a suspensao do gate se perdeu numa
// ronda real, em silencio.
//
// As que ficam sao as que ainda vivem dentro de ficheiros de logica. A lista encolhe a cada
// uma que se mude, e o objectivo e **desaparecer**.
export const CONSTANTES_DO_PROJETO = [
  [".agent/scripts/check-doc-versions.mjs", "BANNED"],
  [".agent/scripts/guards/versions.mjs", "CHECKS"],
  [".agent/scripts/lib/surface-patterns.mjs", "CONTAGENS"],
];
