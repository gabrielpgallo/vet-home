# Identidade e acesso

O app usa Better Auth 1.7.5 para OAuth Google e sessões no PostgreSQL. O IAM da aplicação mantém vínculos usuário/clínica, convites, perfis e auditoria. Os dados existentes continuam na clínica `ar-saude-animal` (identificador interno histórico da IR Saúde Animal).

## Ativar Google

1. No Google Cloud Console, configure a tela de consentimento e crie um cliente OAuth do tipo **Aplicativo da Web**. Solicite apenas identidade básica (openid, e-mail e perfil). Enquanto o projeto estiver em teste, inclua as contas autorizadas nos usuários de teste do Google.
2. Cadastre a URI de redirecionamento exatamente: `http://127.0.0.1:3010/api/auth/callback/google`. Para uma implantação, use `https://SEU-DOMINIO/api/auth/callback/google` e configure o domínio correspondente no consentimento.
3. No `.env` local (ou cofre de segredos da hospedagem), configure `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET`. Não coloque segredos no Git nem no chat. `BETTER_AUTH_SECRET` deve ser aleatório, ter pelo menos 32 caracteres e permanecer estável entre reinícios. Um segredo já foi gerado no ambiente local.
4. Defina `BETTER_AUTH_URL` para a URL exata do aplicativo. Não misture `localhost` e `127.0.0.1` no fluxo de login.
5. Execute `pnpm db:migrate` e `pnpm iam:bootstrap`. A variável `IAM_INITIAL_ADMIN_EMAIL` está reservada para `irsaudeanimal@gmail.com`. O bootstrap não altera usuários existentes nem concede novamente acessos revogados. O convite inicial tem validade de 30 dias.
6. Defina `AUTH_MODE=google` e `APP_LOCAL_MODE=false`, reinicie o servidor e entre com o e-mail inicial. Na tela seguinte, aceite o convite da clínica. Confirme o acesso antes de distribuir o endereço aos demais usuários.

Referência do provedor: https://better-auth.com/docs/authentication/google

## Modo de desenvolvimento

O ambiente local permanece explicitamente em `AUTH_MODE=local` e `APP_LOCAL_MODE=true` enquanto as credenciais Google não forem configuradas. Nesse modo, o servidor só aceita hosts locais e a sessão é uma administradora de desenvolvimento, sem identidade Google. A interface mostra essa condição. O servidor local continua vinculado a `127.0.0.1`; não publique esse modo. Sem o modo local explícito, a ausência de credenciais nunca libera acesso aos dados: a aplicação encaminha ao login e a API exige autenticação.

## Perfis

- Administradora: todos os recursos, incluindo produtos, financeiro, configurações e IAM.
- Veterinária: agenda, cadastros, conteúdo clínico e recebimentos; sem financeiro gerencial, edição do catálogo ou IAM.
- Assistente: agenda, cadastros demográficos e recebimentos; sem prontuários, exames, receitas, custos ou financeiro gerencial.

As permissões são definidas em `src/lib/permissions.ts` e verificadas no servidor em todas as rotas. O bootstrap de dados filtra campos restritos antes de responder. Ao editar o cadastro como assistente, notas clínicas anteriores são preservadas. Valores de cobrança por visita são visíveis para permitir registrar pagamentos.

## Convites e sessões

A administradora cria um convite associado ao e-mail, válido por 7 dias, e compartilha o endereço `/login`. Não existe envio automático de e-mail nesta versão. O Google deve confirmar a identidade e o e-mail; a pessoa aceita explicitamente o convite em `/access`. Convites vencidos ou revogados não concedem acesso. Contas sem convite não podem se cadastrar. Contas existentes sem vínculo ativo veem somente seus próprios convites e acessos.

`Minha conta` mostra as sessões e permite encerrar outras sessões ou sair. Sessões expiram em 7 dias, com renovação após 1 dia de atividade. A suspensão remove imediatamente o acesso da pessoa à clínica nas próximas requisições; a sessão Google pode continuar válida para outra clínica. A ação administrativa `Encerrar sessões` desconecta a conta em todas as clínicas e dispositivos.

As verificações consultam sessão e vínculo no servidor, sem cache de permissões em cookies. A última administradora ativa não pode ser suspensa ou rebaixada, inclusive com alterações concorrentes.

## Organização técnica

- `src/server/auth.ts`: Google, cookies e sessões da biblioteca.
- `src/server/access.ts`: origem, autenticação e autorização HTTP.
- `src/server/context.ts`: identidade e clínica por requisição, sem estado global compartilhado entre usuários.
- `src/server/iam.ts`: operações transacionais de convites e vínculos.
- `src/server/db.ts`: contexto de clínica no PostgreSQL para RLS e identidade para auditoria.
- `db/004_auth.sql` e `db/005_iam.sql`: esquema versionado, gerado a partir da versão instalada da biblioteca e complementado pelo IAM.

Os registros clínicos e financeiros continuam protegidos por RLS. As tabelas de identidade são globais, pois o login precisa resolver o usuário antes de selecionar uma clínica; suas consultas são restritas no servidor pelo usuário ou pela clínica autorizada. Credenciais, cookies e tokens não são devolvidos pelo módulo IAM.

A seleção de clínica já é suportada para usuários com vários vínculos. O cadastro público de clínicas, perfis personalizados, envio de e-mails e MFA próprio não fazem parte desta versão.

## Validação

`pnpm test` verifica permissões, aceitação por e-mail verificado, validade e revogação de convites, proteção da última administradora, concorrência, isolamento por clínica e autoria de alterações. O fluxo OAuth completo com consentimento e retorno do Google depende das credenciais reais configuradas acima.
