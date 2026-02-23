.PHONY: dev dev-down build migrate sqlc lint test test-api test-web clean

# Development
dev:
	docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build

dev-down:
	docker compose -f docker-compose.yml -f docker-compose.dev.yml down

dev-logs:
	docker compose -f docker-compose.yml -f docker-compose.dev.yml logs -f

# Production
build:
	docker compose up -d --build

# Database
migrate:
	cd api && go run -tags 'postgres' github.com/pressly/goose/v3/cmd/goose@latest -dir migrations postgres "$(shell grep DB_ .env | sed 's/DB_//g' | tr '\n' ' ')" up

migrate-down:
	cd api && go run -tags 'postgres' github.com/pressly/goose/v3/cmd/goose@latest -dir migrations postgres "$(shell grep DB_ .env | sed 's/DB_//g' | tr '\n' ' ')" down

# Code generation
sqlc:
	cd api && sqlc generate

# Linting
lint:
	cd api && go vet ./...
	cd web && npm run lint 2>/dev/null || true

# Testing
test: test-api test-web

test-api:
	cd api && go test ./...

test-web:
	cd web && npm test 2>/dev/null || true

# Cleanup
clean:
	docker compose -f docker-compose.yml -f docker-compose.dev.yml down -v
	rm -rf api/tmp api/bin
