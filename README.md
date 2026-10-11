# FluxoZap - WhatsApp Flow Builder & Meta Cloud API

Plataforma visual estilo **Typebot / 2chat** para WhatsApp Oficial usando **React Flow**, **Express** e **MongoDB Atlas** (Model: `WhatsApp`).

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
MONGODB_URI="mongodb+srv://<usuario>:<senha>@cluster0.abcde.mongodb.net/fluxozap?retryWrites=true&w=majority"
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
