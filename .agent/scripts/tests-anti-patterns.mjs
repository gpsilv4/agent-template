/**
 * Testes do Guard 15 (as referencias a anti-padroes resolvem) — {{PROJECT_NAME}}
 *
 * Espelha `guards/anti-patterns.mjs`. NAO e um entry point: o `test-guards.mjs` importa e
 * chama `registar()`.
 *
 * Uma citacao errada e pior do que nenhuma: manda o leitor a uma entrada REAL com outro
 * significado, e nada no ecra a denuncia. Aconteceu num projeto derivado, ao trazer os
 * scripts do template num upgrade.
 */
import { readdirSync, rmSync } from "fs";
import { pathToFileURL } from "url";
import { test, file, readF, writeF } from "./test-harness.mjs";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.error(
    "tests-anti-patterns.mjs nao e um entry point: nao corre testes por si.\n" +
      "Correr `node .agent/scripts/test-guards.mjs`."
  );
  process.exit(1);
}

export function registar() {
  // --- Guard 15: as referencias a anti-padroes resolvem -------------------------
  // Uma citacao errada e pior do que nenhuma: manda o leitor a uma entrada REAL com outro
  // significado, e nada no ecra a denuncia. Aconteceu num projeto derivado, ao trazer os
  // scripts do template num upgrade.

  // O numero e montado em duas partes de proposito: o Guard 15 varre os `.agent/scripts/`,
  // **inclusive as suites**, logo o literal escrito aqui seria apanhado como citacao morta no
  // repo real. Assim ele existe so no ficheiro que a fixture escreve, que e onde o teste o
  // quer. (Excluir as suites da varredura era a alternativa, e perdia dez citacoes legitimas
  // que vivem nelas — medido.)
  const AP_INEXISTENTE = "AP" + "99";
  test("G15: citacao de um anti-padrao que nao existe avisa", (dir) => {
    const f = ".agent/rules/core-rules.md";
    writeF(dir, f, readF(dir, f) + `\n> Ver ${AP_INEXISTENTE} para o detalhe.\n`);
  }, { code: 1, includes: [`cita ${AP_INEXISTENTE}`, "nao existe em anti-patterns.md"] });

  test("G15: entrada escrita com `###` tambem conta como definida", (dir) => {
    // Tolerancia aos dois niveis: as entradas deste repo usam `##`, um derivado pode usar
    // `###`, e o guard nao pode passar a dizer que o anti-padrao desapareceu por isso.
    const f = ".agent/rules/anti-patterns.md";
    writeF(dir, f, readF(dir, f).replace(/^## AP/gm, "### AP"));
  }, { code: 0, excludes: ["nao existe em anti-patterns.md"] });

  test("G15: sem anti-patterns.md da SKIP visivel, nao silencio", (dir) => {
    rmSync(file(dir, ".agent/rules/anti-patterns.md"));
  }, { code: 1, anyOut: ["SKIP  Guard 15"] });

  /** Mesma nocao de "codigo" que o guard usa (`guards/anti-patterns.mjs`): se as duas
   *  divergirem, os testes deixam de medir os ramos que o guard tem. */
  const ehCodigo = (rel) => rel.startsWith(".agent/scripts/") || rel.startsWith(".claude/");

  /** Percorre a fixture e aplica `transformar` aos ficheiros que `inclui` aceita. O varrimento
   *  e DERIVADO da fixture e nao uma lista escrita a mao: o Guard 15 varre os proprios
   *  `.agent/scripts/`, logo quem cita anti-padroes nos comentarios e o guard sob teste, e uma
   *  lista fixa aqui envelhecia no primeiro ficheiro novo da fixture — o `AP1`.
   *
   *  `transformar` a devolver `null` significa "so ler": e assim que se deriva o conjunto de
   *  anti-padroes citados sem escrever nada.
   *
   *  Por omissao, neutraliza as citacoes. A substituicao nao casa `\bAP\d+\b` e preserva o
   *  comprimento (um `x` por digito), logo nao move nenhum orcamento de bytes: com um texto
   *  mais longo, um teste podia passar a ser satisfeito por um aviso do Guard 1 em vez do que
   *  afirma. O comprimento e derivado do numero e nao assumido — a versao anterior dizia "APx
   *  tem o mesmo comprimento", verdade so enquanto os numeros tiverem um digito.
   *
   *  Os cabecalhos de DEFINICAO do `anti-patterns.md` ficam intactos: sem eles o guard cai no
   *  SKIP legitimo em vez do ramo que se quer medir. */
  function andarFixture(dir, inclui, transformar) {
    const AP = ".agent/rules/anti-patterns.md";
    const neutralizar = (c, sub) =>
      c
        .split("\n")
        .map((l) =>
          sub === AP && /^#{2,3}\s+AP\d+\b/.test(l)
            ? l
            : l.replace(/\bAP(\d+)\b/g, (_, n) => "AP" + "x".repeat(n.length))
        )
        .join("\n");
    const anda = (rel) => {
      for (const e of readdirSync(file(dir, rel), { withFileTypes: true })) {
        if (e.name === ".git" || e.name === "node_modules") continue;
        const sub = rel ? `${rel}/${e.name}` : e.name;
        if (e.isDirectory()) {
          anda(sub);
          continue;
        }
        if (!/\.(?:md|mjs|json|toml)$/.test(e.name)) continue;
        if (!inclui(sub)) continue;
        const c = readF(dir, sub);
        if (!/\bAP\d+\b/.test(c)) continue;
        const novo = transformar ? transformar(c, sub) : neutralizar(c, sub);
        if (novo !== null && novo !== c) writeF(dir, sub, novo);
      }
    };
    anda("");
  }

  /** Apaga TODAS as citacoes `APn` da fixture, em docs e em codigo. */
  const semCitacoesAP = (dir) => andarFixture(dir, () => true);

  // Ha catalogo e ninguem o cita: o catalogo nao previne nada, e e disso que o NOTE avisa.
  // Este ramo era CODIGO MORTO — cada definicao contava como citacao de si mesma, logo
  // `citacoes >= existentes` sempre. Fixture sintetica e nao copia do repo porque o que se
  // afirma e um veredicto ABSOLUTO (exit 0 com NOTE) e nao uma diferenca.
  /** Apaga as citacoes so nos DOCUMENTOS, deixando as dos verificadores intactas. E o cenario
   *  que o ramo do "ninguem cita" existe para nomear: o catalogo esta escrito e a documentacao
   *  do projeto ignora-o. Antes de o ramo contar so docs, chegar la obrigava a reescrever o
   *  **codigo-fonte do guard sob teste** — um caminho que nenhum projeto real percorre. */
  const semCitacoesEmDocs = (dir) => andarFixture(dir, (sub) => !ehCodigo(sub));

  /** Escreve um `anti-patterns.md` que DEFINE tudo o que o codigo da fixture cita. Derivado da
   *  fixture, nao do repo: herdar as definicoes do `anti-patterns.md` real tornava a assercao
   *  falsa num projeto que ainda nao escreveu anti-padroes (o que o proprio ficheiro autoriza
   *  por escrito) — verde aqui, vermelho no consumidor. E o `AP3`. */
  const definicoesQueOCodigoCita = (dir) => {
    const citados = new Set();
    andarFixture(dir, (sub) => ehCodigo(sub), (c) => {
      for (const m of c.matchAll(/\bAP(\d+)\b/g)) citados.add(m[1]);
      return null; // so ler
    });
    const entradas = [...citados].sort((a, b) => Number(a) - Number(b));
    writeF(
      dir,
      ".agent/rules/anti-patterns.md",
      `# Anti-Padroes\n\n${entradas.map((n) => `## AP${n} — montado pela fixture`).join("\n\n")}\n`
    );
    return entradas.length;
  };

  test("G15: catalogo que a documentacao ignora da NOTE (o ramo que era codigo morto)", (dir) => {
    const n = definicoesQueOCodigoCita(dir);
    semCitacoesEmDocs(dir);
    // Se a fixture nao definir nada, o guard cai no SKIP e o teste media outra coisa. Falha
    // fechada: sem esta guarda, uma fixture sem codigo a citar dava verde por acidente.
    if (n === 0) throw new Error("fixture sem definicoes — o teste mediria o SKIP, nao a NOTE");
  }, { code: 0, synthetic: true, includes: ["nenhum documento varrido cita um anti-padrao"] });

  // O CONTROLO da semantica: as citacoes que vivem em CODIGO nao salvam o ramo. Antes de ele
  // contar so docs, os comentarios dos proprios verificadores — que sao alvos de si mesmos —
  // faziam `citacoes > 0` em qualquer projeto que mantivesse `.agent/scripts/`, e o ramo nunca
  // disparava la. Este teste afirma que as citacoes em codigo CONTINUAM a ser varridas para
  // efeito de citacao morta, que e a deteccao real.
  test("G15: citacao morta em CODIGO continua a avisar mesmo sem citacoes em docs", (dir) => {
    definicoesQueOCodigoCita(dir);
    semCitacoesEmDocs(dir);
    const f = ".agent/scripts/check-doc-versions.mjs";
    writeF(dir, f, readF(dir, f) + `\n// ver ${AP_INEXISTENTE} para o detalhe\n`);
  }, { code: 1, synthetic: true, includes: [`cita ${AP_INEXISTENTE}`] });

  // O outro lado da assimetria: as definicoes ignoravam comentarios HTML e as citacoes nao.
  // Quem batia nisto era quem acabou de clonar e ainda nao apagou o exemplo ilustrativo — ou
  // seja, entre o `git clone` e o passo do `BOOTSTRAP.md` que manda apaga-lo.
  //
  // A citacao que importa e a da PROSA dentro do comentario, nao o cabecalho: o cabecalho ja
  // e excluido pela outra correcao, e um teste que so o exercitasse ficava verde com o strip
  // de comentarios desligado — satisfeito por outra verificacao, que e o `AP1`.
  test("G15: exemplo ilustrativo dentro de `<!-- -->` nao e citacao nem definicao", (dir) => {
    semCitacoesAP(dir);
    writeF(dir, ".agent/rules/anti-patterns.md", [
      "# Anti-Padroes",
      "",
      "<!-- Exemplo (substituir/remover no bootstrap). O AP1 abaixo e ilustrativo e nao uma",
      "     definicao deste projeto; a prosa deste comentario cita-o, como no template.",
      "",
      "## AP1 — Um anti-padrao qualquer",
      "",
      "- **Origem**: nenhuma, e exemplo",
      "-->",
      "",
    ].join("\n"));
  }, { code: 0, synthetic: true, includes: ["sem anti-padroes definidos e sem citacoes"] });

  // O strip de comentarios PRESERVA os `\n` — o corpo vira espacos em vez de desaparecer. Com
  // um `replace(…, "")` o ficheiro encurtava e o numero de linha citado no aviso apontava para a
  // linha errada de tudo o que vem depois de um comentario. Um aviso que manda o leitor ao sitio
  // errado **com confianca** custa mais do que aviso nenhum, e nada o afirmava: desligar a
  // preservacao dos `\n` deixava a suite inteira verde.
  test("G15: o numero de linha do aviso sobrevive a um comentario HTML acima", (dir) => {
    const f = ".agent/rules/core-rules.md";
    const linhas = [
      ...readF(dir, f).split("\n"),
      "<!--",
      "um comentario",
      "de varias linhas",
      "-->",
      "",
      `> Ver ${AP_INEXISTENTE} para o detalhe.`,
    ];
    writeF(dir, f, linhas.join("\n") + "\n");
    // O numero e DERIVADO do que a fixture acabou de escrever. Escrito a mao, envelhecia na
    // primeira linha acrescentada ao `core-rules.md` — e o teste passava a medir o ficheiro.
    const n = linhas.findIndex((l) => l.includes(AP_INEXISTENTE)) + 1;
    return { includes: [`${f}:${n}: cita ${AP_INEXISTENTE}`] };
  }, { code: 1 });

  // Um `<!--` SEM a linha de fecho comenta ate ao fim do ficheiro, e e assim que o markdown o
  // le. E o residuo do mesmo defeito: quem remove o exemplo ilustrativo de cima para baixo e
  // para a meio fica com um comentario aberto, e voltava a levar avisos sobre texto comentado.
  // As definicoes vem ANTES do comentario de proposito — depois dele seriam apagadas tambem, e
  // o teste caia no SKIP em vez de medir o que diz medir.
  test("G15: `<!--` sem fecho comenta ate ao fim do ficheiro", (dir) => {
    semCitacoesAP(dir);
    writeF(dir, ".agent/rules/anti-patterns.md", [
      "# Anti-Padroes",
      "",
      "## AP1 — entrada montada pela fixture",
      "",
      "<!-- Exemplo por remover. A linha de fecho foi apagada a mao, logo daqui para baixo",
      "     esta tudo comentado — incluindo a citacao morta da linha seguinte.",
      `     ver ${AP_INEXISTENTE} para o detalhe`,
      "",
    ].join("\n"));
  }, { code: 0, synthetic: true, excludes: [`cita ${AP_INEXISTENTE}`] });

  // O strip de comentarios HTML corre **so** em `.md`. Em `.mjs` o `<!--` e texto dentro de um
  // literal (este repo tem regexes que o contem), logo aplica-lo abria um vao de linhas onde o
  // guard ficava cego — e o vao vivia no proprio ficheiro que a correcao editou. A citacao morta
  // deste teste e plantada exactamente entre um `<!--` e um `-->` de um `.mjs`.
  test("G15: `<!--` num literal de `.mjs` nao cega o guard", (dir) => {
    const f = ".agent/scripts/check-backlog.mjs";
    writeF(
      dir,
      f,
      readF(dir, f) +
        [
          "",
          "// um literal de abertura de comentario HTML:  <!--",
          `// e uma citacao morta pelo meio: ver ${AP_INEXISTENTE} para o detalhe.`,
          "// e o literal de fecho mais abaixo:  -->",
          "",
        ].join("\n")
    );
  }, { code: 1, includes: [`cita ${AP_INEXISTENTE}`, "nao existe em anti-patterns.md"] });

  // O CONTROLO do ambito: os cabecalhos de definicao saem da contagem **so** no
  // `anti-patterns.md`. Um `## APn` em qualquer outro ficheiro e uma citacao como as outras —
  // um cabecalho copiado por `/upgrade` e precisamente o caso que este guard existe para
  // apanhar. Sem este teste, excluir cabecalhos em todo o lado abria um ponto cego silencioso.
  test("G15: cabecalho `## APn` NOUTRO ficheiro continua a contar como citacao", (dir) => {
    const f = ".agent/rules/core-rules.md";
    writeF(dir, f, readF(dir, f) + `\n## ${AP_INEXISTENTE} — cabecalho copiado de outro projeto\n`);
  }, { code: 1, includes: [`cita ${AP_INEXISTENTE}`, "nao existe em anti-patterns.md"] });}
