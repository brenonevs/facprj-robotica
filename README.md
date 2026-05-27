# Empilhadeira Robotica - Inicio Simples

Este inicio do projeto tem apenas duas partes:

1. Uma interface web para informar o IP do Raspberry Pi.
2. Um servidor WebSocket para rodar no Raspberry Pi.

Ainda nao ha Arduino, visao computacional, telemetria real ou controle de motores nesta etapa.

## Rodar o servidor no Raspberry Pi

Entre na pasta do servidor:

```bash
cd raspberry-server
```

Instale a dependencia:

```bash
python3 -m pip install -r requirements.txt
```

Rode o servidor:

```bash
python3 server.py
```

O servidor ficara ouvindo em:

```txt
ws://IP_DO_RASPBERRY:8765
```

## Rodar a interface web

Entre na pasta da interface:

```bash
cd web-dashboard
```

Instale as dependencias:

```bash
npm install
```

Rode o Vite:

```bash
npm run dev
```

Abra a URL exibida pelo Vite, normalmente:

```txt
http://localhost:5173
```

No campo da interface, digite o IP do Raspberry Pi, por exemplo:

```txt
192.168.0.42
```

Depois clique em `Conectar`.

## Como descobrir o IP do Raspberry

No terminal do Raspberry:

```bash
hostname -I
```

Use o primeiro IP exibido.

## Fluxo atual

```txt
Interface Web -> WebSocket -> Raspberry Pi
Interface Web <- WebSocket <- Raspberry Pi
```

Por enquanto, os botoes da interface apenas enviam mensagens de teste. O Raspberry responde com um `ack`, confirmando que recebeu o comando.
