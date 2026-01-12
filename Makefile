.PHONY: all build-all install-all start-dev

all: install-all build-all

install-all:
	@echo "📦 Installing Frontend Dependencies..."
	cd frontend && npm install
	@echo "📦 Installing Backend Dependencies..."
	cd backend && npm run install:smart
	@echo "📦 Installing Gateway Dependencies..."
	cd wa-gateway && go mod download

build-all:
	@echo "🏗️ Building Frontend..."
	cd frontend && npm run build
	@echo "🏗️ Building Gateway..."
	cd wa-gateway && go build -o gowam-rest cmd/main/main.go

start-dev:
	@echo "🚀 Starting Development Environment..."
	@echo "Please use 'docker-compose up' for the best experience."
