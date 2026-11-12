/**
 * As REGRAS do backlog que nao sao contagens — {{PROJECT_NAME}}
 *
 * PORQUE EXISTE (#445, PR 2): a ordem de execucao vivia em prosa ou numa coluna `Ordem` que ninguem verificava, um
 * "Depende de" podia apontar para um ticket que so se faz depois, e uma linha fechada ficava no ativo com um `~~`. O
 * `calcula` (`lib/backlog-calculo.mjs`) conta e valida os contadores; estas regras leem o mesmo backlog (o leitor,
 * `lib/backlog-itens.mjs`) e dizem o que esta fora de ordem ou fora do sitio. Cada mensagem reprova (`derivado: false`):
 * o `--corrigir` nao lhes toca, porque reordenar ou fechar e uma decisao de uma pessoa.
 *
 * NAO REPETE O QUE JA SE DIZ: um Estado desconhecido, um `Concluido` no ativo, um ID duplicado ou um ID dos Pendentes
 * que nenhuma tabela por tipo cobre ja tem aviso no `calcula`; aqui nao se diz outra vez.
 */
import { ID_LIKE, OPEN_STATES, norm } from "./backlog-itens.mjs";

/** A `Ordem` de uma linha de bloco: um inteiro, ou `null` (nao e um numero). Com a mesma tolerancia a enfase do ID e
 *  do Estado (`**1**`), e sem os `~~` de uma linha riscada (a regra 6 ja diz o riscado). */
const ordemDe = (celula) => {
  const v = norm((celula ?? "").replace(/~~/g, ""));
  return /^\d+$/.test(v) ? Number(v) : null;
};

/**
 * @param {ReturnType<import("./backlog-itens.mjs").leBacklog>} lido
 * @param {{ ACTIVE: string, ARCHIVE: string }} nomes  os caminhos, para as mensagens
 * @returns {string[]} as mensagens, pela ordem das regras
 */
export function regrasDoBacklog(lido, { ACTIVE, ARCHIVE }) {
  const problemas = [];

  // 1) O Historico: o heading, e as colunas que se leem pelo nome. Sem elas, o `calcula` nao valida linha a linha (um
  //    aviso so, e nao um por linha).
  if (lido.encontradas.arquivo && !lido.encontradas.historico) {
    problemas.push(`${ARCHIVE}: nao encontrei o heading \`## Historico\` — os items fechados nao estao a ser lidos`);
  }
  for (const c of lido.colunasEmFaltaNoHistorico) {
    problemas.push(`${ARCHIVE}: o Historico nao tem a coluna \`${c}\` — le-se pelo nome (ID, Tipo, Estado); sem ela, os contadores nao foram validados`);
  }

  // 2) O que parece um bloco e nao o e.
  for (const { titulo } of lido.semId) {
    problemas.push(`${ACTIVE}: a tabela de "${titulo}" tem a coluna Ordem e nao tem ID — um bloco precisa das duas`);
  }
  for (const { titulo } of lido.sprintSemOrdem) {
    problemas.push(`${ACTIVE}: "${titulo}" tem uma tabela com ID e sem a coluna Ordem — a ordem de execucao vive nela`);
  }

  // As definicoes, uma vez. Aberto: nas tabelas por tipo, Pendente ou A Fazer. Fechado: no Historico (vence o aberto:
  // um ID nos dois ja tem o aviso de duplicado). Inexistente: em nenhum dos dois.
  // Um riscado do Historico ja vem pelo ID limpo do leitor (#524): `~~F1~~` fechou o F1.
  const fechados = new Set(lido.fechados.map((f) => f.id).filter(Boolean));
  const existentes = new Set([...lido.linhasPorTipo.map((l) => l.id), ...fechados].filter(Boolean));
  const abertos = new Set(lido.linhasPorTipo.filter((l) => l.id && OPEN_STATES.includes(l.estado) && !fechados.has(l.id)).map((l) => l.id));
  const nosPendentes = new Set((lido.pendentes ?? []).map((p) => p.id).filter(Boolean));

  // 3) A Ordem de cada bloco: cresce linha a linha, sem repetidos (os saltos sao permitidos: fechar tira a linha).
  const ordemValida = lido.blocos.map((b) => {
    let anterior = null;
    let valida = true;
    b.linhas.forEach((l, i) => {
      if (!l.idLimpo) {
        problemas.push(`${ACTIVE}: "${b.titulo}", linha ${i + 1}: tem conteudo e nao tem ID`);
        return;
      }
      const n = ordemDe(l.ordem);
      if (n === null) {
        problemas.push(`${ACTIVE}: "${b.titulo}": a Ordem de ${l.idLimpo} ("${l.ordem}") nao e um numero`);
        valida = false;
      } else if (anterior !== null && n === anterior) {
        problemas.push(`${ACTIVE}: "${b.titulo}": a Ordem ${n} repete-se (${l.idLimpo})`);
        valida = false;
      } else if (anterior !== null && n < anterior) {
        problemas.push(`${ACTIVE}: "${b.titulo}": a Ordem nao cresce em ${l.idLimpo} (${n} depois de ${anterior}) — a ordem das linhas e a de execucao`);
        valida = false;
      }
      if (n !== null) anterior = n;
    });
    return valida;
  });

  // Onde cada ID esta planeado: a 1.a ocorrencia num bloco.
  const onde = new Map();
  // Pelo `idLimpo`: um riscado ainda esta planeado ali (e a regra 6 que diz o riscado).
  lido.blocos.forEach((b, bi) => b.linhas.forEach((l) => l.idLimpo && !onde.has(l.idLimpo) && onde.set(l.idLimpo, { bi, ordem: ordemDe(l.ordem) })));

  // 4) O "Depende de" (os IDs antes de `Bloqueado:`): a dependencia tem de existir e, se esta aberta, tem de vir ANTES.
  lido.blocos.forEach((b, bi) => {
    // Uma coluna de dependencias com outro nome desligava esta regra calada (`TP2`): diz-se, uma vez por bloco.
    const estranha = (b.cabecalho ?? []).find((c) => c.startsWith("depend") && c !== "depende de");
    if (estranha) problemas.push(`${ACTIVE}: "${b.titulo}": a coluna "${estranha}" nao e lida — as dependencias vivem na coluna \`Depende de\``);
    for (const l of b.linhas) {
      if (!l.idLimpo) continue;
      const deste = `${ACTIVE}: "${b.titulo}": ${l.idLimpo} depende de`;
      for (const d of l.dependeDe?.ids ?? []) {
        if (d === l.idLimpo) {
          problemas.push(`${deste} si proprio`);
        } else if (!existentes.has(d) && !onde.has(d) && !nosPendentes.has(d)) {
          // Um ID que so esta num bloco ou nos Pendentes ja tem aviso no `calcula` (2b, 1b): aqui nao se repete.
          problemas.push(`${deste} ${d}, que nao esta em nenhuma tabela por tipo nem no Historico`);
        } else if (abertos.has(d)) {
          const p = onde.get(d);
          if (p && p.bi > bi) {
            problemas.push(`${deste} ${d}, que esta num bloco que vem DEPOIS ("${lido.blocos[p.bi].titulo}")`);
          } else if (p && p.bi === bi && ordemValida[bi] && p.ordem !== null && p.ordem >= ordemDe(l.ordem)) {
            problemas.push(`${deste} ${d}, que tem uma Ordem igual ou maior no mesmo bloco`);
          } else if (!p && nosPendentes.has(d)) {
            problemas.push(`${deste} ${d}, que esta nos Pendentes sem Sprint (ainda sem bloco)`);
          } else if (!p) {
            problemas.push(`${deste} ${d}, que esta aberto e nao esta em nenhum bloco nem nos Pendentes`);
          }
        }
      }
    }
  });

  // 5) A rede do arquivo: um ID numa tabela FORA do Historico tem de estar no Historico.
  if (lido.encontradas.historico) {
    for (const { id, titulo } of lido.arquivoForaDoHistorico) {
      if (!fechados.has(id)) problemas.push(`${ARCHIVE}: "${titulo}" cita ${id}, que nao esta no Historico`);
    }
  }

  // 6) As linhas riscadas: nos blocos e nos Pendentes; nas tabelas por tipo so com um Estado aberto (o fechado e o
  //    desconhecido ja avisam no `calcula`).
  const riscada = (onde, id) => `${ACTIVE}: ${onde}: a linha de ${id} esta riscada — fechar move-a para o arquivo, e tira-a daqui`;
  for (const b of lido.blocos) for (const l of b.linhas) if (l.riscado) problemas.push(riscada(`"${b.titulo}"`, l.idLimpo));
  for (const p of lido.pendentes ?? []) if (p.riscado) problemas.push(riscada("Pendentes sem Sprint", p.idLimpo));
  for (const l of lido.linhasPorTipo) if (l.riscado && OPEN_STATES.includes(l.estado)) problemas.push(riscada(l.seccao, l.idLimpo));

  // 8) O formato do ID (#515): um ID que nao casa o `ID_LIKE` (1 a 4 letras e depois algarismos) fica FORA das
  //    verificacoes de IDs — o `calcula` salta-o (nem o repetido se ve) e a vista mostra-o como invalido. Dize-lo, e nao
  //    calar (`TP2`). Os riscados tem a regra 6; uma linha sem ID (a do modelo vazio) nao conta. Nao se renomeia: e decisao
  //    do projeto. O ID na mensagem e o do FICHEIRO (`U15p1`, e nao o normalizado `U15P1`): e o que um `grep` encontra (#524).
  const FORMATO = "nao tem o formato de um ID (1 a 4 letras e depois algarismos, ex. U47) — fica fora das verificacoes de IDs";
  // Sem a enfase, mas com as maiusculas do ficheiro (o `norm` passa a minusculas).
  const tal = (x) => String(x.idCelula ?? x.id).trim().replace(/^[*_`]+|[*_`]+$/g, "");
  const noAtivo = (onde, x) => `${onde}: o ID "${tal(x)}" ${FORMATO}; dar-lhe um ID novo (uma sub-parte de outro ticket leva um ID proprio)`;
  // No arquivo o ID ja e historia (#524): renomear e reescreve-la, e nao um "ID novo" sem mais — o novo verifica-se nos dois
  // ficheiros (um ID nunca se reutiliza), num commit proprio que diga o antigo.
  const noArquivo = (x) =>
    `${ARCHIVE}: Historico: o ID "${tal(x)}" ${FORMATO}; um item ja fechado renomeia-se num commit proprio que diga o ID antigo, com o novo verificado no backlog e no arquivo (backlog-method.md, "Ao renomear")`;
  for (const l of lido.linhasPorTipo) if (l.id && !l.riscado && !ID_LIKE.test(l.id)) problemas.push(noAtivo(`${ACTIVE}: ${l.seccao}`, l));
  for (const p of lido.pendentes ?? []) if (p.id && !p.riscado && !ID_LIKE.test(p.id)) problemas.push(noAtivo(`${ACTIVE}: Pendentes sem Sprint`, p));
  for (const f of lido.fechados) if (f.id && !ID_LIKE.test(f.id)) problemas.push(noArquivo(f));

  // 7) Os Pendentes: o heading (sem ele, a regra 4 dos Pendentes desligava-se calada) e a coluna `Nota`.
  if (!lido.encontradas.pendentes) {
    problemas.push(`${ACTIVE}: nao encontrei o heading \`## Pendentes sem Sprint\` — os tickets por planear nao estao a ser lidos`);
  } else if (!lido.encontradas.tabelaNosPendentes) {
    problemas.push(`${ACTIVE}: o heading dos Pendentes sem Sprint nao tem tabela — a do template tem as colunas ID, Descricao, Esforco e Nota`);
  } else if (!lido.encontradas.notaNosPendentes) {
    problemas.push(`${ACTIVE}: a tabela dos Pendentes sem Sprint nao tem a coluna \`Nota\` — a razao de estar parqueado vive nela (renomear a coluna)`);
  }

  return problemas;
}
