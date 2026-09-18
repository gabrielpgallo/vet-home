# Releases e deploy de produção

O workflow `.github/workflows/release.yml` publica na Vercel somente no evento de publicação de uma release estável. Push na `main`, push de tag e rascunho de release não publicam. Pré-releases também não publicam em produção.

`vercel.json` define `git.deploymentEnabled: false`, desativando os deploys automáticos da integração Git, inclusive previews. Isso passa a valer para os commits que contêm essa configuração. Deploys manuais pelo painel/CLI continuam possíveis; evite-os para manter a rastreabilidade por release.

## Configuração única

No GitHub, em Settings → Secrets and variables → Actions:

- Secret `VERCEL_TOKEN`: criado em https://vercel.com/account/tokens com acesso ao time do projeto. Renove-o antes da expiração.
- Variable `VERCEL_ORG_ID`: Team ID em Settings → General do time na Vercel.
- Variable `VERCEL_PROJECT_ID`: Project ID em Settings → General do projeto vet-home.

Em Settings → Environments → production → Environment secrets, cadastre também:

- `ADMIN_DATABASE_URL`: conexão administrativa direta ou Session Pooler do Supabase (porta 5432); nunca o Transaction Pooler, pois o runner usa advisory lock de sessão.
- `APP_DB_PASSWORD`: senha existente do papel `vet_app`, usada apenas caso seja necessário criá-lo. Não altera a senha de um papel já existente.
- `DATABASE_SSL_CA`: certificado raiz PEM do Supabase. A conexão verifica certificado e hostname.

As credenciais do banco são disponibilizadas apenas nas etapas de conferência e migrations do job `deploy`, após os testes. Não são repassadas à Vercel. A Action não precisa das credenciais Google nem Gemini. O build final é executado na Vercel com suas variáveis Production.

## Publicar

1. Envie e revise os commits na `main`.
2. Havendo migrations novas, revise-as e assegure um backup antes de publicar. A Action as testa em um banco descartável e depois aplica no Supabase, antes do deploy. Migrations devem ser compatíveis com a versão ainda publicada.
3. No GitHub → Releases → Draft a new release, crie a tag `v1.0.0` apontando para o commit desejado da `main` que já contém o workflow.
4. Preencha as notas e clique em Publish release. Salvar apenas o rascunho não faz deploy.
5. Acompanhe Actions → Release para produção. O resumo contém tag, commit e URL da implantação.

A Action valida a tag e a origem do commit, executa lint, TypeScript e testes com PostgreSQL temporário e só então aplica as migrations pendentes no Supabase e solicita o build/deploy de produção. Se uma migration falhar, a etapa de deploy não executa. Publica o SHA do evento da release, não o estado mais recente da main. Deploys são serializados, sem cancelar um que já começou. Evite publicar várias releases simultâneas: o GitHub não garante ordem FIFO para execuções concorrentes.

Se a configuração estiver incompleta ou o build falhar, corrija o problema e use Re-run failed jobs na Action. Não mova uma tag já publicada. Para corrigir código, publique uma nova versão.

## Falhas e recuperação

O runner registra cada arquivo aplicado em `schema_migrations`, usa uma transação por arquivo e um advisory lock para evitar execução simultânea. Reexecutar a Action pula arquivos já aplicados. Não edite migrations publicadas: crie um novo arquivo incremental.

Se uma migration falhar, aquela transação é revertida; arquivos anteriores que já terminaram permanecem aplicados. Se o build/deploy falhar depois das migrations, elas também permanecem no banco, enquanto a aplicação anterior continua publicada. Não há rollback automático do banco. Por isso, remova colunas ou faça outras mudanças incompatíveis somente após uma transição em releases separadas.

O limite da etapa de migrations é de cinco minutos. Não rode bootstrap nem seed nessa etapa: ela atualiza apenas estrutura e permissões pelo runner existente.

## Versões

- `v1.0.0`: primeira versão estável.
- `v1.0.1`: correção (patch, ou fix).
- `v1.1.0`: funcionalidade compatível (minor).
- `v2.0.0`: mudança incompatível (major).

A tag é a identificação da versão publicada. O campo `version` do package.json não controla deploy e não é alterado automaticamente pela Action. Nenhuma release ou tag é criada automaticamente ao fazer push.

Referências: [eventos de releases no GitHub](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#release), [desativar deploy automático na Vercel](https://vercel.com/docs/project-configuration/git-configuration#turning-off-all-automatic-deployments).
