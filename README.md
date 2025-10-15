SMS Sender API
Uma API robusta e escalável para envio de SMS, construída com Node.js e pronta para ser implantada em ambientes containerizados com Docker.

📄 Sobre o Projeto
Este projeto fornece uma interface RESTful para o envio de mensagens de texto (SMS). Foi desenvolvido para ser altamente disponível e fácil de implantar, utilizando Docker e Docker Swarm para orquestração. Ideal para integrar sistemas que precisam de um gateway centralizado de notificações por SMS.

✨ Funcionalidades Principais
API RESTful: Endpoints claros e bem definidos para o envio de mensagens.

Envio Simples: Envie SMS para um destinatário com uma única chamada de API.

Pronto para Contêineres: Acompanha Dockerfile e configuração de stack para implantação em Docker Swarm.

Persistência de Dados: Utiliza PostgreSQL para armazenar histórico de envios e logs.

Segurança: Utiliza chaves de API para autenticação das requisições.

🛠️ Tecnologias Utilizadas
Backend: Node.js, Express.js

Banco de Dados: PostgreSQL

ORM: Sequelize

Containerização: Docker

Orquestração: Docker Swarm (para produção)

🚀 Começando
Siga os passos abaixo para configurar e executar o projeto em seu ambiente de desenvolvimento local.

Pré-requisitos
Node.js (versão 18 ou superior)

Docker e Docker Compose

Git

1. Instalação Local (Sem Docker)
Clone o repositório e instale as dependências.

Bash

# Clone o projeto
git clone https://github.com/DevHMedeiros/sms-druzzo-rev2.git

# Entre na pasta do projeto
cd sms-druzzo-rev2

# Crie seu arquivo de variáveis de ambiente
cp .env.example .env
Agora, edite o arquivo .env com as suas configurações locais (banco de dados, chaves de API, etc.).

Bash

# Instale as dependências
npm install

# Inicie o servidor de desenvolvimento
npm run dev
O servidor estará rodando em http://localhost:3000.

2. Instalação com Docker (Recomendado)
Para um ambiente de desenvolvimento idêntico ao de produção, use o Docker Compose.

Bash

# Clone o projeto
git clone https://github.com/DevHMedeiros/sms-druzzo-rev2.git

# Entre na pasta do projeto
cd sms-druzzo-rev2

# Crie seu arquivo de variáveis de ambiente
cp .env.example .env
Edite o arquivo .env com as configurações desejadas. O Docker Compose irá utilizá-las para configurar os serviços.

Bash

# Suba os contêineres em background
docker-compose up -d
A API estará disponível em http://localhost:3000 e o banco de dados PostgreSQL estará rodando internamente.

🚢 Implantação (Deploy) em Produção
Este projeto é otimizado para implantação em um cluster Docker Swarm com Traefik como proxy reverso.

Crie o Secret da Senha: Armazene a senha do banco de dados de forma segura no Swarm.

Bash

# Exemplo de comando no terminal do manager do Swarm
echo "SuaSenhaSuperSecreta" | docker secret create POSTGRES_PASSWORD_DRUZZO -
Prepare o Arquivo da Stack: Utilize um arquivo docker-stack.yml similar ao abaixo para definir os serviços, redes e configurações do Traefik.

<details>
<summary>Clique para ver um exemplo de docker-stack.yml</summary>

YAML

version: "3.8"

services:
  app:
    image: ghcr.io/devhmedeiros/sms-sender-api:latest # Imagem gerada pelo GitHub Actions
    networks:
      - traefik-public
      - internal-net
    environment:
      - DB_HOST=postgres
      - DB_USERNAME=docker
      - DB_DATABASE=sms_sender
      - DB_PASSWORD_FILE=/run/secrets/POSTGRES_PASSWORD_DRUZZO
    secrets:
      - POSTGRES_PASSWORD_DRUZZO
    deploy:
      replicas: 1
      labels:
        - "traefik.enable=true"
        - "traefik.docker.network=traefik-public"
        - "traefik.http.routers.sms-api.rule=Host(`sms.seu-dominio.com.br`)"
        - "traefik.http.routers.sms-api.entrypoints=websecure"
        - "traefik.http.routers.sms-api.tls.certresolver=myresolver"
        - "traefik.http.services.sms-api.loadbalancer.server.port=3000"

  postgres:
    image: postgres:13
    networks:
      - internal-net
    secrets:
      - POSTGRES_PASSWORD_DRUZZO
    environment:
      - POSTGRES_USER=docker
      - POSTGRES_DB=sms_sender
      - POSTGRES_PASSWORD_FILE=/run/secrets/POSTGRES_PASSWORD_DRUZZO
    volumes:
      - postgres-data:/var/lib/postgresql/data
    deploy:
      placement:
        constraints: [node.role == manager]

secrets:
  POSTGRES_PASSWORD_DRUZZO:
    external: true

volumes:
  postgres-data:

networks:
  traefik-public:
    external: true
  internal-net:
    driver: overlay
</details>

Execute o Deploy:

Bash

docker stack deploy -c docker-stack.yml nome-da-sua-stack
🔌 Uso da API
Autenticação
Todas as requisições para a API devem conter um cabeçalho x-api-key com a chave de API definida na variável de ambiente API_KEY.

Enviar SMS
Endpoint: POST /api/v1/send

Headers:

Content-Type: application/json

x-api-key: SUA_CHAVE_DE_API_SECRETA

Body (JSON):

JSON

{
  "to": "5561999998888",
  "message": "Sua fatura de outubro já está disponível. Acesse nosso site para mais detalhes."
}
Resposta de Sucesso (200 OK):

JSON

{
  "status": "success",
  "messageId": "xyz-123-abc-456",
  "details": "Mensagem enviada para a fila de processamento."
}
⚙️ Variáveis de Ambiente
Para rodar a aplicação, as seguintes variáveis de ambiente precisam ser configuradas no seu arquivo .env ou como secrets no Docker Swarm.

Variável	Descrição	Exemplo
APP_PORT	Porta onde a aplicação irá rodar.	3000
API_KEY	Chave secreta para autenticação na API.	uma-chave-secreta-muito-longa
DB_DIALECT	Dialeto do Sequelize.	postgres
DB_HOST	Host do banco de dados.	postgres (se usando Docker)
DB_PORT	Porta do banco de dados.	5432
DB_USERNAME	Usuário de acesso ao banco.	docker
DB_PASSWORD	Senha de acesso ao banco.	SuaSenhaSuperSecreta
DB_DATABASE	Nome do banco de dados.	sms_sender
SMS_PROVIDER_API_KEY	Chave de API do seu provedor de SMS.	provider-key-123
SMS_PROVIDER_API_SECRET	Segredo da API do seu provedor de SMS (se houver).	provider-secret-456

Exportar para as Planilhas
🤝 Contribuindo
Contribuições são o que tornam a comunidade de código aberto um lugar incrível para aprender, inspirar e criar. Qualquer contribuição que você fizer será muito apreciada.

Faça um Fork do projeto

Crie sua Feature Branch (git checkout -b feature/FuncionalidadeIncrivel)

Faça o Commit de suas alterações (git commit -m 'Adiciona FuncionalidadeIncrivel')

Faça o Push para a Branch (git push origin feature/FuncionalidadeIncrivel)

Abra um Pull Request

📜 Licença
Distribuído sob a licença MIT. Veja LICENSE para mais informações.

Atualização Teste envio GIT

