import datetime
import os
import subprocess
from pathlib import Path

import pygit2
import tornado.web


def format_commit(commit: pygit2.Commit) -> dict[str, object]:
    """Format a pygit2.Commit object for API responses."""
    return {
        "sha": str(commit.id),
        "message": commit.message.strip(),
        "author_name": commit.author.name,
        "author_email": commit.author.email,
        "commit_time": datetime.datetime.utcfromtimestamp(commit.commit_time).isoformat() + "Z",
        "parents": [str(parent.id) for parent in commit.parents],
    }


def make_repository(repo_root: str | None = None) -> pygit2.Repository:
    """Open a pygit2 repository rooted at repo_root or the current working directory."""
    repo_root = repo_root or os.getcwd()
    return pygit2.Repository(repo_root)


class CommitListHandler(tornado.web.RequestHandler):
    """API endpoint that returns the current branch commit history."""

    def initialize(self, repo: pygit2.Repository) -> None:
        self.repo = repo

    async def get(self) -> None:
        if self.repo.head_is_unborn:
            self.write({"current_branch": None, "commits": []})
            return

        head = self.repo.head
        branch_name = head.shorthand
        walker = self.repo.walk(head.target, pygit2.GIT_SORT_TOPOLOGICAL | pygit2.GIT_SORT_TIME)

        commits = []
        for index, commit in enumerate(walker):
            if index >= 50:
                break
            commits.append(format_commit(commit))

        self.write({"current_branch": branch_name, "commits": commits})


class CommitDiffHandler(tornado.web.RequestHandler):
    """API endpoint that returns the patch for a single commit."""

    def initialize(self, repo: pygit2.Repository) -> None:
        self.repo = repo

    def get(self, sha: str) -> None:
        try:
            commit = self.repo[sha]
        except KeyError as err:
            raise tornado.web.HTTPError(404, reason="Commit not found") from err

        if not isinstance(commit, pygit2.Commit):
            raise tornado.web.HTTPError(404, reason="Object is not a commit")

        if commit.parents:
            parent_tree = commit.parents[0].tree
        else:
            empty_tree_id = self.repo.TreeBuilder().write()
            parent_tree = self.repo[empty_tree_id]

        diff = self.repo.diff(parent_tree, commit.tree)
        patch_text = getattr(diff, "patch", None)
        if patch_text is None:
            patch_text = str(diff)

        response = format_commit(commit)
        response["patch"] = patch_text
        self.write(response)


class StatusHandler(tornado.web.RequestHandler):
    """API endpoint returning staged and unstaged file lists and current branch."""

    def initialize(self, repo: pygit2.Repository) -> None:
        self.repo = repo

    async def get(self) -> None:
        branch = None if self.repo.head_is_unborn else self.repo.head.shorthand

        statuses = self.repo.status()
        staged = []
        unstaged = []
        for path, flag in statuses.items():
            # index flags indicate staged changes
            if flag & (pygit2.GIT_STATUS_INDEX_NEW | pygit2.GIT_STATUS_INDEX_MODIFIED | pygit2.GIT_STATUS_INDEX_DELETED | pygit2.GIT_STATUS_INDEX_RENAMED | pygit2.GIT_STATUS_INDEX_TYPECHANGE):
                staged.append(path)
            # worktree flags indicate unstaged changes
            if flag & (pygit2.GIT_STATUS_WT_MODIFIED | pygit2.GIT_STATUS_WT_DELETED | pygit2.GIT_STATUS_WT_NEW | pygit2.GIT_STATUS_WT_RENAMED | pygit2.GIT_STATUS_WT_TYPECHANGE):
                unstaged.append(path)

        self.write({"current_branch": branch, "staged": staged, "unstaged": unstaged})


class StageHandler(tornado.web.RequestHandler):
    """API endpoint to stage/unstage files."""

    def initialize(self, repo: pygit2.Repository) -> None:
        self.repo = repo

    async def post(self) -> None:
        data = tornado.escape.json_decode(self.request.body)
        path = data.get("path")
        action = data.get("action")
        if not path or action not in ("add", "remove"):
            raise tornado.web.HTTPError(400, reason="Invalid payload")

        index = self.repo.index
        if action == "add":
            try:
                index.add(path)
            except Exception:
                raise tornado.web.HTTPError(500, reason="Failed to add to index")
        else:
            # Unstage: remove from index but avoid deleting working-tree file.
            workdir_path = None
            file_bytes = None
            try:
                repo_workdir = self.repo.workdir
                if repo_workdir:
                    workdir_path = os.path.join(repo_workdir, path)
                    if os.path.exists(workdir_path):
                        with open(workdir_path, "rb") as f:
                            file_bytes = f.read()
            except Exception:
                # ignore reading failures, proceed to remove from index
                file_bytes = None

            try:
                index.remove(path)
            except Exception:
                raise tornado.web.HTTPError(500, reason="Failed to remove from index")

            # write index and ensure working-tree file wasn't accidentally removed
            try:
                index.write()
            except Exception:
                raise tornado.web.HTTPError(500, reason="Failed to write index")

            try:
                if workdir_path and file_bytes is not None and not os.path.exists(workdir_path):
                    # restore file contents to avoid deletion
                    with open(workdir_path, "wb") as f:
                        f.write(file_bytes)
            except Exception:
                # non-fatal; continue
                pass

            # exit early because we've already written the index
            self.write({"status": "ok"})
            return

        # write index for add case
        try:
            index.write()
        except Exception:
            raise tornado.web.HTTPError(500, reason="Failed to write index")

        self.write({"status": "ok"})
        self.write({"status": "ok"})


class CommitCreateHandler(tornado.web.RequestHandler):
    """API endpoint to create a commit from the current index."""

    def initialize(self, repo: pygit2.Repository) -> None:
        self.repo = repo

    async def post(self) -> None:
        data = tornado.escape.json_decode(self.request.body)
        message = data.get("message")
        if not message:
            raise tornado.web.HTTPError(400, reason="Missing commit message")

        author = pygit2.Signature("gitui", "gitui@example.com")
        committer = author
        index = self.repo.index
        index.write()
        tree = index.write_tree()
        parents = []
        if not self.repo.is_empty:
            parents = [self.repo.head.target]

        try:
            commit_id = self.repo.create_commit("HEAD", author, committer, message, tree, parents)
        except Exception as exc:
            raise tornado.web.HTTPError(500, reason=str(exc))

        commit = self.repo[commit_id]
        response = format_commit(commit)
        self.write(response)


class HealthHandler(tornado.web.RequestHandler):
    """Simple health-check endpoint."""

    async def get(self) -> None:
        self.write({"status": "ok"})


def make_app(repo_root: str | None = None) -> tornado.web.Application:
    """Create the Tornado application with API and static routes."""
    repo = make_repository(repo_root)
    dist_dir = Path(__file__).resolve().parent / "dist"

    routes = [
        (r"/api/commits", CommitListHandler, dict(repo=repo)),
        (r"/api/commit/([0-9a-fA-F]+)", CommitDiffHandler, dict(repo=repo)),
        (r"/api/status", StatusHandler, dict(repo=repo)),
        (r"/api/stage", StageHandler, dict(repo=repo)),
        (r"/api/commit", CommitCreateHandler, dict(repo=repo)),
        (r"/api/diff", GitDiffHandler, dict(repo=repo)),
        (r"/api/health", HealthHandler),
    ]

    if dist_dir.exists():
        routes.append((r"/(.*)", tornado.web.StaticFileHandler, {"path": str(dist_dir), "default_filename": "index.html"}))

    return tornado.web.Application(routes, default_handler_class=HealthHandler)


class GitDiffHandler(tornado.web.RequestHandler):
    """Return diffs for staged/unstaged files or entire section using git CLI for accuracy."""

    def initialize(self, repo: pygit2.Repository) -> None:
        self.repo = repo

    async def get(self) -> None:
        scope = self.get_argument("scope", None)
        path = self.get_argument("path", None)

        if scope not in ("staged", "unstaged"):
            raise tornado.web.HTTPError(400, reason="scope must be 'staged' or 'unstaged'")

        # map scope to git diff flags
        git_args = ["git", "diff"]
        if scope == "staged":
            git_args = ["git", "diff", "--cached"]

        if path:
            git_args += ["--", path]

        repo_dir = None
        try:
            repo_dir = self.repo.workdir or os.getcwd()
        except Exception:
            repo_dir = os.getcwd()

        try:
            proc = subprocess.run(git_args, cwd=repo_dir, capture_output=True, check=False)
            patch = proc.stdout.decode("utf-8", errors="replace")
        except Exception as exc:
            raise tornado.web.HTTPError(500, reason=str(exc))

        self.set_header("Content-Type", "application/json")
        self.write({"patch": patch})


# API endpoint documentation:
#
# GET /api/commits
# Response:
# {
#   "current_branch": "main",
#   "commits": [
#     {
#       "sha": "...",
#       "message": "Commit message",
#       "author_name": "...",
#       "author_email": "...",
#       "commit_time": "2026-06-19T12:34:56Z",
#       "parents": ["parent_sha"]
#     }
#   ]
# }
#
# GET /api/commit/{sha}
# Response:
# {
#   "sha": "...",
#   "message": "...",
#   "author_name": "...",
#   "author_email": "...",
#   "commit_time": "...",
#   "parents": ["..."],
#   "patch": "diff --git a/... b/...\n..."
# }


if __name__ == "__main__":
    import os

    import tornado.httpserver
    import tornado.ioloop

    app = make_app()
    server = tornado.httpserver.HTTPServer(app)
    port = int(os.environ.get("PORT", "8080"))
    server.listen(port)
    print(f"Serving gitui on http://localhost:{port}")
    tornado.ioloop.IOLoop.current().start()
