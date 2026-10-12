# FluxoZap - WhatsApp Flow Builder & Meta Cloud API

Plataforma visual estilo **Typebot / 2chat** para WhatsApp Oficial usando **React Flow**, **Express** e **MongoDB Atlas** (banco dedicado: `FluxoZap`).

---

## 🚀 Como Rodar Localmente no seu Computador com o Bun

### 1. Pré-requisito: Instalar o Bun (caso ainda não tenha)

- **No Windows (PowerShell):**
  ```powershell
  powershell -c "irm bun.sh/install.ps1 | iex"
  ```
- **No macOS / Linux:**
  ```bash
  curl -fsSL https://bun.sh/install | bash
  ```

---

### 2. Clonar ou Baixar o Projeto e Entrar na Pasta

```bash
cd caminho/do/projeto
```

---

### 3. Configurar o Arquivo `.env`

Crie uma cópia do arquivo `.env.example` chamada `.env`:

```bash
cp .env.example .env
```

Abra o arquivo `.env` e preencha suas variáveis (ou configure depois diretamente pela interface web nas abas de Configurações):

```env
# Meta WhatsApp Cloud API (opcional via .env ou direto na interface)
WHATSAPP_PHONE_NUMBER_ID=""
WHATSAPP_ACCESS_TOKEN=""
WHATSAPP_WABA_ID=""
WHATSAPP_VERIFY_TOKEN="fluxozap_webhook_secret_2026"

# MongoDB Atlas URI (opcional via .env ou direto na aba MongoDB Atlas)
MONGODB_URI="mongodb+srv://<usuario>:<senha>@cluster0.abcde.mongodb.net/?retryWrites=true&w=majority"
```

---

### 4. Instalar as Dependências com Bun

```bash
bun install
```

---

### 5. Iniciar o Servidor em Modo Desenvolvimento

Execute:

```bash
bun run dev:bun
```
*(ou se preferir, `bun run dev`)*

Pronto! Acesse no navegador:
👉 **http://localhost:3000**

---

## 🌐 Como Receber Webhooks do WhatsApp Localmente

Como a API da Meta precisa enviar mensagens para uma URL HTTPS pública, use o **ngrok** ou **cloudflared** no seu PC:

```bash
# Opção 1: Usando Ngrok
npx ngrok http 3000

# Opção 2: Usando Cloudflare Tunnel
npx cloudflared tunnel --url http://localhost:3000
```

Copie a URL HTTPS gerada (ex: `https://xyz.ngrok-free.app/api/webhook`) e cole no portal da Meta Developers!

## Pagamentos no Brasil e México com XPag Global

1. Abra **Pagamentos XPag** e informe o `Client ID` e o `Client Secret` gerados em **Integrações → API** no painel da XPag.
2. Acesse o FluxoZap por uma URL HTTPS pública. Cada cobrança recebe uma URL de webhook exclusiva, vinculada à sessão e ao telefone do pagador.
3. No editor, adicione o bloco **Gerar Pagamento** e escolha **PIX**, **SPEI** ou **OXXO**.
4. Configure o valor em BRL para PIX ou MXN para SPEI/OXXO. Nome, documento, e-mail e descrição são opcionais.
5. Conecte a saída **Gerada** aos blocos que enviam as instruções e use as variáveis produzidas pelo pagamento. As saídas **Paga**, **Erro** e **Expirada** tratam cada resultado separadamente.

O bloco não envia mais uma mensagem automática grande. Ele salva os dados sob um prefixo configurável (por padrão, `xpag`), incluindo `{{xpag_pix_copy_paste}}`, `{{xpag_qr_code_url}}`, `{{xpag_clabe}}`, `{{xpag_bank}}`, `{{xpag_beneficiary}}`, `{{xpag_oxxo_reference}}`, `{{xpag_oxxo_barcode}}`, `{{xpag_status}}`, `{{xpag_expires_at}}`, `{{xpag_error}}` e os identificadores da transação. Para enviar a imagem do QR Code, use `{{xpag_qr_code_url}}` como URL de um bloco **Enviar Imagem**.

O funil pode aguardar a confirmação do pagamento sem impedir que a saída **Gerada** envie primeiro as instruções personalizadas. Antes de liberar a saída **Paga**, o FluxoZap identifica a cobrança pela chave única e reconcilia o callback pela rota autenticada de consulta da XPag. A expiração usa a data devolvida pela API ou, se configurado, um prazo local de segurança. O simulador nunca cria cobranças reais.

Mensagens comuns da API do WhatsApp não possuem um botão nativo para copiar PIX ou CLABE arbitrários. O botão de copiar código documentado pela Meta pertence a templates de autenticação; por isso, códigos de pagamento devem ser enviados em uma mensagem própria para facilitar a cópia pelo cliente.

O bloco **Aguardar Resposta** também pode ser usado sem variável: quando o campo estiver vazio, ele apenas espera a próxima mensagem e continua o fluxo sem armazenar a resposta.

## Esperas persistentes e retomada do funil

O bloco **Tempo de Espera** não usa `sleep`, `setTimeout` longo nem mantém uma requisição aberta. Ele grava na sessão a data de retomada, o nó e o contexto da linha do WhatsApp. É possível aguardar por segundos, minutos, horas, dias ou meses, ou escolher uma data e hora exatas.

O bloco **Aguardar Resposta** pode permanecer sem prazo ou ter uma expiração opcional. Com prazo ativo, ele possui duas saídas: **Respondeu** e **Tempo esgotado**. Uma resposta cancela o agendamento antes de seguir pela primeira saída; o vencimento limpa a espera e segue pela segunda.

As sessões são salvas em JSON e no MongoDB depois de cada mudança de nó. Na inicialização, o FluxoZap escolhe a cópia mais recente, restaura os checkpoints do novo mecanismo e retoma esperas vencidas. Estados legados sem checkpoint não são executados automaticamente, evitando disparos duplicados durante a migração. Quando um funil chega a um bloco sem saída ou ao bloco **Finalizar Funil**, a sessão fica concluída e mensagens futuras não reiniciam a automação; o reinício precisa ser feito explicitamente na conversa.

## Isolamento por número do WhatsApp

Cada linha cadastrada possui seu próprio **Fluxo 1**, credenciais da Meta, clientes, sessões, histórico, pagamentos e logs. A identidade de uma conversa é composta por `accountId + telefone do cliente`; portanto, o mesmo cliente falando com duas linhas inicia dois atendimentos totalmente independentes.

O seletor no topo define o contexto de todas as telas. Ao trocar de linha, a conversa aberta é fechada, a lista exibe somente os clientes daquela linha e os envios usam obrigatoriamente o Phone Number ID e o token da linha selecionada. Não existe fallback para as credenciais da linha principal.

## Mídias de entrada e saída

Arquivos enviados pelo atendente ou por blocos do fluxo não são armazenados no R2. O FluxoZap envia o binário diretamente para a biblioteca de mídia da Meta e usa o `media_id` retornado na mensagem, evitando falhas `131053` causadas por links privados ou inacessíveis.

O Cloudflare R2 é usado somente para arquivos recebidos dos clientes. Fotos, áudios, vídeos e documentos recebidos têm limite máximo de **100 MB por arquivo**; downloads acima desse tamanho são interrompidos e registrados na conversa sem persistir o conteúdo.

## Persistência no MongoDB

O servidor sempre conecta no banco `FluxoZap`, independentemente do nome presente na URI, evitando o banco padrão `test`. Os dados são divididos nas collections `project_configs`, `flows`, `sessions`, `whatsapp_accounts`, `api_logs` e `xpag_payments`. A collection `flows` é a fonte única dos funis: eles não são carregados, salvos nem semeados a partir de JSON local. Quando não há documento para uma linha, o editor abre um Fluxo 1 vazio. Os demais arquivos em `data/*.json` continuam atendendo seus dados locais de contingência.
