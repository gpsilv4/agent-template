/**
 * Montar o "projeto de ontem" a partir de uma tag — {{PROJECT_NAME}}
 *
 * PORQUE VIVE A PARTE: e a FIXTURE do `simulate-upgrade.mjs`, e so dele — um projeto derivado
 * que queira medir o impacto de um upgrade nao precisa de montar consumidor nenhum, porque ja
 * **e** um. Extraida quando o simulador ganhou o modo `--template`: sem isto o ficheiro passava
 * as 500 linhas, e levantar o teto para acomodar crescimento proprio esvazia a catraca.
 *
 * PORQUE A BASELINE E UMA TAG E NAO UMA FIXTURE ESCRITA A MAO: quem escreve o passado escreve-o
 * compativel sem dar por isso, e a simulacao fica verde por construcao. Uma tag e um passado que
 * ninguem pode ajustar depois.
 *
 * PORQUE `git archive` E NAO UMA COPIA DA ARVORE: o archive so emite ficheiros versionados. Nao
 * ha `.env`, `.pem`, `node_modules` nem `.git` para excluir, logo nao ha lista de exclusao para
 * envelhecer. O `simulate-derived.mjs` precisa dessa lista porque copia a arvore de trabalho;
 * aqui o problema nao existe, em vez de estar resolvido.
 *
 * `ok` e `fatal` sao parametros e nao `console.log`: as suites afirmam sobre as linhas que isto
 * imprime, logo quem chama e que decide o formato e o que fazer numa recusa.
 */

import { execFileSync } from "child_process";
import { mkdirSync, readdirSync, readFileSync, writeFileSync, rmSync } from "fs";
import { dirname, join } from "path";
import { leOuNull, substituivel, andaFicheiros, PLACEHOLDER, CONSTANTES_DO_PROJETO } from "./upgrade-mecanico.mjs";

/**
 * Enche `dir` com um consumidor da `tag`: a arvore dessa tag, bootstrapada, mais conteudo
 * proprio que exercita cada linha da tabela do `/upgrade`.
 *
 * @param {object} o
 * @param {string} o.dir       a copia (ja criada por quem a vai limpar)
 * @param {string} o.root      o repo do template
 * @param {string} o.tag       a versao de onde o consumidor sai
 * @param {string} o.sha       o sha curto dessa tag, para a marca `.template-version`
 * @param {string} o.substituto  o nome que substitui os placeholders
 * @param {string} o.marcaProjeto  o texto que marca a constante customizada
 * @param {(m: string) => void} o.ok
 * @param {(m: string) => never} o.fatal
 */
export function montaProjetoDeOntem({ dir, root, tag, sha, substituto, marcaProjeto, ok, fatal }) {
  const SUBSTITUTO = substituto;
  const MARCA_PROJETO = marcaProjeto;
  const ROOT = root;

  // Um SO sitio de recusa para as duas formas de isto correr mal — o `git archive` a falhar e o
  // archive a sair vazio. Separados, o primeiro era um ramo que nenhum teste alcanca: nao ha
  // como fazer o `git archive` de uma tag valida falhar a pedido. O `TP7` diz o que fazer com um
  // ramo assim — nao e escrever a razao ao lado, e juntar ao que se consegue medir. O motivo
  // concreto vai na mensagem, logo nao se perde nada a quem le.
  let erroArchive = null;
  try {
    execFileSync("sh", ["-c", `git archive ${tag} | tar -x -C ${JSON.stringify(dir)}`], { cwd: ROOT, stdio: "pipe" });
  } catch (err) {
    erroArchive = err.message.split("\n")[0];
  }
  const nFicheiros = readdirSync(dir).length;
  if (erroArchive !== null || nFicheiros === 0) {
    fatal(`nao consegui montar o template de ${tag}${erroArchive ? `: ${erroArchive}` : " — o archive saiu vazio"}`);
  }
  ok(`template de ontem extraido (${nFicheiros} entradas de topo)`);

  // --- 2b. bootstrapar esse template de ontem --------------------------------------
  // O mesmo estado que o `simulate-derived.mjs` monta, mas sobre a arvore da TAG: placeholders
  // substituidos e as rules que a Fase 2.2 manda gerar. Sem isto o "projeto de ontem" seria o
  // template nu, e um template nu nao e um consumidor.


  let tocados = 0;
  andaFicheiros(dir, (sub, nome) => {
    if (!substituivel(sub, nome)) return;
    const p = join(dir, sub);
    const c = readFileSync(p, "utf8");
    const novo = c.replace(PLACEHOLDER, SUBSTITUTO);
    if (novo !== c) {
      writeFileSync(p, novo);
      tocados++;
    }
  });

  // As rules GERADAS no bootstrap, derivadas da seccao 2.2 do BOOTSTRAP.md **da tag** — e nao do
  // HEAD. A tabela pode ter mudado entretanto, e o que interessa e o que o consumidor gerou na
  // altura em que bootstrapou.
  const bootstrapAntigo = leOuNull(join(dir, ".agent/BOOTSTRAP.md"));
  const seccao = bootstrapAntigo?.split(/^### 2\.2 /m)[1]?.split(/^### 2\.3 /m)[0] ?? "";
  const geradas = [...new Set([...seccao.matchAll(/`(\.agent\/rules\/[a-z-]+\.md)`/g)].map((m) => m[1]))];
  if (geradas.length === 0) {
    fatal(`nao derivei nenhuma rule gerada da seccao 2.2 do BOOTSTRAP.md do ${tag} — o formato mudou?`);
  }
  for (const rel of geradas) {
    const p = join(dir, rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, `# ${rel.split("/").pop().replace(".md", "")} (ProjetoDeOntem)\n\nGerado no bootstrap.\n`);
  }

  // A marca. E o que poe o projeto no **Modo A** do `/upgrade` — o unico que isto simula.
  writeFileSync(join(dir, ".agent/.template-version"), `sha: ${sha}\nversao: ${tag}\n`);
  // E o `BOOTSTRAP.md` sai: a propria documentacao manda apaga-lo depois do bootstrap, e mante-lo
  // deixava o projeto a parecer um template por estrear para quem olha para esse sinal.
  rmSync(join(dir, ".agent/BOOTSTRAP.md"), { force: true });
  ok(`bootstrapado: ${tocados} ficheiro(s) com placeholders, ${geradas.length} rule(s) geradas, marca ${tag}`);

  // --- 2c. o conteudo PROPRIO do projeto -------------------------------------------
  // Um consumidor nao e um template bootstrapado e mais nada: tem coisas suas, e sao elas que
  // tornam um upgrade dificil. Cada item aqui existe para exercitar uma linha concreta da tabela
  // do `/upgrade` — sem eles a simulacao passava por construcao.
  {
    // (a) Um anti-padrao SEU. Depois da separacao de prefixos o espaco `AP` e todo do projeto,
    //     e e exactamente isso que a migracao deste upgrade tem de preservar.
    const rel = ".agent/rules/anti-patterns.md";
    const c = leOuNull(join(dir, rel));
    if (c === null) fatal(`${rel} nao existe no ${tag} — a fixture nao representa um consumidor`);
    const idProprio = "AP" + "1";
    writeFileSync(
      join(dir, rel),
      c.replace(/<!--[\s\S]*?-->\n*/g, "") +
        `\n## ${idProprio} — Anti-padrao proprio deste projeto\n\n` +
        `- **Origem**: um bug deste projeto\n- **Anti-padrao**: o que nao fazer\n` +
        `- **Correto**: o que fazer\n- **Detecao em review**: \`grep -rn "exemplo" src/\`\n`
    );

    // (b) Um ficheiro SEU acima das 500 linhas. E a linha "limiar apertado" da 2b: o Guard 17
    //     reprova-o, e a adaptacao prescrita e entra-lo em `TETOS` com a contagem do dia da
    //     migracao. Sem um ficheiro assim, essa linha da tabela nunca era exercitada.
    writeFileSync(
      join(dir, ".agent/scripts/check-dominio.mjs"),
      "#!/usr/bin/env node\n// Verificador proprio deste projeto.\n" + "// linha\n".repeat(540)
    );

    // (c) Uma constante adaptavel CUSTOMIZADA. Sem isto o caminho da preservacao nunca corria:
    //     todos os blocos ficavam iguais aos do template e nao havia nada para preservar — um
    //     teste que passa sem exercitar o que diz exercitar.
    //     QUAL constante e DERIVADO de `CONSTANTES_DO_PROJETO` — a lista que o motor usa de facto.
    //     Cravado a mao, envelhece: esta linha dizia `TARGETS` em `check-bundle-sizes.mjs`, e quando
    //     essa constante se mudou para `config/` a fixture passou a customizar algo que o motor ja
    //     nao preserva. **Nao deu erro enquanto a tag de baseline era anterior a mudanca**; so
    //     apareceu na tag seguinte, no CI, com a mensagem a apontar para a forma da constante em vez
    //     de para a causa. Derivado da lista, nao pode divergir dela.
    const [relAlvos, nomeConst] = CONSTANTES_DO_PROJETO[0];
    const cAlvos = leOuNull(join(dir, relAlvos));
    if (cAlvos === null) fatal(`${relAlvos} nao existe no ${tag} — a fixture nao representa um consumidor`);
    //     A customizacao e um COMENTARIO e nao uma entrada: as constantes da lista tem formas
    //     diferentes (umas abrem em `[`, outras em `{`, e as entradas de cada uma sao objectos
    //     distintos). Um comentario e valido em todas, e o que a travessia mede e se o bloco do
    //     PROJETO sobrevive — nao o que esta escrito dentro dele.
    const cAlvosNovo = cAlvos.replace(
      new RegExp(`^(const ${nomeConst} = [\\[{])$`, "m"),
      `$1\n  ${MARCA_PROJETO}`
    );
    // A fixture REBENTA se nao alterou nada. Sem esta linha, uma mudanca de forma da constante
    // (era `[`, e um objecto `{`) fazia o `replace` nao casar, a customizacao nao acontecia, e a
    // simulacao passava a testar a preservacao de zero constantes — verde a afirmar nada. Foi
    // exactamente o que aconteceu, e so se viu por o contador dizer `0 preservada(s)`.
    if (cAlvosNovo === cAlvos) fatal(`nao consegui customizar TARGETS em ${relAlvos} — a forma da constante mudou`);

    // (d) A DECISAO do projeto: o gate dos bundles SUSPENSO. Nao e um valor tecnico — e a posicao
    //     que um consumidor toma quando liga a medicao a serio, encontra os alvos acima e abre um
    //     ticket. Foi exactamente esta decisao que se perdeu numa ronda de `/upgrade` real: o
    //     ficheiro veio, a constante voltou ao default, e o gate passou a reprovar **sem ninguem
    //     decidir nada**. Em silencio, com o verificador a correr e a medir bem.
    //
    //     A verificacao que o consumidor tinha era por DIFERENCA de output, e nao apanhou: nenhuma
    //     linha desapareceu — o veredicto e que mudou. Diferenca de output apanha o que some; nao
    //     apanha um default que regressa. Por isso e que isto se mede aqui, e nao se confia.
    writeFileSync(join(dir, relAlvos), cAlvosNovo);

    //     A decisao vive na `config/`, que o upgrade NAO toca. E essa a mudanca que fecha a
    //     classe: preservar por nome era mitigacao, e uma lista de nomes envelhece a cada decisao
    //     nova que alguem acrescente e se esqueca de inscrever.
    //     A fixture pode legitimamente NAO ter a `config/`: ela nasceu depois de algumas tags, e
    //     um consumidor tirado de uma dessas e exactamente o caso real que mais interessa. Por
    //     isso isto **garante** o ficheiro em vez de o exigir — escreve-o quando falta, e edita-o
    //     quando ja veio da tag. As duas metades sao medidas: o teste do consumidor SEM `config/`
    //     vive em `test-simulate-upgrade.mjs`, e prova que o upgrade lha traz.
    const relCfg = ".agent/scripts/config/bundles.mjs";
    const cCfg = leOuNull(join(dir, relCfg));
    const comGateSuspenso =
      cCfg === null
        ? "export const TARGETS = {};\nexport const ALVOS_REPROVAM = false;\n"
        : cCfg.replace(/export const ALVOS_REPROVAM = (?:true|false);/, "export const ALVOS_REPROVAM = false;");
    if (cCfg !== null && comGateSuspenso === cCfg) {
      fatal(`nao consegui suspender o gate em ${relCfg} — o literal mudou de forma`);
    }
    mkdirSync(dirname(join(dir, relCfg)), { recursive: true });
    writeFileSync(join(dir, relCfg), comGateSuspenso);
  }
  ok("conteudo proprio do projeto acrescentado (anti-padrao, verificador grande e uma constante customizada)");
}
