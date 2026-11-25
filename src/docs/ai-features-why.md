# Porque a regra de IA e assim ({{PROJECT_NAME}})

> **Leitura de humano, uma vez.** As **instrucoes** — quando parar, o que vai para o modelo, a saida como dados — estao
> em `.agent/rules/ai-features.md`, que o agente abre quando uma funcionalidade chama um modelo. Este ficheiro e o
> **racional**, com as fontes. Nao e aconselhamento juridico.
>
> A regra saiu do mesmo `/grill` da privacidade (#495, com o #494), escrito para TODOS os dominios, e de uma leitura
> do openGym (AGPL-3.0: so as IDEIAS, escritas de raiz; nenhum texto nem codigo copiado). Duas leituras juridicas
> independentes corrigiram o plano: o art. 22 sem delimitacao, a condicao do art. 9(2) ligada ao envio em vez da
> finalidade, o aviso "nao e conselho" tratado como suficiente, e o art. 50 sem quem e o obrigado.

## Porque o validador e a fronteira

Um prompt e um PEDIDO ao modelo, e nao uma garantia: o modelo pode ignora-lo, e o texto do utilizador ou de um
documento pode reescreve-lo (a injecao de prompt). O que o codigo controla e o que faz com a resposta. Por isso a
fronteira e um esquema FECHADO na saida: o modelo propoe, o validador decide, e uma acao fora da lista nao faz nada.
Uma so ronda de reparacao, porque um loop "tenta outra vez ate ser valido" contra uma conta paga e um custo sem tecto.
O instantaneo antes de aplicar e o que torna um erro do modelo reversivel.

As saidas sobre uma pessoa sao dados pessoais quando a identificam (as inferencias e as avaliacoes incluidas: TJUE,
C-434/16, *Nowak*). A exatidao (art. 5(1)(d)) vale para tudo o que se guarda sobre ela — tambem a avaliacao do coach
no perfil do proprio utilizador. Marcar como gerado e necessario, mas nao chega para a exatidao.

## O art. 22 e a DPIA

- O art. 22(1) e uma proibicao de principio de decisoes baseadas EXCLUSIVAMENTE em tratamento automatizado com efeitos
  juridicos ou similarmente significativos (TJUE, C-634/21, *SCHUFA*). O mesmo acordao: uma pontuacao em que um
  terceiro se apoia de forma determinante ja e a "decisao". Uma revisao humana so de carimbo nao a tira do art. 22
  (Grupo do Artigo 29, WP251).
- As excecoes do 22(2): necessaria ao contrato, autorizada por lei, ou consentimento explicito. As garantias do 22(3)
  (para a primeira e a terceira): intervencao humana, manifestar o ponto de vista, contestar.
- A "explicacao" nao esta no 22(3): vem dos arts. 13(2)(f), 14(2)(g) e 15(1)(h) — "informacoes uteis relativas a
  logica subjacente" — e do considerando 71. O TJUE (C-203/22, *Dun & Bradstreet Austria*) concretizou o que o
  15(1)(h) exige: explicar o procedimento e os principios aplicados.
- O 22(4): nunca com categorias especiais, salvo 9(2)(a) ou (g) e com medidas adequadas — numa app de saude e o caso
  tipico. E o considerando 71: a decisao automatizada "nao deve dizer respeito a uma crianca" — numa app de estudo com
  menores, a regra PARA mesmo dentro das excecoes.
- A DPIA do art. 35(3)(a) nao exige que a decisao seja exclusivamente automatizada: basta uma avaliacao sistematica e
  extensa em que assentem decisoes com efeitos significativos. Com um humano no circuito, o art. 22 pode nao se
  aplicar e a DPIA continuar obrigatoria.

## O alto risco e as praticas proibidas

- **O Anexo III** (via art. 6(2)): biometria (incluindo o reconhecimento de emocoes); educacao — o acesso, a avaliacao
  dos resultados, o nivel adequado e a vigilancia nos testes, "em instituicoes de ensino e formacao" (uma app de
  estudo de consumo esta provavelmente fora; a de uma escola ou de uma entidade certificadora, dentro); emprego — o
  recrutamento e as decisoes sobre condicoes, promocao, cessacao e a avaliacao do desempenho (avaliar arbitros ou
  atletas com vinculo, ou o scouting para contratar, podem cair aqui); a solvabilidade e o credito; o risco e o preco
  nos seguros de vida e de saude; a triagem de chamadas de emergencia e de doentes em emergencia (nao um verificador
  de sintomas em geral, que pode cair no MDR).
- **O art. 6(1) + Anexo I:** um produto regulado por legislacao do Anexo I e alto risco quando passa por uma avaliacao
  de conformidade por TERCEIROS. Num software medico (Regulamento (UE) 2017/745, MDR, art. 2(1): diagnosticar,
  prevenir, monitorizar, prever, prognosticar, tratar ou aliviar uma doenca), e a partir da classe IIa — e a regra 11
  do Anexo VIII do MDR poe la quase todo o software de diagnostico ou de monitorizacao. A finalidade define-se pelo
  que o fabricante declara — na rotulagem, nas instrucoes, nos materiais promocionais e na avaliacao clinica (MDR art.
  2(12); MDCG 2019-11) —, por isso um aviso CONTRARIADO pelo que a funcionalidade faz ou pelo modo como e promovida nao a
  muda. Que o software com finalidade medica e dispositivo mesmo sem agir sobre o corpo: TJUE, C-329/16, *Snitem*. Uma
  finalidade medica de QUALQUER classe ja cai no MDR (marcacao CE, a regra 11; e o IVDR, Regulamento (UE) 2017/746, num
  dispositivo de diagnostico in vitro); a partir da classe IIa e tambem alto risco no AI Act.
- **O Anexo III e uma lista fechada no Anexo, e a rule so da exemplos:** inclui tambem o acesso a prestacoes e servicos
  publicos e privados essenciais (relevante para financas pessoais e apoio social), as infraestruturas criticas, a
  aplicacao da lei, a migracao, a justica e os processos democraticos.
- **O art. 6(3):** um sistema do Anexo III nao e alto risco se nao houver risco significativo (tarefa processual
  restrita, melhorar uma atividade humana concluida, detetar padroes sem substituir a avaliacao, tarefa
  preparatoria) — mas E sempre se definir perfis de pessoas. Quem invoca a derrogacao documenta-a antes de colocar no
  mercado (art. 6(4)). O agente nao a conclui sozinho.
- **O art. 5:** as praticas proibidas aplicam-se desde 2 fev 2025 (Capitulos I e II; art. 113 do AI Act, na redacao do
  Regulamento (UE) 2026/1744, eur-lex.europa.eu/eli/reg/2026/1744/oj). O reconhecimento de emocoes assenta em dados
  BIOMETRICOS (a voz incluida); uma analise de sentimento de texto nao o e. O Omnibus acrescentou ao art. 5(1) duas
  alineas novas, (ba) e (bb), aplicaveis desde 2 dez 2026 (art. 113, al. (a), na mesma redacao,
  eur-lex.europa.eu/eli/reg/2026/1744/oj): ler o texto consolidado antes de concluir que uma funcionalidade esta fora.
- **Definir perfis FORA do Anexo III** (um tutor que se adapta, um coach) nao e, por si, alto risco: o "sempre alto
  risco" do art. 6(3) e so para os sistemas do Anexo III.
- **Os atos regulados fora do AI Act:** a recomendacao de investimento personalizada (DMIF II, Diretiva 2014/65/UE, art. 4(1)(4)) e a consulta juridica
  (em PT, ato proprio de advogado, Lei 49/2004). A Diretiva (UE) 2024/2853 (responsabilidade por produtos
  defeituosos) cobre o software: um aviso ou uma clausula nao afastam a responsabilidade.

## O art. 50

- O projeto que integra um modelo de uso geral por API e poe o sistema no mercado em seu nome e FORNECEDOR do sistema
  de IA (art. 3(3); "fornecedor a jusante", art. 3(68)); as obrigacoes dos modelos de uso geral (capitulo V) ficam
  com quem vende o modelo.
- 50(1): informar que se interage com uma IA, salvo se for obvio; o mais tardar na 1.a interacao (50(5)). A regra pede
  "sempre": a lei isenta o obvio, e "obvio" e um juizo que o agente nao deve fazer.
- 50(2): a marcacao legivel por maquina do conteudo sintetico, na medida do tecnicamente viavel; excluidas as funcoes
  de assistencia a edicao normal. Para os sistemas ja no mercado antes de 2 ago 2026, o Omnibus deu ate 2 dez 2026
  (art. 111(4) do AI Act, na redacao do Regulamento (UE) 2026/1744, eur-lex.europa.eu/eli/reg/2026/1744/oj).
- 50(3) e 50(4) sao do RESPONSAVEL PELA IMPLANTACAO: o reconhecimento de emocoes e a categorizacao biometrica
  (informar), os deep fakes e o texto publicado para informar o publico (divulgar). O utilizador final em uso pessoal
  esta excluido (art. 2(10)).
- A literacia em IA (art. 4): o Omnibus alterou-a; ler a versao consolidada.

## O fornecedor

- Quem trata por conta do projeto e SUBCONTRATANTE (art. 28): o DPA, os subcontratantes ulteriores (28(2)/(4)). Se o
  projeto e ele proprio subcontratante do cliente (B2B), o fornecedor de IA e subcontratante ULTERIOR e pede a
  autorizacao do cliente.
- Se o fornecedor usa os dados para treinar os SEUS modelos, nessa parte e responsavel (art. 28(10)): e uma
  comunicacao a outro responsavel, com base, compatibilidade (art. 6(4) do RGPD) e informacao proprias — por isso o
  tier sem treino por omissao, e o PARAR.
- "Retencao zero" raramente e incondicional: muitos tiers guardam dados para monitorizar abusos, e nessa parte o
  fornecedor pode ser responsavel autonomo. Ler o DPA e os termos, e registar a retencao no inventario.
- A residencia na UE e uma preferencia, nao uma obrigacao; as transferencias seguem a `privacy.md`.

## Pseudonimos e agregados

- A pseudonimizacao e minimizacao (arts. 5(1)(c), 25, 32), e os dados CONTINUAM pessoais para o projeto (art. 4(5);
  considerando 26; Diretrizes EDPB 01/2025, na versao para consulta publica). O TJUE (C-413/23 P, *EDPS v SRB*) admite que, para um destinatario sem
  meios razoaveis de reidentificar, possam nao o ser — mas isso nao alivia o projeto, e o texto livre (um CV, uma
  nota) identifica por si.
- A agregacao e o limiar minimo PODEM anonimizar se forem bem desenhados (Grupo do Artigo 29, WP216), mas tem riscos
  conhecidos: a inferencia, as diferencas entre consultas, a ligacao a outras fontes. Por isso a regra trata o
  resultado como pessoal salvo avaliacao. E calcular o agregado ja e tratar os dados desses outros utilizadores: a
  finalidade e a base deles tem de o cobrir, e a politica deles tem de o dizer.
- O consentimento "por fornecedor e por destino" e uma escolha do projeto, mais exigente que a lei: os destinatarios
  entram na informacao dos arts. 13/14 por categorias, e o que a lei obriga a voltar a pedir e a mudanca da finalidade
  ou da natureza dos dados. As derrogacoes do art. 49 interpretam-se restritivamente e nao servem transferencias
  sistematicas ou repetidas (Diretrizes EDPB 2/2018).

## O fornecedor falso e a versao fixada

- O CI de um PR nao pode depender de uma conta paga nem de uma resposta que muda a cada corrida. Um fornecedor FALSO
  (valido, invalido, timeout) testa o FLUXO de forma determinista e sem custo; as avaliacoes com o modelo real medem a
  QUALIDADE, correm a parte e custam dinheiro — por isso fora do include do runner dos PRs.
- Um modelo "mais recente" muda de comportamento sem aviso: fixar a versao torna a mudanca um diff revisto. E aqui que
  o template fica mais exigente do que o openGym, que parte de um modelo por omissao sem o fixar.

## Os contribuidores

O uso de IA por quem contribui para o codigo e uma decisao do projeto: o derivado pode escrever a sua politica no
`CONTRIBUTING.md`. O template nao a impoe.

## As datas

A regra nao fixa datas: o calendario do AI Act ja mudou uma vez (o Omnibus) e pode mudar outra. As datas aqui sao as
confirmadas no texto oficial, com a fonte:

- O AI Act e o Regulamento (UE) 2024/1689 (CELEX 32024R1689; JO L de 12 jul 2024, eur-lex.europa.eu/eli/reg/2024/1689/oj).
- O "Digital Omnibus on AI" e o Regulamento (UE) 2026/1744, de 8 jul 2026, publicado a 24 jul 2026 (eur-lex.europa.eu/eli/reg/2026/1744/oj).
- O alto risco do Anexo III aplica-se desde 2 dez 2027 (art. 113, al. (c)(i), eur-lex.europa.eu/eli/reg/2026/1744/oj).
- O do art. 6(1) e do Anexo I desde 2 ago 2028 (art. 113, al. (c)(ii), eur-lex.europa.eu/eli/reg/2026/1744/oj).
- O Omnibus do RGPD (art. 22, pseudonimizacao) estava em negociacao, e nao adotado, quando esta regra se escreveu: se
  for adotado, o art. 22 e a seccao dos pseudonimos releem-se.
