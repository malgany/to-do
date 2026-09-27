#!/usr/bin/env bash
set -euo pipefail

if [[ ! -t 0 ]]; then
  echo 'Execute este script num terminal interativo.' >&2
  exit 1
fi

IFS= read -r -s -p 'Cole a nova chave Jev aqui (entrada oculta) e pressione Enter: ' JEV_API_KEY
printf '\n'
if [[ -z "$JEV_API_KEY" ]]; then
  echo 'Nenhuma chave informada.' >&2
  exit 1
fi

export JEV_API_KEY
trap 'unset JEV_API_KEY' EXIT
npm run eval:jev
