.PHONY: fmt build

fmt:
	bun i
	bun run oxfmt
	uv run ruff format
	uv run ruff check --fix --unsafe-fixes

build:
	cd frontend && bun i && bun run build && cd -