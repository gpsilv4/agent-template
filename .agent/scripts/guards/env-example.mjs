/**
 * Guard 23: um ficheiro de EXEMPLO do `.env` nao traz um segredo real (#595) — {{PROJECT_NAME}}
 *
 * PORQUE EXISTE: o `.claude/settings.json` passou a deixar o agente ler e escrever o `.env.example`, o `.env.sample` e o
 * `.env.template` (um `!` no `deny`, BOOTSTRAP §2.9) — sao so placeholders, e o derivado F tinha de os editar a mao
 * quando uma variavel mudava. Antes, o `deny` negava-os de proposito porque "um ficheiro de exemplo costuma conter
 * valores realistas". Este guard e o que torna a abertura segura: um exemplo com cara de segredo reprova. E a mesma
 * verificacao trava a ADOCAO de um projeto que ja existia (`adotar-template.mjs`), antes de qualquer sessao do agente.
 *
 * O QUE REPROVA, em cada `.env.{example,sample,template}` da arvore (versionado ou nao — um acabado de escrever pelo
 * agente conta, que e o caso que importa; dentro de um `build/` ou de um `dist/` tambem, porque o `!` abre-os la):
 *   - um valor com a forma de um segredo de `lib/segredos.mjs` (chave de fornecedor, JWT, chave privada, URL com
 *     credencial) ou um hash de senha completo (Argon2, bcrypt);
 *   - um exemplo que nao e um ficheiro normal (symlink, pasta, FIFO): o `!` abre-o, e o que esta do outro lado nao e
 *     um ficheiro de placeholders.
 * Um symlink de PASTA segue-se, dentro ou FORA do repo (o `!` abre um exemplo la dentro pelo caminho do repo), uma vez
 * por alvo real — um ciclo para na segunda visita. Um symlink para uma arvore enorme (a casa, a raiz) varre-a: o custo
 * e o do tempo, e o de nao a varrer era um exemplo aberto sem verificacao.
 * Uma pasta ou um exemplo que NAO SE LE da so nota: o agente corre com o mesmo utilizador, e tambem nao o le (um
 * volume do docker-compose, `./pgdata` de outro dono, e o caso comum — reprova-lo travava uma adocao sem razao).
 *
 * O QUE PASSA (os placeholders; cada um tem o seu caso e o seu controlo no `tests-env-example.mjs`):
 *   - uma chave so de `x`/`0`, ou com `example`/`your`/`placeholder` (o `AKIAIOSFODNN7EXAMPLE` da doc da AWS);
 *   - um JWT com `role: anon` (a chave publica do Supabase, que se versiona de proposito), ou o de demonstracao do
 *     `supabase start` — so se a assinatura validar com o segredo de demonstracao, publico; um `iss` copiado nao chega;
 *   - um URL com credencial cuja SENHA e de exemplo (`<...>`, `[...]`, `${...}`, `x...`, `...`, igual ao utilizador,
 *     uma palavra do costume, ou com `password`/`your`/`example`/`changeme`/`placeholder`) ou cujo servidor e um dominio
 *     RESERVADO (`example.com`/`.org`/`.net`, `*.example`, `*.test`, `*.invalid`, `*.localhost` — RFC 2606/6761).
 *     O servidor `localhost` ou sem ponto NAO iliba sozinho: com um `port-forward` ou um proxy, a senha que vai para
 *     `localhost` e a de producao (leitura independente do #595). `postgres:postgres@db` passa pela senha.
 *
 * NUNCA imprime o valor — so o ficheiro, a linha e o tipo. Imprimi-lo punha o segredo no output do CI e no contexto
 * do agente, que e o que o `deny` existia para evitar.
 *
 * LIMITE, dito por inteiro: "limpo" quer dizer "sem forma CONHECIDA de segredo", nao "sem segredo" — um
 * `SESSION_SECRET` hexadecimal ou uma senha numa variavel a parte passam. Estreito de proposito (sem entropia: nao ha
 * limiar que se teste). O `gitleaks` do CI e a rede larga; este corre localmente, antes do push, e num derivado sem ele.
 */
import { createHmac } from "crypto";
import { lstatSync, readdirSync, readFileSync, realpathSync, statSync } from "fs";
import { join } from "path";
import { HASHES_DE_SENHA, SEGREDOS } from "../lib/segredos.mjs";

/** Os nomes de exemplo — os MESMOS que o `!` do `settings.json` abre (`ABERTAS` em `lib/permissoes.mjs`). */
export const NOMES_DE_EXEMPLO = new Set([".env.example", ".env.sample", ".env.template"]);

/** So o que nunca e do projeto. Um `build/` ou um `vendor/` ficam DENTRO: o `!` e um nome solto e abre-os a qualquer
 *  profundidade, logo o que ele abre tem de ser varrido (leitura independente do #595). */
const FORA = new Set([".git", "node_modules"]);

/** Uma senha de exemplo: um formato de placeholder, uma palavra do costume (inteira), ou uma que se declara exemplo.
 *  So maiusculas NAO chega: `K7QX9PL2` e uma senha gerada (leitura independente do #595). */
const SENHA_DE_EXEMPLO = /^(?:<[^>]*>|\[[^\]]*\]|\$\{[^}]*\}|x+|\.\.\.|pass|secret|root|postgres|admin|dev|test|user)$|password|your|example|changeme|placeholder/i;
/** Um dominio que nunca e um servidor real (RFC 2606 e 6761): o que la esteja nao autentica nada. */
const HOST_RESERVADO = /(?:^|\.)(?:example\.(?:com|org|net)|example|test|invalid)$|\.localhost$/i;
/** Uma chave que se declara de exemplo: so `x`/`0` no corpo, ou com `example`, `your`, `placeholder`. */
const CHAVE_DE_EXEMPLO = /x{6,}|0{8,}|example|your|placeholder/i;
/** O `jwt_secret` de demonstracao do `supabase start` — PUBLICO (o mesmo em todas as maquinas), e por isso nao e um
 *  segredo; com ele se prova que um token `iss: supabase-demo` e mesmo o de demonstracao, e nao um re-assinado. */
const SEGREDO_DEMO_SUPABASE = "super-secret-jwt-token-" + "with-at-least-32-characters-long";

/** O URL com credencial casado em `[inicio, fim)` de `linha` e de exemplo? A senha, e o servidor que vem a seguir. */
function urlDeExemplo(linha, inicio, fim) {
  const [, user, senha] = /:\/\/([^\s:@/]+):([^\s:@/]+)@$/.exec(linha.slice(inicio, fim)) ?? [];
  const host = /^[^\s/:?#]+/.exec(linha.slice(fim))?.[0] ?? "";
  return SENHA_DE_EXEMPLO.test(senha ?? "") || senha === user || HOST_RESERVADO.test(host);
}

/** Um JWT publico: a chave `anon` (feita para o cliente), ou o de demonstracao do `supabase start`, provado pela
 *  assinatura e nao pelo `iss` (que qualquer um copia). */
function jwtPublico(token) {
  const [h, p, s] = token.split(".");
  try {
    const carga = JSON.parse(Buffer.from(p, "base64url").toString("utf8"));
    if (carga.role === "anon") return true;
    return carga.iss === "supabase-demo" && createHmac("sha256", SEGREDO_DEMO_SUPABASE).update(`${h}.${p}`).digest("base64url") === s;
  } catch {
    return false;
  }
}

/**
 * Os exemplos sob `raiz`, relativos a ela: tudo o que tem nome de exemplo (ficheiro ou nao). Segue um symlink de pasta,
 * dentro ou fora da raiz (o `!` abre o exemplo pelo caminho pedido), uma vez por alvo real — um ciclo para na segunda
 * visita. Uma pasta que nao se le vai em `ilegiveis`.
 * @returns {{ exemplos: string[], ilegiveis: string[] }}
 */
export function exemplosEm(raiz) {
  const real = realpathSync(raiz);
  const vistas = new Set([real]);
  const exemplos = [];
  const ilegiveis = [];
  const desce = (rel) => {
    let entradas;
    try {
      entradas = readdirSync(join(raiz, rel), { withFileTypes: true });
    } catch {
      ilegiveis.push(rel || ".");
      return;
    }
    for (const e of entradas.sort((a, b) => a.name.localeCompare(b.name))) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (NOMES_DE_EXEMPLO.has(e.name)) exemplos.push(r);
      if (FORA.has(e.name)) continue;
      if (e.isDirectory()) desce(r);
      else if (e.isSymbolicLink() && !NOMES_DE_EXEMPLO.has(e.name)) {
        let alvo;
        try {
          alvo = statSync(join(raiz, r)).isDirectory() ? realpathSync(join(raiz, r)) : null;
        } catch {
          alvo = null; // symlink partido: nao abre nada
        }
        if (alvo === null || vistas.has(alvo)) continue;
        vistas.add(alvo);
        desce(r);
      }
    }
  };
  desce("");
  return { exemplos, ilegiveis };
}

/** O que ha de errado num exemplo: `{ linha, o }`, sem o valor. */
export function achadosDe(texto) {
  const achados = [];
  // Um comentario tambem se varre: um segredo comentado continua versionado, e o agente le-o na mesma.
  texto.split(/\r?\n/).forEach((l, i) => {
    for (const { re, o, url } of [...SEGREDOS, ...HASHES_DE_SENHA]) {
      const reais = [...l.matchAll(new RegExp(re.source, `${re.flags}g`))].filter((m) =>
        url ? !urlDeExemplo(l, m.index, m.index + m[0].length) : !CHAVE_DE_EXEMPLO.test(m[0]) && !(m[0].startsWith("eyJ") && jwtPublico(m[0])));
      if (reais.length) {
        achados.push({ linha: i + 1, o });
        break;
      }
    }
  });
  return achados;
}

/**
 * Os problemas de cada exemplo sob `raiz`, prontos a imprimir (nunca com o valor), e as notas (o que nao se le).
 * Partilhado pelo guard e pela adocao.
 * @returns {{ exemplos: string[], problemas: string[], notas: string[] }}
 */
export function problemasDosExemplos(raiz) {
  const { exemplos, ilegiveis } = exemplosEm(raiz);
  const problemas = [];
  const naoLe = "o agente tambem nao o le (o mesmo utilizador), logo nao abre nada, mas nao foi verificado";
  const notas = ilegiveis.map((d) => `${d}/: nao consegui ler a pasta — ${naoLe}`);
  for (const f of exemplos) {
    let st;
    try {
      st = lstatSync(join(raiz, f));
      if (!st.isFile()) {
        problemas.push(`${f}: nao e um ficheiro normal (${st.isSymbolicLink() ? "um symlink" : st.isDirectory() ? "uma PASTA" : "um FIFO ou dispositivo"}) — o \`deny\` abre os exemplos do \`.env\`, e o que esta do outro lado nao e um ficheiro de placeholders`);
        continue;
      }
      for (const { linha, o } of achadosDe(readFileSync(join(raiz, f), "utf8"))) {
        problemas.push(`${f}:${linha}: ${o} — um ficheiro de exemplo so leva placeholders (\`<real-key>\`, \`(gerar com ...)\`, vazio); o valor nao se mostra aqui`);
      }
    } catch (err) {
      notas.push(`${f}: nao consegui ler (${err instanceof Error ? err.code ?? err.message : String(err)}) — ${naoLe}`);
    }
  }
  return { exemplos, problemas, notas };
}

export function guardEnvExemplo({ warn, ok, skip, note, ROOT }) {
  const r = problemasDosExemplos(ROOT);
  for (const n of r.notas) note(`Guard 23: ${n}`);
  if (r.exemplos.length === 0 && r.problemas.length === 0) {
    skip("Guard 23 (exemplos do `.env` sem segredos) — nenhum `.env.example`/`.env.sample`/`.env.template` no repo");
    return 0;
  }
  for (const p of r.problemas) warn(p);
  if (r.problemas.length === 0) ok(`exemplos do \`.env\` sem segredos com forma conhecida (${r.exemplos.join(", ")})`);
  return 1;
}
