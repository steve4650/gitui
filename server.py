import datetime
import os
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
        (r"/api/health", HealthHandler),
    ]

    if dist_dir.exists():
        routes.append((r"/(.*)", tornado.web.StaticFileHandler, {"path": str(dist_dir), "default_filename": "index.html"}))

    return tornado.web.Application(routes, default_handler_class=HealthHandler)


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
