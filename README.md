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

- Financeiro por período com resultado estimado, movimentação de caixa, gráfico, receitas por visita e despesas editáveis, com vínculo opcional a uma visita. Relatórios PDF e CSV.

### Critérios do financeiro

Faturamento e custo das aplicações consideram **visitas concluídas**, pela data da visita. Visitas agendadas ou em andamento não são receita realizada. O custo de cada aplicação usa quantidade × custo unitário histórico, arredondado por aplicação ao centavo.

Despesas entram no resultado pela **data de competência**, independentemente de pagamento. A categoria **Compra de produtos** afeta apenas as saídas de caixa: o consumo desses produtos já entra como custo nas aplicações. Não cadastre o mesmo custo novamente como outra despesa.

Recebimentos usam a data registrada no pagamento e incluem visitas antigas e adiantamentos. Despesas pagas usam a data de pagamento, inclusive as de competência anterior. A movimentação líquida (entradas menos saídas registradas) não é o saldo bancário. O cartão “A receber” mostra apenas visitas concluídas do período, abatendo pagamentos até a data final do filtro.

O resultado por visita desconta aplicações e despesas vinculadas com competência no período. Despesas gerais também são descontadas do resultado total. Uma despesa ligada a uma visita fora do período permanece no resultado de sua própria competência. Relatórios usam os registros atuais, portanto correções podem alterar relatórios históricos. O CSV usa UTF-8, separador ponto e vírgula e seções distintas para facilitar a conferência.

### Demais funcionalidades

- Configurações da empresa: nome, logo PNG/JPEG, veterinária responsável, CRMV e MAPA/SIPEAGRO. Telefone, e-mail, CNPJ e CPF da veterinária são opcionais e aparecem nos documentos clínicos quando preenchidos. O cadastro do tutor também aceita CPF/CNPJ opcional.
- Cor primária por clínica: seletor de cor, código hexadecimal, prévias clara/escura e restauração do padrão. Aplicada ao sistema após salvar e aos PDFs; os tons de texto se ajustam para contraste e os botões preservam a cor escolhida.

- Cadastro rápido de tutor com nome, endereço e nomes dos animais; edição posterior de tutor e paciente.
- Agenda com visões de dia, semana e mês, navegação por período e totais correspondentes; horário exato, duração, endereço, motivo, tutor pesquisável e seleção dos animais da visita.
- Atendimento separado por animal, com texto livre, medições, salvamento explícito e histórico acessível durante a consulta.
- Proteção contra sair com texto não salvo e contra sobrescrever uma edição feita em outra aba.
- Catálogo com custo e venda por unidade; aplicação de quantidade fracionada, cálculo no servidor e preço preservado no histórico.
- Receita com vários itens, revisão e download de **PDF de rascunho sem assinatura**.
- Receitas e pedidos de exame usam cabeçalho com contatos, identificação compacta do paciente e tutor, paginação automática e rodapé com espaço em branco para assinatura externa. Idade calculada na data do documento; peso da consulta vinculada, quando disponível. O espaço reservado não assina o arquivo.
- Pedido de exame com ações Salvar ou Salvar e gerar PDF (sem assinatura), e novo download pelo atendimento, timeline ou pendências, encaminhamento, anexação de resultado PDF de até 15 MB e vínculo de exame já existente a outra consulta do mesmo paciente.
- Timeline de consultas, aplicações, receitas, exames e notas, preservando os vínculos sem duplicar eventos.
- Cobrança por visita, recebimento parcial por Pix, dinheiro, crédito, débito ou link de pagamento, com histórico de recebimentos.
- Lista de atendimentos em andamento, pedidos sem resultado e valores a receber.

O registro da consulta é salvo pelo botão **Salvar atendimento**. Concluir preserva o registro clínico; complementos podem ser lançados como notas. A visita fica concluída quando todos os animais tiverem atendimento concluído.

## Limites desta etapa

O ambiente atual continua em desenvolvimento local, com servidor em `127.0.0.1`. O login Google e o IAM estão implementados, mas a ativação do OAuth exige configurar as credenciais descritas em `docs/AUTENTICACAO.md`. Acesso pelo tablet na rede e publicação ainda dependem da implantação com HTTPS e do modo autenticado.

Ainda não há assinatura digital, emissão formal de documentos, integração com WhatsApp, gateway de pagamento, geração de links de pagamento, controle de estoque, remarcação de visitas ou funcionamento offline. “Link de pagamento” registra a forma do recebimento. PDF de receita é explicitamente um rascunho; a dose e a posologia são sempre informadas pela veterinária.

Os dados de cada organização têm RLS no PostgreSQL e o usuário de execução não é dono das tabelas nem pode ignorar RLS. No modo autenticado, a organização vem de um vínculo ativo do usuário, e a identidade fica registrada na auditoria. No modo de desenvolvimento a organização é fixa no servidor. As operações clínicas e financeiras usam transações e idempotência; o IAM usa transações e controle de concorrência. O log não contém conteúdo clínico. Pagamentos concorrentes são serializados para não ultrapassar o saldo. Não existe rotina de backup automático; para dados reais, backup e recuperação precisam fazer parte da implantação.

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
- [Versionamento e deploy por release](docs/RELEASES.md).
- [Assistente de anamnese: texto, gravação e revisão com IA](docs/IA.md).

### Login Google e IAM

Para publicar na Vercel com PostgreSQL do Supabase, veja [configuração de implantação e pendências](docs/DEPLOY.md). A versão atual usa Better Auth; Supabase Auth e Storage ainda são etapas pendentes.

O módulo **Usuários e acessos** permite criar convites, gerenciar perfis (administradora, veterinária e assistente), suspender usuários e encerrar sessões. **Minha conta** mostra os acessos e dispositivos do próprio usuário. As permissões são verificadas na API e os registros são isolados por clínica.

A integração usa Better Auth; o ambiente local continua em modo de desenvolvimento explícito até configurar as credenciais Google. Veja [configuração e critérios de acesso](docs/AUTENTICACAO.md). O convite inicial está reservado para `irsaudeanimal@gmail.com`. Convites não enviam e-mails automaticamente.
