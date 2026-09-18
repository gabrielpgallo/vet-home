# Assistente de anamnese

Em Configurações → IA para anamnese, a administração cadastra ou remove a chave Gemini da clínica. O campo vazio preserva a chave existente. A chave nunca retorna ao navegador; o sistema informa apenas se está configurada.

Na consulta em andamento, “Estruturar com IA” abre um painel lateral com as etapas Relato e Revisão. É possível escrever, gravar pelo microfone ou anexar áudio. A gravação exige permissão explícita do navegador, HTTPS (ou localhost), e um navegador com MediaRecorder. O profissional pode parar, ouvir ou descartar antes de enviar. Fechar o painel interrompe o microfone, inclusive quando a permissão chega depois do fechamento.

O envio ocorre apenas em “Gerar sugestão” ou “Transcrever e estruturar”. A resposta contém a transcrição quando há áudio, a sugestão editável e pontos para conferir. “Aplicar ao campo” substitui apenas o campo principal de anamnese. O profissional pode continuar editando, desfazer a aplicação, salvar ou concluir pelo fluxo normal. Gerar ou aplicar não grava o prontuário automaticamente. Medições e demais campos clínicos não são alterados pela IA.

## Limites e proteção dos dados

- Texto: 20 mil caracteres por solicitação; sugestão: até 50 mil.
- Áudio: até 3 MB; gravação: até 5 minutos, com parada automática. Formatos: MP3, M4A, WAV, OGG/Opus, FLAC e WebM.
- Uma solicitação simultânea e 30 tentativas por hora por clínica. Timeout do provedor: 45 segundos.
- Apenas perfis com `clinical.write`, na própria clínica e em atendimento ainda aberto. Revisões desatualizadas são rejeitadas.
- Áudio e sugestões não são persistidos pelo aplicativo. O conteúdo enviado é processado pelo Google; o aplicativo registra somente metadados de auditoria.
- Chave cifrada com AES-256-GCM, vinculada à clínica, com chave derivada de `BETTER_AUTH_SECRET`. Ao trocar esse segredo, recadastre as chaves Gemini.

O modelo configurado é `gemini-3.6-flash`. As instruções pedem apenas organização dos fatos relatados, sem inventar diagnóstico, conduta ou medidas. Isso não garante precisão: revisão profissional é necessária.

## Implantação e termos do provedor

Execute `pnpm db:migrate` antes de usar a funcionalidade. A migração `010_gemini_integration.sql` cria o armazenamento isolado das chaves e limites. A migração anterior `009_primary_color.sql` também deve estar aplicada. A chave cadastrada no banco local não é transferida à produção.

Antes de utilizar prontuários reais, avalie os [termos do Gemini API](https://ai.google.dev/gemini-api/terms): os termos incluem restrição ao uso em prática clínica e aconselhamento médico; a implementação editorial não estabelece uma exceção contratual para uso veterinário. Serviços gratuitos também podem usar entradas e saídas para melhoria dos produtos, com revisão humana, e os termos orientam não enviar informação sensível. Os testes reais realizados usaram relatos fictícios.
