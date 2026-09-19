# Rotação dos segredos compartilhados

A correção do código não invalida credenciais antigas. Não envie novas chaves pelo chat nem as inclua no Git.

## Supabase

1. Em Database → Settings, altere a senha administrativa do banco. Use senha aleatória no gerenciador de senhas. Essa senha é distinta da senha do papel restrito `vet_app` usado pelo aplicativo.
2. Atualize a senha (codificada para URL quando necessário) em `ADMIN_DATABASE_URL` de `.env.supabase.local` e no secret homônimo do environment `production` no GitHub. Confirme uma conexão TLS antes da próxima release. Se existirem outras integrações usando o usuário administrativo, atualize-as também.
3. Em Project Settings → API Keys, revogue/substitua a chave secreta `sb_secret_…` que foi compartilhada. Criar uma chave nova não invalida a antiga.
4. Para as chaves legadas `service_role`/JWT, siga o procedimento atual de migração para signing keys e revogação do segredo legado no painel. Revise consumidores antes da revogação. Só trocar a chave que assina novos tokens não basta para deixar de aceitar a antiga.

O aplicativo usa PostgreSQL diretamente com `vet_app` e Better Auth. Não utiliza as chaves `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_SECRET_KEY`, anon ou publishable para login. Por isso a rotação dessas chaves não substitui nem exige trocar `BETTER_AUTH_SECRET`. Confirme também os usos fora deste repositório antes de revogá-las.

## Gemini

Crie uma nova chave no projeto correto do Google AI Studio, cadastre-a nas configurações de cada clínica/ambiente que usa IA e teste com um relato fictício. Depois desative/exclua a chave anterior no provedor. Atualizar a chave no app sozinho não revoga a anterior.

## Segredo do aplicativo

Não troque `BETTER_AUTH_SECRET` isoladamente: ele protege cookies, tokens OAuth cifrados e as chaves Gemini armazenadas. Uma eventual rotação exige encerrar sessões e planejar recifragem ou recadastro das integrações. Esse segredo é independente das chaves Supabase acima.

Referências: [senha do banco Supabase](https://supabase.com/docs/guides/troubleshooting/how-do-i-reset-my-supabase-database-password-oTs5sB), [chaves API Supabase](https://supabase.com/docs/guides/getting-started/api-keys), [segredos JWT legados](https://supabase.com/docs/guides/troubleshooting/rotating-anon-service-and-jwt-secrets-1Jq6yd), [chaves Gemini](https://ai.google.dev/gemini-api/docs/api-key).
