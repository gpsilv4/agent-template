# Privacidade por desenho ({{PROJECT_NAME}})

> **Rule de REFERENCIA — nao carregada.** Abrir ao tocar em dados de PESSOAS (recolher, guardar, enviar, apagar,
> registar em logs), ao acrescentar um servico de terceiros, e no `/review` §7 e na lente de privacidade do `/audit`.
> O porque de cada regra, com as fontes: `src/docs/privacy-why.md`.
>
> **RGPD por omissao** (e a ePrivacy para o dispositivo do utilizador). Noutras jurisdicoes ajustam-se a base e a
> autoridade. Isto e um ponto de partida, e **NAO e aconselhamento juridico**: o agente PROPOE, o responsavel DECIDE,
> e nos casos marcados **PARAR** pede-se um jurista antes de escrever codigo.
>
> O que e proprio da IA (o prompt, a injecao, o custo, as decisoes automatizadas) tem a sua regra:
> `.agent/rules/ai-features.md`. Aqui, um fornecedor de IA e mais um DESTINO do inventario.

## As 4 perguntas (o BOOTSTRAP, a Fase 0-R e o `/upgrade` apontam para aqui)

1. **A app trata dados de PESSOAS** — dos utilizadores (nome, email, um registo de treino, notas de estudo,
   movimentos bancarios, um documento) **ou de quem NAO a usa** (jogadores observados, arbitros avaliados, os
   contactos num documento)? **Sim** liga o nivel COMPLETO.
2. **Inclui categorias especiais** (art. 9), **condenacoes penais** (art. 10) **ou dados de MENORES**?
3. **Envia dados a terceiros?** Quais (alojamento, base de dados, email, analytics, IA, um CDN), e em que pais? Um
   fornecedor de IA abre tambem a `ai-features.md`.
4. **Quem decide para que servem os dados: o projeto, ou o CLIENTE que o usa?** Numa app B2B (scouting para um clube,
   avaliacao para uma empresa), quem decide e o cliente: o projeto e SUBCONTRATANTE dele — **PARAR**: um contrato do
   art. 28 com o cliente, o registo do art. 30(2), e a base legal e o art. 14 passam a ser do cliente.

Num projeto existente (a Fase 0-R) ou num derivado que ja existe (o `/upgrade`), o agente PROPOE as respostas a
partir do codigo (o que guarda, o que envia, a quem), e o utilizador confirma.

## Nivel BASE — para todos, sempre

- **Logs sem dados pessoais em claro:** o IP desligado ou truncado, os emails mascarados, nunca o user-agent, um
  limite de eventos e de dias. Um id de utilizador e um dado PSEUDONIMIZADO, e nao anonimo.
- **O dispositivo do utilizador (ePrivacy, art. 5(3); em PT, a Lei 41/2004):** guardar ou ler QUALQUER coisa nele
  — cookies, `localStorage`, ids de dispositivo, fingerprinting, pixels — so com consentimento, salvo o estritamente
  necessario ao servico pedido. Vale seja qual for a base do art. 6. Uma medicao sem cookies **nem outro acesso ao
  dispositivo**, alojada pelo projeto, fica de fora; um SDK no cliente quase nunca.
- **O gatilho:** o PRIMEIRO dado pessoal, ou o primeiro SDK de analytics, liga o nivel completo. O `/review` §7
  pergunta-o; o Guard 24 lembra-o quando um SDK entra no `package.json`.

## Nivel COMPLETO

**O inventario** (`docs/legal/privacy-inventory.md`, do modelo `src/docs/exemplos/privacy-inventory.md`) e o registo
do art. 30 e a UNICA fonte: a politica gera-se dele; o Guard 24 e o `/audit` leem-no. Por FLUXO: o dado, o titular,
a finalidade, a base legal, o destino e o seu PAPEL (subcontratante — pede um DPA, art. 28; responsavel independente;
ou CORRESPONSAVEL, art. 26 — o caso tipico de um widget ou embed de terceiros), a transferencia (o PAIS e o
mecanismo) e a retencao. E ainda as medidas de seguranca (art. 32) e, se o responsavel estiver fora do EEE, o
representante na UE (art. 27).

- **Uma base por finalidade (art. 6), sem hierarquia entre elas:**
  - a **execucao do contrato** (6(1)(b)) so para o que e objetivamente INDISPENSAVEL ao servico — em regra, nao a
    personalizacao, a melhoria do produto, nem a publicidade (porque: `privacy-why.md` § "As bases legais");
  - a **obrigacao legal** (6(1)(c)) para o que a lei impoe (a faturacao, os registos fiscais);
  - o **interesse legitimo** (6(1)(f)), com uma ponderacao ESCRITA, para qualquer titular (a seguranca, a fraude,
    os logs de erros no servidor);
  - o **consentimento** para o resto: livre, especifico, informado, inequivoco, revogavel tao facilmente como se da — e
    DEMONSTRAVEL (art. 7(1)): guardar quando, a que texto e em que versao.
- **As categorias especiais (art. 9):** saude, dados geneticos, biometricos PARA IDENTIFICAR, origem, opinioes
  politicas, crencas, filiacao sindical, vida ou orientacao sexual. Pedem uma condicao do art. 9(2) alem da base do
  art. 6; em PT, a saude e a genetica tem condicoes proprias (Lei 58/2019, art. 29: o sigilo, a necessidade de
  conhecer). A localizacao precisa nao e do art. 9, mas passa a ser se REVELAR uma categoria especial (visitas a uma
  clinica, a um local de culto).
- **As condenacoes penais (art. 10): por omissao NAO se tratam.** So sob o controlo de uma autoridade publica, ou com
  uma lei que o autorize com garantias adequadas — **PARAR**.
- **Os menores:** o art. 8 (o consentimento dos pais abaixo dos 13–16 anos; em PT, 13) aplica-se quando a base e o
  consentimento num servico oferecido diretamente a criancas, com "esforcos razoaveis" para o verificar. Com base no
  contrato, conta a capacidade civil (a lei nacional).
- **Os NAO-utilizadores:** tipicamente o interesse legitimo, com a ponderacao escrita (reforcada se for uma
  crianca); informa-los (art. 14) no prazo de um mes — ou ANTES, na primeira comunicacao com a pessoa ou na
  divulgacao a outro destinatario (14(3)(b)/(c)), o que ocorrer primeiro; a politica da app NAO chega, porque eles
  nunca a leem; com um esforco desproporcionado (14(5)(b)), a informacao torna-se PUBLICA. E o direito de oposicao
  (art. 21). **Categorias especiais de nao-utilizadores: por omissao NAO se recolhem — PARAR.**
- **A RETENCAO e uma tabela no inventario**, com um limite concreto por tipo: sessoes, codigos de uso unico, tokens,
  ficheiros apagados (o periodo de graca), logs, backups (a rotacao).
- **Os direitos**, respondidos em **um mes** (prorrogavel por mais dois, art. 12(3)): o acesso (art. 15) a todos os
  dados; a portabilidade (art. 20) dos FORNECIDOS pelo titular, tratados por consentimento ou contrato e por meios
  automatizados, num formato legivel por maquina; o apagamento de
  TODAS as copias (base, backups, logs, caches, o fornecedor) — salvo o que a lei obriga a guardar (art. 17(3): a
  faturacao); a oposicao, apresentada a parte e de forma explicita (art. 21(4)), e absoluta no marketing direto.
- **A DPIA (art. 35):** obrigatoria nos tres casos do art. 35(3) e na lista da CNPD (o Regulamento n.o 1/2018, em
  DR o n.o 798/2018); pelos criterios do WP248, dois
  ou mais pedem-na (avaliar ou pontuar pessoas, dados sensiveis, pessoas vulneraveis, tecnologia nova como a IA,
  grande escala). **O DPO (art. 37):** se a atividade principal for vigiar pessoas de forma regular e sistematica em
  grande escala, ou tratar categorias especiais ou dados do art. 10 em grande escala, ou se for um organismo
  publico. O agente PROPOE se se aplicam; com um criterio presente, **PARAR**.
- **Decisoes automatizadas com efeitos significativos** sobre pessoas (art. 22): **PARAR** quando a saida decide, ou
  pontua de forma determinante para quem decide, sem revisao humana real — intervencao humana, o ponto de vista e a
  contestacao (22(3)), e a logica explicada (arts. 13-15, nao o 22(3)); e a `ai-features.md`, que trata o AI Act
  (avaliar no emprego, incluindo o desempenho, alunos em instituicoes de ensino, ou o credito pode ser alto risco, Anexo
  III).
- **As transferencias para fora do EEE:** uma decisao de adequacao (o DPF so para os EUA, com o fornecedor
  certificado — verificar o estado: esta sob recurso e pode cair como o Privacy Shield), as clausulas-tipo com uma avaliacao do impacto da transferencia,
  as BCR, ou uma derrogacao do art. 49.
- **Os fluxos que se esquecem:** videos embebidos (mesmo os "so ao toque"), mapas, fontes e CDNs, a verificacao de
  atualizacoes, os widgets de terceiros. Cada um e uma linha do inventario.
- **A violacao de dados:** notificar a autoridade sem demora e em 72 h DESDE QUE se tem conhecimento (art. 33) — nao
  e devida se for improvavel um risco; os titulares quando o risco e elevado (art. 34); TODAS se registam (33(5)).
  Um subcontratante avisa o responsavel sem demora. O procedimento vive no `SECURITY.md` (#496).
- **Um projeto que cada um aloja:** quem aloja e o responsavel — salvo um uso estritamente pessoal ou domestico, que
  esta fora do RGPD (art. 2(2)(c)). O autor do software nao e responsavel pelas instancias dos outros — salvo pelo
  que a instancia lhe envie (telemetria, a verificacao de atualizacoes).
- **A politica publicada** nasce como RASCUNHO, existe em TODAS as linguas da UI, e com categorias especiais,
  condenacoes, menores, nao-utilizadores, o art. 22 ou transferencias **nao se publica sem revisao humana e juridica**.

## O que fica so por leitura (nenhum guard o ve)

Os logs, a retencao, o apagamento de todas as copias, o consentimento do dispositivo, e os campos `[...]` por
preencher de um modelo copiado. O Guard 24 ve so um SDK no `package.json`. O `/review` §7 corre a partir de `M`, e
no modo minimo nao ha `/audit`: um ticket `S` com o primeiro dado pessoal e sem SDK nao passa por nenhuma rede.
