# Inventário de dados pessoais

> O registo das atividades de tratamento (art. 30 do RGPD) e a ÚNICA fonte da privacidade deste projeto: a política
> publicada gera-se daqui. As regras: `.agent/rules/privacy.md`.
>
> Criado no bootstrap a partir de `src/docs/exemplos/privacy-inventory.md`. Os campos entre `[...]` preenchem-se; um
> `[...]` que fique por preencher não é visto por nenhum guard. O agente PROPÕE, o responsável DECIDE. Ponto de
> partida, e NÃO aconselhamento jurídico.

## O responsável

- **Quem decide para que servem os dados:** [o projeto — ou o CLIENTE que o usa: então o projeto é SUBCONTRATANTE, este
  registo é o do art. 30(2), e há um contrato do art. 28 com o cliente]
- **Responsável pelo tratamento:** [nome da pessoa ou da entidade — num projeto que cada um aloja, quem aloja]
- **Corresponsável (art. 26), se houver:** [quem, e onde está o acordo entre os dois]
- **Representante na UE (art. 27):** [se o responsável estiver fora do EEE; senão, "não se aplica"]
- **Contacto para a privacidade:** [email]
- **DPO (art. 37):** [nome e contacto, ou "não se aplica, porque ..." — decidido pelo responsável]
- **DPIA (art. 35):** [feita em AAAA-MM-DD, onde está; ou "não se aplica, porque ..." — decidido pelo responsável]
- **Autoridade de controlo:** [em Portugal, a CNPD]

## As respostas às 4 perguntas

1. Dados de pessoas (utilizadores ou não): [sim/não — quais]
2. Categorias especiais (art. 9), condenações (art. 10) ou menores: [sim/não — quais, com a condição do art. 9(2) ou a
   lei que autoriza o art. 10]
3. Destinos (terceiros) e países: [quais]
4. Quem decide as finalidades: [o projeto / o cliente]

## Os fluxos

Uma linha por fluxo e por FINALIDADE. O "Papel" de um terceiro: SUBCONTRATANTE (trata por conta do projeto — pede um
DPA, art. 28), RESPONSÁVEL independente, ou CORRESPONSÁVEL (art. 26). A "Transferência" diz o PAÍS e o mecanismo.

| Dado | Titular | Finalidade | Base legal (art. 6) | Destino | Papel | DPA | Transferência | Retenção |
|------|---------|------------|---------------------|---------|-------|-----|---------------|----------|
| [ex.: email] | [utilizador] | [criar e recuperar a conta] | [execução do contrato, 6(1)(b)] | [o próprio projeto] | — | — | — | [enquanto a conta existir] |
| [ex.: email, depois de apagar a conta] | [ex-utilizador] | [permitir repor a conta por engano] | [interesse legítimo, 6(1)(f) — ponderação abaixo] | [o próprio projeto] | — | — | — | [30 dias] |
| [ex.: erros, recolhidos no servidor] | [utilizador] | [corrigir falhas] | [interesse legítimo, 6(1)(f) — ponderação abaixo] | [o serviço de erros] | [subcontratante] | [sim, AAAA-MM-DD] | [país; adequação / cláusulas-tipo] | [90 dias] |

## Se o projeto é SUBCONTRATANTE do cliente (o registo do art. 30(2))

Quando a 4.ª resposta é "o cliente", a tabela acima descreve o que o projeto faz POR CONTA dele: a finalidade e a base
legal são as do cliente (o projeto não as escolhe). E por cada cliente:

| Cliente (responsável) | Contacto | Categorias de tratamento feitas por conta dele | Contrato (art. 28) | Transferências (país; mecanismo) |
|-----------------------|----------|-----------------------------------------------|--------------------|----------------------------------|
| [ex.: o clube X] | [email] | [observação e avaliação de jogadores] | [assinado em AAAA-MM-DD] | [—] |

## As ponderações do interesse legítimo

Uma por cada linha com 6(1)(f): o interesse do projeto, o impacto na pessoa (reforçado se for uma criança), e as
garantias. [...]

## O consentimento — como se prova (art. 7(1))

[Onde se guarda: quando foi dado, a que texto e em que versão, e como se retira.]

## A retenção, por tipo de dado

| Tipo | Limite | Onde é aplicado |
|------|--------|-----------------|
| Sessões | [ex.: 30 dias de inatividade] | [ficheiro ou configuração] |
| Códigos de uso único e tokens | [ex.: 15 minutos] | [...] |
| Ficheiros apagados (período de graça) | [ex.: 30 dias] | [...] |
| Logs | [ex.: 14 dias, sem IP nem email em claro] | [...] |
| Backups | [ex.: rotação de 30 dias] | [...] |
| Faturação e registos fiscais | [o prazo da lei] | [...] |

## As medidas de segurança (art. 32)

[Descrição geral: cifra em trânsito e em repouso, controlo de acessos, backups, registo de acessos, ... — e onde estão
descritas em detalhe (o `SECURITY.md`).]

## Os direitos — como se cumprem (resposta em um mês, art. 12(3))

- **Acesso** (art. 15): [como]
- **Portabilidade** (art. 20 — o que o titular forneceu, num formato legível por máquina): [como]
- **Retificação:** [como]
- **Apagamento de TODAS as cópias** (base, backups, logs, caches, fornecedores), salvo o que a lei obriga a guardar:
  [como, e em quanto tempo]
- **Oposição** (art. 21; absoluta no marketing direto): [como]
- **Informar os não-utilizadores** (art. 14 — no máximo num mês, ou antes, na primeira comunicação ou na divulgação a
  outro destinatário, o que ocorrer primeiro; a política da app não chega; com esforço desproporcionado, publicar): [como]

## Os fluxos que se esquecem

[Vídeos embebidos, mapas, fontes, CDNs, verificação de atualizações, widgets — cada um uma linha acima, ou "nenhum".]

## A violação de dados

Notificar a autoridade sem demora e em 72 h desde que se tem conhecimento (art. 33), salvo se for improvável um risco;
os titulares quando o risco é elevado (art. 34); registar TODAS. O procedimento: `SECURITY.md`.
