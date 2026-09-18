# Documentos clínicos

Receitas e solicitações de exame compartilham o layout em `src/server/clinical-document.ts`. O relatório financeiro mantém seu próprio modelo.

- Cabeçalho: logo, nome da clínica, telefone, e-mail e CNPJ preenchidos em Configurações.
- Identificação: paciente, espécie, raça, sexo, idade na data do documento, peso da consulta vinculada, tutor, CPF/CNPJ, telefone e endereço. Não se busca peso em outra consulta.
- Corpo: todos os itens e orientações da receita ou dados e observações do pedido; textos longos continuam em páginas adicionais, sem truncamento.
- Rodapé: veterinária, CRMV, CPF opcional e MAPA/SIPEAGRO nas receitas. Os dados de identificação e a numeração se repetem em todas as páginas.
- Assinatura: área em branco à direita, sem borda ou rótulo. Não há integração com gov.br ou assinatura criptográfica. A receita continua identificada como rascunho sem assinatura digital.
- Tratamento configurável em Configurações: Dra. (Médica veterinária) ou Dr. (Médico veterinário). O padrão é Dra.; não se infere o tratamento pelo nome. O título não é duplicado quando já consta no nome digitado.

Os dados vêm do cadastro no momento do download. Um novo download pode refletir alterações posteriores no cadastro; ainda não há versionamento imutável de documentos emitidos.

## Banco e implantação

Aplicar `007_document_details.sql` e `008_veterinarian_title.sql` com `pnpm db:migrate` **antes de publicar o código**. Para o ambiente Supabase configurado localmente:

```sh
ENV_FILE=.env.supabase.local pnpm db:migrate
```

A migration é aditiva, cria campos opcionais vazios e mantém os registros existentes. Clientes antigos que não enviam os campos opcionais não apagam valores já cadastrados. O envio explícito de uma string vazia limpa o campo.

## Verificação

`pnpm test` cobre conteúdo e paginação dos PDFs, dados opcionais, idade, persistência, controle de revisão e isolamento por clínica. A revisão visual deve incluir receita com três itens, pedido simples, instruções em várias páginas, logo e nomes longos.
