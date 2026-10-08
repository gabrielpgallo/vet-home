# Endereço do tutor e busca por CEP

Cadastros novos têm CEP com máscara `00000-000`, rua, número, complemento, bairro, cidade e UF. O CEP é opcional. A busca começa após os oito dígitos; o botão “Buscar CEP” permite tentar novamente. Os campos permanecem editáveis, inclusive em CEPs gerais de municípios ou indisponibilidade do serviço.

A consulta passa por `/api/postal-codes/[cep]`, com autenticação e permissão `registry.write`. Somente os oito dígitos do CEP vão ao [ViaCEP](https://viacep.com.br/). O serviço não exige chave. Nome, telefone, número da residência e complemento não são enviados. O complemento retornado pelo ViaCEP descreve uma faixa postal e não preenche o complemento residencial.

## Ciclo de vida da busca e do cache

- No navegador há uma espera de 350 ms para evitar consultas intermediárias. Trocar ou apagar o CEP e fechar o formulário cancela o timer e a requisição anterior. Um contador descarta respostas antigas; edições manuais feitas durante a consulta são preservadas. O salvamento aguarda a busca terminar ou ser cancelada.
- No servidor, cada consulta externa tem timeout de cinco segundos. O resultado validado é armazenado no Data Cache do Next.js, com chave versionada por CEP e revalidação em 24 horas. Não há Map global, intervalo de limpeza nem dependência de uma instância da função permanecer ativa.
- Apenas resultados válidos entram no cache. CEP inexistente, falha de rede e resposta inválida geram erros antes da gravação. A resposta autenticada ao navegador usa `no-store`.
- Este projeto não habilita Cache Components; usa `unstable_cache`, suportado pelo Data Cache na Vercel. O cache é separado por ambiente e região e persiste entre deploys. Após 24 horas, uma nova leitura provoca revalidação; a infraestrutura pode servir o resultado anterior enquanto atualiza ou em uma falha de revalidação. A Vercel gerencia a remoção de entradas por capacidade. A perda de uma entrada apenas causa nova consulta. [Documentação da Vercel](https://vercel.com/docs/caching/runtime-cache/data-cache).
- A chave `vet-home:postal-code:v1` deve ser incrementada se mudar o formato dos dados. A tag `postal-codes` permite invalidação administrativa futura. O cache não é fonte de verdade do cadastro: o tutor só é gravado ao clicar em Salvar.

## Persistência e compatibilidade

A migration `018_tutor_address.sql` adiciona `tutors.address_details` e inclui os campos na auditoria. O CEP é salvo com oito dígitos, sem pontuação; o servidor recompõe também `tutors.address`, usado em telas, documentos e novas visitas. Visitas existentes mantêm o endereço que foi registrado no agendamento.

Endereços antigos continuam em texto livre. “Preencher por CEP” permite migrar um cadastro ao editar, mostrando o texto anterior como referência e oferecendo a opção de mantê-lo. Não fazemos divisão automática nem alteração em massa dos endereços anteriores.

Clientes anteriores preservam os detalhes ao atualizar outros dados com o mesmo endereço. Se alterarem o endereço livre sem enviar os campos separados, o servidor limpa os detalhes antigos para não apresentar duas versões divergentes.

Aplicar com `pnpm db:migrate` antes de usar a versão nova. A migração local não altera a produção; a rotina de release aplica as migrações no deploy.
