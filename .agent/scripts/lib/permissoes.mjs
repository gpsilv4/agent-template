/**
 * As SONDAS do Guard 11 e a comparacao do `deny`/`ask` com o template — {{PROJECT_NAME}}
 *
 * PORQUE EXISTE (#301, R7B-1 da ronda 8): o `settings.json` de um derivado real tinha 18 `deny` e
 * 7 `ask` quando o do template ja tinha 47 e 22. Faltava o `ask` de `Edit(./.claude/hooks/**)` —
 * um agente podia editar os hooks sem perguntar — e nenhum verificador o disse. O Guard 11
 * verificava o `deny` contra 12 alvos escritos a mao, e tudo o que o template acrescentou depois
 * a lista dele ficou sem rede. E o `TP8`: a lista do template e a do guard concordavam a mao.
 *
 * Agora concordam por TESTE: `tests-settings.mjs` le o `settings.json` do template e reprova se
 * uma regra dele nao for exercida por nenhuma sonda daqui. Uma regra nova no template sem sonda
 * nova reprova no PR que a acrescenta, e nao tres rondas depois num derivado.
 *
 * Sem avisos aqui (so dados e funcoes puras): os sitios de aviso vivem no guard, que esta em
 * `PARES`.
 */

/**
 * Traduz um glob de permissao (`./**\/*.pem`, `~/.ssh/**`) num regex ancorado. Numa passagem so:
 * fazer os `replace` em cadeia era um bug — o `.*` do passo do `**` tinha um `*` que o passo
 * seguinte voltava a reescrever, e um deny correcto era dado como em falta.
 */
function globParaRegex(glob) {
  const g = glob.replace(/^\.\//, "");
  let rx = "";
  for (let i = 0; i < g.length; i++) {
    if (g[i] === "*" && g[i + 1] === "*") {
      if (g[i + 2] === "/") { rx += "(?:[^/]+/)*"; i += 2; }
      else { rx += ".*"; i += 1; }
    } else if (g[i] === "*") {
      rx += "[^/]*";
    } else {
      // Um so caracter de cada vez; o `g` nao muda nada, e fecha o alerta do CodeQL.
      rx += g[i].replace(/[.+^${}()|[\]\\?]/g, "\\$&");
    }
  }
  return new RegExp(`^${rx}$`);
}

/**
 * Alguma regra de `regras` cobre `alvo` para `ferramenta`? Segue a sintaxe documentada do Claude
 * Code (code.claude.com/docs/en/permissions, lida no #301):
 *  - `Bash(x:*)` e `Bash(x *)` exigem fronteira de palavra (`Bash(ls *)` nao apanha `lsof`); so o
 *    `*` COLADO (`Bash(ls*)`) e prefixo cru. Ler `:*` como prefixo cru dava `Bash(rm -:*)` por bom
 *    para os sete `rm` destrutivos, e `Bash(git push --force:*)` por bom para o `--force-with-lease`
 *    (leitura independente do #301);
 *  - um caminho sem `/` e um nome solto e casa a qualquer profundidade (gitignore: `Read(.env)` e
 *    `Read(**\/.env)` sao a mesma regra); `./x` e `/x` ancoram na raiz do projeto; `//x` e absoluto
 *    e `~/x` e a casa, e nenhum dos dois cobre um caminho do repo;
 *  - o nome nu (`Edit`) e a ferramenta INTEIRA.
 * Na duvida, NAO cobre: um aviso a mais custa uma leitura, um silencio indevido custa a fronteira.
 * @param {unknown[]} regras
 * @param {string} ferramenta
 * @param {string} alvo
 */
export function cobre(regras, ferramenta, alvo) {
  return regras.some((r) => {
    if (typeof r !== "string") return false;
    if (r.trim() === ferramenta) return true;
    const m = /^([A-Za-z]+)\((.*)\)$/.exec(r.trim());
    if (!m || m[1] !== ferramenta) return false;
    if (ferramenta !== "Bash") {
      const cru = m[2].trim();
      const glob = cru.includes("/") ? cru.replace(/^\/(?!\/)/, "") : `**/${cru}`;
      // Um `~/` so e coberto por um padrao com `~/`: senao `Read(./**/id_*)` dava por coberto o
      // `~/.ssh/id_ed25519` (o `~` lido como uma pasta do repo), e apagar o deny de `~/.ssh` calava-se.
      return alvo.startsWith("~/") === glob.startsWith("~/") && globParaRegex(glob).test(alvo);
    }
    const corpo = m[2];
    const palavra = /^(.*?)(?::\*| \*)\s*$/.exec(corpo);
    if (palavra) {
      const p = palavra[1].trim();
      return alvo === p || alvo.startsWith(`${p} `);
    }
    const colado = /^(.*)\*\s*$/.exec(corpo);
    return colado ? alvo.startsWith(colado[1].trim()) : alvo === corpo.trim();
  });
}

/**
 * Leitura de SEGREDOS que o `deny` tem de cobrir — todas as classes que o template protege, na raiz
 * e aninhadas.
 */
export const LEITURAS_NEGADAS = [
  ".env", ".env.local", ".env.production", "a/b/.env", "a/.env.local",
  "chave.pem", "a/chave.pem", "tls.key", "a/b/tls.key", "id_rsa", "a/id_rsa.pub", "a/id_ed25519", ".npmrc", "a/.npmrc",
  "credentials.json", "a/credentials.json", "secrets/db.json", "a/secrets/db.json",
  ".envrc", "a/.netrc", "a/.pgpass", "a/.git-credentials", "a/cert.p12", "a/cert.pfx", "a/keystore.jks",
  "~/.ssh/id_ed25519", "~/.aws/credentials", "~/.npmrc", "~/.config/gh/hosts.yml",
];

/**
 * O resto da fronteira. `lista`: onde a regra TEM de estar — `deny`, ou `ask` (e ai o `deny` tambem
 * serve: e mais estrito). `nota: true` e o que depende da stack ou do fluxo do projeto (um projeto
 * Python nao usa `yarn`; um fluxo de rebase usa `--force-with-lease`): avisa sem reprovar. `pasta`:
 * a sonda so conta se a pasta existir — um derivado sem `.githooks/` nao tem nada a proteger la.
 */
const BASH = (lista, cmds, extra = {}) => cmds.map((c) => ({ lista, ferramenta: "Bash", alvo: `${c} x`, ...extra }));
export const SONDAS = [
  // A configuracao de permissoes e os segredos nao se escrevem.
  ...["Edit", "Write"].flatMap((f) => [".claude/settings.json", ".claude/settings.local.json", ".env.local", "a/.env"].map((alvo) => ({ lista: "deny", ferramenta: f, alvo }))),
  ...BASH("deny", ["git push --force", "git push -f", "git reset --hard", "rm -rf", "rm -fr", "rm -Rf", "rm -fR", "rm -r -f", "rm -f -r", "rm --recursive --force"]),
  ...BASH("deny", ["git push --force-with-lease"], { nota: true }),
  // A FRONTEIRA: sem isto um agente edita os hooks, os git hooks e os agentes sem perguntar (R7B-1).
  // Um ficheiro na raiz da pasta e um em `lib/`: `Edit(./.claude/hooks/*.mjs)` cobria o primeiro e
  // deixava aberto o `lib/fronteira.mjs`, que e onde a decisao vive (leitura independente do #301).
  ...["Edit", "Write"].flatMap((f) => [
    ...[".claude/hooks/x.mjs", ".claude/hooks/lib/x.mjs"].map((alvo) => ({ lista: "ask", ferramenta: f, alvo, pasta: ".claude/hooks" })),
    ...[".githooks/commit-msg", ".githooks/lib/x.mjs"].map((alvo) => ({ lista: "ask", ferramenta: f, alvo, pasta: ".githooks" })),
    { lista: "ask", ferramenta: f, alvo: ".claude/agents/x.md", pasta: ".claude/agents" },
  ]),
  ...BASH("ask", ["git commit", "git push", "npm install"]),
  ...BASH("ask", ["git merge", "gh pr merge", "npm uninstall", "pnpm add", "pnpm remove", "yarn add", "yarn remove", "bun add", "bun remove", "pip install", "git checkout -b", "git switch -c", "git branch"], { nota: true }),
];

/** Uma sonda descrita como quem le a mensagem a escreveria: `Edit` de `.githooks/commit-msg`. */
export const descreve = ({ ferramenta, alvo }) => (ferramenta === "Bash" ? `\`${alvo.replace(/ x$/, "")}\`` : `\`${ferramenta}\` de \`${alvo}\``);

/**
 * O que falta a `perms` (o `permissions` de um settings.json), sonda a sonda: `{ tipo, sonda }`, com
 * `tipo` `leitura` (alvo de `LEITURAS_NEGADAS`), `deny` ou `ask`. O guard decide o nivel; o teste de
 * remocao um a um usa a mesma funcao, para medir com a semantica que o guard aplica.
 * @param {{ deny?: unknown, ask?: unknown }} perms
 * @param {(pasta: string) => boolean} [existe]
 */
export function emFalta(perms, existe = () => true) {
  const lista = (v) => (Array.isArray(v) ? v : []);
  const deny = lista(perms.deny);
  const ask = lista(perms.ask);
  return [
    ...LEITURAS_NEGADAS.filter((a) => !cobre(deny, "Read", a)).map((alvo) => ({ tipo: "leitura", sonda: { ferramenta: "Read", alvo } })),
    ...SONDAS.filter((s) => !s.pasta || existe(s.pasta))
      .filter((s) => !cobre(s.lista === "deny" ? deny : [...ask, ...deny], s.ferramenta, s.alvo))
      .map((sonda) => ({ tipo: sonda.lista, sonda })),
  ];
}

/** Se `regra` (`Bash(cmd)` ou `Bash(cmd:*)`) cai num prefixo `Bash(p:*)` de `regras`: o mesmo comando, ou ele
 *  seguido de argumentos. */
const cobertaPorPrefixo = (regra, regras) => {
  const cmd = /^Bash\((.*?)(?::\*)?\)$/.exec(regra)?.[1];
  if (cmd === undefined) return false;
  return [...regras].some((p) => {
    const pre = /^Bash\((.*):\*\)$/.exec(p)?.[1];
    return pre !== undefined && (cmd === pre || cmd.startsWith(`${pre} `));
  });
};
/** Uma regra do `allow` que corre um script da maquinaria do template (`node .agent/scripts/...`, os hooks). */
const MAQUINARIA_NO_ALLOW = /\bnode\s+(?:\.\/)?\.(?:agent\/scripts|claude\/hooks)\//;

/**
 * As regras do `deny`/`ask` do template que o projeto nao tem, LITERALMENTE (e as do `allow` da maquinaria que
 * ele nao tem nem cobre por um prefixo `Bash(x:*)`). Literal de proposito no `deny`/`ask`:
 * e uma lista para copiar, e a equivalencia (um `Read(./**\/.env*)` que cobre quatro) e o Guard 11
 * que a julga. `null` quando um dos dois nao se le — "nao comparei" nao e "nao falta nada".
 * @param {string | null} projetoRaw
 * @param {string | null} templateRaw
 * @returns {{ deny: string[], ask: string[], allow: string[] } | null}
 */
export function regrasEmFalta(projetoRaw, templateRaw) {
  const le = (raw) => {
    try {
      return raw === null ? null : JSON.parse(raw).permissions ?? {};
    } catch {
      return null;
    }
  };
  const p = le(projetoRaw);
  const t = le(templateRaw);
  if (!p || !t) return null;
  const lista = (v) => (Array.isArray(v) ? v.filter((r) => typeof r === "string") : []);
  const negadas = new Set(lista(p.deny));
  const tem = new Set([...lista(p.deny), ...lista(p.ask)]);
  const permitidas = new Set(lista(p.allow));
  return {
    // So o `deny` do projeto conta: a mesma regra no `ask` e MAIS FRACA, e falta.
    deny: lista(t.deny).filter((r) => !negadas.has(r)),
    // Uma regra do `ask` do template que o projeto pos no `deny` e mais estrita: nao falta.
    ask: lista(t.ask).filter((r) => !tem.has(r)),
    // Do `allow`, so o que corre a MAQUINARIA do template (#317, item 25): sem ela cada verificador pede
    // aprovacao (o Guard 11 so o diz como NOTE), e no `/upgrade` da v0.59.0 a linha nova teve de ser
    // acrescentada a mao. O resto do `allow` e escolha do projeto, e lista-lo era ruido. Uma que o projeto pos
    // no `ask`/`deny` e decisao dele (leituras do #317): pedir aprovacao, de proposito, nao e falta.
    // E COBERTA por um prefixo (`Bash(node x.mjs:*)` cobre `Bash(node x.mjs --list)`), que e como o Claude Code
    // compara: medido no derivado privado B, a comparacao literal pedia 6 regras que ele ja tinha assim.
    allow: lista(t.allow).filter((r) => MAQUINARIA_NO_ALLOW.test(r) && !permitidas.has(r) && !tem.has(r) && !cobertaPorPrefixo(r, [...permitidas, ...tem])),
  };
}
