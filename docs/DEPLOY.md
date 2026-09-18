# Vercel e PostgreSQL do Supabase

Esta versão mantém o Google OAuth com Better Auth e o IAM existente. **Supabase Auth e Storage ainda não estão implementados.** Não configure AUTH_MODE=supabase: a validação do build rejeita modos não suportados.

## Banco e preparação

Crie um projeto Supabase, preferencialmente em São Paulo. As tabelas da aplicação são acessadas pela API Next.js com `pg`, sem acesso direto do navegador ao banco.

Crie `.env.supabase.local` (ignorado pelo Git) para executar os comandos de preparação no seu computador. Esse nome não é carregado automaticamente pelo Next.js e mantém o banco local independente. Configure:

- `ADMIN_DATABASE_URL`: conexão de administração direta ou pelo Session Pooler. Não use Transaction Pooler para migrações: elas usam advisory lock de sessão.
- `APP_DB_PASSWORD`: senha aleatória com 20–128 caracteres alfanuméricos, `_` ou `-`, para criar o papel `vet_app`.
- `DATABASE_SSL_CA`: conteúdo PEM do certificado raiz do Supabase, obtido em Database Settings → SSL Configuration → Download Certificate. Pode conter quebras de linha reais ou `\n`; a aplicação verifica o certificado e o hostname.
- `DATABASE_URL`: conexão Transaction Pooler com usuário `vet_app.<project-ref>`, porta 6543 e `sslmode=verify-full`. Use o host exato indicado no painel do projeto.
- `APP_ORG_ID=ar-saude-animal`: identificador interno atual, independente do nome comercial IR Saúde Animal.
- `IAM_INITIAL_ADMIN_EMAIL=irsaudeanimal@gmail.com`.

Execute nesta ordem, depois de preencher as URLs:

```sh
ENV_FILE=.env.supabase.local pnpm db:migrate
ENV_FILE=.env.supabase.local pnpm db:bootstrap
ENV_FILE=.env.supabase.local pnpm iam:bootstrap
```

A migração cria um papel de execução sem bypass de RLS e revoga acesso de `anon` e `authenticated` às tabelas da aplicação. Use um projeto Supabase dedicado. O bootstrap cria a clínica sem exemplos e preserva configurações existentes. O convite inicial não envia e-mail. Não execute `db:seed` em produção.

Esses comandos inicializam um banco vazio; não transferem os registros, anexos ou logo existentes no banco local. A transferência dos dados deve ser uma etapa separada, com backup e verificação.

## Vercel

O deploy de produção é controlado pela publicação de releases estáveis `vMAJOR.MINOR.PATCH` no GitHub. Pushes não fazem deploy automático. Veja a [configuração da Action e publicação de releases](RELEASES.md).

Importe o repositório `gabrielpgallo/vet-home`, framework Next.js, diretório raiz `.` e Node.js 22. O projeto já define `pnpm build` e região `gru1`.

Variáveis no ambiente Production:

| Variável               | Valor                                                                                               |
| ---------------------- | --------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`         | Transaction Pooler com `vet_app.<project-ref>` e TLS verificado                                     |
| `DATABASE_SSL_CA`      | Conteúdo PEM do certificado raiz Supabase                                                           |
| `APP_ORG_ID`           | `ar-saude-animal`                                                                                   |
| `AUTH_MODE`            | `google`                                                                                            |
| `APP_LOCAL_MODE`       | `false`                                                                                             |
| `BETTER_AUTH_URL`      | Opcional em Production: usa automaticamente o domínio informado pela Vercel; obrigatório em Preview |
| `BETTER_AUTH_SECRET`   | Segredo aleatório próprio deste ambiente, com pelo menos 32 caracteres                              |
| `GOOGLE_CLIENT_ID`     | ID do cliente OAuth Web                                                                             |
| `GOOGLE_CLIENT_SECRET` | Segredo do cliente OAuth Web                                                                        |

Não coloque `ADMIN_DATABASE_URL`, `APP_DB_PASSWORD` ou variáveis `NEXT_PUBLIC_` com segredos na Vercel. Migrations não rodam durante o build da Vercel: a Action de release as executa no Supabase antes do deploy, usando secrets do environment `production` no GitHub (veja `RELEASES.md`). Para Preview, use banco, segredo e OAuth separados; não copie automaticamente o acesso de produção.

O domínio automático usa `VERCEL_PROJECT_PRODUCTION_URL` apenas quando `VERCEL_ENV=production`; mantenha a exposição das variáveis de sistema habilitada na Vercel. Um `BETTER_AUTH_URL` explícito tem prioridade. Nunca usamos o cabeçalho Host da requisição para definir o domínio OAuth.

Caso tenha sido preparado um arquivo `.env.vercel.production`, importe-o em Settings → Environment Variables → Import .env, selecionando apenas Production. Ele contém a conexão restrita `vet_app`, o certificado, o segredo de sessão e as credenciais Google; não inclui acesso administrativo ao banco. Em seguida publique uma release conforme `RELEASES.md`. Esse arquivo é privado, ignorado pelo Git, e não deve ser publicado.

No GCP, adicione `https://seu-projeto.vercel.app/api/auth/callback/google` às URLs de redirecionamento autorizadas do cliente OAuth. Preserve também a URL local enquanto ela for usada. Após mudar as variáveis, faça um novo deploy. Entre com a conta convidada e aceite o convite da clínica.

## Limitações antes do uso real

- Anexos continuam no PostgreSQL, com limite local de 15 MB. A Vercel limita corpo de requisição/resposta a 4,5 MB: arquivos grandes ainda requerem a integração de upload direto com Storage privado. Não considere o fluxo de anexos de 15 MB pronto para produção na Vercel.
- A migração de autenticação para Supabase deve preservar os IDs do IAM, testar convites e revogação de sessões e só então substituir Better Auth.
- Valide login, isolamento por clínica, PDFs, agenda e pagamentos no endereço definitivo antes de usar dados reais. Configure backup e restauração do banco e, quando adotado, dos objetos do Storage.

Referências: [conexão com PostgreSQL](https://supabase.com/docs/guides/database/connecting-to-postgres), [limites de funções Vercel](https://vercel.com/docs/functions/limitations).
