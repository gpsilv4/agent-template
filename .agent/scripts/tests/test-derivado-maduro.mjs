#!/usr/bin/env node
/**
 * Testes NEGATIVOS da maturidade do derivado — {{PROJECT_NAME}}
 *
 * O modulo sob teste leva o projeto simulado do **dia 1** ao **dia 100**: um anti-padrao
 * proprio, a configuracao preenchida, ficheiros grandes seus. Tres dos quatro achados de uma
 * ronda de revisao viviam so nesse estado.
 *
 * O QUE ESTA SUITE AFIRMA, e e por aqui que ela nao vira decorativa: cada uma das quatro
 * recusas (`fatal()`) fica **vermelha** quando o que ela vigia falha. Um modulo que monta
 * fixtures e falha ABERTO e pior do que nao existir — deixa a simulacao a medir o template por
 * estrear outra vez, em silencio, e a anunciar que mediu um derivado.
 *
 * Cada caso monta a sua propria copia em `tmpdir` e limpa-a (`TP3`): nada e herdado do repo,
 * senao os testes passavam aqui e falhavam em qualquer projeto derivado.
 *
 *   node .agent/scripts/tests/test-derivado-maduro.mjs
 */
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join, dirname } from "path";
import { pathToFileURL } from "url";
import { comHistoria, queConfigurou, comFicheirosGrandes, comoUmDerivadoReal, comOptOuts } from "../lib/derivado-maduro.mjs";

let passed = 0;
const falhas = [];
const test = async (nome, fn) => {
  let p;
  try {
    p = (await fn()) ?? [];
  } catch (err) {
    p = [`rebentou: ${err.message}`];
  }
  if (p.length === 0) {
    passed++;
    console.log(`  PASS  ${nome}`);
  } else {
    falhas.push([nome, p]);
    console.log(`  FAIL  ${nome}`);
    for (const m of p) console.log(`          ${m}`);
  }
};

/** O `fatal` do simulador, capturado em vez de executado. O verdadeiro sai do processo — aqui
 *  lanca, para o teste poder afirmar SOBRE a mensagem. Um teste que deixasse o `fatal` real
 *  correr matava a propria suite, e um que o substituisse por um no-op media o modulo a falhar
 *  ABERTO, que e o defeito. */
class Recusa extends Error {}
const espia = () => {
  const ditas = [];
  return {
    ditas,
    ok: (m) => ditas.push(`ok: ${m}`),
    fatal: (m) => {
      throw new Recusa(m);
    },
  };
};

/** Uma copia minima com o que os tres passos leem. `omitir` deixa um ficheiro DE FORA, que e
 *  como se monta cada controlo negativo; `corromper` troca-lhe o literal que o patch procura. */
const copia = ({ omitir = [], corromper = [] } = {}) => {
  const dir = mkdtempSync(join(tmpdir(), "derivado-maduro-teste-"));
  const escreve = (rel, txt) => {
    if (omitir.includes(rel)) return;
    const p = join(dir, rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, corromper.includes(rel) ? "// o literal mudou de forma\n" : txt);
  };
  escreve(".agent/rules/anti-patterns.md", "# Anti-Padroes\n\n## AP1 — ja existente\n");
  escreve(".agent/scripts/guards/versions.mjs", "const CHECKS = [\n];\n");
  escreve(".agent/scripts/check-doc-versions.mjs", "const BANNED = [\n];\n");
  escreve(".agent/scripts/config/bundles.mjs", "export const ALVOS_REPROVAM = true;\n");
  escreve(".agent/rules/process-rules.md", "Cada ticket passa por 6 fases.\n");
  escreve(
    ".agent/scripts/guards/sizes.mjs",
    "export const LIMITE = 500;\nexport const TETOS = {\n};\nexport const contaLinhas = (t) => t.replace(/\\n$/, '').split('\\n').length;\n"
  );
  return dir;
};
const limpa = (dir) => rmSync(dir, { recursive: true, force: true });
const le = (dir, rel) => readFileSync(join(dir, rel), "utf8");

console.log("\n=== Testes da maturidade do derivado ===\n");

// --- 3c: o anti-padrao proprio ---------------------------------------------------
await test("comHistoria: escolhe o proximo ID livre do prefixo do PROJETO", async () => {
  const dir = copia();
  try {
    const e = espia();
    comHistoria({ dir, ok: e.ok });
    const c = le(dir, ".agent/rules/anti-patterns.md");
    const p = [];
    if (!/## AP2\b/.test(c)) p.push("nao acrescentou o AP2 (o proximo livre depois do AP1)");
    if (/## AP1 — Entrada propria/.test(c)) p.push("reutilizou o AP1, que ja estava ocupado");
    return p;
  } finally {
    limpa(dir);
  }
});

// O CONTRA-CASO do de cima: sem nenhum `AP` definido comeca no PRIMEIRO numero. Sem ele, um
// modulo que escrevesse sempre "AP2" passava no teste anterior.
await test("comHistoria: sem nenhum AP definido comeca no primeiro numero", async () => {
  const dir = copia();
  try {
    writeFileSync(join(dir, ".agent/rules/anti-patterns.md"), "# Anti-Padroes\n");
    comHistoria({ dir, ok: espia().ok });
    return /## AP1\b/.test(le(dir, ".agent/rules/anti-patterns.md")) ? [] : ["nao comecou no AP1"];
  } finally {
    limpa(dir);
  }
});

// Ficheiro ausente NAO e recusa aqui, e e deliberado: um projeto pode nao ter o catalogo.
// Sem este caso, alguem "arrumava" o `if (c !== null)` para um `fatal` e partia esse projeto.
await test("comHistoria: catalogo ausente e silencio, nao recusa", async () => {
  const dir = copia({ omitir: [".agent/rules/anti-patterns.md"] });
  try {
    const e = espia();
    comHistoria({ dir, ok: e.ok });
    return e.ditas.length === 0 ? [] : [`devia ficar calado, disse: ${e.ditas.join(" | ")}`];
  } finally {
    limpa(dir);
  }
});

// --- 3d: a configuracao preenchida -----------------------------------------------
await test("queConfigurou: preenche as quatro decisoes do projeto", async () => {
  const dir = copia();
  try {
    queConfigurou({ dir, ...espia() });
    const p = [];
    if (!/framework-do-projeto/.test(le(dir, ".agent/scripts/guards/versions.mjs"))) p.push("CHECKS por preencher");
    if (!/NomeAntigoDoProjeto/.test(le(dir, ".agent/scripts/check-doc-versions.mjs"))) p.push("BANNED por preencher");
    if (!/ALVOS_REPROVAM = false/.test(le(dir, ".agent/scripts/config/bundles.mjs"))) p.push("gate dos bundles por suspender");
    if (/passa por 6 fases/.test(le(dir, ".agent/rules/process-rules.md"))) p.push("prosa por reescrever");
    return p;
  } finally {
    limpa(dir);
  }
});

// RECUSA 1 de 4.
await test("queConfigurou: RECUSA quando o ficheiro a configurar nao existe", async () => {
  const dir = copia({ omitir: [".agent/scripts/config/bundles.mjs"] });
  try {
    queConfigurou({ dir, ...espia() });
    return ["passou sem o ficheiro — a simulacao media o template por estrear em silencio"];
  } catch (err) {
    return err instanceof Recusa && /nao existe na copia/.test(err.message) ? [] : [`recusa errada: ${err.message}`];
  } finally {
    limpa(dir);
  }
});

// RECUSA 2 de 4. E a que mais provavelmente dispara na vida real: o literal muda de forma num
// ticket qualquer, e sem esta recusa a simulacao passava a medir menos, verde.
await test("queConfigurou: RECUSA quando o literal mudou de forma", async () => {
  const dir = copia({ corromper: [".agent/scripts/guards/versions.mjs"] });
  try {
    queConfigurou({ dir, ...espia() });
    return ["passou com o literal mudado — o patch nao aplicou e ninguem soube"];
  } catch (err) {
    return err instanceof Recusa && /o literal mudou de forma/.test(err.message) ? [] : [`recusa errada: ${err.message}`];
  } finally {
    limpa(dir);
  }
});

// --- 3e: os ficheiros grandes do projeto -----------------------------------------
await test("comFicheirosGrandes: congela o ficheiro do projeto nos TETOS", async () => {
  const dir = copia();
  try {
    await comFicheirosGrandes({ dir, ...espia() });
    const c = le(dir, ".agent/scripts/guards/sizes.mjs");
    const p = [];
    if (!/check-dominio\.mjs/.test(c)) p.push("nao congelou o ficheiro do projeto");
    // 544: as 540 linhas, o cabecalho e as duas da recusa real do #308 (parte 3).
    if (!/: 54[34]\b/.test(c)) p.push(`contagem inesperada em TETOS: ${c.match(/: (\d+)/)?.[1]}`);
    // ACRESCENTA e nao substitui: os TETOS do template tem de sobreviver.
    if (!/export const TETOS = \{/.test(c)) p.push("destruiu o bloco TETOS em vez de lhe acrescentar");
    return p;
  } finally {
    limpa(dir);
  }
});

// RECUSA 3 de 4.
await test("comFicheirosGrandes: RECUSA quando o guard dos tamanhos nao existe", async () => {
  const dir = copia({ omitir: [".agent/scripts/guards/sizes.mjs"] });
  try {
    await comFicheirosGrandes({ dir, ...espia() });
    return ["passou sem o guard — nao ha catraca nenhuma a medir"];
  } catch (err) {
    return err instanceof Recusa && /nao existe na copia/.test(err.message) ? [] : [`recusa errada: ${err.message}`];
  } finally {
    limpa(dir);
  }
});

// RECUSA 4 de 4.
await test("comFicheirosGrandes: RECUSA quando os TETOS mudaram de forma", async () => {
  const dir = copia();
  try {
    writeFileSync(
      join(dir, ".agent/scripts/guards/sizes.mjs"),
      "export const OUTROS_NOME = {\n};\nexport const contaLinhas = (t) => t.replace(/\\n$/, '').split('\\n').length;\n"
    );
    await comFicheirosGrandes({ dir, ...espia() });
    return ["passou sem reescrever os TETOS — o derivado ficava sem os seus ficheiros grandes"];
  } catch (err) {
    return err instanceof Recusa && /nao consegui reescrever os TETOS/.test(err.message) ? [] : [`recusa errada: ${err.message}`];
  } finally {
    limpa(dir);
  }
});

// --- 3f: o derivado como os reais ficam (#177) ------------------------------------
const CFG_VAZIA = "export const GUARDS = [];\nexport const PARES_DO_PROJETO = [];\nexport const SKIPS_DO_PROJETO = [];\n";
// As rules do template e o contexto importado que a (f') enche ate ao limite exato (#556). `rules` e o texto de cada uma
// (null = ausente); `claude` o `CLAUDE.md` (por omissao importa o plano e a sessao).
const RULES_DO_TEMPLATE = [".agent/rules/core-rules.md", ".agent/rules/process-rules.md", ".agent/rules/anti-patterns.md"];
const CLAUDE_COM_PLANO = "# Projeto\n\n@.agent/context/session.md\n@.agent/context/implementation_plan.md\n";
const comCfg = (txt, { rule = true, rules = {}, claude = CLAUDE_COM_PLANO, ficheiros = {} } = {}) => {
  const dir = copia();
  mkdirSync(join(dir, ".agent/scripts/config"), { recursive: true });
  if (txt !== null) writeFileSync(join(dir, ".agent/scripts/config/guards-do-projeto.mjs"), txt);
  mkdirSync(join(dir, ".agent/rules"), { recursive: true });
  if (rule) writeFileSync(join(dir, ".agent/rules/business-logic.md"), "# Logica de negocio\n");
  for (const r of RULES_DO_TEMPLATE) {
    const texto = r in rules ? rules[r] : `# ${r}\n\nUma regra.\n`;
    if (texto !== null) writeFileSync(join(dir, r), texto);
  }
  mkdirSync(join(dir, ".agent/context"), { recursive: true });
  writeFileSync(join(dir, ".agent/context/session.md"), "# Sessao\n\nO estado.\n");
  writeFileSync(join(dir, ".agent/context/implementation_plan.md"), "# Plano\n");
  writeFileSync(join(dir, "CLAUDE.md"), claude);
  for (const [rel, txt] of Object.entries(ficheiros)) writeFileSync(join(dir, rel), txt);
  mkdirSync(join(dir, "src/docs"), { recursive: true });
  return dir;
};
await test("comoUmDerivadoReal: declara o guard proprio E o seu SKIP na config", async () => {
  const dir = comCfg(CFG_VAZIA);
  try {
    comoUmDerivadoReal({ dir, ...espia() });
    const c = le(dir, ".agent/scripts/config/guards-do-projeto.mjs");
    const p = [];
    if (!c.includes("guardDoProjeto")) p.push("o guard nao ficou declarado em GUARDS");
    if (!c.includes("Guard do projeto (simulacao)")) p.push("o SKIP nao ficou declarado em SKIPS_DO_PROJETO");
    // Os PARES dos dois verificadores do projeto, e a suite deles (#308, parte 3): sem isto a varredura
    // do derivado dava `SEM PAR` aos dois.
    for (const alvo of ["guards/do-projeto.mjs", "check-dominio.mjs"]) {
      if (!new RegExp(`PARES_DO_PROJETO = \\[[^\\n]*\\.agent/scripts/${alvo.replace(".", "\\.")}`).test(c)) p.push(`${alvo} sem par em PARES_DO_PROJETO`);
    }
    if (!(le(dir, ".agent/scripts/tests/tests-do-projeto.mjs") ?? "").includes('entryPoint = "test-guards.mjs"')) p.push("a suite do projeto nao ficou escrita");
    // E o par e USAVEL (leitor do #308): importada, a config da um `sinal` que e uma RegExp e casa
    // exactamente o sitio de recusa do guard gerado — um escape estragado no texto passava o teste acima.
    const { PARES_DO_PROJETO } = await import(pathToFileURL(join(dir, ".agent/scripts/config/guards-do-projeto.mjs")).href + "?t=" + Date.now());
    const doProjeto = PARES_DO_PROJETO.find((x) => x.alvo.endsWith("guards/do-projeto.mjs"));
    const linhas = le(dir, ".agent/scripts/guards/do-projeto.mjs").split("\n").filter((l) => doProjeto?.sinal instanceof RegExp && doProjeto.sinal.test(l));
    if (linhas.length !== 1) p.push(`o sinal do par do guard do projeto casou ${linhas.length} linha(s), esperado 1`);
    if (!le(dir, "src/docs/CHANGELOG.md").includes("`TP1`-`TP2`")) p.push("o CHANGELOG nao ganhou historia");
    // (f) entre a NOTE (11 500) e o tecto (12 000) das rules carregadas (#302).
    const bytes = Buffer.byteLength(le(dir, ".agent/rules/business-logic.md"));
    if (bytes <= 11500 || bytes > 12000) p.push(`a rule do projeto devia ficar perto do tecto (11 500-12 000); ficou com ${bytes}`);
    // (f') as rules do template no limite EXATO (o Guard 1 avisa com `> 12000`: qualquer acrescento passa-o), e o
    // contexto importado pelo `CLAUDE.md` a 47 990 dos 48 000 (#556). A rede so mede se o tamanho for este.
    for (const r of RULES_DO_TEMPLATE) {
      const b = Buffer.byteLength(le(dir, r));
      if (b !== 12000) p.push(`${r} devia ficar com 12000 bytes exatos; ficou com ${b}`);
    }
    const ctx = ["session.md", "implementation_plan.md"].reduce((s, f) => s + Buffer.byteLength(le(dir, `.agent/context/${f}`)), 0);
    if (ctx !== 47990) p.push(`o contexto importado devia ficar com 47990 bytes; ficou com ${ctx}`);
    // O enchimento e NEUTRO nos QUATRO: um comentario HTML so com "x" (nenhum guard o le como conteudo).
    for (const f of [...RULES_DO_TEMPLATE, ".agent/context/implementation_plan.md"]) {
      if (!/<!-- x+ -->\n$/.test(le(dir, f))) p.push(`o enchimento de ${f} nao e o comentario neutro`);
    }
    return p;
  } finally {
    limpa(dir);
  }
});
await test("comoUmDerivadoReal: sem a config, REPROVA", async () => {
  const dir = comCfg(null);
  try {
    comoUmDerivadoReal({ dir, ...espia() });
    return ["devia ter reprovado sem a config"];
  } catch (err) {
    return err instanceof Recusa && /nao existe na copia/.test(err.message) ? [] : [`razao errada: ${err.message}`];
  } finally {
    limpa(dir);
  }
});
// A rule que (f) faz crescer e gerada no bootstrap: sem ela o passo nao tem onde agir, e um passo
// que nao faz nada em silencio deixava o derivado sem a NOTE que a ronda 8 mostrou faltar (#302).
await test("comoUmDerivadoReal: sem a rule do projeto, REPROVA", async () => {
  const dir = comCfg(CFG_VAZIA, { rule: false });
  try {
    comoUmDerivadoReal({ dir, ...espia() });
    return ["devia ter reprovado sem a business-logic.md"];
  } catch (err) {
    return err instanceof Recusa && /business-logic\.md nao existe na copia/.test(err.message) ? [] : [`razao errada: ${err.message}`];
  } finally {
    limpa(dir);
  }
});
// (f') Os bytes contam-se como o Guard 1 (o CRLF normalizado, #556): um `core-rules.md` com finais de linha do Windows
// fica a 12 000 bytes PARA O GUARD — contados em bruto, ficava abaixo, e a rede deixava de ser exata sem aviso.
await test("comoUmDerivadoReal: com CRLF, o core-rules.md fica a 12000 bytes contados como o Guard 1", async () => {
  const dir = comCfg(CFG_VAZIA, { rules: { ".agent/rules/core-rules.md": "# Core\r\n\r\nUma regra.\r\n".repeat(40) } });
  try {
    comoUmDerivadoReal({ dir, ...espia() });
    const b = Buffer.byteLength(le(dir, ".agent/rules/core-rules.md").replace(/\r\n/g, "\n"));
    return b === 12000 ? [] : [`normalizado, o core-rules.md ficou com ${b} bytes (esperado 12000)`];
  } finally {
    limpa(dir);
  }
});
// (f') As tres recusas da rede no limite (#556): cada uma pela SUA mensagem.
for (const [nome, opcoes, razao] of [
  ["sem o core-rules.md, REPROVA", { rules: { ".agent/rules/core-rules.md": null } }, /core-rules\.md nao existe na copia/],
  ["com uma rule do template JA acima de 12000, REPROVA (a rede tem de ser revista)", { rules: { ".agent/rules/process-rules.md": "x".repeat(12001) } }, /process-rules\.md \(12001 bytes\) ja nao cabe em 12000/],
  ["com o resto do contexto importado JA no limite, REPROVA a dizer que foi o contexto", { claude: "# Projeto\n\n@.agent/context/session.md\n@.agent/context/implementation_plan.md\n@.agent/context/grande.md\n", ficheiros: { ".agent/context/grande.md": "x".repeat(48000) } }, /o contexto importado sem o plano ja tem \d+ bytes/],
  ["sem o CLAUDE.md a importar o plano, REPROVA", { claude: "# Projeto\n\n@.agent/context/session.md\n" }, /nao importa o \.agent\/context\/implementation_plan\.md/],
]) {
  await test(`comoUmDerivadoReal: ${nome}`, async () => {
    const dir = comCfg(CFG_VAZIA, opcoes);
    try {
      comoUmDerivadoReal({ dir, ...espia() });
      return ["devia ter reprovado"];
    } catch (err) {
      return err instanceof Recusa && razao.test(err.message) ? [] : [`razao errada: ${err.message}`];
    } finally {
      limpa(dir);
    }
  });
}
// Sem a lista dos PARES (#308, parte 3): o guard ficava declarado e a varredura sem rede para ele.
await test("comoUmDerivadoReal: sem PARES_DO_PROJETO, REPROVA", async () => {
  const dir = comCfg("export const GUARDS = [];\nexport const SKIPS_DO_PROJETO = [];\n");
  try {
    comoUmDerivadoReal({ dir, ...espia() });
    return ["devia ter reprovado sem a lista dos PARES"];
  } catch (err) {
    return err instanceof Recusa && /mudou de forma/.test(err.message) ? [] : [`razao errada: ${err.message}`];
  } finally {
    limpa(dir);
  }
});
await test("comoUmDerivadoReal: com a lista noutra forma, REPROVA", async () => {
  const dir = comCfg("export const GUARDS = [];\n// sem a lista dos SKIPs\n");
  try {
    comoUmDerivadoReal({ dir, ...espia() });
    return ["devia ter reprovado com a lista dos SKIPs ausente"];
  } catch (err) {
    return err instanceof Recusa && /mudou de forma/.test(err.message) ? [] : [`razao errada: ${err.message}`];
  } finally {
    limpa(dir);
  }
});

// --- 3g: os opt-outs (#189) -------------------------------------------------------
const comWorkflows = (bootstrap) => {
  const dir = copia();
  const w = (rel, txt) => {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), txt);
  };
  w(".agent/BOOTSTRAP.md", bootstrap);
  for (const n of ["plan", "audit"]) w(`.agent/workflows/${n}.md`, `# ${n}\n`);
  w(".claude/commands/audit.md", "ler audit\n");
  w("CLAUDE.md", "| /plan | `.agent/workflows/plan.md` |\n| /audit | `.agent/workflows/audit.md` |\n");
  w("README.md", "O template traz 2 workflows.\n");
  w(".cursor/rules/project.mdc", "ponteiro\n");
  return dir;
};
const FRASE = "- **Modo minimo**: **remover os restantes** (`audit` — sem uso) na Fase 2.\n";
await test("comOptOuts: poda o que a §2.6 manda, acerta a contagem e tira o .cursor/", async () => {
  const dir = comWorkflows(FRASE);
  try {
    comOptOuts({ dir, ...espia() });
    const p = [];
    if (existsSync(join(dir, ".agent/workflows/audit.md"))) p.push("o workflow podado ficou");
    if (!existsSync(join(dir, ".agent/workflows/plan.md"))) p.push("podou um que a §2.6 manda manter");
    if (existsSync(join(dir, ".claude/commands/audit.md"))) p.push("o wrapper do podado ficou");
    if (le(dir, "CLAUDE.md").includes("audit.md")) p.push("a linha da tabela do podado ficou");
    if (!le(dir, "README.md").includes("1 workflows")) p.push("a contagem nao foi acertada");
    if (existsSync(join(dir, ".cursor"))) p.push("o .cursor/ ficou");
    return p;
  } finally {
    limpa(dir);
  }
});
await test("comOptOuts: sem a frase do Modo minimo no BOOTSTRAP, REPROVA", async () => {
  const dir = comWorkflows("# Bootstrap sem a frase\n");
  try {
    comOptOuts({ dir, ...espia() });
    return ["devia ter reprovado"];
  } catch (err) {
    return err instanceof Recusa && /Modo minimo/.test(err.message) ? [] : [`razao errada: ${err.message}`];
  } finally {
    limpa(dir);
  }
});

console.log("");
console.log(`  ${passed} passaram, ${falhas.length} falharam.`);
if (falhas.length) {
  console.log("\n  Um construtor de fixtures que falhe ABERTO da por medido um derivado que nunca existiu.\n");
  process.exit(1);
}
console.log("\n  Todos os testes da maturidade do derivado passaram.\n");
process.exit(0);
