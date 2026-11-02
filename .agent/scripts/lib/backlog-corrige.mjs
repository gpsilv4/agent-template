/**
 * O `--corrigir` do backlog: reescreve so os valores DERIVADOS — {{PROJECT_NAME}}
 *
 * PORQUE EXISTE (#431): depois de juntar o `main` a um PR antigo, os contadores do `backlog.md` ficam errados — e as
 * vezes SEM conflito (o git junta as linhas da tabela e deixa o Total antigo). Reescreve-los a mao e onde se erra.
 * Isto reescreve so o que e calculado: os cinco numeros de cada linha do Resumo, os do Total, e a linha do Progresso
 * Geral (a barra, a percentagem, os `X/Y`). Nunca um item, uma seccao, ou o arquivo.
 *
 * E PURO: recebe o texto e o calculo (`lib/backlog-calculo.mjs`) e devolve o texto novo, ou as recusas. As recusas
 * vao pelo `problemas.push(` (cada uma e um sitio da varredura). Recusa — e devolve `texto: null` — sempre que algum
 * aviso do calculo NAO e uma contagem (uma lista do que se PERMITE, `TP6`): com um ID duplicado, uma seccao que falta
 * ou um estado desconhecido, os proprios contadores estao errados, e reescreve-los era abencoar numeros falsos.
 *
 * Edita a LINHA CRUA: so o primeiro numero de cada celula, e a barra com o par de glifos do proprio ficheiro. O
 * negrito, as celulas a mais, o alinhamento, os `\|`, o `\r` de um ficheiro CRLF e o BOM ficam como estavam.
 */
import { norm, SECTIONS, BLOCO_CHEIO, BLOCO_VAZIO } from "./backlog-calculo.mjs";

/** O par de um glifo da barra, quando ela so tem um dos dois (0 % ou 100 %). */
const PAR = new Map([
  ["_", "█"], ["-", "█"], [" ", "█"], ["░", "█"], ["⬜", "🟩"],
  ["█", "_"], ["▓", "░"], ["🟩", "⬜"], ["⬛", "⬜"], ["#", "-"],
]);

/** As posicoes dos `|` de uma linha de tabela, sem os escapados (`\|`). */
function pipes(linha) {
  const out = [];
  for (let i = 0; i < linha.length; i++) {
    if (linha[i] === "\\" && linha[i + 1] === "|") i++;
    else if (linha[i] === "|") out.push(i);
  }
  return out;
}

/** A linha com o primeiro numero das celulas 1..5 trocado pelos `valores`; `null` se uma delas nao tem numero. */
function trocaNumeros(linha, valores) {
  const ps = pipes(linha);
  if (ps.length < 7) return null;
  let out = linha;
  // Da direita para a esquerda: trocar um numero mexe nos indices das celulas que vem depois dele.
  for (let k = 5; k >= 1; k--) {
    const [a, b] = [ps[k], ps[k + 1]];
    const celula = out.slice(a + 1, b);
    const m = /-?\d+/.exec(celula);
    if (!m) return null;
    out = out.slice(0, a + 1) + celula.slice(0, m.index) + String(valores[k - 1]) + celula.slice(m.index + m[0].length) + out.slice(b);
  }
  return out;
}

/**
 * @param {string} active  o `backlog.md`
 * @param {{ avisos: {msg: string, derivado: boolean}[], counts: Record<string, Record<string, number>>, g: Record<string, number>,
 *           countable: number, expectedPct: number, expectedFilled: number }} calc  o resultado de `calcula`
 * @returns {{ texto: string | null, problemas: string[] }}
 */
export function corrige(active, calc) {
  const problemas = [];
  for (const a of calc.avisos) if (!a.derivado) problemas.push(a.msg);
  if (problemas.length) return { texto: null, problemas };
  if (calc.avisos.length === 0) return { texto: active, problemas };

  const linhas = active.split("\n");
  const porNome = new Map(SECTIONS.map(({ key, resumo }) => [norm(resumo ?? key), key]));
  const iResumo = linhas.findIndex((l) => /^##\s*Resumo/i.test(l));
  const fim = linhas.findIndex((l, j) => j > iResumo && /^#{1,6}\s/.test(l));
  let totalVisto = false;
  for (let j = iResumo + 1; iResumo >= 0 && j < (fim < 0 ? linhas.length : fim); j++) {
    const t = linhas[j].trim();
    if (!t.startsWith("|") || /^\|[\s|:-]+\|?$/.test(t)) continue;
    const nome = norm(linhas[j].slice(pipes(linhas[j])[0] + 1, pipes(linhas[j])[1]));
    // So a PRIMEIRA linha Total, a que o calculo verifica: uma segunda (um merge que a duplicou) ficava reescrita sem
    // que a confirmacao final a lesse (a leitura independente do #431). As outras ficam como estao.
    const eTotal = nome.includes("total");
    if (eTotal && totalVisto) continue;
    totalVisto ||= eTotal;
    const c = eTotal ? calc.g : calc.counts[porNome.get(nome)];
    if (!c) continue; // o cabecalho da tabela, ou uma linha que o calculo ja teria acusado
    const nova = trocaNumeros(linhas[j], [c.total, c.pendente, c["a fazer"], c.concluido, c.cancelado]);
    if (nova === null) {
      problemas.push(`Resumo: nao consegui reescrever a linha "${t}" — ficou como estava`);
      return { texto: null, problemas };
    }
    linhas[j] = nova;
  }

  const re = /(`)([^`]*)(`\s*\*\*)(\d+)(%\*\*\s*\()(\d+)(\/)(\d+)/;
  let texto = linhas.join("\n");
  const m = re.exec(texto);
  if (m) {
    const blocos = [...m[2]];
    const cheio = blocos.find((b) => BLOCO_CHEIO.has(b)) ?? PAR.get(blocos.find((b) => BLOCO_VAZIO.has(b)));
    const vazio = blocos.find((b) => BLOCO_VAZIO.has(b)) ?? PAR.get(blocos.find((b) => BLOCO_CHEIO.has(b)));
    if (!cheio || !vazio) {
      problemas.push("Barra: nao sei que par de glifos escrever — ficou como estava");
      return { texto: null, problemas };
    }
    const barra = cheio.repeat(calc.expectedFilled) + vazio.repeat(20 - calc.expectedFilled);
    texto = texto.slice(0, m.index) + m[1] + barra + m[3] + calc.expectedPct + m[5] + calc.g.concluido + m[7] + calc.countable + texto.slice(m.index + m[0].length);
  }
  return { texto, problemas };
}
