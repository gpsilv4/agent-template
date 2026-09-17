/**
 * Harness do verificador de bundles — {{PROJECT_NAME}}
 *
 * Os construtores de fixture do `test-bundle-sizes.mjs`. **NAO e um entry point**: nao corre
 * testes, so monta o que eles medem.
 *
 * PORQUE VIVE A PARTE: a suite estava congelada nos `TETOS` do Guard 17, e a catraca exigiu a
 * divisao a primeira vez que ela cresceu ("Dividir antes de acrescentar"). E o mesmo padrao do
 * `test-surface-harness.mjs` e do `test-upgrade-harness.mjs`: um harness **importa-se**, nao
 * precisa de descoberta.
 *
 * Vale registar que a expectativa estava errada: esperava-se que mover a configuracao para
 * `config/bundles.mjs` encolhesse a suite. Nao encolheu — o ajudante que ESCREVE a config, com
 * a semantica parcial que a torna correcta, custa tanto como o fatiamento que substituiu. O
 * ganho da separacao e outro (o upgrade deixa de atropelar decisoes do projeto), e nao este.
 */
import { mkdtempSync, mkdirSync, writeFileSync, cpSync } from "fs";
import { gzipSync } from "zlib";
import { tmpdir } from "os";
import { fileURLToPath } from "url";
import { dirname, resolve, join } from "path";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
export const CHECKER = ".agent/scripts/check-bundle-sizes.mjs";


/** Cria uma sandbox com o checker e uma arvore .next/ vazia. */
export function sandbox() {
  const dir = mkdtempSync(join(tmpdir(), "bundle-test-"));
  mkdirSync(join(dir, ".agent", "scripts"), { recursive: true });
  cpSync(join(ROOT, CHECKER), join(dir, CHECKER));
  // A configuracao ESCREVE-SE, nao se fatia. Antes, cada patch tinha de encontrar o literal
  // dentro do ficheiro da logica e substitui-lo — e cada um trazia a sua guarda de "o patch
  // nao aplicou", com falsos positivos proprios. Com a config num ficheiro seu, montar a
  // configuracao de um teste e escrever seis linhas.
  //
  // E continua a ser a fixture a decidir: nenhum teste pode depender das rotas DESTE projeto,
  // porque num consumidor sao outras (`TP3`).
  porConfig(dir, { targets: TARGETS_FIXTURE, alvosReprovam: true });
  mkdirSync(join(dir, ".next", "static", "chunks", "app"), { recursive: true });
  return dir;
}

/** Escreve um chunk com `bytes` de conteudo compressivel e devolve o tamanho gzipped. */
export function chunk(dir, relPath, bytes, filler = "x") {
  const full = join(dir, ".next", relPath);
  mkdirSync(dirname(full), { recursive: true });
  const body = filler.repeat(bytes);
  writeFileSync(full, body);
  return gzipSync(Buffer.from(body)).length;
}

/** O `TARGETS` da FIXTURE, escrito aqui e **nao herdado do repo**.
 *
 *  A `sandbox()` copia o checker deste projeto, e com ele a configuracao DELE. Num consumidor
 *  essa configuracao e outra: acrescentar **uma** rota — a primeira coisa que o `BOOTSTRAP.md`
 *  §2.4 manda fazer — punha **7 destes 27 testes** vermelhos, todos com
 *  "nao foi possivel resolver os chunks proprios destas rotas". Verde no template, vermelho em
 *  todos os consumidores com UI, no dia 1: e o `TP3` na sua forma mais cara.
 *
 *  O mecanismo para evitar isto ja existia (`withTargets`) e **nunca era chamado** — codigo
 *  morto ao lado do defeito que ele resolvia. Medido pelo `simulate-upgrade.mjs`, que hoje e o
 *  controlo desta correccao: ele customiza o `TARGETS` do consumidor e exige verde. */
export const TARGETS_FIXTURE = { "/": { name: "Home", target: 160, alarm: 180 } };

/** Reescreve o literal TARGETS na copia do checker (para exercitar varias rotas). */
/** O estado da config de cada sandbox, em MEMORIA. A alternativa era ler o ficheiro e
 *  extrair os valores de volta — parse de JavaScript com regex, para saber o que esta suite
 *  acabou de escrever. Uma fixture nao precisa de ler o que ela propria pos la. */
export const configDe = new Map();

/** Escreve a configuracao do projeto na copia. E a unica forma de a montar — nao ha literal a
 *  procurar dentro da logica, logo nao ha "o patch nao aplicou" nem guarda para o detectar.
 *
 *  Substituiu o `withTargets` + `porAlvos` + dois `LITERAL_*`: ~40 linhas de fatiamento e as
 *  suas armadilhas (fixar um valor que ja era o actual produzia texto identico, e a guarda lia
 *  isso como "nao aplicou"). O ficheiro de config nao tem esse problema porque se ESCREVE. */
export function porConfig(dir, alteracao) {
  // PARCIAL: o que nao for dado fica como esta. Mudar o gate nao pode repor as rotas — a
  // primeira versao reescrevia tudo, e `suspenderAlvos()` a seguir a `withTargets()` apagava as
  // rotas que o teste tinha acabado de definir. O `porAlvos` antigo fatiava so a constante e
  // por isso nao tinha o problema: a semantica de "muda UMA coisa" veio com ele.
  const atual = configDe.get(dir) ?? { targets: TARGETS_FIXTURE, alvosReprovam: true };
  const { targets, alvosReprovam } = { ...atual, ...alteracao };
  configDe.set(dir, { targets, alvosReprovam });
  const corpo = Object.entries(targets)
    .map(([r, c]) => `  ${JSON.stringify(r)}: { name: ${JSON.stringify(c.name)}, target: ${c.target}, alarm: ${c.alarm} },`)
    .join("\n");
  const f = join(dir, ".agent/scripts/config/bundles.mjs");
  mkdirSync(dirname(f), { recursive: true });
  writeFileSync(f, `export const TARGETS = {\n${corpo}\n};\nexport const ALVOS_REPROVAM = ${alvosReprovam};\n`);
}

/** Acoes por nome, para cada teste DECLARAR a posicao do gate que mede em vez de a herdar. */
/** Acoes por nome, para cada teste DECLARAR o que mede em vez de o herdar do repo.
 *  O `withTargets` sobrevive como adaptador: os oito sitios de chamada dizem o que interessa
 *  (as rotas que o teste mede) e nao precisavam de mudar de forma so porque a config mudou de
 *  casa — um diff de ruido esconde o diff que interessa. */
export const withTargets = (dir, targets) => porConfig(dir, { targets, alvosReprovam: true });
export const suspenderAlvos = (dir) => porConfig(dir, { alvosReprovam: false });
export const ligarAlvos = (dir) => porConfig(dir, { alvosReprovam: true });

/** Escreve o manifesto RSC de uma rota, na forma que o Next escreve.
 *  A chave leva o caminho da rota — e numa rota dinamica leva parenteses rectos, que e a
 *  armadilha que a regex tem de sobreviver. */
export function manifestoRsc(dir, route, chunksPorModulo, { chaveLiteral = null, corpo = null } = {}) {
  const rel = route === "/" ? "" : route.slice(1);
  const f = join(dir, ".next", "server", "app", rel, "page_client-reference-manifest.js");
  mkdirSync(dirname(f), { recursive: true });
  const chave = chaveLiteral ?? `${route === "/" ? "" : route}/page`;
  const obj = corpo ?? {
    moduleLoading: { prefix: "/_next/" },
    clientModules: Object.fromEntries(
      chunksPorModulo.map((chunks, i) => [`mod${i}`, { id: i, name: "*", chunks }])
    ),
  };
  writeFileSync(
    f,
    `globalThis.__RSC_MANIFEST=(globalThis.__RSC_MANIFEST||{});\n` +
      `globalThis.__RSC_MANIFEST[${JSON.stringify(chave)}]=${typeof obj === "string" ? obj : JSON.stringify(obj)}\n`
  );
  return f;
}


export function manifest(dir, obj) {
  writeFileSync(join(dir, ".next", "build-manifest.json"), JSON.stringify(obj));
}

