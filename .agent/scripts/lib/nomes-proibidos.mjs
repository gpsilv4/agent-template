/**
 * Os NOMES PROIBIDOS num texto publico: a lista guardada FORA do repo, e como se procura — {{PROJECT_NAME}}
 *
 * PORQUE EXISTE (#375): um repo publico nao pode nomear o que e privado (repos, clientes, pessoas). A regra
 * vivia so na memoria do agente, e 20 textos publicos nomearam-nos na mesma (#339, item 2b). A lista nao pode
 * viver no repo — publica-la era o proprio defeito —, logo vive num ficheiro do utilizador, e quem a le e
 * este modulo: o `commit-msg` (`.githooks/lib/commit-msg.mjs`) e o comando `check-textos-publicos.mjs`, e o hook do Claude Code
 * (`.claude/hooks/guard-textos-publicos.mjs`, #375b).
 *
 * Vive em `.agent/scripts/lib/`, e nao em `.githooks/lib/`, porque o `/upgrade` copia esta pasta sozinho e a
 * `.githooks/` vai para a fronteira, que o utilizador aplica a mao: com a lib la, o comando e a sua suite
 * importavam um modulo em falta ate esse passo (#375, Fase 0 v2, B2).
 *
 * O CONTRATO da lista (escrito tambem no `upgrade-why.md`, porque um derivado depende dele):
 *   - o caminho e `$NOMES_PROIBIDOS_FICHEIRO`, ou `~/.config/agent-template/nomes-proibidos`;
 *   - um nome por linha; `#` no inicio comenta, e as linhas em branco nao contam;
 *   - `-`, ` ` e `_` sao o mesmo separador, a caixa nao conta, e um nome dentro de uma palavra maior nao casa;
 *     os dois lados vao a NFC (um texto colado no macOS vem em NFD), e os acentos contam;
 *   - uma linha sem nenhuma letra ou digito (`-`, `_ _`) nao e um nome: casava tudo.
 *
 * O INTERRUPTOR por repo: a lista vale para todos os repos de quem a tem, e num repo PRIVADO os nomes dela podem
 * ser legitimos (o proprio nome do repo). `git config --local agent-template.nomesProibidos desligado` desliga-a
 * ali — so a config LOCAL conta, para uma global nao a desligar em todo o lado. Arma por omissao (falha fechada).
 *
 * Os ESTADOS, e o que cada consumidor faz com eles, decidido no `/grill` do #375:
 *   - `desligado`: o repo desligou-a (o interruptor acima). O `commit-msg` passa; o comando de varredura diz-o;
 *   - `sem-lista`: nao ha ficheiro no caminho por omissao. Nao e erro (a regra so arma quando ha lista), mas
 *     ninguem diz "limpo". Com a VARIAVEL definida, um ficheiro em falta ja nao e isto: quem a definiu disse que ha;
 *   - `ilegivel`, `vazia`, `dentro-do-repo`: ha uma lista e nao serve — recusa-se, com a razao. Uma lista
 *     DENTRO do repo e a lista a um `git add` de ficar publica. Um symlink sem alvo e `ilegivel`, nao `sem-lista`.
 *
 * Cada estado que nao e `ok` passa por `recusa(r, estado)`, e e esse o sitio da varredura: desligado, o fluxo
 * segue ate ao fim sem rebentar, e da `vazia` ou `ok` no lugar do estado certo — a suite ve a diferenca.
 */
import { execFileSync } from "child_process";
import { lstatSync, readFileSync, realpathSync } from "fs";
import { homedir } from "os";
import { join, relative, isAbsolute, sep } from "path";

/** A variavel que muda o caminho. As suites fixam-na sempre (`TP3`): a lista real de quem corre nao entra. */
export const VARIAVEL = "NOMES_PROIBIDOS_FICHEIRO";

/** O caminho da lista: a variavel, se tiver valor, senao o sitio por omissao na `home`. */
export function caminhoDaLista({ env = process.env, home = homedir() } = {}) {
  return env[VARIAVEL] || join(home, ".config", "agent-template", "nomes-proibidos");
}

/** A chave do interruptor por repo (`git config --local`). */
export const INTERRUPTOR = "agent-template.nomesProibidos";

/** O repo da `raiz` desligou a verificacao? So a config LOCAL; sem repo, ou sem a chave, nao. */
export function desligadoNoRepo(raiz, env = process.env) {
  try {
    return execFileSync("git", ["-C", raiz, "config", "--local", "--get", INTERRUPTOR], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], env }).trim() === "desligado";
  } catch {
    return false;
  }
}

/** Marca o resultado com um estado que nao e `ok`. */
function recusa(r, estado) {
  r.estado = estado;
}

/** O `caminho` (ja real) esta dentro da `raiz` (ja real)? */
function dentroDe(raiz, caminho) {
  const rel = relative(raiz, caminho);
  // `..lista` e um nome de ficheiro DENTRO da raiz; so `..` e `../` saem dela.
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

/**
 * Le a lista. Devolve `{ estado, nomes, caminho }`: `nomes` e `[{ nome, linha }]`, com a linha do ficheiro
 * (as recusas citam a LINHA, nao o nome: a mensagem entra no contexto de um agente, #375 R7).
 * @param {{ env?: Record<string, string | undefined>, home?: string, raiz: string, desligado?: (raiz: string) => boolean }} opcoes
 */
export function carregaLista({ env = process.env, home = homedir(), raiz, desligado = desligadoNoRepo }) {
  const caminho = caminhoDaLista({ env, home });
  const r = { estado: "ok", nomes: [], caminho };
  let texto;
  let existe = true;
  try {
    // `lstat`, e nao `stat`: um symlink sem alvo EXISTE (e da `ilegivel` no `realpath`), nao e `sem-lista`.
    lstatSync(caminho);
  } catch (err) {
    existe = !(err && err.code === "ENOENT");
  }
  let real;
  if (desligado(raiz)) recusa(r, "desligado");
  else if (!existe) recusa(r, env[VARIAVEL] ? "ilegivel" : "sem-lista");
  else {
    try {
      real = realpathSync.native(caminho);
    } catch {
      recusa(r, "ilegivel");
    }
  }
  // Pelo caminho REAL dos dois lados: um symlink fora do repo para uma lista dentro dele continua dentro.
  // O `.native` devolve a caixa REAL do disco: num macOS sem caixa, `/users/...` passava por fora do repo.
  if (real && dentroDe(realpathSync.native(raiz), real)) recusa(r, "dentro-do-repo");
  else if (real) {
    try {
      texto = readFileSync(real, "utf8");
    } catch {
      recusa(r, "ilegivel");
    }
  }
  if (r.estado === "ok") {
    r.nomes = (texto ?? "")
      .normalize("NFC")
      .split(/\r\n|\r|\n/)
      .map((l, i) => ({ nome: l.trim(), linha: i + 1 }))
      .filter((n) => n.nome && !n.nome.startsWith("#") && /[\p{L}\p{N}]/u.test(n.nome));
    if (r.nomes.length === 0) recusa(r, "vazia");
  }
  return r;
}

/** O que cada estado que nao e `ok` quer dizer, para as mensagens dos tres consumidores. */
export const RAZOES = {
  desligado: `a verificacao de nomes proibidos esta DESLIGADA neste repo (\`git config --local ${INTERRUPTOR} desligado\`)`,
  "sem-lista": "nao ha lista de nomes proibidos",
  ilegivel: "a lista de nomes proibidos nao se consegue ler (em falta no caminho da variavel, uma pasta, um symlink sem alvo, ou sem permissao)",
  vazia: "a lista de nomes proibidos nao tem nenhum nome (so comentarios ou linhas em branco)",
  "dentro-do-repo": "a lista de nomes proibidos esta DENTRO do repo — a um `git add` de ficar publica",
};

/** Uma regex por nome: sem caixa, `-`/` `/`_` equivalentes, e sem casar dentro de uma palavra maior. */
export function padroes(nomes) {
  return nomes.map(({ nome, linha }) => {
    const partes = nome.normalize("NFC").split(/[-\s_]+/).filter(Boolean).map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    return { linha, re: new RegExp(`(?<![\\p{L}\\p{N}])${partes.join("[-\\s_]+")}(?![\\p{L}\\p{N}])`, "iu") };
  });
}

/** As linhas da lista cujos nomes aparecem no `texto`. */
export function encontra(texto, regexes) {
  return regexes.filter(({ re }) => re.test((texto ?? "").normalize("NFC"))).map(({ linha }) => linha);
}
