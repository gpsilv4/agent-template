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
 * Sem sitios de recusa: so dados e funcoes puras. Quem imprime e a 2b (`lib/medida-upgrade.mjs`).
 */
import { mkdirSync, copyFileSync, existsSync, readFileSync, lstatSync } from "fs";
import { join, dirname } from "path";
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
 * @param {{ removidos?: {caminho: string}[], substituidos?: string[], doProjeto?: string[] }} [medido] o que o motor devolveu
 * @param {{ antes?: (rel: string) => string | null, atual?: (rel: string) => string | null, temClaude?: boolean }} [o]
 */
export function fronteiraQueMuda(raiz, dir, { removidos = [], substituidos = [], doProjeto = [] } = {}, o = {}) {
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
      if (rel === PROTEGIDOS) {
        if (aqui === null) out.push({ rel, como: "novo", nota: "os branches protegidos DESTE projeto, migrados do hook (#257)" });
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

/** Copia para `staging` a versao PROCESSADA (da copia `dir`) de cada ficheiro que entra. */
export function preparaStaging(dir, lista, staging) {
  for (const { rel, como } of lista) {
    if (como === "sai") continue;
    mkdirSync(dirname(join(staging, rel)), { recursive: true });
    copyFileSync(join(dir, rel), join(staging, rel));
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
