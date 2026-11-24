# IA no produto ({{PROJECT_NAME}})

> **Rule de REFERENCIA — nao carregada.** Abrir ao planear ou rever uma funcionalidade que chama um modelo de IA, e
> no bootstrap de um projeto (a pergunta do §13 vale para todos os projetos). Escrever um servidor MCP do projeto: `mcp-policy.md`.
>
> **NAO e aconselhamento juridico:** o agente PROPOE, o responsavel DECIDE, e nos casos marcados **PARAR** pede-se um
> jurista antes de escrever codigo. O fornecedor do modelo e um DESTINO do inventario da `.agent/rules/privacy.md`: a
> base legal, os direitos, os menores e as transferencias vivem la, e nao se repetem aqui.

## 1. Ambito

Dentro: uma funcionalidade que chama um modelo (um coach, um tutor, um classificador, um analisador de documentos);
um assistente que PROPOE acoes de uma lista fechada, que o codigo valida e aplica. Fora: treinar ou afinar modelos,
modelos locais, avaliar a qualidade de um modelo, escolher o fornecedor. Um agente que planeia e EXECUTA ferramentas
fora de uma lista fechada validada pelo codigo, sem confirmacao humana: **PARAR**.

## 2. Quando PARAR

- **Decisoes automatizadas (RGPD art. 22).** Definir perfis pode ser licito (com base, informacao nos arts. 13/14, e
  oposicao pelo art. 21 onde se aplica). **PARAR** quando a saida DECIDE, ou pontua de forma determinante para quem
  decide, algo com efeitos juridicos ou similarmente significativos sobre uma pessoa, sem revisao humana REAL (uma de
  carimbo nao conta). Entao: uma das excecoes do 22(2); intervencao humana, o ponto de vista e a contestacao (22(3));
  a logica explicada (arts. 13-15, nao o 22(3)); nunca com categorias especiais sem 9(2)(a)/(g) (22(4)). Sobre uma
  CRIANCA, uma decisao ou pontuacao determinante: PARAR mesmo dentro das excecoes (considerando 71). A DPIA
  (35(3)) pode ser obrigatoria MESMO com revisao humana (porque: `ai-features-why.md` § "O art. 22 e a DPIA").
- **Alto risco (AI Act).** Os dominios do Anexo III, entre eles (a lista completa e a do Anexo): biometria; educacao
  em instituicoes de ensino (admissao, avaliacao, nivel, vigilancia nos testes); emprego, incluindo avaliar o
  desempenho; o acesso a prestacoes e servicos essenciais; credito; seguros de vida e de saude; triagem de chamadas e
  de doentes em emergencia. O agente nunca conclui sozinho pela derrogacao do art. 6(3), e ela nunca vale para um
  sistema do Anexo III que define perfis de pessoas: esse e sempre alto risco (porque: `ai-features-why.md` § "O alto risco e as praticas proibidas").
- **Finalidade medica:** uma funcionalidade que diagnostica, previne, monitoriza, preve ou trata uma doenca, entre
  outras (MDR art. 2(1)), de QUALQUER classe: PARAR (MDR, ou IVDR). Quando a conformidade pede um organismo notificado
  (a partir da IIa no MDR, da B no IVDR), tambem e alto risco (art. 6(1) + Anexo I).
- **Praticas proibidas (art. 5 do AI Act)**, entre elas (a lista completa e a do artigo): explorar a vulnerabilidade da idade (menores), de deficiencia ou
  socioeconomica; tecnicas manipuladoras; reconhecimento de emocoes (biometrico) no trabalho e na educacao, salvo por
  razoes medicas ou de seguranca; categorizacao biometrica por atributos sensiveis; recolha nao direcionada de imagens
  faciais; pontuacao social; prever infracoes so com base em perfis. E as alineas novas (ba)/(bb) do art. 5(1): ler o texto consolidado — um gerador de imagem
  ou de audio e o caso a verificar.
- **Atos regulados:** se a funcionalidade FAZ o ato (recomendar investimentos personalizados, dar consulta
  juridica), um aviso contrariado pelo que ela faz nao basta.

## 3. Transparencia (art. 50 do AI Act)

O projeto que integra um modelo e poe a app no mercado em seu nome e FORNECEDOR do sistema (e, quando o usa ou publica,
tambem responsavel pela implantacao). Dizer que e uma IA, o mais tardar na 1.a interacao (aqui: sempre). Conteudo
sintetico (texto, imagem, audio, video): marcacao LEGIVEL POR MAQUINA na medida do viavel, salvo a assistencia a edicao
normal ou que nao altera substancialmente a entrada (50(2)) — o rotulo na UI nao a cumpre; ver o que o fornecedor do modelo
da. Como responsavel pela implantacao (50(3)/50(4)): informar quem e exposto a reconhecimento de emocoes ou
categorizacao biometrica; divulgar deep fakes, e o texto gerado publicado para informar o publico sobre materias de
interesse publico, salvo revisao humana com responsabilidade editorial (porque: `ai-features-why.md` § "O art. 50").

## 4. O que vai para o modelo

- Uma LISTA FECHADA de campos, pelo nome, num so objeto (art. 25); o ecra que informa le a MESMA lista; um **teste de
  fuga** reprova um campo fora dela; mostrar ao utilizador o que foi enviado.
- Nada de segredos nem de dados de OUTROS utilizadores no contexto.
- Um pseudonimo, e nao o id: continua a ser dado pessoal, e o texto livre identifica por si. O agente nunca conclui
  que o fornecedor "nao recebe dados pessoais" (porque: `ai-features-why.md` § "Pseudonimos e agregados").
- Documentos carregados com dados de TERCEIROS (os contactos num documento, os nomes num extrato): o projeto trata-os
  como responsavel; o dever de informar (art. 14) e a sua excecao por esforco desproporcionado (14(5)(b)) avalia-os o
  responsavel — o agente propoe, nao conclui (`privacy.md`).
- Agregados de outros utilizadores: so a partir de um minimo de pessoas (ex.: dez); esse limiar sozinho nao garante a
  anonimizacao — tratar o resultado como pessoal.

## 5. O fornecedor

Subcontratante: um DPA (art. 28), os subcontratantes ulteriores, e — se o projeto e ele proprio subcontratante do
cliente (a 4.a pergunta da `privacy.md`) — a autorizacao do cliente para o fornecedor (28(2)). Por omissao um tier SEM
treino, com retencao MINIMA e o prazo no inventario (ler o DPA: a retencao para abuso pode faze-lo responsavel nessa
parte). **Se treina com os dados para fins proprios, nessa parte e responsavel (28(10)), e o envio e uma comunicacao a
outro responsavel: PARAR.** A residencia na UE
e preferencia. Os logs de prompts e de respostas sao um destino do inventario (porque: `ai-features-why.md` § "O fornecedor").

## 6. Categorias especiais e consentimento

- A condicao do art. 9(2) e da FINALIDADE (a funcionalidade de IA), nao do envio: numa app de consumo, quase sempre o
  consentimento explicito (9(2)(a)), especifico da funcionalidade. O subcontratante nao pede um consentimento a mais.
- Onde o consentimento e a base: demonstravel e com VERSAO; retirar tao facil como dar (7(3)). A retirada para os
  envios seguintes, e apaga o gerado guardado e os logs que so tinham essa base (17(1)(b)), avisando o fornecedor. Volta a pedir-se quando muda a finalidade ou a natureza dos dados — e, por escolha do projeto, por
  fornecedor e por destino, quando a lista de campos ou o fornecedor mudam.
- O art. 49(1)(a) nunca serve um envio sistematico. Com base no interesse legitimo: um interruptor do UTILIZADOR para
  a oposicao (art. 21).

## 7. A saida e DADOS

Validar contra um esquema FECHADO; o modelo so propoe acoes de uma lista fechada; uma desconhecida nao faz nada; o
validador, e nao o prompt, e a fronteira; ha dados que a IA nunca toca; aplicar com um instantaneo antes (desfazer,
tudo-ou-nada). Uma saida sobre uma pessoa identificavel e dado pessoal (as inferencias incluidas): a exatidao
(5(1)(d)) vale tambem para o proprio utilizador, e os direitos cobrem o gerado guardado e os logs (`privacy.md`).
Marcar o gerado como gerado (porque: `ai-features-why.md` § "Porque o validador e a fronteira").

## 8. Injecao de prompt

O texto do utilizador ou de um documento e dado, nunca instrucao. A saida que aciona ferramentas ou escreve dados
valida-se antes. Nao renderizar URLs externos da saida (links e imagens exfiltram), ou so de uma allowlist. O caso
hostil (a fonte e esta): o fornecedor FALSO devolve uma saida como se a injecao tivesse resultado — uma acao fora da
lista, um link ou uma imagem externos — e o teste afirma que nada se aplica nem se renderiza; desligado o validador, o
mesmo teste reprova. O `/security-tests` 3.11 corre-o, onde existe.

## 9. Prompts, avaliacoes e modelo

Os prompts vivem no CODIGO, ao lado da funcionalidade (versionados, revistos, testados). As avaliacoes com o modelo
real vivem junto dos testes mas **excluidas do include do runner** do `test:unit` e do `test:e2e`: um script proprio
(ex.: `test:evals`) que so um job manual ou a corrida local chamam, com chave propria e teto de custo. O
`docs/architecture/` explica que modelos, o que entra no contexto e os limites. A versao do modelo FIXADA, verificavel
por `grep` (porque: `ai-features-why.md` § "O fornecedor falso e a versao fixada").

## 10. Custos e falha

Um limite por pedido e por utilizador, com aviso; um tempo maximo por tarefa; um maximo de tokens de saida; a pesquisa
na web desligada por omissao e com teto; limites diarios por chave partilhada; UMA so ronda de reparacao (nunca um
loop contra uma conta paga); os tectos testados. A falha: o que o utilizador ve quando o modelo falha, demora, da 429
ou esgota a quota, e o fallback.

## 11. Credenciais e "desligado"

O processo que chama o modelo nao herda segredos que nao usa; a chave num header, nunca no URL; cifrada em repouso;
no telemovel, no Keychain/Keystore. Um interruptor de operador desliga a IA em todo o lado, e nada de IA carrega ate
o utilizador a escolher (ou a escolher ao aderir, quando a IA e o produto) — provado por teste. As capacidades minimas
num objeto unico, afirmado por teste.

## 12. Testes

Um **fornecedor FALSO** no CI (resposta valida, invalida, timeout), sem conta de IA. O falso nao avalia a QUALIDADE.

## 13. Ativos que nunca entram num modelo

Vale para TODOS os projetos, incluindo o agente de codigo (tambem e um modelo): dados de clientes sob contrato, codigo
ou conteudo com uma licenca que o proibe. Descrever cada ativo por CATEGORIA ou caminho (`dados/clientes/**`,
"repositorios sob NDA"), nunca pelo nome do cliente: um nome que nao pode ser publico vai para a lista de nomes
proibidos (`core-rules.md`, Seguranca). A resposta estende o bullet `**Nunca**:` das Fronteiras em todas as copias:
`CLAUDE.md`, `AGENTS.md`, `.cursor/rules/project.mdc`, `.github/copilot-instructions.md` (o Guard 1d compara-as) e
`GEMINI.md` (o Guard 2); "nenhum" nao acrescenta nada. No `decisions.md`, a entrada
`## <data> — Ativos que nunca entram num modelo: <lista, ou "nenhum">`.

## 14. So por leitura

Nenhum guard ve o custo, a lista de campos sem teste, o "desligado" nem a exatidao. No modo minimo restam o `/plan` e
a cadeia `/review` §7 -> `privacy.md` -> esta rule.
