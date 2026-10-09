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

import { readFileSync, writeFileSync, mkdirSync, cpSync, existsSync, statSync } from "fs";
import { execFileSync } from "child_process";
import { join, dirname, sep, relative } from "path";

// Re-exportado para nao partir quem ja o importava daqui. A definicao vive em
// `lib/ficheiros.mjs` — estava escrita duas vezes, identica (`TP8`).
export { leOuNull } from "./ficheiros.mjs";
import { leOuNull, blocoDaConstante, listaDeBranches } from "./ficheiros.mjs";
import { foraDoTemplate } from "./fora-do-template.mjs";
import { intactoAMenosDePlaceholders, capturaPlaceholders, valoresDoProjeto } from "./intacto.mjs";

// As categorias (o que se copia, o que e do projeto, o que mudou de casa) vivem em
// `upgrade-categorias.mjs` (#243); reexportadas para quem ja as importava daqui.
import { substituivel, PLACEHOLDER, andaFicheiros, PREFIXOS_COPIADOS, MIGRACOES, CONSTANTES_DO_PROJETO } from "./upgrade-categorias.mjs";
export { substituivel, PLACEHOLDER, andaFicheiros, MIGRACOES, CONSTANTES_DO_PROJETO };

/**
 * Aplica ao consumidor em `dir` as categorias MECANICAS do `/upgrade`, a partir do template
 * em `root`. `tag` e a versao de onde o projeto saiu — a comparacao e sempre contra ela, e
 * nao contra o template nu, senao tudo aparece customizado.
 *
 * `fatal` recebe a razao e NAO retorna: qualquer coisa que este modulo nao consiga fazer com
 * seguranca tem de parar tudo. Escrever por cima dos ficheiros de um consumidor as cegas e
 * pior do que nao fazer upgrade nenhum.
 *
 * @returns {{repostas: number, trazidos: number, placeholders: number, removidos: object[], migracoes: object[], naoCopiados: object[], substituidos: string[]}}
 *          o que mediu. `naoCopiados` sao `{caminho, razao}`: o que estava no disco do template
 *          e NAO e dele (ignorado pelo git, ou nome de segredo/lixo) — ver `lib/fora-do-template.mjs`. `removidos` sao `{caminho, migrado}`: os ficheiros que sairam do template e o
 *          consumidor ainda tem. `migrado: true` quando o mesmo NOME existe noutro caminho — ou
 *          seja, o ficheiro mudou de sitio e a remocao **faz parte da migracao**, nao e uma
 *          limpeza opcional. Continua a ser uma LISTA, nunca uma accao ja feita.
 */
export function aplicaUpgradeMecanico({ dir, root, tag, fatal, substituto, constantes = CONSTANTES_DO_PROJETO }) {
  
  
  /** O conteudo de um ficheiro NA TAG. `null` quando nao existia — e quem chama decide, porque
   *  "nao existia" e "nao consegui ler" pedem accoes diferentes (`TP2`). */
  const tagFicheiro = (rel) => {
    try {
      return execFileSync("git", ["show", `${tag}:${rel}`], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    } catch {
      return null;
    }
  };
  
  /** Os ficheiros que a TAG tinha, sob os prefixos que o upgrade copia. `null` quando o `git`
   *  falha — e quem chama decide, porque "nao havia nenhum" e "nao consegui listar" pedem accoes
   *  diferentes (`TP2`). */
  const arvoreNaTag = () => {
    try {
      return new Set(
        execFileSync("git", ["ls-tree", "-r", "--name-only", tag], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
          .split("\n")
          .filter((p) => PREFIXOS_COPIADOS.some((pre) => p.startsWith(pre)))
      );
    } catch {
      return null;
    }
  };

  /** Os ficheiros que o template tem AGORA, lidos do DISCO e nao de `git ls-tree HEAD`.
   *
   *  Tem de ser do disco porque e do disco que o `trazerDoHead` copia. Com `ls-tree HEAD` as duas
   *  metades respondiam a perguntas diferentes — "o que esta commitado" contra "o que se copiou" —
   *  e um ficheiro acrescentado ao template e ainda por commitar aparecia como REMOVIDO. A
   *  primeira versao usava `HEAD` e um teste apanhou-a: e o `TP1` na sua forma mais barata, duas
   *  leituras do mesmo conceito com normalizacoes diferentes. */
  const arvoreNoDisco = () => {
    const fs = new Set();
    for (const pre of PREFIXOS_COPIADOS) {
      const base = join(root, pre);
      if (!existsSync(base)) continue;
      andaFicheiros(base, (sub) => {
        if (razaoParaNaoCopiar(`${pre}${sub}`) === null) fs.add(`${pre}${sub}`);
      });
    }
    return fs;
  };

  // O que esta no disco e NAO e do template (ignorado pelo git, ou nome de segredo) nao se copia
  // nem conta como "existe agora" — ver `lib/fora-do-template.mjs`.
  const { razao: razaoParaNaoCopiar, erro: semIgnorados } = foraDoTemplate(root);
  if (semIgnorados !== undefined) {
    fatal(`nao consegui perguntar ao git o que o template ignora (${semIgnorados}) — sem isso copiava-se o que nao e do template, segredos incluidos`);
  }
  // Nunca em silencio: o que fica de fora vai no resultado, e quem chama mostra-o.
  const naoCopiados = new Map();
  const podeCopiar = (rel) => {
    const r = razaoParaNaoCopiar(rel);
    if (r !== null) naoCopiados.set(rel, r);
    return r === null;
  };

  /** O que SAIU do template entre a tag e o HEAD, e que o consumidor ainda tem.
   *
   *  PORQUE EXISTE: o upgrade copia com `cpSync`, que acrescenta e substitui — **nunca apaga**.
   *  Um ficheiro renomeado ou removido no template ficava no consumidor para sempre, ao lado do
   *  novo. Nao e so desarrumacao: a descoberta em disco encontra o orfao e exige-lhe par
   *  (`SEM PAR`), o Guard 17 conta-o, e o `check-test-surface` ve a superficie duplicada. Ou
   *  seja, uma renomeacao no template punha VERMELHO todos os projetos derivados.
   *
   *  A REGRA E DELIBERADAMENTE ESTREITA, e e ela que torna isto seguro: so entra o que **estava
   *  na tag** de onde o projeto saiu, **ja nao esta no HEAD**, e **ainda existe no consumidor**.
   *  Um ficheiro que o consumidor criou nunca esteve na tag, logo nunca entra — e a diferenca
   *  entre propor apagar codigo do template e propor apagar trabalho de alguem.
   *
   *  **Isto NAO apaga nada.** Devolve a lista; a decisao e do passo de aprovacao do workflow, que
   *  e onde tem de estar (`Fase 0: nada e copiado antes de aprovacao`).
   */
  const naTag = arvoreNaTag();
  if (naTag === null) {
    fatal(`nao consegui listar a arvore do ${tag} — sem ela nao sei o que saiu do template`);
  }
  const agora = arvoreNoDisco();
  const saiu = [...naTag].filter((p) => !agora.has(p) && existsSync(join(dir, p))).sort();

  // MIGRACAO vs LIMPEZA, e a distincao decide se a remocao e opcional.
  //
  // Um ficheiro que saiu e **nao voltou a aparecer** e uma limpeza: o consumidor pode adiar a
  // remocao e fica so com um orfao inofensivo. Um ficheiro que saiu e cujo **mesmo nome existe
  // noutro caminho** foi MOVIDO — e ai adiar parte o projeto: os contadores duplicam, a
  // descoberta exige par ao orfao, o `check-test-surface` ve a superficie inflada.
  //
  // Nao e teorico: foi medido a mover 28 ficheiros para `tests/`. O consumidor ficava com as
  // DUAS estruturas e o gate vermelho, com uma mensagem que falava de "entry point que declara"
  // — a quilometros da causa. A tabela do `/upgrade` dizia "propor apagar, com aprovacao", o que
  // esta certo para um ficheiro solto e errado para uma migracao.
  const nomeDe = (p) => p.split("/").pop();
  const nomesAgora = new Set([...agora].map(nomeDe));
  const removidos = saiu.map((p) => ({ caminho: p, migrado: nomesAgora.has(nomeDe(p)) }));

  // O que o projeto ALTEROU e a copia vai SUBSTITUIR (#176). A copia de `.agent/scripts/**` e dos
  // hooks e limpa por desenho, e foi assim que um derivado perdeu as ligacoes dos seus guards
  // proprios no `check-doc-versions.mjs` e no `lib/pares.mjs` — sem nada no ecra. Nao impede a
  // copia: diz, ANTES de aprovar, o que vai deixar de ser como o projeto o tinha. A `config/`
  // fica de fora porque o upgrade nunca a substitui.
  //
  // "Alterou" tem de descontar o que NAO e alteracao, ou a lista afoga-se — medido no modo 2b de
  // um derivado real: 68 de 71 ficheiros listados. Duas coisas a descontar:
  //  - os PLACEHOLDERS: a 2b usa um nome de fachada e o derivado tem o nome real, logo cada `{{ X }}`
  //    aceita o que la estiver, na mesma linha (`intactoAMenosDePlaceholders`);
  //  - as CONSTANTES que o motor preserva: um ficheiro que so difere no `CHECKS` nao perde nada.
  // E um ficheiro NOVO no template com o caminho de um que o projeto ja tinha tambem e substituido.
  const semPreservadas = (rel, t) =>
    constantes.filter(([r]) => r === rel).reduce((acc, [, nome]) => {
      const bloco = blocoDaConstante(acc, nome);
      return bloco === null ? acc : acc.replace(bloco, `<${nome} preservada>`);
    }, t);
  const substituidos = [...agora]
    .filter((p) => !p.includes("/config/") && !p.endsWith("/protegidos.json"))
    .filter((p) => {
      const doConsumidor = leOuNull(join(dir, p));
      const referencia = naTag.has(p) ? tagFicheiro(p) : leOuNull(join(root, p));
      if (doConsumidor === null || referencia === null) return false;
      return !intactoAMenosDePlaceholders(semPreservadas(p, doConsumidor), semPreservadas(p, referencia));
    })
    .sort();

  // Os VALORES reais dos placeholders, recolhidos dos ficheiros intactos do consumidor (#179).
  const { recolhe, substitui, emConflito } = valoresDoProjeto(substituto);

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
    const vals = antigo === null || naTagBruto === null ? null : capturaPlaceholders(antigo, naTagBruto);
    if (vals !== null) {
      recolhe(vals);
      continue; // intacto: fica o do template novo
    }
    if (antigo !== null) guardados.push([rel, nome, antigo]);
  }

  // Constantes que mudaram de casa: se o consumidor as tinha CUSTOMIZADAS na casa antiga, a
  // customizacao perde-se — e perde-se em silencio, que e o modo de falha pior. Compara-se
  // contra a TAG e nao contra o template nu: e a mesma regra do ciclo acima, e sem ela um
  // projeto que nunca lhes tocou levava um aviso sobre trabalho que nao tem.
  const migracoes = [];
  for (const { rel, nome, para } of MIGRACOES) {
    const doConsumidor = blocoDaConstante(leOuNull(join(dir, rel)), nome);
    if (doConsumidor === null) continue;
    const naTag = blocoDaConstante(tagFicheiro(rel), nome);
    if (naTag === null || !intactoAMenosDePlaceholders(doConsumidor, naTag)) migracoes.push({ nome, de: rel, para });
  }
  
  /** Copia recursiva de uma pasta do HEAD para a copia. */
  function trazerDoHead(rel) {
    const origem = join(root, rel);
    if (!existsSync(origem)) fatal(`${rel} nao existe no HEAD — nada a trazer`);
    cpSync(origem, join(dir, rel), {
      recursive: true,
      // `config/` e a configuracao do PROJETO, ao lado do `.agent/context/`. Sem tratamento
      // proprio, a copia de `.agent/scripts/**` passava-lhe por cima e a decisao do projeto
      // voltava ao default do template — era esse o defeito, um directorio abaixo.
      //
      // Mas a regra NAO e "nunca tocar": e **nunca SUBSTITUIR, copiar se AUSENTE**. (Os hooks NAO
      // seguem esta regra: sao substituidos, menos o `protegidos.json`, #257.) A diferenca nao e academica — a primeira versao desta linha
      // excluia a pasta por inteiro, e o simulador reprovou: um consumidor anterior a existencia
      // da `config/` recebia o `check-bundle-sizes.mjs` novo, que faz
      // `import ... from "./config/bundles.mjs"`, e **sem o ficheiro que ele importa**. O
      // verificador rebentava no arranque, em TODOS os projetos derivados ja existentes.
      //
      // Trazer a logica sem a configuracao que ela importa nao e proteger a configuracao — e
      // partir o consumidor para a proteger.
      filter: (src) => {
        if (!podeCopiar(relative(root, src).split(sep).join("/"))) return false;
        const p = src.split(sep).join("/");
        if (!p.includes("/.agent/scripts/config/") && !p.endsWith("/.claude/hooks/protegidos.json")) return true;
        // Descer sempre nas pastas: recusar a pasta `config/` porque ela ja existe saltava
        // tambem os ficheiros NOVOS que o template tivesse acrescentado la dentro.
        if (statSync(src).isDirectory()) return true;
        // O destino deriva-se do caminho relativo a origem da copia — nunca de aritmetica sobre
        // a string, que e onde este tipo de codigo costuma mentir em silencio.
        return !existsSync(join(dir, rel, relative(origem, src)));
      },
    });
  }
  
  // Os protegidos customizados no hook (ou `new Set`, ate v0.3.0) MIGRAM para o JSON antes da copia (#257).
  const HOOK = ".claude/hooks/guard-protected-branch.mjs";
  let protegidosMigrados = 0;
  if (!existsSync(join(dir, ".claude/hooks/protegidos.json"))) {
    for (const nome of ["PROTEGIDOS_LISTA", "PROTEGIDOS"]) {
      const seu = blocoDaConstante(leOuNull(join(dir, HOOK)), nome);
      const naTag = blocoDaConstante(tagFicheiro(HOOK), nome);
      if (seu === null || (naTag !== null && intactoAMenosDePlaceholders(seu, naTag))) continue;
      const lista = listaDeBranches(seu); // `[]` customizado tambem migra: e uma decisao do projeto
      if (lista === null) fatal(`nao consegui ler os branches protegidos de ${HOOK} (${nome}) — migrar a mao para .claude/hooks/protegidos.json`);
      writeFileSync(join(dir, ".claude/hooks/protegidos.json"), `${JSON.stringify(lista)}\n`); protegidosMigrados = 1; break;
    }
  }

  // (i) `.agent/scripts/**` — copia limpa. (ii) O catalogo de anti-padroes do TEMPLATE, por
  // inteiro: e dele, e os IDs dele sao os mesmos em todos os projetos. (iii) Os hooks.
  // Da MESMA lista que diz o que "saiu do template": duas chamadas escritas a mao ao lado dela eram
  // o `TP1`, e o `.github/scripts/` entrou na lista sem ser copiado (#277, medido).
  for (const pre of PREFIXOS_COPIADOS) {
    const rel = pre.replace(/\/$/, "");
    // `.github/scripts/` so existe desde o #277: um template que nao o tenha (as fixtures
    // sinteticas) nao tem nada a trazer. As outras duas continuam obrigatorias.
    if (rel === ".github/scripts" && !existsSync(join(root, rel))) continue;
    trazerDoHead(rel);
  }
  for (const rel of [".agent/rules/anti-patterns-template.md"]) {
    const c = leOuNull(join(root, rel));
    if (c === null) fatal(`${rel} nao existe no HEAD`);
    writeFileSync(join(dir, rel), c);
  }
  
  // Repor as constantes do projeto por cima da copia. E o passo que a tabela chama "preservando".
  let repostas = protegidosMigrados;
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
  // (iv) O CABECALHO do `anti-patterns.md`: a regra do (v), sem tocar nas ENTRADAS (`APn`, so do
  // projeto). Intacto contra a tag, a menos dos placeholders, traz-se o novo; customizado, nao se
  // toca — trazer o inteiro apagava o que o projeto condensou e rebentava o tecto (#178). A prosa
  // velha aponta-a o Guard 15 (ID morto) ou o G12g (intervalo), com ficheiro e linha.
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
    const naTag = corta(tagFicheiro(rel));
    const vals = naTag === null ? null : capturaPlaceholders(doProjeto[0], naTag[0]);
    if (vals !== null) {
      recolhe(vals);
      writeFileSync(join(dir, rel), doTemplate[0] + doProjeto[1]);
    }
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
  const novos = [];
  const atualizados = [];
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
      if (!podeCopiar(sub)) return;
      const antigo = tagFicheiro(sub);
      const doConsumidor = leOuNull(join(dir, sub));
      // FICHEIRO NOVO desde a tag. O consumidor nunca o teve, logo **nao ha customizacao a
      // respeitar** — copia-se se ele nao o tiver, e nunca se sobrepoe nada.
      //
      // Sem isto, NENHUMA rule, workflow ou `-why` novo chegava alguma vez a um projeto
      // derivado: o `trazerDoHead` cobre so os `PREFIXOS_COPIADOS`, e este ciclo
      // saltava tudo o que nao existia na tag antiga.
      //
      // Apanhado pelo `simulate-upgrade` ao criar o `src/docs/review-why.md` (#109), e **so
      // porque um ponteiro apontava para ele**: o Guard 20 reprovou a apontar para um ficheiro
      // ausente. Um ficheiro novo SEM ponteiro de entrada chegava ausente em silencio, e o
      // consumidor ficava sem ele para sempre sem nada o denunciar.
      //
      // Os placeholders de um ficheiro NOVO substituem-se ao escreve-lo, NO FIM, com os valores
      // reais recolhidos (#179): o bootstrap do consumidor ja correu, e ninguem os substituiria.
      if (antigo === null) {
        if (doConsumidor !== null) return;
        const novoC = leOuNull(join(root, sub));
        if (novoC === null) return;
        novos.push([sub, novoC]);
        return;
      }
      // Contra a versao antiga A MENOS DOS PLACEHOLDERS (`lib/intacto.mjs`): um so `substituto`
      // dava por customizado todo o ficheiro com o nome real ou com outro placeholder (#179).
      const vals = doConsumidor === null ? null : capturaPlaceholders(doConsumidor, antigo);
      if (vals === null) return;
      recolhe(vals);
      const novoC = leOuNull(join(root, sub));
      if (novoC === null || novoC === antigo) return;
      atualizados.push([sub, novoC]); // escrito depois da verificacao dos conflitos, como os novos
    });
  }
  
  // Dois valores para o mesmo placeholder: escolher um em silencio era texto que ninguem escreveu.
  // So conta um conflito num `X` que alguem vai escrever: nos novos, ou na passagem final.
  const usados = new Set();
  const nomesEm = (t) => { for (const m of t.matchAll(PLACEHOLDER)) usados.add(m[0].slice(2, -2)); };
  for (const [, c] of [...novos, ...atualizados]) nomesEm(c);
  andaFicheiros(dir, (sub, nome) => substituivel(sub, nome) && nomesEm(readFileSync(join(dir, sub), "utf8")));
  const conflito = emConflito(usados);
  if (conflito) fatal(`placeholders com mais de um valor nos ficheiros intactos: ${conflito} — sem consenso nao sei o que escrever`);
  for (const [sub, c, escreve] of [...atualizados.map(([s, c]) => [s, c, (t) => t]), ...novos.map(([s, c]) => [s, c, substitui])]) {
    mkdirSync(dirname(join(dir, sub)), { recursive: true });
    writeFileSync(join(dir, sub), escreve(c));
    trazidos++;
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
    const n = substitui(c);
    if (n !== c) {
      writeFileSync(p, n);
      repostosPh++;
    }
  });

  return {
    repostas,
    trazidos,
    placeholders: repostosPh,
    removidos,
    substituidos,
    migracoes,
    naoCopiados: [...naoCopiados].map(([caminho, razao]) => ({ caminho, razao })).sort((a, b) => a.caminho.localeCompare(b.caminho)),
  };
}
