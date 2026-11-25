/**
 * O `--config-env` e o `--attr-source` no guard do branch protegido (#579) — {{PROJECT_NAME}}
 *
 * NAO e um entry point: o `test-hooks.mjs` descobre este modulo e chama `registar()`.
 *
 * PORQUE EXISTE: a lista das flags globais do git que levam valor do guard (`invocacoes-git.mjs`) nao tinha o
 * `--config-env` nem o `--attr-source`: o VALOR passava a verbo, e `git --config-env a=B push --force origin fix/x`
 * passava num branch de feature (medido no `main` a 20 nov). A correcao le o verbo certo — e le o `--config-env K=VAR`
 * como o `-c K=$VAR`: o valor vem de uma variavel que o hook nao ve, e com uma chave que executa (`core.pager`)
 * conta como "executa algo". Sem isso, `git --config-env core.pager=X log` passava a DEIXAR num branch protegido.
 *
 * A EXCECAO deny -> allow (a opcao A da Fase 0, ESTREITADA a 20 nov): com uma chave inofensiva (`user.name`, um proxy,
 * um cabecalho) ou com o `--attr-source`, o guard decide o que decidiria sem a flag. Antes negava por acaso, pelo verbo
 * errado (`a=B`). As chaves PERIGOSAS (`core.hooksPath`, `include.path`...) nao entram: no `-c` o valor ve-se e nao se
 * julgam, mas aqui vem de uma variavel que ninguem ve — negam de proposito.
 */
import { rmSync } from "fs";
import { pathToFileURL } from "url";
import { porqueAltera } from "../lib/fronteira.mjs";
import { PROTEGIDOS_LISTA } from "../lib/protegidos.mjs";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.error("tests-git-config-env.mjs nao e um entry point: nao corre testes por si.\nCorrer `node .claude/hooks/tests/test-hooks.mjs`.");
  process.exit(1);
}

/** Entry point a que este modulo pertence. */
export const entryPoint = "test-hooks.mjs";

/** A razao de uma negacao por uma opcao que faz o git executar (`guard-protected-branch.mjs`): afirma-la prende a razao
 *  CERTA — sem a leitura do `--config-env`, o verbo errado (`core.pager=X`) negava pelo verbo, e o teste passava. */
const EXECUTAR = "com uma opcao que faz o git executar";
const FORCE = "Force-push negado";

export function registar({ test, corre, repo, eq, contem, SALTA }) {
  // O branch protegido e o 1.o DO PROJETO (#257), e nao `main`: num derivado que proteja outro, um `main` fixo negava a
  // menos e os controlos deixavam por nao ser protegido (o `/audit` da v0.64.0). Sem nenhum, salta.
  const main = PROTEGIDOS_LISTA[0];
  const decide = (comando, branch) => {
    if (branch === undefined) throw SALTA;
    const d = repo(branch);
    try {
      return corre({ tool_input: { command: comando }, cwd: d });
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  };
  const nega = (comando, branch, razao) => {
    const r = decide(comando, branch);
    eq(r.decisao, "deny", `"${comando}" em ${branch}`);
    contem(r.razao, razao);
  };

  // --- O force-push e o `--delete`, em QUALQUER branch: o verbo certo depois da flag -------------------------------
  for (const c of ["git --config-env a=B push --force origin fix/x", "git --attr-source X push --force origin fix/x",
    "sudo git --config-env a=B push --force origin fix/x", "env Y=1 git --config-env a=B push --force origin fix/x",
    "=git --config-env a=B push --force origin fix/x", "git --config-env a=B --attr-source X push -f origin fix/x"]) {
    test(`config-env: \`${c}\` num branch de feature NEGA o force-push (#579)`, () => nega(c, "feature/x", FORCE));
  }
  // O ref apagado e o 1.o protegido do projeto: so um protegido nega o `--delete` (o `refsApagados`).
  test("config-env: `git --config-env a=B push origin --delete <protegido>` num branch de feature NEGA (#579)", () => {
    if (main === undefined) throw SALTA;
    eq(decide(`git --config-env a=B push origin --delete ${main}`, "feature/x").decisao, "deny", "apaga o protegido remoto");
  });

  // --- A chave que executa: o valor vem de uma variavel, e conta como "executa algo" ------------------------------
  for (const c of ["git --config-env core.pager=X log", "git --config-env=core.pager=X log", "git --config-env CORE.PAGER=X log",
    "git --config-env core.editor=X status", "git --config-env core.sshCommand=X fetch",
    // O `=` da chave: o git parte no ULTIMO `=` (o primeiro dava `credential.https://h/?a`, que nao executa).
    "git --config-env=credential.https://h/?a=b.helper=X fetch", "sudo git --config-env core.pager=X log",
    // A forma separada seguida de outra flag global: o `++j` consome o valor, e o `-C` leva o `.` (o leitor de correcao).
    "git --config-env core.pager=X -C . log",
    // O valor vazio: o `$` sozinho conta como "executa" — falha fechado.
    "git --config-env core.pager= log",
    // Dentro de um wrapper opaco, o comando do git e UMA palavra citada: le-se tambem sem as aspas (o leitor adversarial:
    // com o verbo lido certo, passavam a DEIXAR — no `main` negavam pelo verbo errado).
    "sh -c 'git --config-env core.pager=X log'", 'bash -c "git --config-env core.pager=X log"', 'eval "git --config-env core.pager=X log"',
    "su -c 'git --config-env core.pager=X log'",
    // As chaves PERIGOSAS (a opcao A estreitada): no `-c` o valor ve-se e nao se julgam; aqui vem de uma variavel.
    "git --config-env core.hooksPath=V push origin v1.0.0", "git --config-env core.hooksPath=V switch -c x",
    "git --config-env include.path=V log", "git --config-env remote.origin.uploadpack=V fetch",
    "git --config-env submodule.s.update=V submodule update", "git --config-env url.ext::x.insteadOf=V fetch"]) {
    test(`config-env: \`${c}\` num branch protegido NEGA por executar (#579)`, () => nega(c, main, EXECUTAR));
  }
  // Documentacao, e nao prova: o `alias.st` nega pelo verbo `st`, que nao e seguro, com ou sem a leitura.
  // O valor esperado a vista (`eq(r, "deny", ...)`): o contador da superficie (`surface-patterns.mjs`) le o 2.o argumento
  // do `eq(`, e com `decide(c, "main")` lia o `"main"` do `decide` por acaso — trocado pela variavel, a contagem caia.
  test("config-env: `git --config-env alias.st=X st` num branch protegido NEGA (#579)", () => {
    const r = decide("git --config-env alias.st=X st", main).decisao;
    eq(r, "deny", "alias");
  });

  // --- A excecao (opcao A): a mesma decisao que o `-c` da mesma chave, ou que sem a flag --------------------------
  // Os pares em que so muda a chave: `a=B` deixa, `core.pager=X` (acima) nega.
  // E a chave SEM `=` (nao e uma configuracao valida: o git recusa, e nao corre nada).
  // E as que passam SEGREDOS, o caso de uso do `--config-env`: um cabecalho, um proxy (perigosa, mas so um dado).
  for (const c of ["git --config-env a=B status", "git --config-env a=B log", "git --config-env user.name=V log --oneline",
    "git --config-env http.extraHeader=AUTH fetch", "git --config-env http.proxy=HTTPS_PROXY fetch", "git --attr-source X status",
    "git --attr-source X log --oneline", "git --config-env core.pager log"]) {
    test(`config-env: \`${c}\` num branch protegido DEIXA, como o -c da mesma chave (#579)`, () => {
      const r = decide(c, main).decisao;
      eq(r, "allow", c);
    });
  }
  // Controlos que ja deixavam no `main` (a forma com `=` saltava um token) e um wrapper sem chave que execute.
  // E um wrapper com um paginador simples e visivel: a leitura sem aspas nao o torna "executa" (o `less` nao casa).
  test("config-env: CONTROLO, `--attr-source=X status`, `sh -c 'git log'` e `sh -c 'git -c core.pager=less log'` DEIXAM num branch protegido (#579)", () => {
    for (const c of ["git --attr-source=X status", "sh -c 'git log'", "sh -c 'git -c core.pager=less log'"]) {
      const r = decide(c, main).decisao;
      eq(r, "allow", c);
    }
  });
  // A fronteira tambem le o `valoresQueExecutam`: um dado (o proxy) a frente de um `git log` que cita a fronteira nao e
  // "executa"; um paginador de uma variavel e (a leitura focada).
  test("config-env: fronteira — `--config-env http.proxy=P log -- <f>` DEIXA, `core.pager=P` NEGA (#579)", () => {
    const f = ".claude/hooks/x.mjs";
    eq(porqueAltera(`git --config-env http.proxy=P log -- ${f}`), null, "http.proxy");
    eq(porqueAltera(`git --config-env core.pager=P log -- ${f}`), "git-que-executa", "core.pager");
  });
  // Controlos num branch de feature: um push normal e o `--delete` de um ramo que nao e protegido.
  test("config-env: CONTROLO, `push origin fix/x` e `push origin --delete fix/x` com a flag DEIXAM num branch de feature (#579)", () => {
    for (const c of ["git --config-env a=B push origin fix/x", "git --config-env a=B push origin --delete fix/x",
      "git --attr-source X push origin fix/x"]) eq(decide(c, "feature/x").decisao, "allow", c);
  });
}
