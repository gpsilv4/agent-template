/**
 * As formas de um SEGREDO literal — {{PROJECT_NAME}}
 *
 * Partilhadas pelo Guard 16 (a configuracao MCP) e pelo Guard 23 (os ficheiros de exemplo do `.env`, #595). Eram so
 * do Guard 16; a segunda lista ia divergir da primeira no dia em que nascesse (a regra do DRY: a segunda repeticao
 * extrai-se).
 *
 * Deliberadamente estreitas: um falso positivo aqui bloqueia trabalho legitimo, e o `gitleaks` do CI e a rede larga.
 * O que se apanha e o descuido obvio — um token colado no ficheiro em vez de vir do ambiente. Sem entropia: nao ha
 * limiar que se teste, e um valor longo e aleatorio e tambem o que um placeholder honesto as vezes e.
 */

/** Tokens e chaves de fornecedores conhecidos, um JWT, uma chave privada, um URL com credencial. */
export const SEGREDOS = [
  { re: /\bsk-[A-Za-z0-9_-]{16,}/, o: "chave de API (sk-...)" },
  // O `core-rules` proibe chaves "reais ou de teste": o `sk_test_` tambem conta, e a restrita (`rk_`) e o webhook.
  { re: /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}/, o: "chave do Stripe (sk_/rk_)" },
  { re: /\bwhsec_[A-Za-z0-9]{20,}/, o: "segredo de webhook do Stripe (whsec_)" },
  { re: /\bsb_secret_[A-Za-z0-9_-]{20,}/, o: "chave secreta do Supabase (sb_secret_)" },
  { re: /\bgh[pousr]_[A-Za-z0-9]{20,}/, o: "token do GitHub" },
  { re: /\bgithub_pat_[A-Za-z0-9_]{20,}/, o: "token do GitHub (fine-grained)" },
  { re: /\bAKIA[0-9A-Z]{16}\b/, o: "chave da AWS" },
  { re: /\bAIza[0-9A-Za-z_-]{30,}/, o: "chave da Google" },
  { re: /\bxox[baprs]-[A-Za-z0-9-]{10,}/, o: "token do Slack" },
  { re: /\bsbp_[a-f0-9]{40}\b/, o: "token do Supabase (sbp_)" },
  { re: /\bglpat-[A-Za-z0-9_-]{20,}/, o: "token do GitLab" },
  { re: /\bnpm_[A-Za-z0-9]{36}\b/, o: "token do npm" },
  // Um JWT (`eyJ` e o `{"` em base64) e a forma canonica de uma service key do Supabase e de
  // meia duzia de servicos. Tres segmentos base64url e uma forma que texto normal nao tem.
  { re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/, o: "JWT (eyJ...)" },
  { re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/, o: "chave privada" },
  // `url`: o Guard 23 deixa passar o de um servidor LOCAL (`postgres://postgres:postgres@localhost`), que e o que um
  // `.env.example` honesto traz; o Guard 16 nao distingue.
  { re: /\b[a-z][a-z0-9+.-]*:\/\/[^\s:@/]+:[^\s:@/]+@/i, o: "URL com credencial embutida", url: true },
];

/** Um hash de senha COMPLETO (o derivado F guardava um num `.env`): com ele, um atacante ataca a senha offline. */
export const HASHES_DE_SENHA = [
  { re: /\$argon2(?:id|i|d)\$v=\d+\$m=\d+,t=\d+,p=\d+\$[A-Za-z0-9+/]{8,}\$[A-Za-z0-9+/]{16,}/, o: "hash Argon2 completo" },
  { re: /\$2[abxy]\$\d{2}\$[./A-Za-z0-9]{53}/, o: "hash bcrypt completo" },
];
