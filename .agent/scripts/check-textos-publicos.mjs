#!/usr/bin/env node
/**
 * Os TEXTOS PUBLICOS do repo contra a lista de nomes proibidos — {{PROJECT_NAME}}
 *
 * PORQUE EXISTE (#375): o `commit-msg` trava uma mensagem de commit, e o hook do Claude Code (`guard-textos-publicos`,
 * #375b) um `gh` ou um `git tag` que publica. Nenhum ve o que JA esta publicado, nem o que se escreveu pela UI web ou por outro agente.
 * Este comando le tudo o que o repo tem de publico e editavel e diz onde aparece um nome da lista. Foi a mao
 * que se fez a 2026-10-22, sobre 212 PRs e 156 issues (#339, item 2b): 62 mencoes em 41 textos.
 *
 * O QUE LE (pelo `gh`, logo com as credenciais de quem corre): os titulos e corpos dos issues e dos PRs, as
 * reviews, os comentarios (de issue e de PR, e os de linha de uma review, cada um pela sua API), o nome e as
 * notas das releases, e a descricao do repo. E as mensagens das TAGS anotadas, pelo `git`: essas so se mudam
 * apagando e recriando a tag, e os derivados fazem o `/upgrade` pelo nome dela, logo saem a parte, como
 * CONHECIDAS, e nao contam para o resultado (#375, Fase 0 v2, B3).
 *
 * O QUE NAO LE, dito por inteiro: as mensagens de commit (imutaveis; e o `commit-msg` que as trava daqui para a
 * frente) e os comentarios de commit, os nomes dos branches remotos, as labels, os milestones e os topics, as
 * discussions, a wiki, e o texto de um ficheiro do repo (esse esta no disco: `git grep`). As tags sao as do clone
 * LOCAL: `git fetch --tags` antes, para serem as publicadas. E o HISTORICO DE EDICOES do GitHub: editar um corpo
 * deixa a versao antiga nas revisoes (apagam-se pela UI), e mudar um titulo deixa um "renamed from" na timeline,
 * que nao se apaga. Um `0` depois de editar diz que o texto ATUAL esta limpo, nao que o nome deixou de ser publico.
 *
 * NAO CORRE NO CI: la nao ha lista, e um aviso que esta sempre aceso ensina a ignorar o painel (decisao 1 do
 * `/grill`). Corre-se a mao, e no `/deploy` antes da tag (as notas da release saem dela).
 *
 * Sai `0` sem nenhum achado editavel; `1` com algum; `2` quando NAO CONSEGUIU MEDIR — sem lista, uma lista que
 * nao serve, o repo desligado (`git config --local`), o `gh` a falhar, ou uma leitura cortada no limite. Nunca diz "limpo" sem ter lido (`TP2`).
 * Cita a LINHA da lista, nunca o nome: o output entra no contexto de quem corre, e pode ser um agente.
 *
 *   node .agent/scripts/check-textos-publicos.mjs
 */
import { execFileSync } from "child_process";
import { homedir } from "os";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { carregaLista, padroes, encontra, RAZOES, VARIAVEL } from "./lib/nomes-proibidos.mjs";
import { ehMain } from "./lib/eh-main.mjs";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Quantos issues e PRs o `gh ... list` le de uma vez. Uma leitura que chegue a ele foi CORTADA (`TP2`). */
export const LIMITE = 500;

/** Quantas reviews por PR o `gh pr list` traz (o GraphQL dele pede as primeiras 100). Chegar a elas e um corte. */
export const LIMITE_DE_REVIEWS = 100;

/** Sem cor: com `GH_FORCE_TTY`/`CLICOLOR_FORCE`, o `--jq` sai indentado e com ANSI, e o parse por linha rebentava. */
const SEM_COR = { ...process.env, NO_COLOR: "1", GH_FORCE_TTY: "", CLICOLOR_FORCE: "0" };

/** Os comentarios, os de linha e as releases vem pela API, paginados: um objecto JSON por linha. */
const POR_LINHA = (caminho, jq) => ["api", "--paginate", `repos/{owner}/{repo}/${caminho}?per_page=100`, "--jq", `.[] | ${jq}`];

/**
 * Le os textos publicos. `corre(cmd, args)` devolve o stdout (injectavel: a suite da-lhe fixtures, sem rede).
 * @returns {{ editaveis: { url: string, campo: string, texto: string }[], tags: { nome: string, texto: string }[], cortadas: string[], contagem: Record<string, number> }}
 */
export function leGitHub(corre = (cmd, args) => execFileSync(cmd, args, { cwd: RAIZ, encoding: "utf8", maxBuffer: 512 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"], env: SEM_COR })) {
  // Um erro de parse do Node traz um EXCERTO do texto que nao leu — e o texto pode ter o nome. Sai so a fonte.
  const parse = (texto, fonte) => {
    try {
      return JSON.parse(texto);
    } catch {
      throw new Error(`o output do gh nao e JSON (${fonte})`);
    }
  };
  const json = (args) => parse(corre("gh", args), args.slice(0, 2).join(" "));
  const linhas = (args) => corre("gh", args).split("\n").filter((l) => l.trim()).map((l) => parse(l, args[2]));
  const editaveis = [];
  const cortadas = [];
  const contagem = {};
  const junta = (tipo, itens, campos) => {
    contagem[tipo] = itens.length;
    for (const it of itens) for (const [campo, texto] of campos(it)) editaveis.push({ url: it.url, campo, texto: texto ?? "" });
  };

  const issues = json(["issue", "list", "--state", "all", "--limit", String(LIMITE), "--json", "url,title,body"]);
  if (issues.length >= LIMITE) cortadas.push("issues");
  junta("issues", issues, (i) => [["titulo", i.title], ["corpo", i.body]]);

  const prs = json(["pr", "list", "--state", "all", "--limit", String(LIMITE), "--json", "url,title,body,reviews"]);
  if (prs.length >= LIMITE) cortadas.push("PRs");
  if (prs.some((p) => (p.reviews ?? []).length >= LIMITE_DE_REVIEWS)) cortadas.push("reviews");
  junta("PRs", prs, (p) => [["titulo", p.title], ["corpo", p.body], ...(p.reviews ?? []).map((r) => ["review", r.body])]);

  junta("comentarios", linhas(POR_LINHA("issues/comments", "{url: .html_url, texto: .body}")), (c) => [["comentario", c.texto]]);
  junta("comentarios de linha", linhas(POR_LINHA("pulls/comments", "{url: .html_url, texto: .body}")), (c) => [["comentario de linha", c.texto]]);
  junta("releases", linhas(POR_LINHA("releases", "{url: .html_url, nome: .name, texto: .body}")), (r) => [["nome da release", r.nome], ["notas da release", r.texto]]);
  const repo = json(["repo", "view", "--json", "url,description,homepageUrl"]);
  junta("repo", [repo], (r) => [["descricao", r.description], ["pagina", r.homepageUrl]]);

  // `%00` separa o nome do corpo e um corpo do nome seguinte: um corpo nunca tem um NUL.
  const cru = corre("git", ["for-each-ref", "refs/tags", "--format=%(refname:short)%00%(contents)%00"]).split("\0");
  const tags = [];
  for (let i = 0; i + 1 < cru.length; i += 2) tags.push({ nome: cru[i].replace(/^\n/, ""), texto: cru[i + 1] });
  contagem.tags = tags.length;
  return { editaveis, tags, cortadas, contagem, repo: repo.url };
}

/** Nao consegui medir: diz porque, e sai `2`. Nunca "limpo". */
function fatal(escreve, motivo, detalhe = []) {
  escreve("");
  escreve(`  NAO MEDIDO  ${motivo}`);
  for (const l of detalhe) escreve(`    ${l}`);
  escreve("");
  return 2;
}

/** Regista um achado (o texto, o campo, a linha da lista). */
function achado(lista, t, linha) {
  lista.push(`${t.url} (${t.campo}): o nome da linha ${linha} da lista`);
}

/**
 * Corre a verificacao. Devolve o exit code.
 * @param {{ env?: Record<string, string | undefined>, home?: string, raiz?: string, ler?: () => ReturnType<typeof leGitHub>, escreve?: (l: string) => void }} [opcoes]
 */
export function correr({ env = process.env, home = homedir(), raiz = RAIZ, ler = leGitHub, escreve = console.log } = {}) {
  const lista = carregaLista({ env, home, raiz });
  if (lista.estado !== "ok") {
    return fatal(escreve, `${RAZOES[lista.estado]}.`, [
      `A lista: ${lista.caminho} (\`$${VARIAVEL}\` muda o caminho). Um nome por linha; \`#\` comenta.`,
      "Fica FORA do repo. Sem ela nao ha nada contra o que medir, e isto nao diz \"limpo\".",
    ]);
  }
  let lido;
  try {
    lido = ler();
  } catch (err) {
    return fatal(escreve, "nao consegui ler os textos publicos.", [err instanceof Error ? err.message.split("\n")[0] : String(err), "O `gh` esta instalado e autenticado, e este repo tem remoto no GitHub?"]);
  }
  if (lido.cortadas.length) {
    return fatal(escreve, `a leitura chegou ao limite de ${LIMITE} (${lido.cortadas.join(", ")}): o resto ficou por ler.`, ["Subir o `LIMITE` e repetir."]);
  }

  const re = padroes(lista.nomes);
  const achados = [];
  for (const t of lido.editaveis) for (const n of encontra(t.texto, re)) achado(achados, t, n);
  const conhecidas = lido.tags.flatMap((t) => encontra(t.texto, re).map((n) => `tag ${t.nome}: o nome da linha ${n} da lista`));

  escreve("");
  escreve(`  Lidos${lido.repo ? ` de ${lido.repo}` : ""}: ${Object.entries(lido.contagem).map(([k, v]) => `${v} ${k}`).join(", ")}; ${lista.nomes.length} nome(s) na lista.`);
  if (conhecidas.length) {
    escreve("");
    escreve("  CONHECIDAS (nao reescritas: mudar a mensagem de uma tag e recria-la, e os derivados atualizam pelo nome dela):");
    for (const c of conhecidas) escreve(`    ${c}`);
  }
  escreve("");
  if (achados.length === 0) {
    escreve("  Nenhum nome da lista nos textos publicos editaveis.");
    escreve("");
    return 0;
  }
  escreve(`  ${achados.length} achado(s) em textos publicos editaveis:`);
  for (const a of achados) escreve(`    ${a}`);
  escreve("");
  escreve("  Editar cada um (com aprovacao: e texto publico), e voltar a correr. O GitHub guarda o historico: a versao");
  escreve("  antiga de um corpo fica nas revisoes (apagar pela UI), e um titulo mudado deixa um \"renamed from\" na timeline.");
  escreve("");
  return 1;
}

if (ehMain(import.meta.url)) process.exit(correr());
