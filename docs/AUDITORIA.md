# Auditoria de dados da clínica

Administradores encontram a tela **Auditoria** no menu. A API `/api/audit` exige
`audit.read`, disponível somente para o perfil administrador. As consultas usam
RLS da clínica selecionada, inclusive para abrir um registro pelo ID.

A migration `013_change_log.sql` cria `change_log` e triggers para tutores,
pacientes, visitas, pacientes de cada visita, atendimentos, aplicações, receitas,
exames, vínculos, metadados de anexos, notas avulsas, produtos, recebimentos,
despesas e campos textuais das configurações. Eventos derivados da timeline não
são duplicados: a alteração fica registrada na tabela que originou o evento.
Conclusões e cancelamentos aparecem como alterações do campo Status.

Cada registro contém data, responsável, entidade, operação, campos alterados e
valores antes/depois. O e-mail do responsável é preservado mesmo que a conta
seja removida posteriormente. Operações fora do contexto de uma sessão são
identificadas como Sistema; desenvolvimento local aparece como tal.

A captura é transacional: rollback desfaz também o histórico. Atualizações sem
mudança nos campos acompanhados não criam entradas. Repetir uma requisição
idempotente não duplica registros. Não existe reconstrução retroativa: mudanças
anteriores à migration permanecem apenas no antigo registro resumido de ações.

Os snapshots usam uma lista explícita de campos. Arquivos PDF, imagens/logos,
chaves de API, tokens, senhas e dados internos de autenticação não são copiados.
Uma troca exclusivamente de logo não aparece no histórico detalhado.
A atividade de acesso/segurança permanece nas telas de usuários e Minha conta.
Novos campos relevantes precisam ser incluídos por uma nova migration.

A aplicação tem somente SELECT em change_log, sem INSERT, UPDATE, DELETE ou
TRUNCATE. Os triggers escrevem por uma função de banco controlada pelo dono da
migration. Isso protege contra alterações pela aplicação; não é uma garantia
contra um administrador com acesso privilegiado direto ao PostgreSQL. Excluir
uma organização via administração do banco também exclui seu histórico.
Não há limpeza automática ou prazo de retenção implementado.

Os filtros de data usam America/Sao_Paulo, com início e fim inclusivos. A lista
mostra até 50 registros por página em ordem decrescente de ID; os snapshots só
são transferidos ao abrir os detalhes. Durante gravações concorrentes, atualizar
a primeira página permite ver transações concluídas após a consulta anterior.

A migration é aplicada localmente com `pnpm db:migrate`; em produção, pelo
workflow de release antes do deploy, seguindo docs/RELEASES.md.
