/**
 * Guard 21: no TEMPLATE, `.agent/context/` esta por estrear — {{PROJECT_NAME}}
 *
 * PORQUE EXISTE: este repo existe para gerar outros. O `CLAUDE.md` promete que e um template
 * virgem e o `/upgrade` marca `.agent/context/*` com "NUNCA tocar". **Nada o media.** Um agente
 * escreveu 189 linhas de planeamento no `implementation_plan.md` e nenhuma rede disparou; se
 * tivesse sido commitado, todo o projeto criado a partir daqui nascia com os tickets de outra
 * pessoa la dentro. O Guard 13 chega a LER estes ficheiros, mas so para contar placeholders —
 * texto acrescentado nao remove nenhum, logo passava.
 *
 * PORQUE NAO FOI SO FALTA DE GUARD: num projeto derivado a Fase 0 de um ticket vai mesmo para o
 * `implementation_plan.md` — e o `process-rules.md` que o manda. A regra esta certa la e errada
 * aqui, e a excecao nunca tinha sido escrita. Esta agora, em `process-rules.md`; sem ela, fechar
 * este guard so garantia que o proximo agente voltava a cair no mesmo sitio por OBEDECER.
 *
 * O CRITERIO E O CONTEUDO CONGELADO, e nao um limite de bytes nem uma lista de marcadores a mao.
 * As tres vias foram pesadas:
 *   - **bytes por ficheiro**: cego a substituir andaime por conteudo do mesmo tamanho, e a folga
 *     gasta-se em silencio;
 *   - **comparar contra a ultima tag** (git): qualquer edicao legitima ao andaime fica vermelha
 *     ate a tag seguinte, e um guard vermelho durante trabalho legitimo e um guard que se
 *     desliga — a licao que o `core-rules.md` ja escreveu. Alem disso obrigava a `git init` nas
 *     fixtures dos doc guards, que hoje sao puramente de ficheiro;
 *   - **hash** (este): apanha QUALQUER alteracao, incluindo a do mesmo tamanho, nao precisa de
 *     git, e a tabela atualiza-se num gesto deliberado e visivel no diff.
 *
 * NAO E `TP8`: um hash e DERIVADO do ficheiro — congela a derivacao, nao duplica a regra. E a
 * suite importa esta mesma tabela em vez de a reescrever.
 *
 * LIMITE HONESTO, dito por escrito: quem polui pode atualizar o hash no mesmo commit. Isto e
 * barreira contra o DESCUIDO, nao contra quem a queira contornar — o mesmo que o `CLAUDE.md` ja
 * diz dos hooks. O que se ganha e que a poluicao passa a aparecer no diff em vez de passar muda.
 */

import { createHash } from "crypto";

/** A pasta inteira, e nao um ficheiro a ficheiro: e o que torna o conjunto FECHADO. */
export const PASTA = ".agent/context";

/**
 * Artefactos que o SISTEMA OPERATIVO ou o editor deixam cair numa pasta, e que nunca sao
 * conteudo. Sem isto, uma visita do Finder a `.agent/context/` punha o guard vermelho e a
 * mensagem dele sugeria **congelar o hash do `.DS_Store`** — conselho errado, e a contradicao
 * exacta do argumento com que este ficheiro rejeita a via do git ("um guard vermelho durante
 * trabalho legitimo e um guard que se desliga"). O repo ja trata estes nomes como ruido: o
 * `.DS_Store` esta no `.gitignore` e o `mutation-sweep.mjs` exclui-o ao copiar o repo.
 *
 * ISTO NAO E O `TP6` (blocklist onde era preciso allowlist), e vale dizer porque: o allowlist
 * e o `PRISTINOS` — tudo o que nao estiver la reprova. Esta lista nao autoriza nada; so decide
 * o que nem sequer e **candidato**, e e curta, fechada e nomeada a ferramenta. Um ficheiro
 * chamado `plano.md` continua a reprovar, e um `.DS_Store` **com 8 KB de planeamento la dentro**
 * seria o unico furo — e quem escreve planeamento num `.DS_Store` ja nao esta a ser descuidado.
 */
const RUIDO_DO_SO = (nome) => nome === ".DS_Store" || nome === "Thumbs.db" || nome === "desktop.ini" || /\.swp$|~$/.test(nome);

/**
 * O `\r\n` -> `\n` nao e cosmetico, e a razao e a mesma do `guards/budgets.mjs`: um clone com
 * `core.autocrlf=true` entrega um byte a mais por linha, e sem normalizar o hash mudava em TODOS
 * os ficheiros num clone Windows. O guard passaria a reprovar pela plataforma de quem o corre em
 * vez de pelo conteudo — que e a forma mais rapida de o desacreditar.
 *
 * 16 hex chegam: nao e defesa contra colisao adversarial (quem quiser contornar edita a tabela,
 * ver o cabecalho), e uma tabela legivel vale mais aqui do que 64 caracteres.
 */
export const digest = (src) => createHash("sha256").update(src.replace(/\r\n/g, "\n"), "utf8").digest("hex").slice(0, 16);

/**
 * O conteudo POR ESTREAR de cada ficheiro de `.agent/context/`, congelado.
 *
 * Mexer num destes ficheiros no template e trabalho legitimo — e obriga a atualizar aqui o hash,
 * no MESMO commit. Um gesto, uma linha, e a alteracao fica a vista de quem revê. E precisamente
 * isso que se quer: tocar no contexto do template tem de ser um ato deliberado.
 *
 * O guard imprime o hash novo quando reprova, para nao ser preciso calcula-lo a mao.
 */
export const PRISTINOS = {
  ".agent/context/backlog-archive.md": "d74b4d538533b42c",
  ".agent/context/backlog.md": "4908ff23f64ee729",
  ".agent/context/decisions-archive.md": "4688e54e1ec16db0",
  ".agent/context/decisions.md": "180e340de1cca452",
  ".agent/context/implementation_plan.md": "90b8d7d96b66b49f",
  ".agent/context/session.md": "cc5d91d56c6f8072",
  ".agent/context/task.md": "f0aa0a905c881dc9",
  ".agent/context/walkthrough-archive.md": "f2e9debc5630c4c5",
  ".agent/context/walkthrough.md": "6d5431e168eee934",
};

/**
 * @returns {number} guards executados
 */
export function guardContextVirgem({ read, warn, ok, skip, listTree, ehDerivado }) {
  // Num projeto derivado estes ficheiros DEVEM ter conteudo: sao o estado e a historia dele.
  // Este guard so tem sentido no template de origem.
  if (ehDerivado()) {
    skip(`Guard 21 (${PASTA}/ por estrear) — projeto derivado; aqui estes ficheiros sao o estado do projeto`);
    return 0;
  }

  // Sem `try/catch` a volta, e de proposito: o `listTree` so lanca quando uma SUBPASTA e
  // ilegivel, e nenhum outro guard o embrulha — o proprio `listTree` diz "aqui sobe, e quem
  // chama decide", e todos decidem deixar subir. A versao anterior apanhava-o, e a varredura de
  // mutacao apontou o ramo como nao coberto: nenhum teste portavel o alcanca (depende de
  // permissoes, e num container a correr como root o `chmod` nem bloqueia). Um `warn` que nenhum
  // teste alcanca da a aparencia de uma rede que nao existe — e o `TP7`, e o `guards/
  // placeholders.mjs` apagou um ramo igual pela mesma razao.
  const tudo = listTree(PASTA, "");
  // O filtro do ruido acontece DEPOIS do `null`: uma pasta ausente continua a ser reprovada, e
  // nao confundida com uma pasta so com ruido lá dentro.
  const emDisco = tudo === null ? null : tudo.filter((f) => !RUIDO_DO_SO(f.split("/").pop()));
  if (emDisco === null) {
    warn(`${PASTA}/ NAO EXISTE — e a pasta de contexto que todo projeto derivado herda`);
    return 1;
  }

  let problemas = 0;

  // 1. O que esta em disco tem de estar na tabela, e tem de estar por estrear.
  for (const f of emDisco) {
    const esperado = PRISTINOS[f];
    if (esperado === undefined) {
      warn(
        `${f}: ficheiro em ${PASTA}/ sem entrada em PRISTINOS — um ficheiro novo aqui viaja para ` +
          `todos os derivados. Se pertence ao template, congelar o hash (${digest(read(f) ?? "")}) em ` +
          `.agent/scripts/guards/context-virgem.mjs; se e trabalho, nao pertence a este repo`
      );
      problemas++;
      continue;
    }
    // `?? ""` e nao um ramo proprio: um ficheiro listado pelo `listTree` e ilegivel pelo `read`
    // e uma janela entre as duas chamadas que nenhum teste alcanca (`TP7` — a varredura apontou
    // o ramo). Colapsado, o caso continua a FALHAR FECHADO: conteudo vazio nunca casa o hash
    // congelado, logo o aviso abaixo dispara na mesma em vez de o ficheiro passar calado.
    const conteudo = read(f) ?? "";
    const atual = digest(conteudo);
    if (atual !== esperado) {
      warn(
        `${f}: DEIXOU DE ESTAR POR ESTREAR (este repo e o template) — ${Buffer.byteLength(conteudo, "utf8")} bytes, ` +
          `hash ${atual} != ${esperado} congelado. Trabalho pendente vive num ISSUE, nunca aqui ` +
          `(ver process-rules.md). Se a alteracao ao andaime e deliberada, atualizar PRISTINOS em ` +
          `.agent/scripts/guards/context-virgem.mjs no mesmo commit`
      );
      problemas++;
    }
  }

  // 2. E o inverso: uma entrada sem ficheiro. Sem este ramo, apagar um ficheiro de contexto do
  //    template saia calado e o derivado nascia sem ele — um `@import` pendurado no `CLAUDE.md`.
  const vistos = new Set(emDisco);
  for (const f of Object.keys(PRISTINOS)) {
    if (vistos.has(f)) continue;
    warn(`${f}: congelado em PRISTINOS mas NAO EXISTE em disco — todo projeto derivado o herda`);
    problemas++;
  }

  if (problemas === 0) ok(`${emDisco.length} ficheiros de ${PASTA}/ por estrear (o template nao guarda trabalho)`);
  return 1;
}
