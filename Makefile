.PHONY: fmt

fmt:
	bun i
	bun run oxfmt
	uv run ruff format
	uv run ruff check --fix --unsafe-fixes