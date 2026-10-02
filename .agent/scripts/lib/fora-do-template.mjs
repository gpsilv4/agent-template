/**
 * O que esta no DISCO do template mas NAO e do template — {{PROJECT_NAME}}
 *
 * PORQUE EXISTE: o motor do `/upgrade` copia do disco (ver `arvoreNoDisco` em
 * `lib/upgrade-mecanico.mjs`), e o disco de quem mantem o template tem o que o git dele ignora:
 * relatorios de trabalho, `.claude/settings.local.json`, chaves. O `andaFicheiros` so salta
 * `.git`, e os `RELATORIO-*.md` ignorados aterraram na copia de um derivado real (ronda 7, R7-D).
 * O que o git do template ignora nao e do template.
 *
 * Duas camadas, e cada uma cobre o furo da outra:
 * 1. **O que o git ignora**, perguntado ao proprio git — nunca reimplementar o `.gitignore`.
 * 2. **Nomes de segredo**, fixos, para o dia em que o `.gitignore` de quem mantem o template nao
 *    cobrir uma chave que la deixou. Falha para o lado seguro: um ficheiro legitimo com um destes
 *    nomes fica de fora, e quem chama mostra-o.
 *
 * Ficheiros POR COMMITAR mas nao ignorados continuam a ser do template: o simulador corre antes
 * do commit, e e disso que o `arvoreNoDisco` depende.
 */

import { execFileSync } from "child_process";

// Sem distinguir maiusculas: `X.PEM` e uma chave como `x.pem`.
const NOME_DE_SEGREDO = /^(settings\.local\.json|\.env(\..+)?|\.envrc|\.npmrc|\.netrc|\.pgpass|credentials(\.json)?|id_(rsa|dsa|ed25519|ecdsa)(\.pub)?|.+\.(pem|key|p12|pfx|jks|keystore|ppk))$/i;
const PASTA_DE_SEGREDO = /(^|\/)secrets(\/|$)/i;
// Lixo do SO e dependencias: nao sao segredo, e dize-lo enganava quem le a lista.
const NOME_DE_LIXO = /^(\.DS_Store|Thumbs\.db)$/i;
const PASTA_DE_LIXO = /(^|\/)node_modules(\/|$)/;

/** A razao pela qual o NOME de `rel` (caminho com `/`) nunca se copia, ou `null`. */
export function razaoDoNome(rel) {
  const nome = rel.split("/").pop();
  if (NOME_DE_SEGREDO.test(nome) || PASTA_DE_SEGREDO.test(rel)) return "nome de segredo";
  if (NOME_DE_LIXO.test(nome) || PASTA_DE_LIXO.test(rel)) return "lixo do sistema ou dependencias";
  return null;
}

/** Pergunta ao git, em `root`, o que ele ignora. Devolve `{ razao }` — uma funcao
 *  `rel -> razao | null` — ou `{ erro }` quando o `git` falha, com a primeira linha do que ele
 *  disse. Nunca uma funcao que deixa passar tudo: "nao ignora nada" e "nao consegui perguntar"
 *  pedem accoes diferentes, e quem chama decide (`TP2`).
 *
 *  NFC dos DOIS lados: com `core.precomposeunicode` (o default no macOS) o git devolve sempre
 *  NFC, e o `readdirSync` devolve os bytes do disco. Um `RELATORIO-ação.md` em NFD passava. */
export function foraDoTemplate(root) {
  let saida;
  try {
    saida = execFileSync("git", ["ls-files", "--others", "--ignored", "--exclude-standard", "--directory", "-z"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (err) {
    const disse = String(err?.stderr ?? "").trim().split("\n")[0];
    return { erro: disse || (err instanceof Error ? err.message : String(err)) };
  }
  const ignorados = saida.split("\0").filter(Boolean).map((p) => p.normalize("NFC"));
  // Com `--directory`, uma pasta ignorada inteira vem como UMA entrada acabada em `/`.
  const pastas = ignorados.filter((p) => p.endsWith("/"));
  const ficheiros = new Set(ignorados.filter((p) => !p.endsWith("/")));
  const razao = (relDoDisco) => {
    const rel = relDoDisco.normalize("NFC");
    if (ficheiros.has(rel) || pastas.some((p) => rel.startsWith(p) || `${rel}/` === p)) return "ignorado pelo git do template";
    return razaoDoNome(rel);
  };
  return { razao };
}

/** As linhas que dizem o que ficou DE FORA. Uma so funcao para os dois modos (o simulador e a
 *  2b), senao a mesma lista escrevia-se duas vezes e divergia (`TP8`). */
export const linhasNaoCopiados = (naoCopiados) =>
  naoCopiados.length === 0
    ? []
    : [
        `${naoCopiados.length} ficheiro(s) do disco do template NAO foram copiados (nao sao do template):`,
        ...naoCopiados.map(({ caminho, razao }) => `        ${caminho}   (${razao})`),
      ];
