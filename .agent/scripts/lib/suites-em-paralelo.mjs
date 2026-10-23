/**
 * As suites do `Guard Suites` em PARALELO — as mesmas, todas, em todos os PRs (#337) — {{PROJECT_NAME}}
 *
 * PORQUE EXISTE: as suites corriam uma de cada vez, um passo do CI por suite, e eram ~97% dos ~3 min
 * do job. Sao independentes: o guard de isolamento (Guard 19, estatico) obriga cada uma a ter a sua pasta
 * temporaria, sem portas nem escritas no ambiente. NAO cobre escritas no checkout, que aqui e PARTILHADO
 * (na varredura cada worker tem a sua copia): uma suite que escreva no repo pode pisar outra. Hoje
 * nenhuma o faz (so leem de `ROOT`); uma que passe a faze-lo da um vermelho intermitente, que se ve.
 * Medido num portatil: 424 s em serie, 201 s com 4 em paralelo, e PIOR com 9 (255 s): a mais pesada compete pelo CPU e passa a fixar o total. Por isso o paralelismo
 * tem TECTO, e nao "todas de uma vez".
 *
 * O QUE NAO MUDA: o que se valida. Nenhuma suite se salta (decisao de 2026-10-17: nao se troca
 * validacao por minutos), e o pior caso de correr em paralelo e um vermelho que se ve — nunca um
 * verde que engana. E so corre SUITES (leituras do #337): `node .agent/scripts/tests/test-*.mjs` ou
 * `node .claude/hooks/tests/test-*.mjs`. Qualquer outro argumento reprova — o runner esta no `allow`
 * por prefixo, e aceitar "qualquer `node x.mjs`" deixava o agente correr QUALQUER script sem aprovacao;
 * e um argumento que nao fosse uma suite era engolido em silencio, e o passo ficava verde. O que o
 * prefixo ainda deixa: correr um `test-*.mjs` NOVO dessas pastas sem pedir — o mesmo que editar uma suite
 * ja aprovada e corre-la, que o `allow` sempre deixou. A escrita e que e o ponto de controlo, nao a corrida.
 *
 * No `ci.yml` corre com `exec`: o passo e um `bash`, e o cancel/timeout do GitHub sinaliza o PROCESSO do
 * passo, nao o grupo — sem `exec` o sinal ficava no `bash` e este runner nunca o via.
 *
 * Uso (no `ci.yml`): as suites por extenso, uma por linha, para a 2b do `/upgrade`, o Guard 11, o
 * `superficie-gate` e a contagem da superficie (`lib/surface-patterns.mjs`) as lerem uma a uma:
 *
 *   exec node .agent/scripts/lib/suites-em-paralelo.mjs -- \
 *     node .agent/scripts/tests/test-guards.mjs \
 *     node .agent/scripts/tests/test-backlog.mjs
 *
 * `--max=N`, antes do `--`, fixa o tecto (os testes usam-no); por omissao e `min(4, cores)`.
 *
 * LIMITACAO ASSUMIDA: uma suite acaba quando os pipes dela FECHAM (`close`), e nao quando o processo sai.
 * Uma que saisse deixando um neto com o stdio herdado pendurava o passo ate ao timeout do job — vermelho,
 * nunca verde. Nenhuma o faz hoje (as fixtures lancam com `stdio` proprio); decidir pelo `exit` mudava a
 * forma de saber que uma suite acabou, e isso e risco novo sem um caso real (auditoria final do #337).
 */
import { spawn } from "child_process";
import { availableParallelism } from "os";
import { ehMain } from "./eh-main.mjs";

/** O tecto por omissao: o melhor ponto medido foi 4, e num runner de 2 cores sao 2. */
export const TECTO = 4;

/** Uma SUITE: o caminho de uma suite de teste do template, e nada mais. */
const SUITE = /^(?:\.agent\/scripts\/tests|\.claude\/hooks\/tests)\/test-[\w-]+\.mjs$/;

/**
 * Le os argumentos: `--max=N` (opcional) antes do `--`, e depois dele so pares `node <suite>`.
 * Devolve `{ max, comandos, erros }`; com erros, nada corre.
 * @param {string[]} args
 */
export function leArgs(args) {
  const erros = [];
  const sep = args.indexOf("--");
  if (sep < 0) return { max: undefined, comandos: [], erros: ["falta o `--` antes das suites"] };
  let max;
  for (const a of args.slice(0, sep)) {
    if (a.startsWith("--max=")) {
      max = a.slice("--max=".length);
      // Um tecto que nao e um inteiro >= 1 nao cai em silencio no de omissao: e um erro como os outros.
      if (!/^[1-9]\d*$/.test(max)) erros.push(`\`--max\` tem de ser um inteiro >= 1: ${a}`);
    } else erros.push(`opcao desconhecida antes do \`--\`: ${a}`);
  }
  const resto = args.slice(sep + 1);
  const comandos = [];
  for (let i = 0; i < resto.length; i += 2) {
    const [bin, alvo] = [resto[i], resto[i + 1]];
    if (bin !== "node" || alvo === undefined || !SUITE.test(alvo)) {
      erros.push(`nao e uma suite: \`${resto.slice(i, i + 2).join(" ")}\` (so \`node .agent/scripts/tests/test-*.mjs\` ou \`node .claude/hooks/tests/test-*.mjs\`)`);
      break;
    }
    // A mesma suite duas vezes: trocar uma linha por um duplicado mantinha a contagem e corria uma a menos.
    if (comandos.some(([, c]) => c === alvo)) {
      erros.push(`suite repetida: \`${alvo}\``);
      break;
    }
    comandos.push([bin, alvo]);
  }
  return { max, comandos, erros };
}

/** Quantas suites ao mesmo tempo: `--max=N` valido, senao `min(TECTO, cores)`; nunca menos de 1. */
export function quantasDeCadaVez(max, cores = availableParallelism()) {
  const n = Number(max);
  if (Number.isInteger(n) && n >= 1) return n;
  return Math.max(1, Math.min(TECTO, cores));
}

/** As suites a correr agora, e o que ja escreveram (o sinal de cancelamento nomeia-as, despeja-as e mata-as). */
const emCurso = new Map();

/** Posto pelo sinal de cancelamento: a partir dai nenhuma suite arranca e nada mais se imprime. */
const runner = { cancelado: false };

/** Mata a suite E o que ela lancou (`git`, `node` das fixtures): cada uma e lider do seu grupo (`detached`). */
const mataGrupo = (p) => {
  try {
    process.kill(-p.pid, "SIGKILL");
  } catch {
    p.kill("SIGKILL"); // sem grupo (ja saiu, ou Windows): pelo menos ela
  }
};

const corre = (cmd) =>
  new Promise((ok) => {
    const t0 = Date.now();
    let saida = "";
    const p = spawn(cmd[0], cmd.slice(1), { stdio: ["ignore", "pipe", "pipe"], detached: true });
    emCurso.set(p, { nome: cmd.at(-1), saida: () => saida });
    p.on("close", () => emCurso.delete(p));
    // Texto, e nao Buffers somados: um caracter multibyte (o `—`) partido entre dois blocos saia como um caracter de substituicao.
    p.stdout.setEncoding("utf8");
    p.stderr.setEncoding("utf8");
    p.stdout.on("data", (d) => (saida += d));
    p.stderr.on("data", (d) => (saida += d));
    // Uma suite que nao arranca (binario em falta) e uma suite que REPROVA, e diz-se porque.
    p.on("error", (err) => ok({ cmd, codigo: -1, sinal: null, saida: `${saida}\n${err.message}`, ms: Date.now() - t0 }));
    // Morta por um SINAL (OOM-kill, timeout), o `code` e `null`: reprova, e o sinal diz-se.
    p.on("close", (codigo, sinal) => ok({ cmd, codigo: codigo ?? -1, sinal, saida, ms: Date.now() - t0 }));
  });

const estado = (r) => (r.codigo === 0 ? "passou" : `REPROVOU (${r.sinal ? `sinal ${r.sinal}` : `exit ${r.codigo}`})`);

/**
 * Corre os comandos com `n` de cada vez. Cada uma que ACABA da logo uma linha de estado (uma suite
 * pendurada nao esconde as que ja acabaram); o bloco inteiro da saida de cada uma sai pela ORDEM dada,
 * e nao pela de chegada, e o log le-se como o de antes — EXCEPTO o de uma que REPROVA, que sai logo:
 * se a primeira da lista pendurar ate ao timeout do job, o diagnostico de uma reprovacao real nao pode
 * ficar preso atras dela (2.a auditoria do #337). Devolve os resultados.
 * @param {string[][]} comandos
 * @param {number} n
 * @param {(linha: string) => void} [escreve]
 */
export async function correTodas(comandos, n, escreve = (l) => process.stdout.write(l)) {
  const resultados = new Array(comandos.length);
  let proximo = 0;
  let impresso = 0;
  let acabadas = 0;
  const grupo = process.env.GITHUB_ACTIONS === "true";
  const jaSaiu = new Set();
  const bloco = (r) => {
    const titulo = `${r.cmd.join(" ")} — ${estado(r)}, ${(r.ms / 1000).toFixed(1)}s`;
    escreve(`${grupo ? "::group::" : "\n=== "}${titulo}\n`);
    escreve(r.saida.endsWith("\n") ? r.saida : `${r.saida}\n`);
    if (grupo) escreve("::endgroup::\n");
  };
  const imprimePorOrdem = () => {
    while (impresso < comandos.length && resultados[impresso]) {
      if (!jaSaiu.has(impresso)) bloco(resultados[impresso]);
      impresso++;
    }
  };
  const trabalhador = async () => {
    while (proximo < comandos.length) {
      const i = proximo++;
      resultados[i] = await corre(comandos[i]);
      // Cancelado enquanto ela corria: foi morta pelo handler, que ja a nomeou e despejou.
      if (runner.cancelado) return;
      escreve(`  [${++acabadas}/${comandos.length}] ${comandos[i].at(-1)} ${estado(resultados[i])} (${(resultados[i].ms / 1000).toFixed(1)}s)\n`);
      if (resultados[i].codigo !== 0 && i > impresso) {
        bloco(resultados[i]);
        jaSaiu.add(i);
      }
      imprimePorOrdem();
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, comandos.length) }, trabalhador));
  return resultados;
}

/** O UNICO sitio de recusa: sai != 0 sem calar a razao. A varredura de mutacao desliga-o e exige vermelho. */
export function reprova(motivo, escreve = (l) => process.stdout.write(l)) {
  escreve(`\n  FAIL  ${motivo}\n`);
  process.exitCode = 1;
}

if (ehMain(import.meta.url)) {
  const { max, comandos, erros } = leArgs(process.argv.slice(2));
  if (erros.length) {
    // Um argumento que nao e uma suite REPROVA: engolido, era uma suite que nunca corria com o passo verde.
    reprova(erros.join("; "));
  } else if (comandos.length === 0) {
    // Sem comandos nao ha medicao: um passo do CI que nao corre nada nao pode ficar verde (`TP2`).
    reprova("nenhuma suite para correr — as suites vao depois de `--`, cada uma como `node <suite>`");
  } else {
    const n = quantasDeCadaVez(max);
    const t0 = Date.now();
    // Cancelado (o timeout do job, ou um cancel): o GitHub manda SIGINT/SIGTERM ao processo do passo, que e
    // este (o `exec` no `ci.yml`). Diz-se QUAIS ainda corriam — e a resposta a "porque pendurou?" —, mata-as
    // com o que lancaram, e reprova. Os blocos das que ja reprovaram ja sairam (acima), e as linhas de estado
    // de todas as que acabaram tambem. Uma vez so (`once`, e a flag): um 2.o sinal nao despeja outra vez.
    // O SIGHUP e o terminal que fecha (local): as suites correm noutro grupo e nao o recebem.
    for (const sinal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
      process.once(sinal, () => {
        if (runner.cancelado) return;
        runner.cancelado = true;
        const vivas = [...emCurso.values()];
        for (const p of emCurso.keys()) mataGrupo(p);
        // O que a pendurada ja escreveu e a pista de ONDE pendurou: em serie, o passo mostrava-o ao vivo.
        for (const v of vivas) process.stdout.write(`\n=== ${v.nome} — INTERROMPIDA, o que escreveu ate aqui:\n${v.saida()}\n`);
        reprova(`interrompido por ${sinal} com ${vivas.length} suite(s) ainda a correr: ${vivas.map((v) => v.nome).join(", ") || "(nenhuma)"}`);
        // Sai so depois de a saida escoar (num pipe, um `exit` logo a seguir pode corta-la). Entretanto a flag
        // impede os trabalhadores de arrancar a seguinte quando a morta fechar.
        process.stdout.write("", () => process.exit(1));
      });
    }
    // Saida por outro caminho (uma excepcao, um EPIPE de `| head`): cada suite corre no seu grupo, e sem isto
    // ficava orfa a correr. O `kill` e sincrono, logo funciona dentro do `exit`. Um sinal SEM handler (SIGKILL,
    // SIGQUIT...) nao se apanha — ai so o fim do job as limpa.
    process.on("exit", () => {
      for (const p of emCurso.keys()) mataGrupo(p);
    });
    const resultados = await correTodas(comandos, n);
    // Cancelado: o handler do sinal ja disse tudo e sai quando a saida escoar. Sem isto, se as mortas fechassem
    // antes, saiam aqui um resumo e um 2.o FAIL, com as mortas contadas como reprovadas (so ruido, mas falso).
    if (runner.cancelado) await new Promise(() => {});
    const falharam = resultados.filter((r) => r.codigo !== 0);
    process.stdout.write(`\n  ${resultados.length} suite(s), ${n} de cada vez, ${((Date.now() - t0) / 1000).toFixed(1)}s de parede.\n`);
    // Na UI do GitHub, cada suite que reprovou fica a vista, e nao so dentro de um grupo fechado.
    if (process.env.GITHUB_ACTIONS === "true") for (const r of falharam) process.stdout.write(`::error title=${r.cmd.at(-1)}::${estado(r)}\n`);
    if (falharam.length) reprova(`${falharam.length} suite(s) reprovaram: ${falharam.map((r) => r.cmd.at(-1)).join(", ")}`);
    else process.stdout.write("  Todas passaram.\n");
  }
}
