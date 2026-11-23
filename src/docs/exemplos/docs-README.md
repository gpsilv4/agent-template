# Documentação do projeto

> O índice da pasta `docs/`: o que é do PRODUTO (como a app funciona, como se constrói, como se opera). A
> maquinaria do agente (regras, workflows, os "porquês", o `CHANGELOG.md`) não vive aqui — vive em `.agent/` e em
> `src/docs/`, e vem do template.
>
> Criado no bootstrap a partir de `src/docs/exemplos/docs-README.md`. Os nomes das pastas ficam em inglês (a
> regra dos nomes de ficheiros); as descrições na língua do projeto.

## Onde pôr um doc novo

Na pasta do seu TIPO. Uma pasta nasce com o primeiro doc desse tipo (o git não guarda pastas vazias). É uma
recomendação, e não uma regra rígida: um projeto pode ter outras pastas, se uma destas não servir.

| Pasta | O que vai lá |
|-------|--------------|
| `product/` | Como a app funciona: o manual, as regras de negócio explicadas, as funcionalidades. |
| `architecture/` | Como está construída: APIs, integrações, o modelo de dados, o design system. |
| `development/` | Como se trabalha nela: setup, testes, convenções, o método de trabalho da equipa. |
| `operations/` | Como corre em produção: deploy, ambientes, variáveis e chaves (os NOMES e onde vivem — nunca os valores), backups, monitorização. |
| `audits/` | O que se investigou, com data: auditorias, revisões, spikes, investigações. |
| `strategy/` | Porque existe e para onde vai: mercado, pitch, preços. |
| `legal/` | Privacidade, termos, avaliações de impacto (DPIA), o inventário de dados pessoais. |
| `reference/` | Material de fonte externa: documentação oficial guardada, normas, artigos úteis. |

## Em dúvida

- Um doc que explica uma decisão técnica tomada: `architecture/` (o registo curto da decisão fica em
  `.agent/context/decisions.md`).
- Um doc datado, que descreve o estado de uma coisa num dia: `audits/`.
- Um doc copiado de fora, que o projeto não escreveu: `reference/`.
- As regras de negócio que o AGENTE segue vivem em `.agent/rules/business-logic.md` (a fonte de verdade); o
  `product/` explica-as para pessoas, e remete para lá em vez de as repetir.
- O método de trabalho do agente vive em `.agent/rules/` (o `ticket-method.md`); o `development/` é o da equipa.
- O relatório de um `/audit` vive em `.agent/context/audit-history.md`; o `audits/` guarda o que se investigou
  fora dele (um spike, uma auditoria externa).
