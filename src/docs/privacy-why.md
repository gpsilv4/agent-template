# Porque a privacidade e assim ({{PROJECT_NAME}})

> **Leitura de humano, uma vez.** As **instrucoes** — os dois niveis, as 4 perguntas, o que vai no inventario —
> estao em `.agent/rules/privacy.md`, que o agente abre quando toca em dados de pessoas. Este ficheiro e o
> **racional**, com as fontes. Nao e aconselhamento juridico.
>
> A regra saiu de um `/grill` em tres versoes (#495, com o #494), escrito para TODOS os dominios — saude, estudo,
> financas, desporto, um assistente de carreira. Duas leituras independentes corrigiram erros de direito: a 1.a
> versao do `/grill` (o consentimento por omissao), e a 1.a versao desta regra (o art. 10 tratado como o art. 9, a
> politica sem os arts. 13/14, o inventario sem o art. 30 completo, e o projeto sempre como responsavel). As
> correcoes estao abaixo, porque sao o que um agente erraria sozinho.

## Porque dois niveis

Obrigar um projeto SEM dados pessoais a preencher um inventario ensina a saltar a regra. O nivel base protege contra
o erro mais comum — dados pessoais em claro nos logs, analytics e cookies sem consentimento — e custa quase nada. O
nivel completo so se liga quando ha dados de pessoas; o gatilho existe porque o BOOTSTRAP pergunta uma vez, e um
projeto muda.

## As bases legais

O RGPD tem SEIS bases (art. 6), sem hierarquia entre elas, e uma por FINALIDADE. A 1.a versao do `/grill` pos o
consentimento por omissao — e estava errado:

- **A execucao do contrato** (6(1)(b)) cobre so o que e OBJETIVAMENTE INDISPENSAVEL ao servico que a pessoa pediu
  (EDPB, Diretrizes 2/2019; TJUE, C-252/21, *Meta*). Em regra nao cobre a personalizacao (salvo quando e intrinseca ao servico,
  Diretrizes 2/2019, §57), a melhoria do produto nem a publicidade — o erro facil e por tudo aqui.
- **A obrigacao legal** (6(1)(c)): o que a lei impoe, como a faturacao e os registos fiscais numa app paga ou de
  financas. Tambem e o que trava um apagamento (art. 17(3)): apagar uma fatura pode violar a lei fiscal.
- **O interesse legitimo** (6(1)(f)) serve tambem os utilizadores (a seguranca, a fraude, os logs de erros), sempre
  com uma ponderacao ESCRITA — o interesse do projeto contra o da pessoa, reforcado se ela for uma crianca.
- **O consentimento** serve o resto, e so vale se for livre, especifico, informado, inequivoco e tao facil de
  retirar como de dar. Tem de se poder DEMONSTRAR (art. 7(1)): quando, a que texto, em que versao.
- **Um fornecedor que trata dados por conta do projeto** e um SUBCONTRATANTE (art. 28): pede-se um contrato (o DPA),
  e nao o consentimento do utilizador. Se usa os dados para os SEUS fins, passa a responsavel; se decide os meios ou
  os fins JUNTO com o projeto — um widget social embebido, por exemplo (TJUE, C-40/17, *Fashion ID*) —, e
  CORRESPONSAVEL (art. 26), com um acordo entre os dois.
- **O projeto pode ser ele proprio o subcontratante** (a 4.a pergunta): numa app B2B — o scouting para um clube, a
  avaliacao de candidatos para uma empresa — e o CLIENTE que decide para que servem os dados. Entao o contrato do art.
  28 e com o cliente, o projeto tem o seu proprio registo (art. 30(2)), e as escolhas da base legal e do art. 14 sao
  do cliente. Assumir sempre que o projeto e o responsavel foi o erro da 1.a versao desta regra.

## O dispositivo do utilizador (a ePrivacy)

O art. 5(3) da Diretiva 2002/58 (em PT, a Lei 41/2004) pede consentimento para QUALQUER armazenamento ou acesso ao
equipamento do utilizador que nao seja estritamente necessario ao servico pedido — seja qual for a base do art. 6. Nao
sao so os cookies: o `localStorage`, os ids de dispositivo numa app movel, o fingerprinting, os pixels (EDPB,
Diretrizes 2/2023). Por isso o exemplo do nivel base diz "sem cookies NEM outro acesso ao dispositivo", e um SDK de
analytics ou de erros no cliente quase nunca fica de fora. O email de marketing tem uma excecao (o "soft opt-in" a
clientes, art. 13(2) da mesma diretiva).

## As categorias especiais, o art. 10 e os menores

- **O art. 9 proibe** tratar categorias especiais (saude, dados geneticos, biometricos para identificar alguem de
  forma inequivoca, origem, opinioes politicas, crencas, filiacao sindical, vida ou orientacao sexual) salvo numa
  condicao do art. 9(2) — por exemplo, o consentimento EXPLICITO. A base do art. 6 nao chega sozinha. O art. 9(4)
  deixa cada pais acrescentar condicoes para a saude, a genetica e a biometria. Em PT, a Lei 58/2019: o art. 29 para a saude e a genetica (o sigilo, a necessidade de conhecer); a biometria aparece noutros artigos (o 28, no contexto laboral).
- **A localizacao precisa nao e do art. 9** — mas passa a ser quando REVELA uma categoria especial por inferencia
  (visitas a uma clinica, a um local de culto; TJUE, C-184/20 e C-252/21).
- **As condenacoes penais (art. 10) NAO tem condicoes no art. 9(2).** So se tratam sob o controlo de uma autoridade
  publica, ou com uma lei que o autorize com garantias. A 1.a versao desta regra misturou-as com o art. 9 — e um caso
  para parar e para um jurista.
- **Os menores:** o art. 8 (o consentimento dos pais; a idade entre 13 e 16, em PT 13 pela Lei 58/2019, art. 16)
  aplica-se quando a base e o consentimento e o servico e oferecido diretamente a criancas, com esforcos razoaveis
  para o verificar (8(2)). Com a base no contrato, o que conta e a capacidade civil do menor. Os dados de um menor
  nao sao do art. 9 por serem de um menor: o que se pede e uma ponderacao reforcada e, muito provavelmente, a DPIA.

## Os nao-utilizadores

Os dados de quem NAO usa a app (um jogador observado, um arbitro avaliado, um contacto num documento): pedir-lhes o
consentimento costuma ser impraticavel, e a base tipica e o interesse legitimo, com a ponderacao escrita. O art. 14
manda informa-los num prazo razoavel — no maximo um mes, ou ANTES, na primeira comunicacao com a pessoa ou na
divulgacao a outro destinatario (14(3)(b)/(c)), o que ocorrer primeiro: o mes e um teto (WP260) —, e a politica da app
NAO cumpre isto, porque eles nunca a leem. Quando informar cada um exige um esforco desproporcionado (14(5)(b), o caso
tipico do scouting), a informacao torna-se PUBLICA e documenta-se a razao. O direito de oposicao (art. 21) e deles.
As categorias especiais de nao-utilizadores ficam, por omissao, fora: o interesse legitimo nao e uma condicao do art.
9(2).

## A DPIA e o DPO

- **A DPIA (art. 35)** e obrigatoria nos tres casos do art. 35(3) — uma avaliacao sistematica de pessoas com efeitos
  juridicos ou similarmente significativos; categorias especiais ou dados do art. 10 em grande escala; vigilancia de
  zonas acessiveis ao publico em grande escala — e nos da lista da CNPD (Regulamento n.o 1/2018, publicado em DR como n.o 798/2018). Fora deles, os
  criterios do WP248: dois ou mais (avaliar ou pontuar, dados sensiveis, pessoas vulneraveis, tecnologia nova como a
  IA, grande escala, cruzar fontes) pedem-na. Um assistente de saude, uma avaliacao de atletas ou de candidatos
  encaixam facilmente — por isso o agente propoe e PARA.
- **O DPO (art. 37(1))** so e obrigatorio em tres casos: um organismo publico; uma atividade principal de vigiar
  pessoas de forma regular e sistematica em grande escala; ou uma atividade principal de tratar categorias especiais
  ou dados do art. 10 em grande escala. Um SaaS grande, sem isto, nao precisa.

## Os direitos, a retencao e as copias

O erro que mais se repete e apagar a conta e esquecer as copias: o backup de ha uma semana, os logs, a cache, a copia
no fornecedor. Por isso o apagamento cobre TODAS — salvo o que a lei obriga a guardar —, e a retencao e uma tabela com
um limite concreto por tipo (os limites espalhados pelo codigo nao dizem a ninguem quanto vive um dado). O acesso (art.
15) e a portabilidade (art. 20) sao direitos diferentes: a portabilidade cobre so o que o titular FORNECEU, tratado por
consentimento ou contrato e por meios automatizados. A resposta e em um mes, prorrogavel por mais dois (art. 12(3)). A
ideia da tabela vem de uma auditoria a um projeto aberto (as ideias, nunca o texto: a licenca e outra), forte nas
defesas tecnicas e fraco no lado legal.

## As transferencias e a violacao de dados

- **O criterio e o EEE**, e nao so a UE. As clausulas-tipo pedem uma avaliacao do impacto da transferencia e, se for
  preciso, medidas suplementares (TJUE, C-311/18, *Schrems II*). O DPF serve so os EUA, com o fornecedor certificado,
  e esta sob recurso (verificar o estado a data) — pode cair como o Privacy Shield. Ha ainda as BCR e as derrogacoes do art. 49.
- **A violacao:** as 72 h contam desde que o responsavel tem CONHECIMENTO, "sem demora injustificada"; a notificacao
  nao e devida se for improvavel um risco; os titulares so quando o risco e elevado, com as excecoes do art. 34(3); e
  TODAS se registam, notificadas ou nao (33(5)). O subcontratante avisa o responsavel sem demora (33(2)).

## Porque o guard e so um NOTE

O Guard 24 le o `package.json` e avisa de um SDK de analytics. Avisa, e nao reprova: a lista nunca esta completa, e
um SDK pode estar configurado sem enviar dados pessoais. Corre tambem no nivel base, porque um SDK de analytics e,
ele proprio, o sinal de que ha dados pessoais — e e a unica peca da regra que uma maquina verifica a cada commit.
