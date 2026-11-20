/**
 * O `su -c`/`runuser -c` como comando opaco, e quem le o stdin numa shell elevada (#600) — {{PROJECT_NAME}}
 *
 * NAO e um entry point: o `test-hooks.mjs` descobre este modulo e chama `registar()`.
 *
 * PORQUE EXISTE: o `su -c <comando>` corre o comando numa shell, e nem a fronteira nem o guard do branch o liam como
 * opaco (medido no `main` a 20 nov): `su -c 'rm -rf <fronteira>'`, `| su -c bash`, `su -c 'git push --force ...'`
 * passavam. A fronteira le-o agora por POSICAO no `inlineDe` (como as shells com `-c`), e nao no regex do `OPACO`:
 * esse negava antes do `recebeDe` (e os casos deste nao se podiam provar) e casava `su` em nomes de ficheiro.
 * Cada grupo tem as formas que SO o seu ramo apanha, para cada ramo ter o seu vermelho.
 *
 * O nome do modulo nao tem `su` como palavra: um controlo abaixo corre-o pelo nome, e prova que o nome nao conta.
 */
import { rmSync } from "fs";
import { pathToFileURL } from "url";
import { porqueAltera } from "../lib/fronteira.mjs";
import { MAX_PALAVRAS } from "../lib/posicao.mjs";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.error("tests-fronteira-elevacao.mjs nao e um entry point: nao corre testes por si.\nCorrer `node .claude/hooks/tests/test-hooks.mjs`.");
  process.exit(1);
}

/** Entry point a que este modulo pertence. */
export const entryPoint = "test-hooks.mjs";

const F = ".claude/hooks/x.mjs";
const R = `rm -rf ${F}`;
const P = "git push --force origin feature/x";

export function registar({ test, corre, repo, eq }) {
  const nega = (c) => { if (porqueAltera(c) === null) throw new Error(`"${c}": devia negar, deixou`); };
  const deixa = (c) => { const r = porqueAltera(c); if (r !== null) throw new Error(`"${c}": devia deixar, negou (${r})`); };

  // --- Fronteira: o `-c` corre um comando (o `inlineDe`, por posicao) --------------------------------------------
  for (const c of [`su -c '${R}'`, `runuser -c '${R}'`, `su root -c '${R}'`, `su -c '${R}' root`, `su --command='${R}'`,
    `su --command '${R}'`, `su --session-command='${R}'`, `su --co '${R}'`, `su --se='${R}'`, `su -lc '${R}'`,
    `su - root -c '${R}'`, `sudo su -c '${R}'`, `env su -c '${R}'`, `caffeinate su -c '${R}'`, `s''u -c '${R}'`,
    `su -c'${R}'`]) {
    test(`elevacao: fronteira — \`${c}\` NEGA (#600)`, () => nega(c));
  }
  // O mesmo com a fronteira A VISTA no proprio comando do `su`: o ramo a vista tambem le o `inlineDe`.
  test("elevacao: fronteira — `cat F | su -c 'cat'` (a fronteira a vista, a montante) NEGA (#600)", () => nega(`cat ${F} | su -c 'cat'`));
  // Controlos: o nome no texto nao conta (um ficheiro, um padrao de procura), e sem `-c` o `su` nao e inline.
  test("elevacao: fronteira — CONTROLO, `su` num nome de ficheiro ou num padrao DEIXA (#600)", () => {
    for (const c of ["node .claude/hooks/tests/tests-fronteira-elevacao.mjs | grep -c ok", 'grep -n "su -c" .claude/hooks/lib/posicao.mjs',
      `su -c 'ls'; cat ${F}`]) deixa(c);
  });

  // --- Fronteira: quem le o stdin, com a fronteira so citada -----------------------------------------------------
  // Com a fronteira citada no comando, o `negaInline(qualquer)` ve QUALQUER `su` nao citado com `-c`: estes sao provas do
  // `inlineDe` (o leitor adversarial: revertido o `recebeDe`, ficavam verdes). Os do `sudo --sh`/`--lo` provam o `eleva`.
  for (const c of [`echo '${R}' | su -c bash`, `echo '${R}' | su -c sh root`, `echo '${R}' | runuser -c bash`,
    `echo '${R}' | caffeinate su -w -c`, `echo '${R}' | env sudo --sh`, `echo '${R}' | caffeinate sudo --lo`]) {
    test(`elevacao: fronteira — \`${c.replace(F, "F")}\` NEGA (#600)`, () => nega(c));
  }

  // --- Fronteira: SO o `recebeDe` ve (a fronteira a vista noutro comando; o `su` nao a cita nem lhe fica a jusante) --
  // (a) o valor do `-c` julgado como comando que recebe o stdin; (b) um `-c` que e o VALOR de outra opcao nao conta;
  // e os prefixos do `sudo` no `eleva`.
  const fora = (v) => `cat ${F}; cat /tmp/s | ${v}`;
  // (b) com o utilizador DEPOIS do `-c`: so com flags, o piso (`RECEBE_CODIGO`) ja negava (`| su -g -c`).
  for (const v of ["su -c bash", "su -c 'true; bash'", "su --command=bash", "su -c 'su -c ls'", "su -c 'cd / && bash' root",
    "su -g -c root", "su --whitelist-environment -c root", "su --shell -c root", "caffeinate su -w -c root", "su -lw -c root",
    "env sudo --sh", "env sudo --she", "caffeinate sudo --lo",
    // Das duas leituras: uma forma NAO exata do `-c` ao lado de uma exata (o ultimo `-c` ganha: corre o `bash`), uma letra
    // de valor que ja leva o valor colado (`-ws`), e o `-c` depois do `--` (e da shell: `/dev/stdin` corre o stdin).
    "su -c ls -lc bash", "su -c ls --co bash", "su -c ls -cbash", "su -c ls -ws -c bash", "su root -- /dev/stdin -c ls",
    "su root -- -s x -c ls", "runuser -u me -- python3 - -c x",
    // Da leitura focada: os prefixos de UMA letra das longas com valor (`--w`, `--g`, `--u`) tambem levam o `-c`.
    "su --w -c root", "su --g -c root", "runuser --u -c root"]) {
    test(`elevacao: fronteira — \`cat F; cat /tmp/s | ${v}\` NEGA (#600)`, () => nega(fora(v)));
  }
  // Nao muda (a 2.a leitura do plano): o `elevaSemValor` fica EXATO. Com os prefixos nele, `| sudo --lo grep bash`
  // deixava de recomecar e passava a deixar. Estes negam no `main`, e continuam.
  // E os que ja negavam por outro ramo: um executor com uma shell a seguir, e a ponta do pipe so com flags (o piso).
  for (const v of ["sudo --lo grep bash", "sudo --logi grep bash", "sudo --she grep bash", "sudo --shel grep bash", "su --co bash",
    "caffeinate su -c bash", "su -g -c", "su -w -c"]) {
    test(`elevacao: fronteira — \`cat F; cat /tmp/s | ${v}\` CONTINUA a negar (#600)`, () => nega(fora(v)));
  }
  // Controlos: o `-c` com um comando que nao le o stdin, e o `sudo` sem uma flag que eleve.
  test("elevacao: fronteira — CONTROLO, `| su -c ls`, `| sudo --list`, `| sudo --set-home grep x` DEIXAM (#600)", () => {
    // E uma letra de valor com o valor COLADO, que nao salta a palavra seguinte (`-gwheel`, `-w=X`). (Nao `-s/bin/bash`:
    // o `OPACO` do `main` ve `bash ... -c` no texto, e nega antes.)
    for (const v of ["su -c ls", "su -c 'ls -c'", "sudo --list", "sudo --set-home grep x", "caffeinate su root grep -c x",
      "su -gwheel -c ls", "su -w=X -c ls"]) deixa(fora(v));
  });

  // O CUSTO do (a): cada valor de `-c` paga um `recebeDe`, e 40 `su -c <valor longo>` atras de um executor levavam 108 s
  // (medido). O tecto: a soma das palavras dos valores no `MAX_PALAVRAS`; passado ele, nega depressa (falha fechado).
  // O valor fica 2 palavras abaixo do tecto (`env` + n atribuicoes + `env` + 30 flags com valor + `grep x`), derivado
  // dele: mudar o `MAX_PALAVRAS` nao parte o caso em silencio.
  const longo = `'env ${"A-B=1 ".repeat(MAX_PALAVRAS - 66)}env ${"-X y ".repeat(30)}grep x'`;
  const tempo = (c) => {
    const i = performance.now();
    const r = porqueAltera(c);
    return { r, t: performance.now() - i };
  };
  test("elevacao: custo — `| su -c <valor longo>` ABAIXO do tecto DEIXA em menos de 1 s (#600)", () => {
    const { r, t } = tempo(fora(`su -c ${longo}`));
    if (r !== null) throw new Error(`negou (${r}) um su que corre so um grep`);
    if (t > 1000) throw new Error(`${t.toFixed(0)} ms`);
  });
  test("elevacao: custo — acima do tecto (40 `su -c <longo>` atras de um executor; 120 `-c` num su) NEGA em menos de 1 s (#600)", () => {
    // E o recomeco (b) do `recebeEm`, que voltava a chegar ao mesmo `su` ate `JANELA` vezes (o leitor adversarial).
    for (const c of [fora(`caffeinate ${`su -c ${longo} `.repeat(40)}`), fora(`su ${`-c ${longo} `.repeat(120)}`),
      fora(`sudo ${"-X caffeinate ".repeat(30)}su -c ${longo} -c ${longo}`)]) {
      const { r, t } = tempo(c);
      if (r === null) throw new Error(`deixou um comando de ${c.length} caracteres acima do tecto`);
      if (t > 1000) throw new Error(`${t.toFixed(0)} ms`);
    }
  });

  // --- O guard do branch protegido ---------------------------------------------------------------------------------
  const decide = (comando, esperado, branch = "feature/x") => {
    const d = repo(branch);
    try {
      eq(corre({ tool_input: { command: comando }, cwd: d }).decisao, esperado, `"${comando.replace(/\n/g, "⏎")}"`);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  };
  for (const c of [`su -c '${P}'`, `runuser -c '${P}'`, `sudo su -c '${P}'`, `su root -c '${P}'`, `su -c'${P}'`,
    `su --command='${P}'`, `su -lc '${P}'`, `su -g wheel root -c '${P}'`, `su -s /bin/sh root -c '${P}'`, `su root -- -c '${P}'`,
    `runuser -u root -- ${P}`]) {
    test(`elevacao: branch — \`${c}\` NEGA o force-push (#600)`, () => decide(c, "deny"));
  }
  // O corpo de um heredoc para uma shell que o preambulo corre: um git DENTRO de um `su -c`/`sh -c` no preambulo nao
  // faz do corpo texto (o `pede`), e o `su`/`sudo -s` leem o stdin numa shell (o `ehShell`).
  const corpo = `\n${P}\nEOF`;
  for (const c of [`sh -c 'git status; bash' <<'EOF'${corpo}`, `su - root <<'EOF'${corpo}`, `sudo -s <<'EOF'${corpo}`,
    `runuser -u root <<'EOF'${corpo}`, `sudo --login <<'EOF'${corpo}`]) {
    test(`elevacao: branch — \`${c.split("\n")[0]}\` com um force-push no corpo NEGA (#600)`, () => decide(c, "deny"));
  }
  // Nao muda: com o `su` no `WRAPPERS`, o `git status` passava a invocacao do preambulo e o corpo deixava de se varrer.
  test("elevacao: branch — `su root -c 'git status; bash' <<EOF` com um force-push no corpo CONTINUA a negar (#600)", () =>
    decide(`su root -c 'git status; bash' <<'EOF'${corpo}`, "deny"));
  // Nao muda: com o `runuser` no `WRAPPERS_OPACOS`, o `comandoOpaco` (a 1.a palavra do texto inteiro) partia o `;` citado
  // do git SEGUINTE, e o `--force`/`--delete` saiam do segmento dele (o leitor adversarial: deny -> allow).
  for (const c of [`runuser -u me true; git push -o "a;b" origin x --force`, `runuser -u me true; git push -o "a|b" origin --delete main`]) {
    test(`elevacao: branch — \`${c}\` CONTINUA a negar (#600)`, () => decide(c, "deny"));
  }
  // Controlos, num branch PROTEGIDO (num de feature, so o force-push nega, e nao distinguiam nada): um verbo seguro dentro
  // do `-c`, um `su` sem git, e uma mensagem de commit num heredoc para o git. Nega a mais, dito: `su root -c 'echo git
  // push'` (o `echo` sai como o valor do `-c`, e o `git push` fica invocacao — o mesmo que o `sh -c 'echo git push'`).
  test("elevacao: branch — CONTROLO, `su -c 'git status'`, `su root -c 'git log'`, `su -c ls` DEIXAM num branch protegido (#600)", () => {
    for (const c of ["su -c 'git status'", "su root -c 'git log --oneline'", "su -c ls", "runuser -u me -- git status"]) decide(c, "allow", "main");
  });
  // Controlos do `ehShell`: um `su` ENTRE ASPAS no preambulo (o titulo de um PR que fala dele) e um `-s` que e do git, e
  // nao do `doas`, nao fazem do corpo de um heredoc comandos — uma mensagem que cita um force-push continua texto.
  test("elevacao: branch — CONTROLO, um `su` citado no titulo e o `-s` do git num heredoc DEIXAM (#600)", () => {
    for (const c of [`gh pr create --title "fix: su -c read as a shell" --body "$(cat <<'EOF'\nnega \`${P}\`\nEOF\n)"`,
      `doas git commit -s -F - <<'EOF'\nnega ${P}\nEOF`]) decide(c, "allow");
  });
}
