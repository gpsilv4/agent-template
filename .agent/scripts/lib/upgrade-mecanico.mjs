/**
 * O upgrade MECANICO de um projeto derivado — {{PROJECT_NAME}}
 *
 * Extraido do `simulate-upgrade.mjs` quando este passou as 500 linhas (Guard 17). A divisao
 * nao e so de tamanho: isto e a parte **arriscada** — a que escreve por cima dos ficheiros de
 * um consumidor — e num modulo proprio pode ser exercitada sem montar a simulacao inteira.
 *
 * O QUE E "MECANICO": so as categorias que a tabela do `.agent/workflows/upgrade.md` resolve
 * sem julgamento. A regra que as governa a todas esta escrita la em cima da tabela: **um
 * ficheiro que o projeto nao modificou desde o bootstrap traz-se por inteiro**; o que ele
 * customizou fica como esta, e e ai que o julgamento vive.
 *
 * O que este modulo **nao** faz, e nao deve passar a fazer sem alguem decidir: integrar
 * ficheiros customizados. Isso e leitura, nao mecanica.
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync, cpSync, existsSync } from "fs";
import { execFileSync } from "child_process";
import { join, dirname } from "path";

/** `null` em vez de excepcao: "nao existe" e "nao consegui ler" pedem accoes diferentes a
 *  quem chama, e colapsar as duas e o `TP2`. */
export const leOuNull = (p) => {
  try {
    return readFileSync(p, "utf8");
  } catch {
    return null;
  }
};

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

// So as categorias que a tabela do `/upgrade` marca como mecanicas. As de julgamento ("diff e
// decidir caso a caso") ficam com a versao ANTIGA — ver o LIMITE no cabecalho.

/** As constantes que sao do PROJETO e sobrevivem a copia. Fonte: a tabela de categorias do
 *  `.agent/workflows/upgrade.md`.
 *
 *  Escrita aqui e nao lida de la porque parsear a tabela amarra isto a formatacao de um
 *  markdown. O preco e poder envelhecer por OMISSAO (uma constante nova que ninguem
 *  acrescente); nao envelhece por APODRECIMENTO, porque uma que desapareca do ficheiro novo
 *  reprova em voz alta la em baixo.
 *
 *  Escrever esta lista ja rendeu: a tabela do workflow dizia `CONTAGENS` em
 *  `check-test-surface.mjs`, e ela vive em `surface-patterns.mjs`. Um consumidor a seguir a
 *  instrucao copiava o ficheiro por inteiro e perdia as suas contagens em silencio. */
const CONSTANTES_DO_PROJETO = [
  [".agent/scripts/check-bundle-sizes.mjs", "TARGETS"],
  [".agent/scripts/check-doc-versions.mjs", "BANNED"],
  [".agent/scripts/guards/versions.mjs", "CHECKS"],
  [".agent/scripts/check-test-surface.mjs", "TEST_GLOBS"],
  [".agent/scripts/check-test-surface.mjs", "CONFIG_GLOBS"],
  [".agent/scripts/surface-patterns.mjs", "CONTAGENS"],
];

/**
 * Aplica ao consumidor em `dir` as categorias MECANICAS do `/upgrade`, a partir do template
 * em `root`. `tag` e a versao de onde o projeto saiu — a comparacao e sempre contra ela, e
 * nao contra o template nu, senao tudo aparece customizado.
 *
 * `fatal` recebe a razao e NAO retorna: qualquer coisa que este modulo nao consiga fazer com
 * seguranca tem de parar tudo. Escrever por cima dos ficheiros de um consumidor as cegas e
 * pior do que nao fazer upgrade nenhum.
 *
 * @returns {{repostas: number, trazidos: number, placeholders: number}} o que mediu
 */
export function aplicaUpgradeMecanico({ dir, root, tag, fatal, substituto, constantes = CONSTANTES_DO_PROJETO }) {
  
  /** O bloco `const NOME = ...` ate a linha que fecha na coluna 0 (`};` ou `];`). Devolve `null`
   *  se nao existir — e quem chama decide, porque "nao ha" e "nao consegui ler" pedem accoes
   *  diferentes (`TP2`). */
  function blocoDaConstante(texto, nome) {
    if (texto === null) return null;
    const linhas = texto.split("\n");
    const i = linhas.findIndex((l) => l.startsWith(`const ${nome} = `));
    if (i === -1) return null;
    // Uma constante de uma linha so (`const X = [];`) fecha nela propria.
    if (/;\s*$/.test(linhas[i]) && !/[[{]\s*$/.test(linhas[i])) return linhas[i];
    const fim = linhas.findIndex((l, n) => n > i && /^[\]}]\);?;?$|^[\]}];$/.test(l));
    if (fim === -1) return null;
    return linhas.slice(i, fim + 1).join("\n");
  }
  
  /** O conteudo de um ficheiro NA TAG. `null` quando nao existia — e quem chama decide, porque
   *  "nao existia" e "nao consegui ler" pedem accoes diferentes (`TP2`). */
  const tagFicheiro = (rel) => {
    try {
      return execFileSync("git", ["show", `${tag}:${rel}`], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    } catch {
      return null;
    }
  };
  
  // Guardar os blocos do projeto ANTES de copiar por cima.
  const guardados = [];
  for (const [rel, nome] of constantes) {
    const antigo = blocoDaConstante(leOuNull(join(dir, rel)), nome);
    const novo = blocoDaConstante(leOuNull(join(root, rel)), nome);
    // A ORDEM importa: a constante tem de existir no template novo ANTES de se perguntar se o
  // projeto a customizou. Ao contrario, um projeto que nao lhe tenha tocado saltava por cima
  // da verificacao e a tabela do `/upgrade` ficava a mandar preservar uma constante que ja
  // nao existe — instrucao impossivel, em silencio. Apanhado pelo controlo negativo.
  //
  // A **mesma regra geral**, ao nivel do bloco: se o bloco do consumidor for igual ao que o
    // template de origem tinha, ele nao lhe tocou — e preserva-lo era congelar prosa velha.
    //
    // Nao e teorico: os comentarios dentro de `TEST_GLOBS` e `CONTAGENS` citam anti-padroes do
    // template, e repo-los por cima do ficheiro novo reintroduzia citacoes que a renomeacao
    // matou. O Guard 15 apanhava-as — no consumidor, depois de o upgrade "correr bem".
    //
    // Quem CUSTOMIZOU de facto fica com a sua versao, comentarios incluidos; se ela carregar
    // citacoes velhas, isso e trabalho de migracao real e aparece na lista da FASE 1.
    if (novo === null) {
      // A constante saiu do ficheiro (renomeada, movida, apagada) e a tabela do `/upgrade`
      // continua a mandar preserva-la la. Um consumidor seguiria uma instrucao impossivel.
      fatal(`${nome} nao existe em ${rel} no HEAD — a tabela de categorias do upgrade.md esta desatualizada`);
    }

    const naTagBruto = blocoDaConstante(tagFicheiro(rel), nome);
    const naTagSubst = naTagBruto === null ? null : naTagBruto.replace(PLACEHOLDER, substituto);
    if (antigo !== null && antigo === naTagSubst) continue; // intacto: fica o do template novo
    if (antigo !== null) guardados.push([rel, nome, antigo]);
  }
  
  /** Copia recursiva de uma pasta do HEAD para a copia. */
  function trazerDoHead(rel) {
    const origem = join(root, rel);
    if (!existsSync(origem)) fatal(`${rel} nao existe no HEAD — nada a trazer`);
    cpSync(origem, join(dir, rel), { recursive: true });
  }
  
  // (i) `.agent/scripts/**` — copia limpa. (ii) O catalogo de anti-padroes do TEMPLATE, por
  // inteiro: e dele, e os IDs dele sao os mesmos em todos os projetos. (iii) Os hooks.
  trazerDoHead(".agent/scripts");
  trazerDoHead(".claude/hooks");
  for (const rel of [".agent/rules/anti-patterns-template.md"]) {
    const c = leOuNull(join(root, rel));
    if (c === null) fatal(`${rel} nao existe no HEAD`);
    writeFileSync(join(dir, rel), c);
  }
  
  // Repor as constantes do projeto por cima da copia. E o passo que a tabela chama "preservando".
  let repostas = 0;
  for (const [rel, nome, bloco] of guardados) {
    const p = join(dir, rel);
    const c = leOuNull(p);
    const alvo = blocoDaConstante(c, nome);
    if (alvo === null) continue; // ja reprovou acima se faltasse no HEAD
    // O replacer e uma FUNCAO, nao a string. Com a string, o `$` no texto de substituicao e
    // interpretado como padrao: `$'` significa "tudo o que vem depois do match", `$&` o proprio
    // match. E as constantes que este codigo move sao **listas de regexes** — `\.mjs$'` aparece
    // la dentro, e a substituicao corrompia-se a si propria. Medido: o `check-test-surface.mjs`
    // saiu da copia truncado a meio de um comentario, com `SyntaxError: Unexpected token 'const'`.
    // Uma funcao nao interpreta nada.
    writeFileSync(p, c.replace(alvo, () => bloco));
    repostas++;
  }
  // (iv) O CABECALHO do `anti-patterns.md`, sem tocar nas ENTRADAS do projeto.
  //
  // A instrucao dizia "nunca tocar" neste ficheiro. Esta certo para as entradas — sao os `APn`
  // do projeto e nao existem em mais sitio nenhum — e errado para o cabecalho, que e prosa do
  // template e cita os IDs dele. Depois da separacao de prefixos, o cabecalho antigo ficou a
  // citar IDs que deixaram de existir: o consumidor levava vermelho num ficheiro que lhe
  // disseram para nao tocar, e a mensagem nao lhe dizia porque.
  //
  // Esta simulacao foi o que o mostrou, e na corrida em que o mostrou a afirmacao que o PR do
  // namespace fez — "o Guard 15 diz ficheiro e linha" — foi verificada pela primeira vez.
  {
    const rel = ".agent/rules/anti-patterns.md";
    // O `---` separa cabecalho de entradas nos dois lados. Se mudar, ISTO REPROVA em vez de
    // adivinhar: uma divisao errada aqui apaga anti-padroes que nao existem noutro sitio.
    const corta = (t) => {
      if (t === null) return null;
      const i = t.indexOf("\n---\n");
      return i > 0 ? [t.slice(0, i + 5), t.slice(i + 5)] : null;
    };
    const doTemplate = corta(leOuNull(join(root, rel)));
    const doProjeto = corta(leOuNull(join(dir, rel)));
    if (doTemplate === null || doProjeto === null) {
      fatal(`nao consegui separar o cabecalho das entradas em ${rel} — o separador '---' mudou de forma`);
    }
    writeFileSync(join(dir, rel), doTemplate[0] + doProjeto[1]);
  }
  
  // (v) **Nao customizado -> traz-se o novo.** A regra ja existia no workflow, so que escrita
  // para os workflows ("copia se nao customizados; diff se sim"); generaliza para tudo o que o
  // template produz, e e mecanica: se o ficheiro do consumidor for igual ao do template ANTIGO,
  // ele nao lhe tocou, logo nao ha julgamento nenhum a fazer.
  //
  // Foi a simulacao que obrigou a isto. Depois de corrigir o cabecalho do `anti-patterns.md`
  // apareceu o `hooks-guide.md` a citar um ID morto, e a seguir apareceriam os outros: o custo
  // real de uma renomeacao de IDs e **todo o documento do template de que o consumidor guarda
  // uma copia antiga**. Trazer um a um era uma lista a envelhecer; esta regra nao envelhece.
  //
  // O que NAO entra: `.agent/context/` (estado do projeto) e o que ja foi tratado acima. E os
  // ficheiros que o projeto MODIFICOU ficam com a versao dele — e ai que o julgamento vive, e e
  // essa mistura que esta simulacao existe para exercitar.
  let trazidos = 0;
  {
    const JA_TRATADO = new Set([".agent/rules/anti-patterns.md", ".agent/rules/anti-patterns-template.md"]);
    andaFicheiros(root, (sub, nome) => {
      // Os da RAIZ entram: `README.md`, `CLAUDE.md`, `CONTRIBUTING.md` sao documentos do
      // template como os outros, e citam anti-padroes na mesma. Ficaram de fora na primeira
      // versao e foi o `README.md` — o ficheiro mais lido do repo — a aparecer com uma citacao
      // morta. Num consumidor real estes costumam estar customizados, e ai a regra deixa-os em
      // paz sozinha; nao e preciso excepcao nenhuma.
      const naRaiz = !sub.includes("/");
      if (!naRaiz && !sub.startsWith(".agent/") && !sub.startsWith("src/docs/") && !sub.startsWith(".claude/")) return;
      if (sub.startsWith(".agent/context/") || sub.startsWith(".agent/scripts/") || sub.startsWith(".claude/hooks/")) return;
      if (JA_TRATADO.has(sub) || !substituivel(sub, nome)) return;
      const antigo = tagFicheiro(sub);
      if (antigo === null) return;
      const doConsumidor = leOuNull(join(dir, sub));
      // A comparacao e contra a versao antiga **com os placeholders ja substituidos**, que e o
      // estado em que o ficheiro ficou depois do bootstrap. Comparar com o bruto dava tudo por
      // customizado e a regra nunca disparava.
      if (doConsumidor === null || doConsumidor !== antigo.replace(PLACEHOLDER, substituto)) return;
      const novoC = leOuNull(join(root, sub));
      if (novoC === null || novoC === antigo) return;
      mkdirSync(dirname(join(dir, sub)), { recursive: true });
      writeFileSync(join(dir, sub), novoC);
      trazidos++;
    });
  }
  
  // Os placeholders OUTRA VEZ, sobre o que acabou de chegar. Um ficheiro trazido do template
  // vem com `{{...}}` por substituir — o `anti-patterns-template.md` tem um no titulo — e
  // deixa-lo assim poe o Guard 13 a reprovar o consumidor. A tabela do `/upgrade` ja manda
  // substituir na linha dos scripts; a linha do catalogo de anti-padroes nao o dizia, e foi
  // esta simulacao, na primeira corrida, que o mostrou.
  let repostosPh = 0;
  andaFicheiros(dir, (sub, nome) => {
    if (!substituivel(sub, nome)) return;
    const p = join(dir, sub);
    const c = readFileSync(p, "utf8");
    const n = c.replace(PLACEHOLDER, substituto);
    if (n !== c) {
      writeFileSync(p, n);
      repostosPh++;
    }
  });

  return { repostas, trazidos, placeholders: repostosPh };
}
