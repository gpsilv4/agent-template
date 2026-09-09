/**
 * Guard 11: sanidade do .claude/settings.json — {{PROJECT_NAME}}
 *
 * Extraido do `check-doc-versions.mjs`, onde eram 266 das suas 911 linhas — 29% de um
 * ficheiro que violava a regra dos 500 que ele proprio impoe.
 *
 * O CORPO ESTA VERBATIM. A indentacao nao foi reajustada de proposito: o ficheiro mistura
 * backticks de template literals com backticks dentro de classes de regex (`/[;|&`\n]/`),
 * o que torna qualquer re-indentacao automatica insegura. Mantendo o corpo intacto, este
 * refactor e auditavel como um MOVIMENTO — o output tem de ficar byte-a-byte igual — e nao
 * como uma reescrita onde um erro se pode esconder.
 *
 * Os avisos vivem aqui, logo este ficheiro tem de estar em `PARES` no `mutation-sweep.mjs`:
 * sem isso a varredura passaria a cobrir 645 linhas em vez de 911 e reportaria 100% a mentir.
 */

/** @returns {number} guards executados (0 se o ficheiro nao existe) */
export function guardSettings({ read, warn, ok, note, skip }) {
  let guardsRun = 0;

// --- Guard 11: sanidade do .claude/settings.json ---
// E a fronteira de seguranca do projeto e nao tinha rede nenhuma: um `allow` demasiado
// largo passava CI sem sinal. Nao substitui revisao humana — apanha as regressoes obvias.
const SETTINGS_PATH = ".claude/settings.json";
const settingsRaw = read(SETTINGS_PATH);
if (settingsRaw === null) {
  skip(`Guard 11 (${SETTINGS_PATH}) — ficheiro ausente (projeto pode nao usar Claude Code)`);
} else {
  let settings = null;
  try {
    settings = JSON.parse(settingsRaw);
  } catch (err) {
    warn(`${SETTINGS_PATH} nao e JSON valido (${err instanceof Error ? err.message : String(err)})`);
  }
  if (settings) {
    const perms = settings.permissions ?? {};
    const asList = (v, name) => {
      if (v === undefined) return [];
      if (Array.isArray(v)) return v;
      warn(`${SETTINGS_PATH}: \`permissions.${name}\` devia ser um array`);
      return [];
    };
    const denyRaw = asList(perms.deny, "deny");
    const allow = asList(perms.allow, "allow");
    let issues = 0;
    const flag = (msg) => {
      warn(`${SETTINGS_PATH}: ${msg}`);
      issues++;
    };
    // Filtrar DEPOIS de `flag` existir: uma versao anterior usava `warn` aqui, logo
    // `issues` ficava 0 e o guard imprimia o WARN e o OK ao mesmo tempo.
    const deny = denyRaw.filter((r) => {
      if (typeof r === "string") return true;
      flag(`entrada do \`deny\` que nao e string (${JSON.stringify(r)})`);
      return false;
    });

    // Cobertura do deny de secrets: verificar que ALGUM padrao cobre cada caminho tipico,
    // em vez de exigir os 4 literais. Um projeto com `Read(./**/.env*)` (superset estrito)
    // era reportado como tendo o deny em falta.
    const denyCovers = (target) =>
      deny.some((rule) => {
        const m = /^Read\((.*)\)$/.exec(rule);
        if (!m) return false;
        // Traducao glob->regex numa passagem unica. Fazer os `replace` em cadeia era
        // um bug: o `.*` inserido pelo passo do `**` continha um `*` que o passo
        // seguinte voltava a reescrever, produzindo `(?:.[^/]*/)?` — que nao casa com
        // caminhos aninhados, e o guard reportava um deny correcto como estando em falta.
        const glob = m[1].replace(/^\.\//, "");
        let rxSrc = "";
        for (let i = 0; i < glob.length; i++) {
          if (glob[i] === "*" && glob[i + 1] === "*") {
            if (glob[i + 2] === "/") { rxSrc += "(?:[^/]+/)*"; i += 2; }
            else { rxSrc += ".*"; i += 1; }
          } else if (glob[i] === "*") {
            rxSrc += "[^/]*";
          } else {
            rxSrc += glob[i].replace(/[.+^${}()|[\]\\?]/, "\\$&");
          }
        }
        const rx = new RegExp(`^${rxSrc}$`);
        return rx.test(target);
      });
    // Alvos de TODAS as classes de secret que o template protege — nao so `.env*`.
    // Apagar as regras de `*.pem`/`id_rsa`/`secrets/**` era invisivel.
    for (const target of [
      ".env", ".env.local", ".env.production", "a/b/.env", "a/.env.local",
      "chave.pem", "a/b/tls.key", "id_rsa", "a/id_rsa.pub", ".npmrc",
      "credentials.json", "a/secrets/db.json",
    ]) {
      if (!denyCovers(target)) flag(`nenhuma regra \`deny\` cobre a leitura de \`${target}\` (nota: o tradutor de glob nao expande braces \`{a,b}\`)`);
    }

    // Um `allow` demasiado largo anula o deny ao lado. Casos que ja foram reais aqui:
    // `Bash(npm run lint*)` cobria `npm run lint-and-deploy`; `Bash(node .agent/scripts/*)`
    // cobria qualquer ficheiro nesse caminho; `Bash(*)` e `Bash(rm -rf *)` abriam tudo; e
    // `Bash` sem parenteses e a concessao maxima possivel.
    // A propriedade que interessa nao e a FORMA da regra — e se o argumento fica
    // constrangido. Uma versao anterior testava a forma e por isso aprovava
    // `Bash(/bin/sh:*)` (prefixo derrota o `^`), `Bash(npm:*)` (npm exec e arbitrario),
    // `Bash ` (sem trim), `Grep`/`NotebookEdit`/`mcp__*` (fora da lista hardcoded), e
    // ao mesmo tempo marcava como perigosa a concessao estreita e legitima
    // `Bash(node .agent/scripts/x.mjs:*)`.
    // O que interessa e se o argumento fica constrangido. Formas que versoes anteriores
    // aprovaram, cada uma por uma razao diferente:
    //   `Bash(sh:*)`            -> apanhado
    //   `Bash(/bin/sh:*)`       -> prefixo derrotava um `^` ancorado
    //   `Bash(env -i sh:*)`     -> remover o wrapper deixava a FLAG como head
    //   `Bash(BASH -c:*)`       -> comparacao case-sensitive
    //   `Bash(git log; sh:*)`   -> metacaracteres de shell nunca eram olhados
    //   `Read(~/**)`            -> so padroes feitos de `*` e `/` eram vistos
    //   `WebFetch(*)`           -> so os nomes NUS eram cobertos
    const WRAPPERS = new Set(["env", "command", "nohup", "nice", "time", "sudo", "doas", "xargs", "exec", "setsid", "stdbuf"]);
    // Familia de interpretadores por PADRAO, nao por nome exacto: uma lista fechada
    // deixava passar `pwsh`, `python3.12`, `ruby2.7`, `tclsh`, `bash5`.
    const INTERP = /^(sh|bash|zsh|fish|dash|csh|ksh|tcsh|pwsh|powershell|node|deno|bun|python|ruby|perl|php|lua|tclsh|osascript|expect|rscript|gcc|clang)[\d.]*$/i;
    // Subcomandos que reabrem execucao arbitraria apesar de o 2o token ser "fixo".
    const REABRE = new Set([
      "npm exec", "npm x", "npx", "pnpm exec", "pnpm dlx", "yarn dlx", "bun x", "bunx",
      "deno run", "deno eval", "pip install", "uv run", "uvx", "git commit", "git -c",
      "gh api", "make -f", "docker run", "kubectl exec",
    ]);
    const RISKY = new Set([
      "sh", "bash", "zsh", "fish", "dash", "csh", "ksh", "tcsh",
      "node", "deno", "bun", "python", "python3", "ruby", "perl", "php", "osascript", "lua",
      "eval", "npm", "npx", "pnpm", "yarn", "make", "git", "find", "awk", "sed", "xargs",
      "rm", "mv", "dd", "chmod", "chown", "curl", "wget", "nc", "ncat", "ssh", "scp",
      "docker", "kubectl", "security", "defaults", "launchctl", "systemctl", "sudo", "doas",
    ]);
    // `;` `&&` `||` `|` backtick `$(` `>` `<` `\n` — encadeiam um segundo comando.
    const SHELL_META = /[;|&`\n]|\$\(|>|</;
    // Comandos que, mesmo com argumentos fixos, nao devem ser pre-aprovados.
    const DESTRUCTIVE = new Set(["rm", "dd", "mv", "chmod", "chown", "mkfs", "shutdown", "reboot", "killall"]);
    const baseName = (tok) => tok.split("/").pop().toLowerCase();

    for (const raw of allow) {
      if (typeof raw !== "string") {
        flag(`entrada do \`allow\` que nao e string (${JSON.stringify(raw)}) — ignorada em silencio pelo motor`);
        continue;
      }
      const rule = raw.trim();

      // Nome de ferramenta sem `(...)`: concede a ferramenta INTEIRA.
      if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(rule)) {
        flag(`\`${rule}\` sem \`(...)\` concede a ferramenta INTEIRA — enumerar os comandos/caminhos exatos`);
        continue;
      }

      const parsed = /^([A-Za-z_][A-Za-z0-9_]*)\((.*)\)$/.exec(rule);
      if (!parsed) {
        flag(`\`${rule}\` nao tem a forma \`Ferramenta(padrao)\` — o motor pode ignora-la`);
        continue;
      }
      const [, tool, bodyRaw] = parsed;
      const body = bodyRaw.trim();

      if (tool === "Bash") {
        if (SHELL_META.test(body)) {
          flag(`\`${rule}\` contem metacaracteres de shell — encadeia um segundo comando`);
          continue;
        }
        const suffix = /^(.*[^*]):\*$/.exec(body);
        if (body.includes("*") && !suffix) {
          flag(`\`${rule}\` tem wildcard sem delimitador — enumerar os comandos exatos`);
          continue;
        }
        // Procurar um comando perigoso em QUALQUER posicao do prefixo fixo, nao so na
        // primeira. Descartar apenas o head nao bastava: em `sudo -u root sh:*` o loop
        // consumia `sudo` e `-u`, e o head passava a ser `root` — o argumento do wrapper.
        const fixed = suffix ? suffix[1] : body;
        const tokens = fixed.split(/\s+/).filter(Boolean);
        // Caminho fora do projeto em QUALQUER token, seja o comando fixo ou com `:*`.
        const foraDoProjeto = tokens.find((t) => t.startsWith("~") || t.startsWith("/etc") || /(^|\/)\.\.(\/|$)/.test(t) || /^\/(Users|home|root|var|private)\//.test(t));
        if (foraDoProjeto) {
          flag(`\`${rule}\` referencia \`${foraDoProjeto}\`, fora do projeto`);
          continue;
        }
        // Subcomando que reabre execucao: `npm:*` era marcado porque "npm exec e
        // arbitrario", mas `npm exec:*` — que concede exactamente isso — passava.
        const doisPrimeiros = tokens.slice(0, 2).map(baseName).join(" ");
        if (suffix && (REABRE.has(doisPrimeiros) || REABRE.has(baseName(tokens[0] ?? "")))) {
          flag(`\`${rule}\` pre-aprova \`${doisPrimeiros}\`, que reabre execucao arbitraria`);
          continue;
        }
        // Um INTERPRETADOR em qualquer posicao e o caso mais grave: so e aceitavel com um
        // alvo fixo que nao seja ele proprio um interpretador. Tratar wrappers como
        // "comando perigoso com alvo fixo" era um buraco: em `env sh:*` o `env` ficava
        // como head e o `sh` passava por alvo — concedendo shell arbitraria.
        const interpAt = tokens.findIndex((t) => INTERP.test(baseName(t)));
        if (interpAt !== -1) {
          const alvo = tokens[interpAt + 1];
          const alvoOk = alvo && !alvo.startsWith("-") && !alvo.includes("*") && !INTERP.test(baseName(alvo));
          if (!alvoOk) {
            flag(`\`${rule}\` deixa \`${baseName(tokens[interpAt])}\` receber argumentos livres — equivale a execucao arbitraria`);
            continue;
          }
        }
        const isRisky = (t) => RISKY.has(baseName(t)) || WRAPPERS.has(baseName(t));
        const riskyAt = tokens.findIndex(isRisky);
        const head = riskyAt === -1 ? "" : baseName(tokens[riskyAt]);
        const next = riskyAt === -1 ? undefined : tokens[riskyAt + 1];
        if (!suffix) {
          // Comando FIXO: nao ha argumentos livres, logo `npx tsc --noEmit` e seguro.
          // So interessam dois casos: um interpretador sozinho (shell interactiva) ou
          // um comando destrutivo pre-aprovado.
          if (riskyAt !== -1 && (next === undefined || DESTRUCTIVE.has(head))) {
            flag(`\`${rule}\` pre-aprova \`${head}\` — shell interactiva ou comando destrutivo`);
          }
          continue;
        }
        if (riskyAt !== -1) {
          // Com `:*` ha argumentos livres: so aceitavel se o comando perigoso vier
          // seguido de um alvo FIXO (`node caminho/script.mjs:*`, `npm run lint:*`).
          const alvoFixo = next && !next.startsWith("-") && !next.includes("*");
          if (!alvoFixo) {
            flag(`\`${rule}\` deixa \`${head}\` receber argumentos livres — equivale a execucao arbitraria`);
            continue;
          }
        }
        if (tokens.length === 1) {
          // Um so token e desconhecido: largo mas nao necessariamente perigoso
          // (`ls:*`, `cat:*`). NOTE, nao WARN — nao trava o gate. Interpretadores e
          // wrappers ja foram marcados acima; despromove-los a NOTE foi uma regressao.
          note(`${SETTINGS_PATH}: \`${rule}\` pre-aprova quaisquer argumentos de \`${baseName(tokens[0])}\` — considerar fixar mais`);
        }
        continue;
      }

      if (["Read", "Edit", "Write", "Glob", "Grep", "NotebookEdit", "MultiEdit", "NotebookRead"].includes(tool)) {
        const pat = body.replace(/^\.\//, "");
        if (pat.startsWith("~") || pat.startsWith("/") || pat.split("/").includes("..")) {
          flag(`\`${rule}\` sai do projeto (\`~\`, caminho absoluto ou \`..\`) — restringir ao repo`);
        } else if (/^[*/]+$/.test(pat)) {
          flag(`\`${rule}\` abrange o repo inteiro — restringir a um subcaminho`);
        }
        continue;
      }

      // Qualquer outra ferramenta (WebFetch, Task, mcp__*): um padrao de puro wildcard
      // e concessao total.
      if (/^[*/]*\*[*/]*$/.test(body)) {
        flag(`\`${rule}\` concede \`${tool}\` sem restricao — enumerar os alvos permitidos`);
      }
    }

    // Cobertura do `ask`: `process-rules.md` declara commit/push/merge e instalacao de
    // dependencias como "perguntar primeiro". Apagar a lista inteira era invisivel.
    const ask = asList(perms.ask, "ask");
    const askCovers = (cmd) => ask.some((r) => {
      const m = /^Bash\((.*?):?\*?\)$/.exec(typeof r === "string" ? r : "");
      return m ? cmd.startsWith(m[1].trim()) : false;
    });
    for (const cmd of ["git commit", "git push", "npm install"]) {
      if (!askCovers(cmd)) flag(`\`${cmd}\` nao esta em \`ask\` nem em \`deny\` — o CLAUDE.md declara-o como "perguntar primeiro"`);
    }

    // Um `allow` que caia dentro de um prefixo negado ou perguntado e contradicao
    // silenciosa: o repo tem `git commit` em `ask`, e `Bash(git commit -m:*)` no allow
    // passava sem sinal.
    const prefixOf = (r) => /^Bash\((.*?):?\*?\)$/.exec(r)?.[1]?.trim() ?? null;
    for (const a of allow) {
      if (typeof a !== "string") continue;
      const pa = prefixOf(a);
      if (!pa) continue;
      for (const [lista, nome] of [[deny, "deny"], [asList(perms.ask, "ask"), "ask"]]) {
        for (const other of lista) {
          if (typeof other !== "string") continue;
          const po = prefixOf(other);
          if (po && pa.startsWith(po)) {
            flag(`\`${a}\` no allow cai dentro de \`${other}\` no ${nome} — contradicao`);
          }
        }
      }
    }

    // `bypassPermissions` anula tudo o que esta acima.
    const mode = perms.defaultMode;
    if (mode && !["default", "acceptEdits", "plan"].includes(mode)) {
      flag(`\`defaultMode: "${mode}"\` desliga a fronteira de permissoes deste ficheiro`);
    }

    if (issues === 0) ok(`${SETTINGS_PATH} (deny de secrets cobre .env*, allow sem concessoes largas)`);
  }
  guardsRun++;
}

  return guardsRun;
}
