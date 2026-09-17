/**
 * Testes do MOTOR mecanico do `/upgrade` — {{PROJECT_NAME}}
 *
 * Os casos que exercitam `aplicaUpgradeMecanico()` atraves do `cenario()`: a parte que escreve
 * por cima dos ficheiros de um consumidor, e onde um erro custa **dados**.
 *
 * NAO e um entry point. O `test-simulate-upgrade.mjs` importa-o e chama `registar()` —
 * explicitamente, e nao por descoberta: esta suite tem contadores proprios e nunca usou o
 * `registaDescobertos()` do `lib/registo.mjs`.
 *
 * PORQUE VIVE A PARTE: a suite passou as 500 linhas e a catraca do Guard 17 manda dividir antes
 * de acrescentar. A fronteira nao e so de tamanho — estes casos falam todos com o MOTOR, e os
 * que ficaram no entry point falam com o SIMULADOR (os guardas de arranque, a corrida de ponta a
 * ponta, os caminhos que tem de parar tudo).
 */
import { cenario, limpa, test } from "./harness/test-upgrade-harness.mjs";
import { CONSTANTES_DO_PROJETO, PLACEHOLDER } from "../lib/upgrade-mecanico.mjs";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { pathToFileURL } from "url";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.error(
    "tests-upgrade-motor.mjs nao e um entry point: nao corre testes por si.\n" +
      "Correr `node .agent/scripts/tests/test-simulate-upgrade.mjs`."
  );
  process.exit(1);
}

/** Entry point a que este modulo pertence. */
export const entryPoint = "test-simulate-upgrade.mjs";

/** O par (ficheiro, constante) que o simulador customiza — DERIVADO da mesma lista que ele usa. */
const CONST_FIXTURE = CONSTANTES_DO_PROJETO[0];


/** Todos os `.mjs` de uma pasta, em profundidade. Derivado do disco: uma lista escrita a mao
 *  envelhecia no primeiro ficheiro novo, que e a classe que este modulo anda a apanhar. */
function andaTudo(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) andaTudo(p, out);
    else if (e.name.endsWith('.mjs')) out.push(p);
  }
  return out;
}

export function registar() {
  // --- O motor mecanico: e aqui que um erro custa DADOS -----------------------------

  // A regra geral do `/upgrade`, na sua forma mais simples: intacto -> traz-se o novo.
  test("documento NAO customizado fica com a versao nova", () => {
    let c;
    try {
      c = cenario({
        ontem: { ".agent/rules/guia.md": "# guia velho\n" },
        hoje: { ".agent/rules/guia.md": "# guia novo\n" },
      });
      const v = c.ler(".agent/rules/guia.md");
      return v === "# guia novo\n" ? [] : [`ficou ${JSON.stringify(v)}, esperado o novo`];
    } finally {
      limpa(c);
    }
  });

  // A DECISAO do projeto sobrevive a travessia. Nao e um caso qualquer de constante preservada:
  // e O caso, porque foi este valor que se perdeu numa ronda de `/upgrade` real — o ficheiro veio,
  // a constante voltou ao default, e o gate dos bundles passou a reprovar **sem ninguem decidir
  // nada**, com o verificador a correr e a medir bem.
  //
  // A verificacao que o consumidor tinha era por DIFERENCA de output e nao o apanhou: nenhuma
  // linha desapareceu, o veredicto e que mudou. Diferenca de output apanha o que some; nao apanha
  // um default que regressa. Por isso isto e um teste e nao uma linha numa tabela: acrescentar a
  // constante a lista das preservadas prova que alguem a escreveu la, nao que ela sobrevive.
  // O INVARIANTE MUDOU, e a mudanca e o ponto: antes afirmava-se que o `ALVOS_REPROVAM` estava
  // na lista das constantes preservadas. Agora ele vive em `config/bundles.mjs`, e o que tem de
  // ser verdade e mais forte — **o upgrade nunca SUBSTITUI a pasta de configuracao**.
  //
  // Uma lista de nomes a preservar envelhece a cada decisao nova que alguem acrescente e se
  // esqueca de inscrever. Uma pasta que o upgrade nao substitui nao envelhece.
  //
  // "Nunca substitui" e nao "nunca toca": excluir a pasta por inteiro deixava um consumidor
  // anterior a `config/` com o checker novo, que a IMPORTA, sem o ficheiro importado. O par de
  // testes abaixo mede as duas direccoes — uma sozinha deixa passar a outra.
  test("o upgrade NAO substitui a configuracao do projeto", () => {
    let c;
    try {
      const cfg = ".agent/scripts/config/bundles.mjs";
      c = cenario({
        ontem: { [cfg]: "export const ALVOS_REPROVAM = true;\n" },
        // O template mudou a sua config — e mesmo assim a do consumidor fica.
        hoje: { [cfg]: "export const ALVOS_REPROVAM = true;\nexport const NOVIDADE = 1;\n" },
        consumidor: { [cfg]: "export const ALVOS_REPROVAM = false;\n" },
      });
      const v = c.ler(cfg);
      const p = [];
      if (!/ALVOS_REPROVAM = false/.test(v ?? "")) p.push("a decisao do projeto foi atropelada pelo upgrade");
      if ((v ?? "").includes("NOVIDADE")) p.push("o upgrade escreveu por cima da config — devia nao lhe tocar");
      return p;
    } finally {
      limpa(c);
    }
  });

  // A OUTRA METADE, e a que o CI apanhou. Um consumidor tirado de uma tag anterior a `config/`
  // NAO a tem — e todos estao nesse caso na ronda em que ela nasce. Saltar a pasta por "e do
  // projeto" deixava o verificador a rebentar no arranque: proteger a configuracao partindo o
  // consumidor nao e proteger nada.
  test("consumidor SEM config/ recebe-a (senao fica com logica que importa o que nao existe)", () => {
    let c;
    try {
      const cfg = ".agent/scripts/config/bundles.mjs";
      c = cenario({
        ontem: { [cfg]: null }, // a tag de onde o projeto saiu ainda nao tinha a pasta
        hoje: { [cfg]: "export const ALVOS_REPROVAM = true;\n" },
        consumidor: { [cfg]: null },
      });
      const v = c.ler(cfg);
      return v === null ? ["o upgrade nao trouxe a config — o verificador novo fica sem o que importa"] : [];
    } finally {
      limpa(c);
    }
  });

  // E o caso que a exclusao-da-pasta-inteira tambem partia, e que nenhuma das duas de cima apanha:
  // o consumidor JA tem a pasta, e o template acrescenta-lhe um ficheiro NOVO. Saltar a pasta por
  // ela existir deixava o ficheiro novo de fora para sempre.
  test("ficheiro NOVO dentro de config/ chega a um consumidor que ja tem a pasta", () => {
    let c;
    try {
      const cfg = ".agent/scripts/config/bundles.mjs";
      const novo = ".agent/scripts/config/rotas.mjs";
      c = cenario({
        ontem: { [cfg]: "export const ALVOS_REPROVAM = true;\n", [novo]: null },
        hoje: { [cfg]: "export const ALVOS_REPROVAM = true;\n", [novo]: "export const ROTAS = [];\n" },
        consumidor: { [cfg]: "export const ALVOS_REPROVAM = false;\n", [novo]: null },
      });
      const p = [];
      if (c.ler(novo) === null) p.push("o ficheiro novo de config/ nao chegou");
      if (!/ALVOS_REPROVAM = false/.test(c.ler(cfg) ?? "")) p.push("e a decisao existente foi atropelada");
      return p;
    } finally {
      limpa(c);
    }
  });

  test("a DECISAO do projeto (gate suspenso) sobrevive ao upgrade", () => {
    let c;
    try {
      const rel = ".agent/scripts/check-bundle-sizes.mjs";
      c = cenario({
        ontem: { [rel]: "const ALVOS_REPROVAM = true;\n// motor velho\n" },
        hoje: { [rel]: "const ALVOS_REPROVAM = true;\n// motor NOVO\n" },
        // O consumidor SUSPENDEU o gate. E a posicao que ele toma ao ligar a medicao a serio.
        consumidor: { [rel]: "const ALVOS_REPROVAM = false;\n// motor velho\n" },
        constantes: [[rel, "ALVOS_REPROVAM"]],
      });
      const v = c.ler(rel);
      const p = [];
      if (!/const ALVOS_REPROVAM = false;/.test(v ?? "")) p.push("a suspensao perdeu-se: o upgrade repos o default");
      if (!(v ?? "").includes("motor NOVO")) p.push("nao trouxe o motor novo — a logica tem de vir");
      return p;
    } finally {
      limpa(c);
    }
  });

  // O CONTRA-CASO, e e ele que faz a regra valer alguma coisa: se um simulador trouxesse tudo,
  // o teste de cima passava na mesma e nada media a diferenca entre customizado e intacto.
  test("documento CUSTOMIZADO fica com a versao do projeto", () => {
    let c;
    try {
      c = cenario({
        ontem: { ".agent/rules/guia.md": "# guia velho\n" },
        hoje: { ".agent/rules/guia.md": "# guia novo\n" },
        consumidor: { ".agent/rules/guia.md": "# guia velho\n\nnotas minhas\n" },
      });
      const v = c.ler(".agent/rules/guia.md");
      return v?.includes("notas minhas") ? [] : [`ficou ${JSON.stringify(v)}, devia manter as notas do projeto`];
    } finally {
      limpa(c);
    }
  });

  // `.agent/context/` e o estado do projeto e nao existe em mais sitio nenhum. A primeira frase
  // da Fase 0 do `/upgrade` e sobre isto.
  test("`.agent/context/` nao e tocado", () => {
    let c;
    try {
      c = cenario({ ontem: { ".agent/rules/guia.md": "# v\n" }, hoje: { ".agent/rules/guia.md": "# n\n" } });
      const v = c.ler(".agent/context/session.md");
      return v === "# estado do projeto\n" ? [] : [`o contexto do projeto foi alterado: ${JSON.stringify(v)}`];
    } finally {
      limpa(c);
    }
  });

  // Uma constante CUSTOMIZADA e conteudo do projeto: sobrevive a copia do ficheiro.
  test("constante customizada e preservada por cima do ficheiro novo", () => {
    let c;
    try {
      const velho = "const A = {\n  x: 1,\n};\n// resto velho\n";
      c = cenario({
        ontem: { ".agent/scripts/s.mjs": velho },
        hoje: { ".agent/scripts/s.mjs": "const A = {\n  x: 1,\n};\n// resto NOVO\n" },
        consumidor: { ".agent/scripts/s.mjs": "const A = {\n  x: 99,\n};\n// resto velho\n" },
        constantes: [[".agent/scripts/s.mjs", "A"]],
      });
      const v = c.ler(".agent/scripts/s.mjs");
      const p = [];
      if (!v?.includes("x: 99")) p.push("perdeu a constante customizada do projeto");
      if (!v?.includes("resto NOVO")) p.push("nao trouxe o resto do ficheiro novo");
      if (c.medido.repostas !== 1) p.push(`repostas=${c.medido.repostas}, esperado 1`);
      return p;
    } finally {
      limpa(c);
    }
  });

  // E o contra-caso: uma constante INTACTA nao se preserva — preserva-la era congelar prosa
  // velha do template, e foi assim que citacoes que uma renomeacao matou voltaram a aparecer.
  test("constante INTACTA fica com a versao nova (nao se congela prosa velha)", () => {
    let c;
    try {
      const igual = "const A = {\n  x: 1,\n};\n";
      c = cenario({
        ontem: { ".agent/scripts/s.mjs": igual + "// velho\n" },
        hoje: { ".agent/scripts/s.mjs": "const A = {\n  x: 2,\n};\n// novo\n" },
        constantes: [[".agent/scripts/s.mjs", "A"]],
      });
      const v = c.ler(".agent/scripts/s.mjs");
      const p = [];
      if (!v?.includes("x: 2")) p.push("devia ficar com a constante nova");
      if (c.medido.repostas !== 0) p.push(`repostas=${c.medido.repostas}, esperado 0`);
      return p;
    } finally {
      limpa(c);
    }
  });

  // A tabela do `/upgrade` manda preservar constantes por nome. Se uma delas sair do ficheiro,
  // a instrucao passa a ser impossivel de cumprir — e um consumidor seguia-a as cegas.
  test("constante que desapareceu do template REPROVA, em vez de ignorar", () => {
    let c;
    try {
      c = cenario({
        ontem: { ".agent/scripts/s.mjs": "const A = {\n  x: 1,\n};\n" },
        hoje: { ".agent/scripts/s.mjs": "// a constante saiu daqui\n" },
        constantes: [[".agent/scripts/s.mjs", "A"]],
      });
      return ["devia ter reprovado"];
    } catch (err) {
      if (!err.message.startsWith("__fatal__")) return [`rebentou por outra razao: ${err.message}`];
      return [];
    } finally {
      limpa(c);
    }
  });

  // Os casos de recusa aqui em cima passavam TODOS — e deixavam oito diretorios temporarios por
  // corrida para tras, cada um com um repo `git init` dentro. O chamador escreve
  // `let c; try { c = cenario(...) } finally { limpa(c) }`, e quando o `cenario` lanca, o `c`
  // ainda e `undefined`: o `finally` corre e nao limpa nada. Um teste verde a sujar a maquina.
  //
  // Chegou a 1621 diretorios (4,1 GB) antes de alguem reparar, e o efeito nao era so disco: o
  // indexador do macOS percorria-os e as medicoes de tempo DESTA suite saiam 3x infladas — uma
  // fuga de recursos que falsificava as proprias medicoes que iam decidir se valia a pena
  // optimizar. Nenhuma leitura do teste a denunciava, porque o sintoma esta fora do processo.
  test("um cenario que REBENTA nao deixa diretorios temporarios para tras", () => {
    // A pasta e SO deste teste. Contar `sim-up-*` no `tmpdir()` do sistema media o estado da
    // maquina (`TP3`) e ficava vermelho por causa de qualquer outra corrida em paralelo.
    const base = mkdtempSync(join(tmpdir(), "sim-up-fuga-"));
    try {
      try {
        cenario({
          ontem: { ".agent/scripts/s.mjs": "const A = {\n  x: 1,\n};\n" },
          hoje: { ".agent/scripts/s.mjs": "// a constante saiu daqui\n" },
          constantes: [[".agent/scripts/s.mjs", "A"]],
          base,
        });
        return ["o cenario devia ter rebentado — sem isso este teste nao mede nada"];
      } catch (err) {
        if (!err.message.startsWith("__fatal__")) return [`rebentou por outra razao: ${err.message}`];
      }
      const restos = readdirSync(base);
      return restos.length === 0 ? [] : [`ficaram ${restos.length} diretorio(s) para tras: ${restos.join(", ")}`];
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  // A lista do que saiu do template deriva da arvore da TAG. Se o `git` nao a conseguir dar, o
  // motor nao sabe o que saiu — e a saida errada seria seguir com a lista VAZIA, que se le como
  // "nada saiu do template". Zero resultados lido como zero problemas e o `TP2`, e aqui teria a
  // consequencia de esconder exactamente aquilo que este passo veio revelar.
  //
  // A varredura de mutacao apontou este `fatal()` como nao coberto, um minuto depois de eu o ter
  // escrito.
  test('tag ilegivel para o git REPROVA em vez de dizer que nada saiu', () => {
    let c;
    try {
      c = cenario({ ontem: {}, hoje: {}, tag: 'nao-existe-esta-tag' });
      return ['devia ter reprovado'];
    } catch (err) {
      if (!err.message.startsWith('__fatal__')) return [`rebentou por outra razao: ${err.message}`];
      return err.message.includes('nao sei o que saiu do template')
        ? []
        : [`razao errada: ${err.message}`];
    } finally {
      limpa(c);
    }
  });

  // --- Placeholders usados como EXEMPLO em prosa --------------------------------
  // O sweep do bootstrap substitui `{{ MAIUSCULAS }}` (sem os espacos) em todo o lado e **nao
  // marcador de um exemplo**. Um comentario que cite o placeholder por extenso fica, num
  // derivado, a dizer «um `Referee Exam Study` la sobrevivia ao bootstrap» — sem sentido, em
  // todos os projetos, para sempre.
  //
  // A solucao ja estava escrita no `sync-docs.md` (escrever com espacos) e **nao tinha sido
  // varrida** para os sete sitios que a violavam — tres deles dentro do proprio guard dos
  // placeholders. E o padrao que a ronda 5 poe no topo do relatorio, e o `TP8` deste repo.
  const COLADO = `{${'{'}PROJECT_NAME}${'}'}`;
  const ESPACADO = '{{ PROJECT_NAME }}';

  test('o sweep do bootstrap COME a forma colada', () => {
    const dentro = `uma frase com ${COLADO} no meio`;
    return PLACEHOLDER.test(dentro) ? [] : ['o padrao deixou de casar a forma colada — o teste abaixo passa a nao provar nada'];
  });

  // A metade que interessa: a forma espacada SOBREVIVE. Sem este caso, o de cima sozinho era
  // satisfeito por um padrao que casasse tudo.
  test('a forma ESPACADA sobrevive ao sweep', () => {
    const dentro = `uma frase com ${ESPACADO} no meio`;
    return PLACEHOLDER.test(dentro) ? ['o sweep come a forma espacada — a solucao do sync-docs.md deixou de funcionar'] : [];
  });

  // E o que impede a RECORRENCIA, derivado do disco e nao de uma lista: nenhum ficheiro da
  // maquinaria pode citar um placeholder colado fora do cabecalho. O cabecalho e o uso
  // legitimo — la e um marcador, e tem mesmo de ser substituido.
  test('nenhum ficheiro da maquinaria cita um placeholder colado em prosa', () => {
    const problemas = [];
    for (const dir of ['.agent/scripts', '.claude/hooks']) {
      for (const rel of andaTudo(dir)) {
        const linhas = readFileSync(rel, 'utf8').split('\n');
        linhas.forEach((l, i) => {
          // O cabecalho: ` * <titulo> — {{ PROJECT_NAME }}` (sem espacos) no topo de cada ficheiro.
          if (/^ \* .* — \{\{[A-Z_]+\}\}$/.test(l)) return;
          if (/\{\{[A-Z_]+\}\}/.test(l)) problemas.push(`${rel}:${i + 1} — placeholder colado em prosa`);
        });
      }
    }
    return problemas;
  });
}
