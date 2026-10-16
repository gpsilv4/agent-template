/**
 * Os alvos que o `--diff` da varredura de mutacao mede — {{PROJECT_NAME}}
 *
 * Saiu do `mutation-sweep.mjs` quando ele chegou as 499 linhas (#317; o Guard 17 reprova acima de
 * 500). Sem sitios de recusa: devolve `{ erro }`, e e o varredor que decide reprovar. O `PARES` e o
 * `verificadoresDe` vem DELE: a fixture do `test-mutation-sweep` escreve os seus e exige que o varredor
 * os importe directamente (`test-sweep-harness.mjs`), senao deixava de os ler.
 */
import { execFileSync } from "child_process";

/** Os alvos que o trabalho deste branch toca, pelas DUAS vias que o mapa conhece.
 *
 *  1. O ficheiro alterado E um alvo -> varre-se.
 *  2. O ficheiro alterado e (ou leva a) uma SUITE -> varrem-se todos os alvos que a usam. E a
 *     via que apanha o indirecto: mexer no `test-harness.mjs` nao toca em alvo nenhum, mas
 *     muda o veredicto de ~260 testes. Sem esta via o filtro media menos do que diz medir, que
 *     seria o `TP2` dentro da ferramenta escrita para o apanhar.
 *
 *  A baseline vem de `git`: sem ela **reprova**, nunca cai para "varrer tudo" nem para "varrer
 *  nada". Uma medicao ausente nao e um OK — a mesma regra do `check-test-surface.mjs`. */
export function alvosDoDiff(ROOT, PARES, verificadoresDe) {
  const git = (args) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  let base;
  try {
    // O ramo principal deste repo, e nao um nome assumido: um projeto derivado pode usar outro.
    const principal = ["origin/HEAD", "origin/main", "main", "origin/master", "master"].find((r) => {
      try {
        git(["rev-parse", "--verify", "--quiet", r]);
        return true;
      } catch {
        return false;
      }
    });
    if (!principal) return { erro: "nao encontrei o branch principal (origin/HEAD, main, master)" };
    base = git(["merge-base", "HEAD", principal]);
  } catch (err) {
    return { erro: `nao consegui resolver a base do branch: ${err.message.split("\n")[0]}` };
  }
  // Sem `--cached`: compara a ARVORE DE TRABALHO contra a base, logo inclui o que ainda nao
  // foi commitado. `-z` porque o git CITA caminhos com espacos ou bytes nao-ASCII, e um
  // caminho citado nao casa regra nenhuma — a lacuna seria silenciosa (`TP5`).
  let ficheiros;
  try {
    ficheiros = git(["diff", "--name-only", "-z", base]).split("\0").filter(Boolean);
  } catch (err) {
    return { erro: `nao consegui ler o diff contra ${base.slice(0, 7)}: ${err.message.split("\n")[0]}` };
  }
  // Os nao rastreados tambem contam: um verificador NOVO ainda por commitar e exactamente o
  // caso em que ninguem quer descobrir a falta de cobertura so no CI.
  try {
    const novos = git(["ls-files", "--others", "--exclude-standard", "-z"]).split("\0").filter(Boolean);
    ficheiros = [...new Set([...ficheiros, ...novos])];
  } catch {
    /* melhor esforco: o diff acima ja e a medicao */
  }

  const { porVerificador, semRegra } = verificadoresDe(ficheiros);
  const suites = new Set(porVerificador.keys());
  const alvos = PARES.filter((p) => ficheiros.includes(p.alvo) || suites.has(p.suite));
  return { ficheiros, alvos, semRegra };
}
