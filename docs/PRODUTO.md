# Fluxo confirmado

A veterinária agenda uma visita domiciliar com horário e duração definidos. A visita tem um tutor, um endereço e um ou mais animais. O deslocamento é incluído no preço base; o sistema não calcula rotas nem organiza bairros.

Cada animal tem um atendimento independente. O registro clínico é livre, acompanhado de medições opcionais de peso, temperatura, frequência cardíaca e respiratória e pressão arterial sistólica. O histórico deve ficar acessível sem perder o contexto da consulta.

Aplicações usam um produto do catálogo, quantidade e unidade. O valor é calculado a partir do preço de venda por unidade; alterações futuras no catálogo não mudam o passado. Esta primeira implementação cobra o preço do produto aplicado, sem uma tarifa adicional de aplicação.

Exames podem ser coletados pela veterinária e enviados ao laboratório parceiro, ou encaminhados a outros profissionais. Pedido e resultado são eventos distintos que podem se relacionar com a consulta. Um exame já cadastrado pode ser vinculado a outra consulta do mesmo paciente sem duplicação.

Receitas têm itens estruturados e orientações. A veterinária define os dados clínicos; a aplicação não sugere doses. Assinatura digital é uma etapa futura de integração, não uma imagem decorativa.

O tutor paga por visita, no momento ou posteriormente, podendo pagar parcialmente. Métodos: Pix, dinheiro, cartão de crédito, débito e link de pagamento.

# Atendimentos sem agendamento e correções

Em **Paciente → Novo atendimento**, é possível iniciar um registro sem agendamento e salvar o rascunho sem data. A data real do atendimento é obrigatória ao concluir; o horário é opcional. Datas futuras são rejeitadas. O horário de cadastro permanece separado da data clínica. Consultas e aplicações aparecem na timeline pela data clínica.

O atendimento avulso possui uma visita interna para cobrança, sem aparecer na agenda. Sua data de competência acompanha a data clínica. Em visitas agendadas, corrigir a data clínica não remarca a agenda nem altera a competência da cobrança compartilhada. A cobrança permite ajustar valor base, endereço e competência; recebimentos têm uma data própria.

Atendimentos concluídos oferecem **Editar atendimento** para anamnese, medições e data. O status permanece concluído. A correção exige motivo, registra autor e valores anteriores na auditoria e recusa sobrescrever uma versão alterada em outra aba. Aplicações permitem corrigir produto, quantidade, preço de venda, lote e via ou cancelar o lançamento. O custo histórico é preservado ao manter o mesmo produto; ao trocar de produto, usa-se o custo do novo catálogo.

Corrigir um recebimento preserva o lançamento anterior como cancelado e cria seu substituto. Os totais ignoram lançamentos cancelados. Se a cobrança diminuir abaixo do recebido, o sistema mostra o valor recebido a maior. Isso não efetua estorno bancário ou devolução automática.

Receitas e pedidos de exame são corrigidos em novas versões vinculadas ao original, com justificativa. PDFs já emitidos pelo novo fluxo ficam preservados, e uma receita corrigida precisa de nova assinatura. Para corrigir um resultado, anexa-se uma nova versão do arquivo; o anexo anterior permanece disponível. Resultados existentes continuam associados ao pedido que os originou. PDFs antigos que nunca foram armazenados pelo sistema são congelados no primeiro download ou na substituição, com os dados disponíveis nesse momento.

As migrations `019_unscheduled_consultations.sql` e `020_encounter_corrections.sql` acrescentam datas, origem do atendimento, controle de revisão, cancelamentos e vínculos de substituição. Registros existentes recebem datas a partir da visita e dos recebimentos, no fuso de Brasília. Aplicar com `pnpm db:migrate`; em produção, o workflow de release executa as migrations antes do deploy.

# Próximos incrementos

1. Validar esta primeira implementação com a veterinária usando somente exemplos: navegação, atendimento, campos da receita e cobrança.
2. Implementar login, sessão e organização vinculada à identidade; publicar um ambiente seguro para tablet e celular.
3. Preparar backup automático e teste de recuperação antes de dados reais.
4. Refinar agenda com remarcação e edição do motivo/duração conforme o uso observado.
5. Completar dados profissionais e tutores, modelos de documentos e integração de assinatura digital.
6. Acrescentar paginação, busca no servidor e estratégia de rascunhos/offline para visitas com conexão instável.

# Decisões de interface

Navegação lateral no desktop e faixa superior no tablet/celular. Azul primário, superfícies neutras e escolha claro/escuro/sistema. Não há limite comercial de pacientes nesta aplicação. Agenda e atendimento recebem prioridade sobre telas administrativas.
