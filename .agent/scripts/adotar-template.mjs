#!/usr/bin/env node
/**
 * Traz o template para um projeto que JA EXISTE — {{PROJECT_NAME}}
 *
 * Corre-se do CLONE do template, dentro do projeto (#288):
 *
 *   git clone --depth 1 https://github.com/gpsilv4/agent-template ../agent-template
 *   node ../agent-template/.agent/scripts/adotar-template.mjs            # copia
 *   node ../agent-template/.agent/scripts/adotar-template.mjs --simular  # so lista
 *
 * PORQUE UM SCRIPT, e nao um ciclo de shell no README: a primeira versao do procedimento era
 * shell, e uma leitura independente encontrou quatro defeitos altos que o texto nao mostrava —
 * as colisoes listadas DEPOIS da copia (tudo "colide", porque ja la esta), um `$TPL` vazio a
 * fazer o `git -C ""` ler o repo do PROJETO, o §2.7 a apagar um `codeql.yml` que era do projeto,
 * e a Fase 0-R a ler os ficheiros acabados de copiar como se fossem codigo da app (incluindo o
 * `LICENSE` MIT do template). Os quatro tem a mesma causa: depois da copia ja nao se sabe o que
 * veio de onde. Este script decide ANTES de copiar, e escreve-o.
 *
 * O MANIFESTO (`.agent/adocao.json`) e o que o BOOTSTRAP le: `copiados` (o que veio do template —
 * a 0-R ignora-os, o §2.7 so remove destes, o commit final so adiciona estes), `colisoes` (o que o
 * projeto ja tinha e e diferente — o Passo 4 funde-os com a copia em `template.caminho`),
 * `perguntar` (o que nao se copia sem decisao: o `LICENSE`) e a origem do template (o §2.0 grava a
 * marca a partir daqui, e nunca do `git describe` do projeto — cujas tags sao do projeto).
 *
 * O QUE RECUSA, e porque: correr dentro do proprio template (copiava-se para si mesmo), um template
 * que ja e derivado (nao ha versao a declarar), um projeto ja adotado ou ja bootstrapado (e o
 * `/upgrade`), e um caminho que passe por um symlink ou por um ficheiro onde o template tem uma
 * pasta — escrever por um symlink pode sair do projeto. Esses caminhos ficam em `colisoes`.
 *
 * NAO APAGA NADA e nao sobrescreve nada: so cria ficheiros que nao existiam (`COPYFILE_EXCL`, que
 * tambem recusa um symlink quebrado posto no destino entretanto).
 *
 * UMA COPIA INTERROMPIDA RETOMA-SE, e nao recomeca: o manifesto escreve-se ANTES da copia, com
 * `estado: "a copiar"`, e so passa a `"completo"` no fim. Recomecar do zero classificava como
 * `iguais` os ficheiros que a primeira corrida ja tinha copiado — e o manifesto mentia: a 0-R lia-os
 * como do projeto, o §2.7 nao os removia, o commit final nao os adicionava.
 *
 * Sem dependencias e sem package.json, como os outros scripts de `.agent/scripts/`.
 */
import { execFileSync } from "child_process";
import { constants, copyFileSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, unlinkSync, writeFileSync } from "fs";
import { dirname, join, relative, resolve, sep } from "path";
import { fileURLToPath } from "url";
import { ehDerivado } from "./lib/derivado.mjs";

/** O que nunca se copia sem decisao do utilizador: uma licenca nao se herda por omissao. */
export const PERGUNTAR = ["LICENSE"];
export const MANIFESTO = ".agent/adocao.json";

const lerOuNull = (raiz, rel) => {
  try {
    return readFileSync(join(raiz, rel), "utf8");
  } catch {
    return null;
  }
};

/** Como um caminho do template fica no projeto. `livre` copia-se; `igual` ja la esta com o mesmo
 *  conteudo; `colide` e diferente, ou o caminho passa por um symlink ou por um nao-diretorio. */
export function estadoNoProjeto(tpl, proj, rel) {
  const partes = rel.split("/");
  for (let i = 1; i < partes.length; i++) {
    const pai = join(proj, ...partes.slice(0, i));
    let st;
    try {
      st = lstatSync(pai);
    } catch {
      return "livre"; // um pai que nao existe: nada abaixo dele existe
    }
    if (st.isSymbolicLink() || !st.isDirectory()) return "colide";
  }
  let st;
  try {
    st = lstatSync(join(proj, rel));
  } catch {
    return "livre";
  }
  if (!st.isFile()) return "colide";
  return readFileSync(join(proj, rel)).equals(readFileSync(join(tpl, rel))) ? "igual" : "colide";
}

/** Decide tudo, sem escrever nada. Lanca com a razao quando a adocao nao deve correr. */
export function planear(tpl, proj, git = (args) => execFileSync("git", ["-C", tpl, ...args], { encoding: "utf8" })) {
  const rTpl = realpathSync(tpl);
  const rProj = realpathSync(proj);
  const derivado = ehDerivado((rel) => lerOuNull(rTpl, rel));
  if (rProj === rTpl && derivado) {
    // Corrido a partir da raiz de um derivado, onde este script tambem vive: a resposta e o /upgrade.
    throw new Error("isto e um projeto ja bootstrapado a partir do template, e nao um clone dele — para o atualizar, e o /upgrade");
  }
  if (rProj === rTpl || rProj.startsWith(rTpl + sep) || rTpl.startsWith(rProj + sep)) {
    throw new Error(`o projeto (${rProj}) e o template (${rTpl}) sobrepoem-se — corre isto dentro do PROJETO, com o clone do template noutra pasta`);
  }
  if (derivado) {
    throw new Error(`${rTpl} nao e o template por estrear (tem .agent/.template-version, ou nao tem o BOOTSTRAP.md) — clona o template de novo`);
  }
  if (existsSync(join(rProj, ".agent/.template-version"))) {
    throw new Error("o projeto ja foi bootstrapado a partir do template — para o atualizar, e o /upgrade");
  }
  // O manifesto escreve-se em `.agent/`: por um symlink, ia parar fora do projeto.
  const agent = (() => {
    try {
      return lstatSync(join(rProj, ".agent"));
    } catch {
      return null;
    }
  })();
  if (agent && (agent.isSymbolicLink() || !agent.isDirectory())) {
    throw new Error("o .agent do projeto nao e uma pasta real (e um symlink ou um ficheiro) — o manifesto sairia do projeto");
  }
  if (git(["status", "--porcelain", "--untracked-files=no"]).trim()) {
    throw new Error(`o clone do template (${rTpl}) tem alteracoes locais — o manifesto atribuia ao commit dele um conteudo que nao e o dele`);
  }
  const anterior = lerOuNull(rProj, MANIFESTO);
  if (anterior !== null) {
    const m = (() => {
      try {
        return JSON.parse(anterior);
      } catch {
        return null;
      }
    })();
    const listas = ["copiados", "colisoes", "iguais", "perguntar"];
    if (!m || typeof m !== "object" || !listas.every((k) => Array.isArray(m[k])) || typeof m.template?.commit !== "string") {
      throw new Error(`${MANIFESTO} ilegivel (JSON invalido ou sem as listas) — nao se sabe o que veio do template; repoe-no ou, se nada foi copiado, apaga-o`);
    }
    if (m.estado !== "a copiar") {
      throw new Error(`${MANIFESTO} ja existe — a adocao ja correu; continua o bootstrap (ou, ja feito, e o /upgrade)`);
    }
    if (m.template?.commit !== git(["rev-parse", "HEAD"]).trim()) {
      throw new Error(`a adocao interrompida era do commit ${m.template?.commit} e o clone esta noutro — repoe o clone nesse commit`);
    }
    // Um ficheiro que a corrida interrompida copiou e que agora DIFERE do template: uma copia
    // cortada a meio, ou uma edicao entre as duas corridas. Passa-lo a `colisoes` em silencio era
    // chamar "do projeto" a um ficheiro do template — o Passo 4 propunha funde-lo.
    const divergentes = m.copiados.filter((rel) => estadoNoProjeto(rTpl, rProj, rel) === "colide");
    if (divergentes.length) {
      throw new Error(`a adocao interrompida deixou ficheiros diferentes do template: ${divergentes.join(", ")} — apaga-os (sao do template) e corre outra vez`);
    }
    // O caminho e o do clone ATUAL: o anterior pode ja nao existir (o mesmo commit, noutra pasta).
    return { ...m, template: { ...m.template, caminho: rTpl }, tpl: rTpl, proj: rProj, retomar: true };
  }
  const ficheiros = git(["ls-files", "-z"]).split("\0").filter(Boolean);
  if (ficheiros.length === 0) throw new Error(`${rTpl} nao tem ficheiros no git — e um clone do template?`);
  const plano = { estado: "a copiar", copiados: [], colisoes: [], iguais: [], perguntar: [] };
  for (const rel of ficheiros) {
    const estado = estadoNoProjeto(rTpl, rProj, rel);
    if (estado === "igual") plano.iguais.push(rel);
    else if (estado === "colide") plano.colisoes.push(rel);
    else if (PERGUNTAR.includes(rel)) plano.perguntar.push(rel);
    else plano.copiados.push(rel);
  }
  const origem = (() => {
    try {
      const url = git(["remote", "get-url", "origin"]).trim();
      // Um `https://<user>:<token>@...` nao pode ir para um ficheiro que se commita.
      if (!/^https?:\/\//i.test(url)) return url;
      const u = new URL(url);
      u.username = "";
      u.password = "";
      return u.toString();
    } catch {
      return null;
    }
  })();
  plano.template = {
    caminho: rTpl,
    origem,
    commit: git(["rev-parse", "HEAD"]).trim(),
    versao: lerOuNull(rTpl, ".agent/TEMPLATE_VERSION")?.trim() ?? null,
  };
  return { ...plano, tpl: rTpl, proj: rProj };
}

/** Escreve por um temporario exclusivo e `rename`: o `rename` substitui um symlink posto no
 *  destino, em vez de escrever no alvo dele. */
const gravaManifesto = (proj, manifesto) => {
  const tmp = join(proj, `${MANIFESTO}.${process.pid}.tmp`);
  writeFileSync(tmp, JSON.stringify(manifesto, null, 2) + "\n", { flag: "wx" });
  renameSync(tmp, join(proj, MANIFESTO));
};

/** Copia o que o plano diz, entre as duas escritas do manifesto. So cria; nunca sobrescreve.
 *  Um ficheiro que apareceu entre o plano e a copia NAO se copia: muda de lista, e o manifesto
 *  final diz o que de facto aconteceu. Recusar deixava uma retoma presa para sempre no mesmo
 *  ficheiro, e recomecar do zero era a mentira que o `estado` existe para impedir.
 *  @returns {object} o manifesto final */
export function executar({ tpl, proj, retomar = false, ...plano }) {
  mkdirSync(join(proj, ".agent"), { recursive: true });
  // O temporario de uma corrida que morreu entre o `writeFileSync` e o `renameSync`. So ficheiros
  // regulares: o nome e nosso, um symlink com ele nao.
  for (const f of readdirSync(join(proj, ".agent"))) {
    const p = join(proj, ".agent", f);
    if (/^adocao\.json\.\d+\.tmp$/.test(f) && lstatSync(p).isFile()) unlinkSync(p);
  }
  gravaManifesto(proj, { ...plano, estado: "a copiar" });
  const final = { ...plano, copiados: [], colisoes: [...plano.colisoes], iguais: [...plano.iguais] };
  for (const rel of plano.copiados) {
    // Os pais revalidam-se AQUI, e nao so no plano: um trocado por um symlink entretanto levava o
    // `mkdirSync` recursivo para fora do projeto. Esse caminho sai `colide`.
    const estado = estadoNoProjeto(tpl, proj, rel);
    if (estado === "colide") {
      final.colisoes.push(rel);
      continue;
    }
    if (estado === "igual") {
      // Numa retoma, e o que a corrida interrompida copiou; senao, alguem o pos la entretanto.
      (retomar ? final.copiados : final.iguais).push(rel);
      continue;
    }
    const destino = join(proj, rel);
    mkdirSync(dirname(destino), { recursive: true });
    // O `copyFileSync` leva o modo da origem (o bit de execucao dos hooks): o teste afirma-o.
    copyFileSync(join(tpl, rel), destino, constants.COPYFILE_EXCL);
    final.copiados.push(rel);
  }
  final.estado = "completo";
  gravaManifesto(proj, final);
  return final;
}

const lista = (titulo, xs) => {
  if (xs.length) console.log(`\n${titulo} (${xs.length}):\n${xs.map((x) => `  ${x}`).join("\n")}`);
};

// `realpath` dos dois lados: o node resolve symlinks no `import.meta.url` e nao no `argv[1]`, logo num
// caminho com um (o `/var` do macOS e um) a comparacao crua dava falso e a CLI saia 0 sem fazer nada.
const principal = (() => {
  try {
    return realpathSync(process.argv[1] ?? "") === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
})();
if (principal) {
  const args = process.argv.slice(2);
  // Um `--dry-run` (o palpite natural, com o README em ingles) nao pode cair na copia real.
  const desconhecidos = args.filter((a) => a !== "--simular");
  if (desconhecidos.length) {
    console.error(`  ERRO  argumento desconhecido: ${desconhecidos.join(" ")} — o unico e --simular`);
    process.exit(1);
  }
  const simular = args.includes("--simular");
  const tpl = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
  let plano;
  try {
    plano = planear(tpl, process.cwd());
  } catch (err) {
    console.error(`  ERRO  ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
  // O manifesto e o plano: os campos a mais (`tpl`/`proj`, e `retomar` numa retoma) nao se leem aqui (#312).
  const { proj, retomar } = plano;
  const manifesto = plano;
  if (retomar) console.log("\nA retomar uma adocao interrompida (o manifesto ficou `a copiar`).");
  lista("A copiar", manifesto.copiados);
  lista("Colidem — fundir na Fase 0-R, Passo 4 (nada foi tocado)", manifesto.colisoes);
  lista("Por decidir com o utilizador (nao copiado)", manifesto.perguntar);
  console.log(`\nIguais ao template: ${manifesto.iguais.length}. Template ${manifesto.template.versao ?? "(sem versao)"} @ ${manifesto.template.commit.slice(0, 7)}.`);
  if (simular) {
    console.log("\n--simular: nada foi escrito.");
    process.exit(0);
  }
  let final;
  try {
    final = executar(plano);
  } catch (err) {
    console.error(`  ERRO  ${err instanceof Error ? err.message : String(err)} — volta a correr: a adocao retoma onde parou`);
    process.exit(1);
  }
  lista("Apareceram durante a copia — passaram a colisoes", final.colisoes.filter((c) => !manifesto.colisoes.includes(c)));
  console.log(`\n${final.copiados.length} ficheiros copiados para ${relative(process.cwd(), proj) || "."}; manifesto em ${MANIFESTO}.`);
  console.log(`Guarda o clone (${manifesto.template.caminho}) ate o bootstrap acabar. Depois: abre o agente e pede`);
  console.log(`"Le o .agent/BOOTSTRAP.md e configura o projeto".`);
}
