# Fluxo confirmado

A veterinária agenda uma visita domiciliar com horário e duração definidos. A visita tem um tutor, um endereço e um ou mais animais. O deslocamento é incluído no preço base; o sistema não calcula rotas nem organiza bairros.

Cada animal tem um atendimento independente. O registro clínico é livre, acompanhado de medições opcionais de peso, temperatura, frequência cardíaca e respiratória e pressão sistólica/diastólica. O histórico deve ficar acessível sem perder o contexto da consulta.

Aplicações usam um produto do catálogo, quantidade e unidade. O valor é calculado a partir do preço de venda por unidade; alterações futuras no catálogo não mudam o passado. Esta primeira implementação cobra o preço do produto aplicado, sem uma tarifa adicional de aplicação.

Exames podem ser coletados pela veterinária e enviados ao laboratório parceiro, ou encaminhados a outros profissionais. Pedido e resultado são eventos distintos que podem se relacionar com a consulta. Um exame já cadastrado pode ser vinculado a outra consulta do mesmo paciente sem duplicação.

Receitas têm itens estruturados e orientações. A veterinária define os dados clínicos; a aplicação não sugere doses. Assinatura digital é uma etapa futura de integração, não uma imagem decorativa.

O tutor paga por visita, no momento ou posteriormente, podendo pagar parcialmente. Métodos: Pix, dinheiro, cartão de crédito, débito e link de pagamento.

# Próximos incrementos

1. Validar esta primeira implementação com a veterinária usando somente exemplos: navegação, atendimento, campos da receita e cobrança.
2. Implementar login, sessão e organização vinculada à identidade; publicar um ambiente seguro para tablet e celular.
3. Preparar backup automático e teste de recuperação antes de dados reais.
4. Refinar agenda com remarcação, visão semanal e edição do motivo/duração conforme o uso observado.
5. Completar dados profissionais e tutores, modelos de documentos e integração de assinatura digital.
6. Acrescentar paginação, busca no servidor e estratégia de rascunhos/offline para visitas com conexão instável.

# Decisões de interface

Navegação lateral no desktop e faixa superior no tablet/celular. Azul primário, superfícies neutras e escolha claro/escuro/sistema. Não há limite comercial de pacientes nesta aplicação. Agenda e atendimento recebem prioridade sobre telas administrativas.
