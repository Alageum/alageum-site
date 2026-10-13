SHELL := /usr/bin/env bash
.PHONY: bootstrap dev down reset demo-reset build lint test test-backend test-e2e migrate migration-check seed smoke backup restore

bootstrap:
	./scripts/bootstrap.sh

dev:
	docker compose up -d

down:
	docker compose down

reset demo-reset:
	./scripts/reset.sh

build:
	docker compose build

lint:
	.venv/bin/ruff check backend
	python3 scripts/check_frontend_env.py
	cd frontend && npm run lint

test: test-backend

test-backend:
	.venv/bin/pytest backend/tests

test-e2e:
	cd frontend && npm run test:e2e

migrate:
	docker compose exec -T backend alembic upgrade head

migration-check:
	docker compose exec -T backend alembic check

seed:
	docker compose exec -T backend python -m scripts.seed

smoke:
	python3 scripts/smoke.py

backup:
	./scripts/backup.sh

restore:
	@test -n "$(BACKUP)" || { echo 'Usage: make restore BACKUP=/path/file.dump' >&2; exit 2; }
	./scripts/restore.sh "$(BACKUP)"
