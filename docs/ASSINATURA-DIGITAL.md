# Assinatura de receitas no dispositivo

Em uma receita salva, escolha **Assinar no dispositivo**, selecione o PFX/P12 e
informe o PIN. Confira o PDF preparado e confirme a assinatura. É necessário
cadastrar nas Configurações o CPF da veterinária titular do certificado.

O fluxo inicial atende A1 RSA de 2048 a 4096 bits, com PFX que contenha a cadeia
completa. Suporta contêineres AES e 3DES. Não suporta token/cartão, certificado
em nuvem, chave EC ou múltiplas chaves no mesmo arquivo. Requer navegador com
Web Crypto em HTTPS (localhost permitido). Não requer API ou segredo adicional.

## Limites de validação

O sistema verifica assinatura criptográfica, integridade do PDF, CPF, uso da
chave, validade e cadeia até raízes ICP-Brasil públicas fixadas no código.
O formato é PAdES B-B, SHA-256, ETSI.CAdES.detached com signing-certificate-v2.
As raízes RSA 5 e 12 foram obtidas do repositório oficial do ITI; as
impressões SHA-256 estão em src/server/signatures/icp-roots.ts. Atualizações de
confiança devem passar por revisão e release; nunca confiar em uma raiz enviada
pelo cliente só por seu nome ou OID.

Não são feitas consultas OCSP/CRL, carimbo de tempo confiável ou armazenamento
LTV. A data exibida é a do servidor, não um carimbo de tempo certificado.
Consequentemente a aplicação NÃO declara a assinatura validada integralmente
pelo ITI nem garante que o certificado não tenha sido revogado. A interface
indica a pendência e oferece o link https://validar.iti.gov.br/ para validação.
A primeira assinatura real deve ser testada ali antes de uso operacional.
A assinatura não substitui exigências do tipo de receituário ou do SIPEAGRO.

## Privacidade e protocolo

1. node-forge abre o PFX localmente, verifica o PIN e encontra o certificado que
   corresponde à chave. A chave RSA é importada no Web Crypto como não extraível.
2. O navegador envia apenas certificado público e cadeia ao POST da assinatura.
3. O servidor valida o certificado e cria PDF e atributos CMS. Nenhum segredo
   pessoal é necessário no servidor. O PDF preparado não deve ser distribuído.
4. Após revisão, o navegador assina os atributos com SHA-256/RSA e envia apenas
   a assinatura e o identificador da tentativa ao PUT.
5. O servidor confere novamente os dados, validade e assinatura, incorpora o CMS
   sem alterar os bytes assinados e persiste o PDF final e seu hash SHA-256.

Não há armazenamento de PFX, PIN ou chave em cookies, localStorage, IndexedDB,
banco ou logs. Entradas do formulário são limpas assim que lidas, buffers são
sobrescritos quando possível e referências são descartadas ao fechar/concluir.
JavaScript não garante eliminação física imediata de strings/objetos da memória.
Não há scripts de fornecedores ou chamadas a URLs dos certificados neste fluxo.

Tentativas expiram em 15 minutos e pertencem à clínica, receita e conta que as
iniciou. Novas preparações substituem tentativas pendentes anteriores. Uma
alteração nos dados do paciente, tutor, consulta, receita ou configuração exige
nova preparação. Tentativas expiradas mantêm apenas material público/PDF da
clínica até serem substituídas; não há job de limpeza automática nesta versão.

PDFs assinados são preservados, não regenerados ao baixar e não podem ser
substituídos/excluídos pelo papel vet_app. A assinatura não modifica o conteúdo
original do cadastro da receita; seu estado é obtido do documento persistido.
Correções devem gerar outra receita. O encerramento é transacional e idempotente.
A auditoria guarda metadados (titular, hash, data), nunca PFX/PIN/PDF binário.

## Implantação e testes

Migration 014 é aplicada pelo workflow de release antes do deploy. Não é preciso
configurar novos secrets na Vercel. A preparação de PDF respeita limite de 4 MB;
o request de retorno da assinatura é pequeno, sem upload de PDF/PFX.

Testes usam uma CA fictícia, injetada apenas por mock no Vitest. Essa CA nunca
entra no trust store da aplicação. São verificados PIN incorreto, PFX AES/3DES,
CPF divergente, cadeia não confiável, adulteração, mudança de dados, expiração,
isolamento de conta/clínica, controle de permissão e persistência imutável.
O PDF de teste também foi verificado com pdfsig/Poppler e renderizado para revisão.
O módulo de assinatura foi testado em navegador real com PFX 3DES fictício e Web Crypto.
A homologação com o certificado real da Safeweb e no tablet da Isabelli depende
de ela executar o fluxo localmente. Não compartilhar PFX nem PIN no chat.
