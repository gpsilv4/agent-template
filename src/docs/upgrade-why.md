# `/upgrade` — o que custou, e porque a lista deixou de se escrever a mao ({{PROJECT_NAME}})

> **NAO carregado no contexto.** Par de `.agent/workflows/upgrade.md`, como o
> `anti-patterns-why.md` e par das rules de anti-padroes: as **instrucoes** vivem no workflow
> (com orcamento de bytes), a **evidencia** vive aqui.

---

## Porque a lista de "mudancas que reprovam" saiu do workflow

O `/upgrade` tinha, escrita a mao, a lista do que cada ronda fazia reprovar num projeto que
estava verde. Tinha dois defeitos e ambos sao estruturais:

1. **Envelhecia a cada release**, e ninguem a recalculava. Uma lista que tem de ser actualizada
   a mao dentro de um workflow e divida: no dia em que estiver errada, ninguem sabe.
2. **Era sempre a lista da ULTIMA ronda**, e um consumidor nao esta necessariamente nessa
   versao. Quem saltasse duas releases lia uma lista que nao era a dele.

O `simulate-upgrade.mjs` resolve os dois: monta um derivado da ultima tag, aplica o upgrade e
**mede** o que passa a reprovar. A lista passa a ser saida de um script em vez de prosa — e e
a lista da versao de onde o consumidor sai, nao a da ultima ronda.

---

## Registo historico: as rondas anteriores

O que se segue e o que estava escrito no workflow. Fica como registo — nao e para seguir, e
para perceber que classes de aperto ja aconteceram.

### Ronda de `v0.4.0`/`v0.5.0`


- **Tecto unico de 12 000 bytes** para *tudo o que o agente le* — rules carregadas, rules de
  referencia, **workflows** e catalogos. Antes as referencias tinham 12 500/14 000 e os
  workflows **nao tinham limite nenhum**. Medir primeiro:
  `for f in .agent/rules/*.md .agent/workflows/*.md; do wc -c "$f"; done | sort -rn | head`
- **Guard 17 (tamanho de ficheiro)**: `> 500` linhas reprova. Os ficheiros que o projeto ja
  tenha acima disso entram em `TETOS` (em `guards/sizes.mjs`) com a contagem **do dia da
  migracao** — e uma catraca, nao uma isencao: podem encolher, crescer reprova.
  Medir: `find .agent/scripts .claude/hooks -name '*.mjs' -exec wc -l {} + | sort -rn | head`
- **A fronteira nao se reescreve por `Bash`** (`guard-protected-branch.mjs`): passam a ser
  negados `sed -i`, redireccao, `node -e`, `mv`, `rm` e `chmod` sobre `.claude/settings.json`,
  `.claude/hooks/` e `.githooks/`. Um projeto com um script de manutencao que toque nesses
  caminhos deixa de o poder correr pelo agente.
- **Guard 16 (MCP) alargado** de `.mcp.json` aos quatro agentes: um servidor que ja estivesse
  configurado no Cursor, no VS Code ou no Gemini passa a exigir linha em *Servidores aprovados*.


---

## Porque a regra "nao customizado -> traz-se" e geral, e nao so para workflows

Estava escrita numa linha so, a dos `.agent/workflows/*`. Mas vale para tudo o que o template
produz, e a razao aparece numa renomeacao de IDs: o custo real **nao e um ficheiro** — e todo
o documento do template de que o consumidor guarda uma copia antiga. As rules de referencia,
os `src/docs/`, os guias. Cada um deles cita IDs que deixaram de resolver.

Medido pelo `simulate-upgrade.mjs` na ronda `v0.5.0` -> `TP`: **14 documentos** numa so ronda.
Traze-los um a um seria uma lista a envelhecer; a regra nao envelhece, e e mecanica — um
ficheiro byte-a-byte igual ao do template de origem nao foi customizado, logo nao ha
julgamento a fazer sobre ele.

---

## Porque a configuracao do projeto saiu dos ficheiros da logica

O template misturava, no mesmo ficheiro, a **logica** (que o upgrade traz) e a **configuracao**
(que nao deve trazer). A mitigacao era uma lista de nomes a preservar (`CONSTANTES_DO_PROJETO`),
mantida **a mao** — e uma lista a mao envelhece.

Foi assim que se perdeu uma decisao real. Um consumidor tinha o gate dos bundles **suspenso**,
com ticket aberto e razao escrita; a ronda trouxe o ficheiro, a constante voltou ao default, e o
gate passou a reprovar **sem ninguem decidir nada**.

**O modo de falha e o pior que ha**: nada desapareceu do ecra. O verificador correu, mediu bem, e
so o veredicto mudou. A verificacao que o consumidor tinha era por DIFERENCA de output e nao o
apanhou — diferenca de output apanha o que some, **nao apanha um default que regressa**.

A separacao fecha a classe em vez de a mitigar: o upgrade copia `.agent/scripts/**` por inteiro
e a configuracao ja nao esta la dentro.

### "Nunca tocar" estava errado. A regra e "nunca SUBSTITUIR, copiar se AUSENTE"

A primeira versao desta regra excluia `config/` da copia **por inteiro**. Parecia a leitura
conservadora — na duvida, nao mexer — e estava errada de uma forma que so aparece no consumidor.

O `check-bundle-sizes.mjs` faz `import { TARGETS, ALVOS_REPROVAM } from "./config/bundles.mjs"`.
Um projeto derivado de uma versao **anterior** a esta pasta nao a tem — e na ronda em que ela
nasce, **nenhum tem**. Com a exclusao total, o upgrade trazia a logica nova e nao trazia o
ficheiro que ela importa: o verificador rebentava no arranque, em todos eles ao mesmo tempo.

**Proteger a configuracao partindo o consumidor nao e proteger nada.** "Ausente" nao e o mesmo
que "teu": nao ha decisao do projeto a preservar num ficheiro que o projeto nao tem.

Havia ainda um segundo caso que a exclusao por pasta partia, e que nao se ve pensando so no
primeiro: um consumidor que **ja tem** a pasta e um template que lhe acrescenta um ficheiro
**novo** la dentro. Recusar a pasta por ela existir deixava esse ficheiro de fora para sempre.
Por isso o filtro desce sempre nas pastas e decide **ficheiro a ficheiro**.

**Como apareceu, e o que isso diz.** Nenhuma das 819 assercoes o apanhou. Apanhou-o o
`simulate-upgrade.mjs` no CI, que constroi um consumidor a partir da **ultima tag real** e
actualiza-o. Suites medem o que alguem se lembrou de afirmar; o simulador mede o que acontece a
um projeto verdadeiro. E a segunda vez que a metade do produto que ninguem media foi a que tinha
o defeito. A lista de nomes a preservar passa a poder **encolher**
a cada constante que se mude, em vez de ter de crescer a cada decisao nova.

**Uma expectativa que estava errada, registada porque a proxima pessoa vai te-la:** esperava-se
que mover as constantes encolhesse a suite de testes (que fatiava literais de dentro do ficheiro
da logica). **Nao encolheu** — o ajudante que ESCREVE a config, com a semantica parcial que o
torna correcto, custa tanto como o fatiamento que substituiu. O ganho e o upgrade deixar de
atropelar decisoes; nao e o tamanho.

---

## Os tres defeitos que a simulacao encontrou na primeira corrida

Escritos porque sao a prova de que o caminho do `/upgrade` nao estava medido — os tres viviam
num template com as suites verdes e a cobertura de mutacao completa.

1. **A tabela mandava preservar `CONTAGENS` em `check-test-surface.mjs`**, e ela vive em
   `surface-patterns.mjs`. Um consumidor a seguir a instrucao copiava o ficheiro por inteiro e
   perdia as suas contagens **em silencio** — o gate voltava a medir zero e a dizer "superficie
   intacta" sobre uma suite apagada.
2. **O catalogo de anti-padroes do template era copiado sem substituir placeholders.** Traz um
   placeholder por substituir no titulo, e o Guard 13 reprovava o consumidor.
3. **O cabecalho do `anti-patterns.md` ficava a citar IDs mortos.** A instrucao dizia "nunca
   tocar" nesse ficheiro — certo para as entradas do projeto, errado para o cabecalho, que e
   prosa do template. Depois da separacao de prefixos as citacoes antigas deixaram de resolver.
