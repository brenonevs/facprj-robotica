#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
  exec sudo "$0" "$@"
fi

RUN_USER="${SUDO_USER:-pi}"
RUN_HOME="$(getent passwd "$RUN_USER" | cut -d: -f6)"
PROJECT_DIR="${RUN_HOME}/GitHub/facprj-robotica/raspberry-server"
VENV_ACTIVATE="${PROJECT_DIR}/venv/bin/activate"

for _ in $(seq 1 30); do
  if ping -c1 -W1 github.com &>/dev/null; then
    break
  fi
  sleep 2
done

cd "$PROJECT_DIR"

sudo -u "$RUN_USER" git pull

exec sudo -u "$RUN_USER" bash -lc "source '${VENV_ACTIVATE}' && cd '${PROJECT_DIR}' && exec python3 server.py"
