import json
import tempfile
from pathlib import Path

import pygit2
import tornado.httpclient
import tornado.testing

from server import make_app


class GitServerTest(tornado.testing.AsyncHTTPTestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.repo_path = Path(self.temp_dir.name)
        self.repo = pygit2.init_repository(str(self.repo_path), bare=False)
        self._initialize_repo()
        super().setUp()

    def tearDown(self):
        self.temp_dir.cleanup()
        super().tearDown()

    def get_app(self):
        return make_app(str(self.repo_path))

    def _write_file(self, filename: str, content: str) -> pygit2.Oid:
        path = self.repo_path / filename
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")
        return self.repo.index.add(str(filename))

    def _commit(self, message: str) -> pygit2.Commit:
        author = pygit2.Signature("Test User", "test@example.com")
        committer = author
        self.repo.index.write()
        tree = self.repo.index.write_tree()
        parents = []
        if not self.repo.is_empty:
            parents = [self.repo.head.target]
        commit_id = self.repo.create_commit(
            "HEAD",
            author,
            committer,
            message,
            tree,
            parents,
        )
        return self.repo[commit_id]

    def _initialize_repo(self) -> None:
        self._write_file("README.md", "Initial commit\n")
        self.repo.index.write()
        self.repo.create_commit(
            "HEAD",
            pygit2.Signature("Test User", "test@example.com"),
            pygit2.Signature("Test User", "test@example.com"),
            "Initial commit",
            self.repo.index.write_tree(),
            [],
        )

    def test_health_endpoint(self):
        response = self.fetch("/api/health")
        self.assertEqual(response.code, 200)
        self.assertEqual(json.loads(response.body), {"status": "ok"})

    def test_commits_endpoint_returns_history(self):
        self._write_file("src/app.py", "print('hello')\n")
        self.repo.index.write()
        self._commit("Add app file")

        response = self.fetch("/api/commits")
        self.assertEqual(response.code, 200)
        payload = json.loads(response.body)
        self.assertEqual(payload["current_branch"], "master" if self.repo.head.shorthand == "master" else self.repo.head.shorthand)
        self.assertGreaterEqual(len(payload["commits"]), 2)
        self.assertEqual(payload["commits"][0]["message"], "Add app file")

    def test_commit_diff_endpoint_returns_patch(self):
        self._write_file("src/app.py", "print('hello')\n")
        self.repo.index.write()
        commit = self._commit("Add app file")

        response = self.fetch(f"/api/commit/{commit.id}")
        self.assertEqual(response.code, 200)
        payload = json.loads(response.body)
        self.assertEqual(payload["sha"], str(commit.id))
        self.assertIn("patch", payload)
        self.assertIn("src/app.py", payload["patch"])

    def test_commit_diff_endpoint_404_for_unknown_sha(self):
        response = self.fetch("/api/commit/0000000000000000000000000000000000000000")
        self.assertEqual(response.code, 404)


if __name__ == "__main__":
    tornado.testing.main()
