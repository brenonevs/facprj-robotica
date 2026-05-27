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

## Respostas (Arduino → Pi)

| Linha | Significado |
|-------|-------------|
| `OK <comando>` | Comando aceito (ex.: `OK M F`) |
| `ERR <motivo>` | Comando rejeitado |

Telemetria periódica (fase futura): linhas `T ...`
