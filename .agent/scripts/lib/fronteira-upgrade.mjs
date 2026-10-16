/**
 * A FRONTEIRA num `/upgrade`: o que muda, e os comandos que o UTILIZADOR corre — {{PROJECT_NAME}}
 *
 * PORQUE EXISTE (#304, R7B-2): o `/upgrade` dizia que `.claude/hooks/*` eram "substituidos pelo motor",
 * mas o motor so corre sobre COPIAS, e o agente nao pode escrever a fronteira (o hook nega-o por
 * `Bash`; o settings pede aprovacao por `Edit`/`Write`). A 2b aplica o motor a uma copia; daqui sai o
 * que la mudou na fronteira e os comandos para o utilizador a trazer, fora do agente.
 *
 * COPIA-SE DA COPIA PROCESSADA, nunca do template cru (duas leituras independentes do #304): o motor
 * substitui os placeholders (`{{ PROJECT_NAME }}`; todos os hooks os tem — o Guard 13 reprovava cada ficheiro copiado
 * cru), repoe as `CONSTANTES_DO_PROJETO` (o `IA` do `commit-msg`) e GERA o `protegidos.json` a partir
 * do hook customizado (#257). Um `cp "$TPL/..."` perdia as tres coisas, em silencio.
 *
 * As recusas (o `--fronteira-em`, o staging onde se escreve) chamam o `fatal` de quem invoca, e estao no
 * `PARES` como as do `medida-upgrade.mjs`. O bloco
 * inteiro da 2b vive aqui (`fronteiraDa2b`), e a 2b (`lib/medida-upgrade.mjs`) so o chama (#317).
 */
import { execFileSync } from "child_process";
import { mkdirSync, writeFileSync, existsSync, readFileSync, readdirSync, lstatSync, mkdtempSync, realpathSync } from "fs";
import { tmpdir } from "os";
import { join, dirname, basename, resolve, relative, isAbsolute, sep } from "path";
import { andaFicheiros } from "./upgrade-categorias.mjs";
import { leOuNull } from "./ficheiros.mjs";

/** As pastas da fronteira que se poem em staging (o `.claude/settings.json` e do utilizador por inteiro).
 *  Os `.claude/agents/` tambem (auditoria do #304): o `ask` do settings pede aprovacao para os escrever,
 *  e um `cp` do agente contornava-o — o `tools:` deles e o que o hook impoe aos subagentes. */
export const PASTAS_FRONTEIRA = [".claude/hooks", ".githooks", ".claude/agents"];
const PROTEGIDOS = ".claude/hooks/protegidos.json";

/**
 * O que o upgrade muda na fronteira: `{ rel, como, nota? }`, com `como` = `muda` | `novo` | `sai`.
 *  - O `protegidos.json` e do projeto: so entra quando o projeto ainda NAO o tem e o motor o gerou na
 *    copia (a migracao do #257) — sem ele, o hook novo caia nos branches por omissao e o projeto
 *    perdia os seus, sem nada o dizer.
 *  - Um ficheiro que o projeto ALTEROU (o `substituidos` do motor: um `SEGUROS` customizado, um hook
 *    proprio) leva a nota de comparar antes.
 *  - Os que SAIRAM do template (e o projeto ainda tem) saem tambem pela mao do utilizador.
 * Compara com o que o projeto tem COMMITADO (`antes`), que e de onde a copia saiu (`git archive HEAD`):
 * contra a arvore de trabalho, uma edicao por commitar num hook saia como `muda`, e o `cp` apagava-a
 * (leitura independente do #304). Mas o que a arvore de trabalho JA tem igual a copia ja foi aplicado
 * (`atual`): a 2b corrida outra vez na §3, com a fronteira aplicada e por commitar, nao a repete.
 * Fica de fora (auditoria do #304): uma pasta que e symlink no projeto ou na copia (um `.githooks` ->
 * `.husky` — os ficheiros dela nao sao do template); as colisoes de um projeto ADOTADO (`doProjeto`);
 * e a camada Claude inteira num projeto que nao a tem (`temClaude`).
 * @param {string} raiz o projeto
 * @param {string} dir a copia, ja com o upgrade mecanico aplicado
 * @param {{ removidos?: {caminho: string}[], substituidos?: string[], doProjeto?: string[], protegidosMigrados?: boolean }} [medido] o que o motor devolveu
 * @param {{ antes?: (rel: string) => string | null, atual?: (rel: string) => string | null, temClaude?: boolean }} [o]
 */
export function fronteiraQueMuda(raiz, dir, { removidos = [], substituidos = [], doProjeto = [], protegidosMigrados = false } = {}, o = {}) {
  const antes = o.antes ?? ((rel) => leOuNull(join(raiz, rel)));
  const atual = o.atual ?? ((rel) => leOuNull(join(raiz, rel)));
  const bases = PASTAS_FRONTEIRA.filter((b) => (o.temClaude ?? true) || !b.startsWith(".claude/"));
  const link = (p) => { try { return lstatSync(p).isSymbolicLink(); } catch { return false; } };
  const doProj = new Set(doProjeto);
  const out = [];
  for (const base of bases) {
    if (!existsSync(join(dir, base)) || link(join(dir, base)) || link(join(raiz, base))) continue;
    andaFicheiros(join(dir, base), (sub) => {
      const rel = `${base}/${sub}`;
      if (doProj.has(rel)) return;
      const novo = readFileSync(join(dir, rel), "utf8");
      if (atual(rel) === novo) return; // ja aplicado
      const aqui = antes(rel);
      const alterado = substituidos.includes(rel) ? { nota: "o projeto ALTEROU-o: comparar antes (diff)" } : {};
      // O que o projeto ja tem COMMITADO e dele: nunca entra. Sem ele no commit, so se diz "migrados"
      // quando o motor migrou de facto (#317) — no template nu e a lista por omissao. E um que o projeto
      // tem SO na arvore de trabalho, por commitar, tambem e dele: sai com o `diff` e o `cp` comentado,
      // e nao com um `cp` pronto a colar que o esmagava (leitura do #317).
      if (rel === PROTEGIDOS) {
        if (aqui === null) {
          const local = atual(rel) !== null ? { nota: "o projeto ALTEROU-o: comparar antes (diff)" } : null;
          const migrou = protegidosMigrados ? { nota: "os branches protegidos DESTE projeto, migrados do hook (#257)" } : {};
          out.push({ rel, como: "novo", ...(local ?? migrou) });
        }
        return;
      }
      if (aqui === null) out.push({ rel, como: "novo", ...alterado });
      else if (aqui !== novo) out.push({ rel, como: "muda", ...alterado });
    });
  }
  for (const { caminho } of removidos) {
    if (bases.some((p) => caminho.startsWith(`${p}/`)) && antes(caminho) !== null && atual(caminho) !== null) out.push({ rel: caminho, como: "sai" });
  }
  return out.sort((a, b) => a.rel.localeCompare(b.rel));
}

/** Escreve no `staging` a versao PROCESSADA de cada ficheiro que entra — os bytes lidos da copia na
 *  MEDICAO, antes de a bateria correr sobre ela (#317: o staging cria-se no fim da 2b). */
function preparaStaging(bytes, staging) {
  for (const [rel, b] of bytes) {
    mkdirSync(dirname(join(staging, rel)), { recursive: true });
    writeFileSync(join(staging, rel), b);
  }
}

/** Uma palavra de shell entre plicas: nenhum `$`, crase ou espaco e interpretado. */
const q = (s) => `'${String(s).replace(/'/g, "'\\''")}'`;

/**
 * Os comandos, prontos a correr num terminal NOVO (fora da sessao: nada de `$TPL`): um `cd` absoluto
 * ao projeto, um `mkdir -p` por pasta que o projeto ainda nao tem (um `cp` nao a cria, e um
 * `.githooks/commit-msg` novo sem o seu `lib/` partia cada commit), um `cp` por ficheiro e um `rm` por
 * cada um que saiu.
 */
export function comandosFronteira(raiz, staging, lista) {
  const out = [`cd ${q(raiz)}`];
  const pastas = new Set();
  for (const { rel, como, nota } of lista) {
    const sufixo = `   # ${como}${nota ? ` — ${nota}` : ""}`;
    // Um ficheiro que o projeto ALTEROU nao vai pronto a colar: o `diff` primeiro, e o `cp` COMENTADO —
    // num bloco colado de uma vez, o aviso num comentario a direita chegava depois do estrago.
    if (nota && como !== "sai" && !/migrados do hook/.test(nota)) {
      out.push(`diff -u ${q(rel)} ${q(join(staging, rel))}   # o projeto ALTEROU-o: decidir antes`);
      out.push(`# cp ${q(join(staging, rel))} ${q(rel)}`);
      continue;
    }
    if (como === "sai") {
      out.push(`rm ${q(rel)}${sufixo}`);
      continue;
    }
    const pasta = dirname(rel);
    if (!existsSync(join(raiz, pasta)) && !pastas.has(pasta)) {
      pastas.add(pasta);
      out.push(`mkdir -p ${q(pasta)}`);
    }
    out.push(`cp ${q(join(staging, rel))} ${q(rel)}${sufixo}`);
  }
  return out;
}

const HOOK = /^\.claude\/hooks\/[^/]+\.mjs$/;
/** Os hooks NOVOS (na raiz de `.claude/hooks/`): um hook copiado e nao ligado nunca dispara. */
export const hooksPorLigar = (lista) => lista.filter(({ rel, como }) => como === "novo" && HOOK.test(rel)).map(({ rel }) => rel);
/** ...e os que SAEM: apagado e ainda ligado, o Claude Code chama-o a cada evento e falha. */
export const hooksPorDesligar = (lista) => lista.filter(({ rel, como }) => como === "sai" && HOOK.test(rel)).map(({ rel }) => rel);

/** Os ficheiros do staging com a FACHADA do nome do projeto: o motor nao o derivou de nenhum ficheiro
 *  intacto, e copia-los punha "EsteProjeto" nos cabecalhos em silencio (leitura independente do #304). */
export const comFachada = (staging, lista, fachada) =>
  lista.filter(({ como }) => como !== "sai").map(({ rel }) => rel).filter((rel) => (leOuNull(join(staging, rel)) ?? "").includes(fachada));

// O antecessor que EXISTE, pelo `realpath` nativo (que da as maiusculas do disco e segue symlinks);
// o resto, que ainda nao existe, como foi escrito.
const canonico = (p) => {
  let cima = resolve(p);
  const resto = [];
  while (!existsSync(cima) && dirname(cima) !== cima) {
    resto.unshift(basename(cima));
    cima = dirname(cima);
  }
  return join(realpathSync.native(cima), ...resto);
};
const fora = (a, b) => {
  const r = relative(a, b);
  return r === ".." || r.startsWith(`..${sep}`) || isAbsolute(r);
};
/** `caminho` fora de cada raiz, e sem conter nenhuma — pelo caminho CANONICO. */
const foraDeTodas = (caminho, raizes) => {
  const c = canonico(caminho);
  return raizes.map(canonico).every((x) => fora(x, c) && fora(c, x));
};
/** Uma pasta que ainda nao existe conta como vazia; um ficheiro nao. */
const vazia = (p) => {
  try {
    return readdirSync(p).length === 0;
  } catch {
    return !existsSync(p);
  }
};
const RECUSA_FORA = "o staging tem de ficar FORA do projeto e do template — senao a 2b escrevia a fronteira";
const RECUSA_CHEIA =
  "a pasta ja existe e nao esta vazia — o staging escrevia por cima do que la esta (o $HOME tem os " +
  "~/.claude/agents/ de todos os projetos): dar uma pasta nova ou vazia, tambem ao correr a 2b outra vez";
const CONTROLO = /[\u0000-\u001f\u007f]/;

/**
 * O staging NUNCA dentro do projeto nem do template (nem a conter um deles): com `--fronteira-em=.` ou
 * `=$PWD` a propria 2b escrevia a fronteira do projeto, por um caminho que o hook nao ve. Valida-se ao
 * LER o argumento (#317): dentro do bloco da fronteira, um valor invalido passava calado num upgrade
 * que nao a mudava. E compara-se o caminho CANONICO: `relative()` com `startsWith("..")` dava
 * `<proj>/..x` como fora, e no APFS `<PROJ>/sub` e o mesmo sitio que `<proj>/sub`. E numa pasta VAZIA
 * (leitura do #317): com `--fronteira-em=$HOME`, um projeto fora dele passava, e o staging trocava os
 * `~/.claude/agents/` do utilizador em silencio.
 */
export function validaFronteiraEm(fronteiraEm, raizes, fatal) {
  if (fronteiraEm === null) return;
  if (!fronteiraEm.trim() || !foraDeTodas(fronteiraEm, raizes)) fatal(`--fronteira-em=${fronteiraEm}: ${RECUSA_FORA}`);
  if (!vazia(resolve(fronteiraEm))) fatal(`--fronteira-em=${fronteiraEm}: ${RECUSA_CHEIA}`);
}

/** Onde cada hook esta LIGADO num `settings.json`: `Map<rel, string[]>`, com `Evento` ou `Evento (matcher)`.
 *  Sem a chave `hooks`, um mapa vazio; um texto que nao e JSON, `null` — "nao sei", e quem le nao filtra. */
export function ligacoes(texto) {
  if (texto === null || texto === undefined) return null;
  const out = new Map();
  let s = null;
  try {
    s = JSON.parse(texto);
  } catch {
    return null;
  }
  for (const [evento, entradas] of Object.entries(s?.hooks ?? {})) {
    for (const e of Array.isArray(entradas) ? entradas : []) {
      for (const h of Array.isArray(e?.hooks) ? e.hooks : []) {
        // TODOS os hooks do comando (`node a.mjs && node b.mjs`), nao so o primeiro (leitura do #317).
        for (const [rel] of String(h?.command ?? "").matchAll(/\.claude\/hooks\/[^/"'\s]+\.mjs/g)) {
          const onde = e.matcher ? `${evento} (${e.matcher})` : evento;
          out.set(rel, [...(out.get(rel) ?? []), onde].sort());
        }
      }
    }
  }
  return out;
}

/**
 * As notas da chave `hooks` (#317): onde ligar cada hook NOVO (o evento e o matcher, nao so o caminho), e
 * os hooks que o projeto JA tem cuja ligacao mudou no template — o `cp` de um hook com um evento novo
 * nao o liga, e nada o dizia. `antes`/`agora` sao o `settings.json` do template na marca e hoje.
 */
export function notasDeLigacao(lista, antes, agora, doProjeto, temNoProjeto) {
  const [la, lh] = [ligacoes(antes) ?? new Map(), ligacoes(agora) ?? new Map()];
  // O que o PROJETO ja liga como o template de hoje nao se pede (leitura do #317): a 2b corrida outra vez
  // na §3, com a ligacao feita, repetia o pedido. Sem `settings.json` legivel no projeto, nao se filtra.
  const lp = ligacoes(doProjeto);
  const feito = (rel) => lp !== null && (lp.get(rel) ?? []).join() === (lh.get(rel) ?? []).join();
  const onde = (rel) => (lh.get(rel) ?? ["(o template nao o liga)"]).join(", ");
  const notas = [];
  // So quando o template o LIGA: sem ligacao dos dois lados, "igual" seria um hook novo que ninguem liga.
  const [novos, saem] = [hooksPorLigar(lista), hooksPorDesligar(lista)];
  const ligar = novos.filter((rel) => !(lh.has(rel) && feito(rel)));
  if (ligar.length) notas.push(`hook(s) novo(s) a ligar na chave \`hooks\` do .claude/settings.json (a mao): ${ligar.map((r) => `${r} -> ${onde(r)}`).join("; ")}`);
  // O desligar NAO se filtra (segunda leitura do #317): um filtro aqui errava para o SILENCIO (um comando
  // com dois hooks, o `settings.local.json`) e o `rm` deixava o Claude Code a falhar a cada evento.
  if (saem.length) notas.push(`hook(s) que saem, a DESLIGAR da chave \`hooks\` do .claude/settings.json (a mao): ${saem.join(", ")}`);
  const mudou = [...new Set([...la.keys(), ...lh.keys()])]
    .filter((rel) => !novos.includes(rel) && !saem.includes(rel) && temNoProjeto(rel) && !feito(rel))
    .filter((rel) => (la.get(rel) ?? []).join() !== (lh.get(rel) ?? []).join())
    .sort();
  if (mudou.length) {
    notas.push(
      `a LIGACAO mudou no template, para hook(s) que este projeto ja tem — ajustar a chave \`hooks\` do .claude/settings.json (a mao): ` +
        mudou.map((r) => `${r}: ${(la.get(r) ?? ["nao ligado"]).join(", ")} -> ${(lh.get(r) ?? ["nao ligado"]).join(", ")}`).join("; ")
    );
  }
  return notas;
}

/**
 * A FRONTEIRA da 2b, inteira, e passo do UTILIZADOR (#304, R7B-2): o motor substitui `.claude/hooks/` e
 * `.githooks/` na copia, mas no projeto real o agente nao os pode escrever — o hook de fronteira nega-o,
 * e bem. Daqui sai a lista, a versao PROCESSADA num staging que persiste, e os comandos.
 * Saiu do `medida-upgrade.mjs` (no limite do Guard 17) e tem DUAS fases (#317): mede-se onde sempre se
 * mediu (a copia ainda sem a bateria nem as adaptacoes), e devolve-se o que IMPRIME — que a 2b chama no
 * fim. Antes, uma medicao que acabava em `fatal` deixava comandos no ecra e um staging orfao no tmpdir.
 * @returns {{ sai: Set<string>, imprime: () => void }} o que sai da fronteira (a lista do que saiu marca-o) e o que imprime
 */
export function fronteiraDa2b({ raiz, template, dir, medido, ref, fronteiraEm, git, ok, note, fatal }) {
  // O que o projeto tem COMMITADO e de onde a copia saiu; uma alteracao por commitar diz-se a parte.
  // Os BYTES do commit, sem o `git()` da medicao (que corta o fim): um `\n` final a menos fazia cada
  // ficheiro intacto parecer mudado. `HEAD:./` e relativo a pasta do projeto (#317): `HEAD:` resolve a
  // partir da raiz do REPO, e um projeto numa subpasta dava tudo como `novo`.
  const commitado = (rel) => {
    try {
      return execFileSync("git", ["show", `HEAD:./${rel}`], { cwd: raiz, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    } catch {
      return null;
    }
  };
  // A camada Claude: um projeto sem NENHUM ficheiro commitado em `.claude/` nao usa Claude Code — os hooks
  // e os agentes nao se aplicam (auditoria do #304: a 2b mandava instalar 31 hooks a um projeto sem ela).
  let temClaude = true;
  try {
    temClaude = execFileSync("git", ["ls-tree", "-r", "--name-only", "HEAD", "--", ".claude"], { cwd: raiz, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() !== "";
  } catch {
    temClaude = true; // na duvida, lista: um aviso a mais custa uma leitura
  }
  const fronteira = fronteiraQueMuda(raiz, dir, medido, { antes: commitado, temClaude });
  const bytes = new Map(fronteira.filter(({ como }) => como !== "sai").map(({ rel }) => [rel, readFileSync(join(dir, rel))]));
  return {
    sai: new Set(fronteira.filter(({ como }) => como === "sai").map(({ rel }) => rel)),
    imprime: () => imprimeFronteira({ raiz, template, ref, fronteiraEm, git, ok, note, fatal, fronteira, bytes, temClaude, commitado }),
  };
}

function imprimeFronteira({ raiz, template, ref, fronteiraEm, git, ok, note, fatal, fronteira, bytes, temClaude, commitado }) {
  const estado = (onde) => {
    try {
      return git(["status", "--porcelain", "--", ...PASTAS_FRONTEIRA], onde).trim();
    } catch {
      return "";
    }
  };
  const lerTpl = (r) => {
    try {
      return git(["show", `${r}:.claude/settings.json`], template);
    } catch {
      return null;
    }
  };
  // FORA do `if` da lista: uma ligacao que muda num hook INTACTO e o caso que nada dizia (#317).
  // A marca do COMMIT; hoje da ARVORE do template, como o staging e o deny/ask da mesma 2b (leitura do #317).
  const hoje = leOuNull(join(template, ".claude/settings.json"));
  const ligacao = temClaude ? notasDeLigacao(fronteira, lerTpl(ref), hoje, leOuNull(join(raiz, ".claude/settings.json")), (rel) => commitado(rel) !== null) : [];
  if (!fronteira.length && !ligacao.length) {
    // Sem a camada Claude, os hooks e os agentes foram FILTRADOS, nao ficaram iguais (#317): so se afirma o `.githooks/`.
    ok(`a fronteira (${temClaude ? ".claude/hooks/, .githooks/, .claude/agents/" : ".githooks/"}) nao muda neste upgrade — nada a pedir ao utilizador`);
  } else {
    // As recusas ANTES do cabecalho, e antes de criar o que quer que seja (segunda leitura do #317).
    // Um caracter de controlo num caminho partia o `# cp` comentado em duas linhas — a segunda corria.
    const estranho = [raiz, ...(fronteiraEm === null ? [] : [fronteiraEm]), ...fronteira.map(({ rel }) => rel)].find((c) => CONTROLO.test(c));
    if (estranho !== undefined) fatal(`um caminho da fronteira tem caracteres de controlo (${JSON.stringify(estranho)}) — nao gero comandos para ele`);
    if (fronteira.length && fronteiraEm === null && !foraDeTodas(tmpdir(), [raiz, template])) fatal(`o tmpdir ${tmpdir()}: ${RECUSA_FORA}`);
    console.log("\n  --- A FRONTEIRA: passo do UTILIZADOR, fora do agente ---\n");
    if (fronteira.length) {
      const staging = fronteiraEm === null ? mkdtempSync(join(tmpdir(), "agent-template-fronteira-")) : resolve(fronteiraEm);
      // "Fora" outra vez AQUI, onde se escreve (leitura do #317): a validacao do arranque foi minutos antes,
      // e um componente que nao existia pode ser agora um symlink para dentro do projeto. (A pasta VAZIA nao
      // se repete: so mudava numa corrida entre as duas, que nenhum teste consegue fazer acontecer.)
      if (!foraDeTodas(staging, [raiz, template])) fatal(`o staging ${staging}: ${RECUSA_FORA}`);
      preparaStaging(bytes, staging);
      note(
        `o upgrade muda ${fronteira.length} ficheiro(s) da fronteira; a versao dele (com os placeholders e as constantes ` +
          `deste projeto) ficou em ${staging} (fica ate o apagares; o sistema pode limpar o tmpdir). Correr ANTES da ` +
          `verificacao da secao 3 (ou aprovar cada \`Edit\`/\`Write\`):`
      );
      for (const l of comandosFronteira(raiz, staging, fronteira)) console.log(`        ${l}`);
      const fachada = comFachada(staging, fronteira, "EsteProjeto");
      if (fachada.length) note(`o nome do projeto nao se derivou: ${fachada.join(", ")} tem a fachada "EsteProjeto" — substituir pelo nome real antes do cp`);
    }
    for (const n of ligacao) note(n);
    if (fronteira.length && estado(raiz)) note("este projeto tem alteracoes por commitar na fronteira: os cp/rm acima ESMAGAM-nas onde o template tambem mudou — guardar antes (commit ou stash) o que for do projeto; o que ja esta igual ao staging conta como aplicado");
    if (fronteira.length && estado(template)) note("o template tem alteracoes por commitar na fronteira — o staging leva-as, e a marca da secao 4 grava so o commit");
    console.log("");
  }
  if (!temClaude) ok("este projeto nao tem a camada Claude (nada em .claude/): os hooks e os agentes nao se aplicam");
}
