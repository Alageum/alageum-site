#!/usr/bin/env sh
set -eu
docker compose run --rm backend python -m scripts.seed

