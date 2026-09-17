#!/usr/bin/env node
/**
 * Testes NEGATIVOS do simulador de `/upgrade` — {{PROJECT_NAME}}
 *
 * O que se afirma: **cada caminho de recusa recusa mesmo, e diz porque**. Um simulador que
 * falhasse aberto era pior do que nao existir — daria por verificada a metade do produto que
 * ninguem mede, que e exactamente o buraco que ele veio tapar.
 *
 * Cada caso monta o seu proprio repo git (`TP3`: nada e herdado do estado deste). Os casos
 * exercitam os caminhos que saem ANTES de o simulador precisar das suites reais — e por isso
 * sao baratos; a corrida completa e o `simulate-upgrade.mjs` no CI.
 *
 * O motor mecanico tem os seus casos proprios aqui em baixo: foi extraido para `lib/` por ser
 * a parte que escreve por cima dos ficheiros de um consumidor, e e ai que um erro custa dados.
 *
 *   node .agent/scripts/tests/test-simulate-upgrade.mjs
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { CONSTANTES_DO_PROJETO } from "../lib/upgrade-mecanico.mjs";
// Os construtores de fixture vivem no harness: a suite passou as 500 linhas e a catraca do
// Guard 17 exigiu a divisao antes de a deixar crescer mais. Ver `test-upgrade-harness.mjs`.
import { git, repo, corre, exige, cenario, limpa, templateSintetico, pontaAPonta, test, resumo } from "./harness/test-upgrade-harness.mjs";
import { registar as registarMotor } from "./tests-upgrade-motor.mjs";
import { contaLinhas, LIMITE } from "../guards/sizes.mjs";

const AQUI = dirname(fileURLToPath(import.meta.url));

/** O par (ficheiro, constante) que o simulador customiza na fixture — DERIVADO da mesma lista
 *  que ele usa. Escrito a mao aqui e la, os dois lados tinham de concordar sem nada a
 *  verifica-lo, e deixaram de concordar assim que uma constante mudou de ficheiro. */
const CONST_FIXTURE = CONSTANTES_DO_PROJETO[0];

// Os casos do MOTOR vivem em modulo proprio (a catraca do Guard 17 exigiu a divisao). Sao
// chamados explicitamente e nao por descoberta: esta suite tem contadores proprios.
registarMotor();

// --- Os guardas que saem ANTES de medir -----------------------------------------

// Sem tags nao ha baseline, e sem baseline nao ha medicao. Passar aqui seria dar por
// verificado um upgrade que nunca chegou a ser montado — o `TP2` na ferramenta escrita
// para o apanhar.
test("sem tags acessiveis, REPROVA a dizer que nao mediu", () => {
  const dir = repo();
  try {
    return exige(corre(dir), { codigo: 1, inclui: ["nao ha tags acessiveis", "sem baseline nao ha medicao"] });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// A tag IGUAL ao HEAD acontece logo a seguir a marcar uma release. Sem delta nao ha upgrade
// nenhum a simular, e um OK aqui era sucesso sobre zero trabalho.
test("tag identica ao HEAD (delta vazio), REPROVA", () => {
  const dir = repo({ comTag: "v9.9.9" });
  try {
    return exige(corre(dir), { codigo: 1, inclui: ["e identica ao HEAD", "nao ha upgrade a simular"] });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// O CONTRA-CASO do anterior: com um commit depois da tag ha delta, e o simulador passa deste
// guarda. Sem ele, um simulador que reprovasse SEMPRE passava o teste de cima.
test("com delta, PASSA deste guarda (nao reprova por baseline)", () => {
  const dir = repo({ comTag: "v9.9.9" });
  try {
    writeFileSync(join(dir, "NOVO.md"), "# novo\n");
    git(dir, ["add", "-A"]);
    git(dir, ["commit", "-qm", "depois da tag"]);
    return exige(corre(dir), { codigo: 1, exclui: ["nao ha upgrade a simular", "nao ha tags acessiveis"] });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// Este script e COPIADO para todos os projetos derivados. La, "a ultima tag antes do HEAD"
// sao as releases DESSE projeto — mediria projeto-v1 -> projeto-v2. Pior que inutil: media
// uma coisa a fingir que media outra. Sai 0 com a razao VISIVEL.
test("num projeto derivado (com marca), da SKIP visivel e sai 0", () => {
  const dir = repo({ comMarca: true, comTag: "v1.0.0" });
  try {
    return exige(corre(dir), { codigo: 0, inclui: ["SKIP", "e um projeto derivado, nao o template"] });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// O outro sinal do mesmo facto: o bootstrap manda apagar o `BOOTSTRAP.md`. Qualquer um dos
// dois basta — olhar so para um deixava metade dos derivados a correr a simulacao errada.
test("sem BOOTSTRAP.md (o outro sinal de derivado), tambem da SKIP", () => {
  const dir = repo({ semBootstrap: true, comTag: "v1.0.0" });
  try {
    return exige(corre(dir), { codigo: 0, inclui: ["SKIP", "e um projeto derivado"] });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// --- O simulador de ponta a ponta, sobre um template SINTETICO --------------------
// Os casos de cima saem cedo, nos guardas. Estes montam um template completo o bastante para
// o simulador correr ate ao fim — e e so assim que os seus proprios caminhos de recusa (a
// customizacao da fixture, a derivacao dos comandos, a adaptacao do Guard 17) ficam medidos.
// A varredura de mutacao apontou-os um a um como nao cobertos; nenhum apareceu numa leitura.



// O archive vazio: a tag aponta para um commit sem ficheiros nenhuns, e o template so aparece
// depois dela. E a unica forma de chegar a esse caminho sem partir o git de proposito.
test("tag cujo archive sai VAZIO, REPROVA", () => {
  const dir = mkdtempSync(join(tmpdir(), "sim-up-vazio-"));
  try {
    git(dir, ["init", "-q", "-b", "main"]);
    git(dir, ["config", "user.email", "t@t"]);
    git(dir, ["config", "user.name", "t"]);
    git(dir, ["commit", "-q", "--allow-empty", "-m", "vazio"]);
    git(dir, ["tag", "v1.0.0"]);
    for (const [rel, c] of Object.entries(templateSintetico())) {
      if (c === null) continue;
      mkdirSync(dirname(join(dir, rel)), { recursive: true });
      writeFileSync(join(dir, rel), c);
    }
    git(dir, ["add", "-A"]);
    git(dir, ["commit", "-qm", "so depois da tag"]);
    return exige(corre(dir), { codigo: 1, inclui: ["o archive saiu vazio"] });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("template sintetico completo: o simulador corre ate ao fim", () => {
  const r = pontaAPonta();
  try {
    return exige(r, { codigo: 0, inclui: ["FASE 2", "verificado"] });
  } finally {
    rmSync(r.dir, { recursive: true, force: true });
  }
});

// Cada um destes desliga uma peca que o simulador PRECISA, e exige que ele pare a dizer o que
// falta — em vez de seguir e dar um veredicto sobre uma simulacao incompleta.
for (const [nome, extra, marca] of [
  // QUAL ficheiro e QUAL constante vem de `CONSTANTES_DO_PROJETO`, como no simulador. Cravados
  // aqui, estes dois casos passavam a medir um ficheiro que a fixture ja nao customiza — e a
  // reprovar por outra razao que nao a que dizem no nome. Foi o que aconteceu do outro lado.
  [
    "sem o ficheiro onde a fixture customiza uma constante",
    { [CONST_FIXTURE[0]]: null },
    "nao representa um consumidor",
  ],
  [
    "com a constante da fixture noutra forma",
    // Sem o `=` na forma que o simulador procura, a customizacao nao aplica e ele tem de parar.
    { [CONST_FIXTURE[0]]: `const ${CONST_FIXTURE[1]} = [];\n` },
    "a forma da constante mudou",
  ],
  ["sem job `guard-tests` no ci.yml", { ".github/workflows/ci.yml": "jobs:\n  outro:\n    steps: []\n" }, "nao derivei nenhum comando"],
  ["sem o guard dos tamanhos", { ".agent/scripts/guards/sizes.mjs": null }, "nao consigo aplicar a adaptacao"],
  ["sem `.agent/context/`", { ".agent/context/session.md": null }, "nao existe na copia"],
  // O gate suspenso e a DECISAO do projeto: se a fixture nao a conseguir montar, a simulacao
  // deixa de exercitar a travessia que interessa — e passava a verde a afirmar menos. A
  // varredura apontou este `fatal()` como nao coberto.
  ["com o gate dos bundles noutra forma", { ".agent/scripts/config/bundles.mjs": "export const ALVOS_REPROVAM = 1;\n" }, "nao consegui suspender o gate"],
  // A AUSENCIA da config NAO entra nesta lista, e saiu dela de proposito: um consumidor tirado
  // de uma tag anterior a `config/` existir nao a tem, e esse e o caso real mais importante, nao
  // uma fixture partida. A fixture passa a escreve-la; o que ela mede esta nos dois testes
  // dedicados mais abaixo.
  ["sem a seccao 2.2 no BOOTSTRAP.md", { ".agent/BOOTSTRAP.md": "# Bootstrap\n\nsem a seccao\n" }, "nao derivei nenhuma rule gerada"],
  ["sem `anti-patterns.md` na tag", { ".agent/rules/anti-patterns.md": null }, "nao representa um consumidor"],
]) {
  test(`${nome}, REPROVA`, () => {
    const r = pontaAPonta(extra);
    try {
      return exige(r, { codigo: 1, inclui: [marca] });
    } finally {
      rmSync(r.dir, { recursive: true, force: true });
    }
  });
}

// --- O que o motor NAO consegue fazer tem de PARAR tudo -------------------------
// Estes tres sitios sairam da varredura de mutacao como nao cobertos: desliga-los deixava a
// suite verde. Um `fatal()` que ninguem nota e um caminho de recusa que nao recusa — e este
// modulo escreve por cima dos ficheiros de um consumidor, logo o custo nao e um aviso.

/** Corre o motor com uma BASE a que falta um ficheiro, e exige que pare. */
const exigeFatal = (base, marca) => {
  let c;
  try {
    c = cenario({ ontem: base, hoje: base });
    return [`devia ter reprovado (${marca})`];
  } catch (err) {
    if (!err.message.startsWith("__fatal__")) return [`rebentou por outra razao: ${err.message}`];
    return err.message.includes(marca) ? [] : [`reprovou por outra coisa: ${err.message}`];
  } finally {
    limpa(c);
  }
};

test("pasta que o upgrade copia por inteiro em falta, REPROVA", () =>
  exigeFatal({ ".claude/hooks/h.mjs": null, ".agent/scripts/x.mjs": "// x\n" }, "nada a trazer"));

test("catalogo de anti-padroes do template em falta, REPROVA", () =>
  exigeFatal({ ".agent/rules/anti-patterns-template.md": null }, "anti-patterns-template.md"));

test("`anti-patterns.md` sem o separador `---`, REPROVA em vez de adivinhar", () =>
  exigeFatal({ ".agent/rules/anti-patterns.md": "# Projeto\n\nsem separador\n" }, "separador"));


// --- O que SAIU do template (o upgrade copia, nunca apaga) -------------------
// `cpSync` acrescenta e substitui. Um ficheiro renomeado ou removido no template ficava no
// consumidor para sempre, ao lado do novo — e nao e desarrumacao: a descoberta exige-lhe par
// (`SEM PAR`), o Guard 17 conta-o, o `check-test-surface` ve a superficie duplicada. Uma
// arrumacao de pastas no template punha vermelhos TODOS os projetos derivados.
test('ficheiro que saiu do template e listado como removido', () => {
  let c;
  try {
    c = cenario({
      ontem: { '.agent/scripts/velho.mjs': '// existia na tag\n' },
      hoje: { '.agent/scripts/velho.mjs': null }, // saiu do template
    });
    return c.medido.removidos.some((r) => r.caminho === '.agent/scripts/velho.mjs')
      ? []
      : [`removidos = ${JSON.stringify(c.medido.removidos)}, devia conter o ficheiro que saiu`];
  } finally {
    limpa(c);
  }
});

// O CONTRA-CASO que torna a regra SEGURA, e sem ele os outros nao valem nada: um ficheiro que o
// PROJETO criou nunca esteve na tag, logo nunca pode ser proposto para apagar. E a diferenca
// entre propor apagar codigo do template e propor apagar trabalho de alguem.
test('ficheiro PROPRIO do projeto nunca e proposto para remocao', () => {
  let c;
  try {
    c = cenario({
      ontem: {},
      hoje: {},
      consumidor: { '.agent/scripts/meu-verificador.mjs': '// e meu, nunca esteve no template\n' },
    });
    return c.medido.removidos.some((r) => r.caminho.includes('meu-verificador'))
      ? ['propos apagar um ficheiro do PROJETO — nunca esteve na tag']
      : [];
  } finally {
    limpa(c);
  }
});

// E o terceiro caso, que separa "saiu do template" de "o consumidor ja nao o tem": se o projeto
// ja o apagou por conta propria, nao ha nada a propor. Sem isto, o /upgrade listava ficheiros
// inexistentes e quem lesse a lista perdia a confianca nela.
test('ficheiro que saiu do template mas o projeto ja apagou nao e listado', () => {
  let c;
  try {
    c = cenario({
      ontem: { '.agent/scripts/velho.mjs': '// existia na tag\n' },
      hoje: { '.agent/scripts/velho.mjs': null },
      consumidor: { '.agent/scripts/velho.mjs': null }, // o projeto ja o tinha apagado
    });
    return c.medido.removidos.some((r) => r.caminho === '.agent/scripts/velho.mjs')
      ? ['listou um ficheiro que o consumidor ja nao tem']
      : [];
  } finally {
    limpa(c);
  }
});
// A adaptacao 2b contava linhas por conta propria, sem aparar o newline final — media +1 em
// TODOS os ficheiros, e nunca deu sinal (400 medido como 401 continua abaixo do limite). So
// aparece na FRONTEIRA: um ficheiro em exactamente 500 era lido como 501, a 2b congelava-o em
// `TETOS`, e o guard — que le 500 — mandava tirar a entrada. Punha o `/upgrade` de QUALQUER
// consumidor vermelho. A contagem passou a vir de `guards/sizes.mjs`; este teste prende a
// fronteira, que e onde uma contagem erra.
test('a contagem da adaptacao 2b concorda com o Guard 17 na FRONTEIRA', () => {
  const p = [];
  const comNewlineFinal = 'x\n'.repeat(LIMITE);
  if (contaLinhas(comNewlineFinal) !== LIMITE) {
    p.push(`${LIMITE} linhas contadas como ${contaLinhas(comNewlineFinal)} — o newline final conta a mais`);
  }
  // O outro lado: uma linha a mais TEM de contar a mais, senao a contagem so estaria a subtrair.
  if (contaLinhas('x\n'.repeat(LIMITE + 1)) !== LIMITE + 1) {
    p.push('um ficheiro acima do limite deixou de ser contado acima do limite');
  }
  return p;
});


  // --- Migracao ou limpeza: a distincao decide se a remocao e opcional --------
  // Um ficheiro que saiu e nao voltou a aparecer e uma LIMPEZA: adiar a remocao deixa um orfao
  // inofensivo. Um que saiu e cujo mesmo NOME existe noutro caminho foi MOVIDO — e ai adiar
  // parte o projeto: os contadores duplicam, a descoberta exige par ao orfao, o
  // `check-test-surface` ve a superficie inflada.
  //
  // Medido a mover 28 ficheiros para `tests/`: o consumidor ficava com as DUAS estruturas e o
  // gate vermelho, com uma mensagem que falava de "entry point que declara" — a quilometros da
  // causa.
  test('ficheiro MOVIDO (mesmo nome noutra pasta) e marcado como migracao', () => {
    let c;
    try {
      c = cenario({
        ontem: { '.agent/scripts/x.mjs': '// na raiz\n' },
        hoje: { '.agent/scripts/x.mjs': null, '.agent/scripts/tests/x.mjs': '// mudou de pasta\n' },
      });
      const r = c.medido.removidos.find((r) => r.caminho === '.agent/scripts/x.mjs');
      if (!r) return ['nao listou o ficheiro que saiu da raiz'];
      return r.migrado ? [] : ['devia estar marcado como migrado — o mesmo nome existe em tests/'];
    } finally {
      limpa(c);
    }
  });

  // O CONTRA-CASO, e sem ele o de cima era satisfeito por marcar TUDO como migracao: um ficheiro
  // que desapareceu de vez e uma limpeza, e a remocao dele pode esperar sem partir nada.
  test('ficheiro que desapareceu de vez NAO e marcado como migracao', () => {
    let c;
    try {
      c = cenario({
        ontem: { '.agent/scripts/obsoleto.mjs': '// ja nao serve\n' },
        hoje: { '.agent/scripts/obsoleto.mjs': null },
      });
      const r = c.medido.removidos.find((r) => r.caminho === '.agent/scripts/obsoleto.mjs');
      if (!r) return ['nao listou o ficheiro que saiu'];
      return r.migrado ? ['marcou como migracao um ficheiro que nao existe em lado nenhum'] : [];
    } finally {
      limpa(c);
    }
  });
resumo();
