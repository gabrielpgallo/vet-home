# Vet Domicílio

Aplicação local para uma médica veterinária que atende em domicílio. Primeira implementação do fluxo discutido com Gabriel: agenda por tutor, atendimento individual por animal e histórico em uma timeline. Interface responsiva em português, com azul como cor primária e temas claro, escuro e do sistema.

## Rodar no Mac

Pré-requisitos: Node.js 22, pnpm 10 e Docker Desktop aberto.

```sh
pnpm install
pnpm setup
pnpm dev
```

Abra **http://127.0.0.1:3010**. `setup` cria `.env` com senhas aleatórias se não existir, sobe o PostgreSQL isolado, executa migrações e insere exemplos fictícios somente se ainda não houver tutores. Não altera dados dos outros projetos.

O banco usa a porta local **55435** e o volume Docker **vet-domicilio_vet-domicilio-data**. `pnpm db:down` desliga o banco sem apagar os dados. Não execute `docker compose down -v` se quiser preservá-los. As configurações privadas estão em `.env`, ignorado pelo Git.

## O que já funciona

- Cadastro rápido de tutor com nome, endereço e nomes dos animais; edição posterior de tutor e paciente.
- Agenda diária com horário exato, duração, endereço, motivo, tutor pesquisável e seleção dos animais da visita.
- Atendimento separado por animal, com texto livre, medições, salvamento explícito e histórico acessível durante a consulta.
- Proteção contra sair com texto não salvo e contra sobrescrever uma edição feita em outra aba.
- Catálogo com custo e venda por unidade; aplicação de quantidade fracionada, cálculo no servidor e preço preservado no histórico.
- Receita com vários itens, revisão e download de **PDF de rascunho sem assinatura**.
- Pedido de exame, encaminhamento, anexação de resultado PDF de até 15 MB e vínculo de exame já existente a outra consulta do mesmo paciente.
- Timeline de consultas, aplicações, receitas, exames e notas, preservando os vínculos sem duplicar eventos.
- Cobrança por visita, recebimento parcial por Pix, dinheiro, crédito, débito ou link de pagamento, com histórico de recebimentos.
- Lista de atendimentos em andamento, pedidos sem resultado e valores a receber.

O registro da consulta é salvo pelo botão **Salvar atendimento**. Concluir preserva o registro clínico; complementos podem ser lançados como notas. A visita fica concluída quando todos os animais tiverem atendimento concluído.

## Limites desta etapa

É uma versão de desenvolvimento local, sem login. O servidor escuta somente em `127.0.0.1`; as APIs também exigem host local e mesma origem nas alterações. Não foi preparada para ser exposta na internet ou acessada pelo tablet pela rede. Autenticação, acesso seguro pelo tablet e publicação são a próxima etapa antes de uso real.

Ainda não há assinatura digital, emissão formal de documentos, integração com WhatsApp, gateway de pagamento, geração de links de pagamento, controle de estoque, remarcação de visitas ou funcionamento offline. “Link de pagamento” registra a forma do recebimento. PDF de receita é explicitamente um rascunho; a dose e a posologia são sempre informadas pela veterinária.

Os dados de cada organização têm RLS no PostgreSQL e o usuário de execução não é dono das tabelas nem pode ignorar RLS. Nesta versão local a organização é fixa no servidor; isso **não substitui autenticação**. Todas as mutações usam transações, idempotência e log técnico sem conteúdo clínico. Pagamentos concorrentes são serializados para não ultrapassar o saldo. Não existe rotina de backup automático; para dados reais, backup e recuperação precisam fazer parte da implantação.

## Validação e desenvolvimento

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Os testes de integração requerem o banco já migrado. Criam uma organização temporária e removem somente os seus dados ao terminar. Cobrem isolamento RLS, idempotência concorrente, cálculo e preservação de preço, conflito de edição, vínculo de exames, pagamento concorrente e fechamento de atendimento.

Stack: Next.js App Router, React, TypeScript, PostgreSQL, `pg`, Zod e PDFKit. O carregamento inicial ainda traz os registros da organização de uma vez; paginação e busca no servidor serão necessárias antes de uma base grande.

- `src/components`: telas e formulários.
- `src/server`: acesso, transações, comandos e consultas.
- `src/app/api`: endpoints locais e documentos.
- `db`: migrações SQL incrementais.
- `scripts`: ambiente, migração e exemplos.
- `tests`: regras de domínio e integração real com PostgreSQL.
- [Escopo do produto](docs/PRODUTO.md).
