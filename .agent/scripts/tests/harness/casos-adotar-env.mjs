/**
 * Os casos dos EXEMPLOS do `.env` numa adocao (#595): o `settings.json` do template deixa o agente ler o `.env.example`,
 * e num projeto que ja existia ele pode ter valores reais — a adocao corre o Guard 23 antes de copiar e recusa. Chamados
 * no lugar pelo `test-adotar-template.mjs` (o ficheiro dele esta perto das 500 linhas), com o template sintetico dele.
 *
 * O token constroi-se por pedacos: o `gitleaks` do CI varre a fonte e nao distingue uma fixture de um token a serio.
 */
import { existsSync } from "fs";
import { join } from "path";

export function registarAdotarEnv({ test, espera, recusa, cli, planear, projeto, tpl, commitTpl, MANIFESTO }) {
  const TOKEN = "gh" + "p_" + "A1b2C3d4".repeat(5);
  test("recusa: um .env.example com um segredo real, numa subpasta (#595)", () => {
    const r = recusa(() => planear(tpl, projeto({ "apps/web/.env.example": `GITHUB_TOKEN=${TOKEN}\n` })));
    return espera(r !== null && /apps\/web\/\.env\.example:1: token do GitHub/.test(r), `deu: ${r}`);
  });
  test("recusa: o segredo do .env.example nao vai na mensagem, e nada foi copiado (#595)", () => {
    const p = projeto({ ".env.example": `GITHUB_TOKEN=${TOKEN}\n` });
    const r = cli(p);
    return [
      ...espera(r.code === 1 && r.out.includes(".env.example:1: token do GitHub"), `devia recusar: ${r.code} ${r.out.slice(0, 200)}`),
      ...espera(!r.out.includes(TOKEN), "o valor do segredo apareceu na mensagem"),
      ...espera(!existsSync(join(p, "CLAUDE.md")) && !existsSync(join(p, MANIFESTO)), "copiou antes de recusar"),
    ];
  });
  // A recusa vem ANTES da retoma: os ficheiros que a corrida interrompida copiou incluem o `settings.json` que abre os
  // exemplos. Com o mesmo manifesto e um exemplo limpo, a retoma segue — o que prova que foi o exemplo a recusar.
  const aCopiar = JSON.stringify({ estado: "a copiar", copiados: [], colisoes: [], iguais: [], perguntar: [], template: { commit: commitTpl, versao: "v9.10.0" } });
  test("recusa: um segredo no .env.example trava tambem a RETOMA de uma adocao interrompida (#595)", () => {
    const r = recusa(() => planear(tpl, projeto({ [MANIFESTO]: aCopiar, ".env.example": `GITHUB_TOKEN=${TOKEN}\n` })));
    const limpo = recusa(() => planear(tpl, projeto({ [MANIFESTO]: aCopiar, ".env.example": "GITHUB_TOKEN=<real-key>\n" })));
    return [
      ...espera(r !== null && /\.env\.example:1: token do GitHub/.test(r), `devia recusar a retoma: ${r}`),
      ...espera(limpo === null, `com o exemplo limpo, a retoma devia seguir: ${limpo}`),
    ];
  });
  // O contra-caso: um exemplo so com placeholders nao trava nada.
  test("um .env.example so com placeholders nao trava a adocao (#595)", () => {
    const r = recusa(() => planear(tpl, projeto({ ".env.example": "GITHUB_TOKEN=<real-key>\nDATABASE_URL=postgres://USER:PASSWORD@HOST/db\n" })));
    return espera(r === null, `recusou: ${r}`);
  });
}
