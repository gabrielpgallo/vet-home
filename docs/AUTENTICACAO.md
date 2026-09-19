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

`Minha conta` mostra as sessões e permite encerrar outras sessões próprias ou sair. A sessão comum tem limite absoluto de 12 horas e expira após 2 horas sem requisições autenticadas ao servidor. A opção “dispositivo compartilhado” no login reduz esses limites para 4 horas e 30 minutos. A política é gravada no banco ao criar a sessão; apagar o cookie de preferência depois não amplia a sessão existente. Edição local sem requisições não renova atividade. A biblioteca pode renovar seu cookie, mas o servidor continua aplicando o limite absoluto pela data original de criação.

A suspensão remove imediatamente o acesso da pessoa à clínica nas próximas requisições; a sessão Google pode continuar válida para outra clínica. A ação administrativa `Revogar sessões nesta clínica` invalida, somente nesse vínculo, sessões criadas antes da revogação. Exige novo login para voltar a acessar aquela clínica e preserva os acessos às outras. A revogação pessoal em `Minha conta` continua encerrando a própria sessão globalmente.

Convites, mudanças de perfil/status, revogações administrativas e criação/substituição/remoção da chave Gemini exigem sessão criada nos últimos 15 minutos. A interface permite confirmar a mesma conta Google em outra aba sem abandonar o formulário. A operação não é repetida automaticamente: depois da confirmação, a pessoa volta e salva novamente. O servidor rejeita formulários de configurações/IAM enviados sob outra identidade ou clínica quando a aba informa a identidade original. Não há exigência de MFA; a confirmação Google pode reaproveitar uma sessão Google já autenticada e não garante nova digitação de senha.

Eventos de criação e revogação de sessões são registrados por trigger no banco. Expiração, negação de permissão e falhas das rotas OAuth também são auditadas. `Minha conta` exibe os eventos do próprio usuário; o IAM exibe os eventos associados à clínica atual. Falhas anônimas são destinadas à operação, não são expostas a administradores de clínicas. Os eventos não armazenam tokens, códigos OAuth, texto clínico ou corpo de requisições. Defina retenção operacional antes de uma base grande; ainda não há expurgo automático de eventos.

O login social é limitado a 10 requisições por minuto, além do limite geral de autenticação. Na Vercel, apenas o cabeçalho `x-forwarded-for` sobrescrito pela plataforma é utilizado para identificar IP. Fora da Vercel, não confiamos em cabeçalhos de IP fornecidos pelo cliente. Se houver Cloudflare fazendo proxy, valide o IP efetivo antes de ajustar limites; não confie automaticamente em `cf-connecting-ip`.

As migrations `011_session_security.sql` e `012_shared_device_sessions.sql` devem estar aplicadas antes de publicar este código. A Action de release faz isso antes do deploy. As políticas novas também se aplicam às sessões antigas: sessões com mais de 12 horas exigirão novo login após a publicação.

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
