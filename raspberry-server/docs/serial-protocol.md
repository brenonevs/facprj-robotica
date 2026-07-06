# Protocolo serial Raspberry Pi ↔ Arduino Uno

- Baud rate: **115200**
- Formato: uma linha de texto por comando, terminada em `\n`
- Comandos em maiúsculas; espaço separa verbo e argumento

## Comandos (Pi → Arduino)

| action (WebSocket) | Linha serial |
|--------------------|--------------|
| `stop` | `S` |
| `move_forward` | `M F` |
| `move_backward` | `M B` |
| `turn_left` | `M L` |
| `turn_right` | `M R` |
| `fork_up` | `F U` |
| `fork_down` | `F D` |
| `start_autonomous_mode` | `A 1` |
| `stop_autonomous_mode` | `A 0` |

## Respostas imediatas (Arduino → Pi)

| Linha | Significado |
|-------|-------------|
| `OK <comando>` | Comando aceito (ex.: `OK M F`) |
| `ERR <motivo>` | Comando rejeitado |

## Telemetria periódica (Arduino → Pi)

Enviada automaticamente a cada **1 s** (independente de comandos).

Formato: linha iniciando com `T`, pares `chave=valor` separados por espaço.

| Chave | Tipo | Descrição |
|-------|------|-----------|
| `bat` | float | Bateria (%) |
| `v` | float | Tensão estimada (V) |
| `tl` | float | Temperatura motor esquerdo (°C) |
| `tr` | float | Temperatura motor direito (°C) |
| `x`, `y` | float | Posição no plano (m) |
| `th` | float | Orientação θ (graus) |
| `lv` | float | Velocidade linear (m/s) |
| `av` | float | Velocidade angular (rad/s) |
| `fork` | float | Altura do garfo (% do curso) |
| `fmm` | float | Altura do garfo (mm, passo do fuso 19 mm/volta) |
| `load` | float | Célula de carga (kg) |
| `up` | int | Uptime desde boot (s) |
| `rssi` | int | RSSI Wi‑Fi simulado (dBm) |
| `imu` | 0/1 | IMU OK |
| `tag` | 0/1 | AprilTag detectada (modo autônomo simulado) |
| `tid` | int | ID da tag (`-1` se nenhuma) |
| `tdist` | float | Distância à tag (m, `-1` se nenhuma) |
| `fsm` | string | Estado FSM (`MANUAL` ou nome do estado) |
| `err` | string | Erros separados por `\|` (opcional) |
| `alt` | string | Alertas separados por `\|` (opcional) |

Exemplo:

```text
T bat=87.0 v=24.52 tl=38.2 tr=36.8 x=1.24 y=0.41 th=5.1 lv=0.00 av=0.00 fork=42 load=0.0 up=120 rssi=-54 imu=1 tag=0 tid=-1 tdist=-1.00 fsm=MANUAL
```

O Raspberry Pi converte cada linha `T` em mensagem WebSocket `{"type":"telemetry",...}` para todos os clientes conectados.
