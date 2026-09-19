# 🧾 PDV Web — Sistema Simples para Igreja

Sistema de ponto de venda (PDV) desenvolvido como trabalho voluntário para auxiliar no controle de vendas da igreja. O foco do projeto é simplicidade, usabilidade e funcionamento offline.

## 📌 Sobre o Projeto

Este PDV foi criado utilizando apenas tecnologias web básicas:

- HTML
- CSS
- JavaScript

A proposta é ter um sistema leve, fácil de usar e que funcione em qualquer dispositivo, mesmo sem internet.

## 🌐 Acesse o Projeto (Deploy)

👉 Link do sistema online:  
https://manaaim-pdv.vercel.app/

## 🎥 Preview do Sistema

### 🖥️ Tela de Vendas
<img width="1920" height="954" src="https://github.com/user-attachments/assets/7aaf449c-bf87-419d-a162-7f4806020c40" />

### 📦 Controle de Estoque
<img width="1920" height="950" src="https://github.com/user-attachments/assets/0bfda1f8-12a0-41cb-ac36-b3ee9d6fa6a5" />

### 🧾 Relatórios
<img width="1919" height="951" alt="image" src="https://github.com/user-attachments/assets/36038e18-1373-49d1-aeda-0d29d7019b44" />


### 📱 Versão Mobile (PWA)
<img width="993" height="910" src="https://github.com/user-attachments/assets/2c4af816-58fb-4247-ab38-a713e6310139" />


## 🚀 Funcionalidades

- 🛒 Registro de vendas de produtos  
- 📦 Controle simples de estoque  
- 🏷️ Organização por categorias  
- 💾 Salvamento centralizado no Supabase
- 📱 Instalação como aplicativo (PWA)  
- ⚡ Funciona offline  
- 🔎 Interface intuitiva e fácil de aprender  

## 💡 Diferenciais

- Não precisa de servidor ou banco de dados  
- Não depende de internet  
- Interface limpa e direta  
- Ideal para pessoas sem conhecimento técnico  

## 📲 PWA (Aplicativo)

O sistema pode ser instalado como um app no celular ou computador:

- Acesso rápido pela tela inicial  
- Experiência semelhante a um app nativo  
- Funciona mesmo offline  

## Configuração

1. Execute o schema em `supabase/migrations/20260919000100_initial_pdv_schema.sql`.
2. Crie o arquivo `.env` localmente e preencha `SUPABASE_URL`, `SUPABASE_ANON_KEY` e as quatro variáveis `MASTER_*`.
3. Instale as dependências com `npm install`.
4. Inicie frontend e backend com `npm run dev`.
5. Acesse `http://localhost:5173`.

### Acessos master

O sistema aceita somente os dois masters configurados no `.env`:

```env
MASTER_THIAGO_EMAIL=thiago@exemplo.com
MASTER_THIAGO_PASSWORD=troque-por-uma-senha-forte
MASTER_CRISTIANO_EMAIL=cristiano@exemplo.com
MASTER_CRISTIANO_PASSWORD=troque-por-outra-senha-forte
```

Os e-mails e as senhas devem ser iguais aos dois usuários cadastrados no Supabase Auth. Para trocar um acesso, atualize o usuário no Supabase Auth e os valores correspondentes no `.env`, depois reinicie o servidor. O frontend nunca recebe essas senhas e o cadastro público permanece desativado.

Para produção, execute `npm run build` e depois `npm start`, configurando `NODE_ENV=production`.

As variáveis do Supabase são lidas somente pelo backend. O frontend usa `/api`, e a sessão fica em cookies `HttpOnly`.

## 🧠 Como funciona o salvamento

Os dados são enviados ao backend autenticado e persistidos no Supabase. O navegador não usa `localStorage` como banco de dados.

## Estrutura do projeto

```text
projeto-manaaim/
|-- index.html
|-- css/
|   |-- style.css
|   |-- caixa.css
|   |-- melhorias.css
|   |-- mobile-fixes.css
|   `-- relatorio-financeiro.css
|-- js/
|   |-- script.js
|   |-- caixa.js
|   |-- mobile-fixes.js
|   `-- relatorio-financeiro.js
|-- backend/
|   `-- server.js
|-- assets/
|   |-- icon-512.png
|   `-- pdv-img.png
|-- manifest.json
|-- sw.js
`-- supabase/
```

O `sw.js` permanece na raiz para que o modo offline do PWA controle todo o aplicativo.

## ⚙️ Como usar

1. Abra o sistema  
2. Cadastre os produtos  
3. Realize as vendas  
4. Acompanhe os registros  
