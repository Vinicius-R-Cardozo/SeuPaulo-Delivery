# Impressão automática dos deliveries

Ao confirmar um pedido de entrega, o admin grava a comanda junto com a mudança de status. O computador da cozinha consulta o Supabase por HTTPS a cada segundo enquanto a fila está vazia e consome os pedidos em sequência quando há trabalho. O navegador pode ser fechado após confirmar. A comanda traz o código do painel, horário local do pedido, quantidades, adicionais e observações. Retiradas ficam fora dessa fila.

## Configurar pelo painel

### Homologação com impressora virtual

Em um computador com Python e IP na rede do agente, execute `python -B kitchen/impressora_virtual.py --ip IP-DESTE-COMPUTADOR` na raiz do projeto. A porta TCP padrão é 9100. Para usar outra porta, acrescente `--porta 19100`. Abra `http://127.0.0.1:19101` nesse mesmo computador para ver as últimas 20 comandas recebidas enquanto o processo estiver ligado. O botão **Enviar teste local** exercita o receptor TCP sem criar um pedido.

No ambiente de homologação, conecte o agente, escolha **Impressora exclusiva por IP**, salve o IP e a porta do simulador e clique em **Imprimir comanda de teste**. Confira **DELIVERY #TESTE** e a indicação de corte no visor. Para testar o aceite automático, habilite a impressão e confirme um delivery de homologação. A via deve chegar com o código do pedido. O teste físico de papel, corte e compartilhamento com o PDV continua sendo feito no restaurante.

### Instalação e ativação

Publique as migrações `20261124163031_kitchen_delivery_print` e `20261124164011_kitchen_printer_admin` e a versão correspondente do admin. O instalador Windows x64 é servido pelo próprio painel.

1. No painel do Seu Paulo, abra **Impressora** e digite a senha de configuração. O administrador precisa desbloquear a tela a cada entrada. O acesso expira após 15 minutos e cinco erros bloqueiam novas tentativas por dez minutos para aquela conta.
2. No computador do restaurante, baixe o instalador pelo painel, extraia o ZIP e execute **Instalar.cmd** como administrador. O pacote traz o runtime, o agente e o suporte a filas Windows.
3. Clique em **Gerar código de conexão** e cole o código na janela do instalador. Ele é de uso único e vale por 15 minutos. A tarefa do Windows inicia agora e a cada inicialização. Aguarde **Agente conectado** no painel.
4. Selecione **Fila do Windows** e o nome exato da fila compartilhada com o PDV, ou **Impressora exclusiva por IP** e o endereço privado e porta da unidade dedicada. Salve. O instalador usa a conta Serviço Local. Para que a fila apareça, disponibilize-a para essa conta.
5. Clique em **Imprimir comanda de teste**. Confira na cozinha a via **DELIVERY #TESTE**, os adicionais e o corte. O status de envio indica que o agente entregou os bytes ao destino local. Para uma fila compartilhada, valide também uma mesa do PDV durante o teste.
6. Marque **Imprimir automaticamente ao confirmar delivery** e salve. A partir daí, confirmar um delivery no admin envia a comanda para o destino salvo. A opção se aplica às próximas confirmações.

Para migrar uma instalação anterior, use o mesmo fluxo. Gerar o código mantém a conexão existente até o código ser utilizado. O novo pareamento revoga a chave anterior e requer selecionar o destino e habilitar as impressões novamente. **Desconectar computador** revoga o acesso dele. Comandas reais pendentes continuam disponíveis para o próximo agente.

## Instalação manual anterior

1. Aplique a migração `20261124163031_kitchen_delivery_print.sql` no projeto Supabase que o painel utiliza e publique o admin atualizado. O pareamento no passo 5 ativa a geração de comandas a partir das próximas confirmações.
2. Identifique o destino junto ao responsável pelo PDV. Para uma Bematech compartilhada, use a fila **já usada pelos PDVs** se ela aceitar documentos RAW ESC/POS e for acessível pela conta Windows Serviço Local no computador do agente. Duas filas apontando ao mesmo IP não coordenam seus trabalhos. Se o PDV envia diretamente ao IP ou usa um gerenciador proprietário, valide o método de compartilhamento com o fornecedor antes de ativar. Para uma impressora dedicada, confirme o endereço reservado, porta de impressão e modo ESC/POS da unidade.
3. No computador Windows que ficará ligado, disponibilize Python 3.10 ou posterior para todos os usuários, incluindo o Serviço Local. Para fila Windows, instale `pywin32` nesse mesmo Python. Use a URL e a chave **publicável** do projeto Supabase. O serviço recebe uma credencial própria no pareamento.
4. Em PowerShell como administrador, execute **uma** das opções abaixo, ajustando os valores do restaurante. O instalador registra uma tarefa de inicialização sob Serviço Local e já a inicia. Use a fila existente no Windows pelo nome exato (consulte `Get-Printer`).

   Impressora compartilhada por uma única fila Windows

   ```powershell
   & 'C:\Program Files\Python312\python.exe' -m pip install pywin32
   .\kitchen\install.ps1 -Python 'C:\Program Files\Python312\python.exe' -SupabaseUrl 'https://PROJETO.supabase.co' -PublicKey 'sb_publishable_...' -Queue 'Cozinha'
   ```

   Impressora exclusiva do delivery via TCP

   ```powershell
   .\kitchen\install.ps1 -Python 'C:\Program Files\Python312\python.exe' -SupabaseUrl 'https://PROJETO.supabase.co' -PublicKey 'sb_publishable_...' -PrinterAddress 'IP-DA-IMPRESSORA' -Port 9100
   ```

5. Execute no SQL Editor do projeto o comando de pareamento emitido pelo instalador. Ele contém só o hash da credencial. A via original será criada apenas para deliveries confirmados a partir desse momento.
6. Confirme um delivery de teste no painel, confira o número, a quantidade, os adicionais, a observação e o corte no papel. Se compartilhar a impressora, envie também uma mesa do PDV no mesmo instante e confira as duas comandas inteiras. Valide a falta de papel, a retomada e uma reinicialização do computador antes do uso no turno.

## Operação

- Em **Pedidos**, **Comanda atrasada** aparece após 30 segundos na fila ou na primeira falha de conexão anterior ao envio. **Conferir na cozinha** indica que a comanda pode ter saído. Clique no código para abrir o pedido. Os avisos consultam a última via de cada delivery em andamento e se atualizam a cada quatro segundos.
- **Na fila da cozinha** indica que o pedido está salvo. Se persistir, confira a conexão e a tarefa `Seu Paulo - Comandas da cozinha`. A falta de internet ou de energia no computador atrasa a impressão. Ao voltar, o agente busca os trabalhos pendentes de pedidos ainda ativos.
- **Enviada à impressora** indica aceite dos bytes pelo destino local. Em uma fila Windows, a bobina pode acabar depois do aceite. Confira o spooler e o papel antes de pedir outra via.
- **Confira na cozinha** aparece após falha durante o envio ou após dois minutos sem confirmação do agente. A via original sai da repetição automática. Após conferir o papel, o atendente pode solicitar **Reimprimir comanda** no detalhe do pedido. A segunda via é identificada no papel.
- Cancelar ou finalizar o pedido retira da fila trabalhos que ainda aguardavam envio. Se a comanda já foi encaminhada, avise a cozinha em caso de cancelamento.
- O texto de preparo é normalizado para caracteres latinos sem acento, com quebra de linha. O agente envia o comando de corte no fim de cada documento.

## Manutenção

O instalador do painel mantém a configuração e o log rotativo em uma subpasta de `%ProgramData%\SeuPauloKitchen`. Ajuste o destino pelo painel. A instalação manual anterior usa `agent.json` diretamente nesse diretório. Para gerar novamente o ZIP distribuído pelo painel em Windows x64, execute `kitchen/package-windows.ps1` com um Python que tenha as dependências de empacotamento descritas no próprio script.

Para suspender temporariamente os envios, pare e desabilite a tarefa. A fila continua recebendo os próximos deliveries confirmados. Para desativar também a criação de novas comandas e revogar o agente, execute `delete from kitchen_print.device where singleton;` no projeto. Confira com o restaurante quaisquer trabalhos pendentes antes de reativar.
