import signal
import subprocess
import sys


def build():
    """Build the frontend."""
    run("bun i")
    run("bun run --cwd frontend build")


def fmt():
    """Format and fix this repo."""
    run("bun i")
    run("bun run oxfmt")
    run("bun run oxlint --fix --fix-dangerously")
    run("uv run ruff format")
    run("uv run ruff check --fix --unsafe-fixes")
    run("uv run ty check --fix")


def lint():
    """Lint this repo."""
    run("bun i")
    run("bun run oxfmt --check")
    run("bun run oxlint")
    run("uv run ruff format --check")
    run("uv run ruff check")
    run("uv run ty check")


def test():
    """Run tests."""
    run("uv run pytest --verbosity=1 tests.py")


def dev():
    """Run a local development server with frontend hot reload and backend proxying."""
    run("bun i --cwd frontend")

    procs = [
        subprocess.Popen("caddy run", shell=True),
        subprocess.Popen("bun run --cwd frontend dev", shell=True),
        subprocess.Popen("uv run server.py", shell=True),
    ]

    def cleanup(signum, frame):
        for p in procs:
            if p.poll() is None:
                p.terminate()
        sys.exit(0)

    signal.signal(signal.SIGTERM, cleanup)
    try:
        for p in procs:
            p.wait()
    except KeyboardInterrupt:
        cleanup(None, None)


def run(cmd, **kwargs):
    print(f"+ {cmd}")
    subprocess.run(cmd, shell=True, check=True, **kwargs)


TASKS = {"build": build, "fmt": fmt, "dev": dev, "lint": lint, "test": test}


def main():
    if len(sys.argv) < 2:
        print("Available tasks:")
        for task in sorted(TASKS):
            print(f"\t{task:12s}\t{TASKS[task].__doc__ or ''}")
        sys.exit(1)

    task = sys.argv[1].lower()
    if task not in TASKS:
        print(f"Unknown task: {task}")
        sys.exit(1)

    TASKS[task]()


if __name__ == "__main__":
    main()
